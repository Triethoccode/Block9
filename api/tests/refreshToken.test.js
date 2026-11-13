const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/prisma");
const crypto = require("../src/services/crypto");

const TEST_USER_ID = "00000000-0000-0000-0000-000000000077";
const TEST_EMAIL = "rt_test_user@example.test";
const TEST_PASSWORD = "Password123!";

test.before(async () => {
  const hash = await crypto.hashPassword(TEST_PASSWORD);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: {
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      emailRaw: TEST_EMAIL,
      passwordHash: hash,
      status: "active",
      role: "viewer",
    },
    update: {
      passwordHash: hash,
      status: "active",
    },
  });
});

test.after(async () => {
  await prisma.refreshToken.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

test("RTR 1: Đăng nhập cấp phát Access Token và Refresh Token 1 trong HttpOnly Cookie", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.data.token, "Phải có Access Token");
  assert.ok(res.body.data.refreshToken, "Phải có Refresh Token trả về");

  // Kiểm tra Set-Cookie header
  const cookies = res.headers["set-cookie"];
  assert.ok(cookies, "Phải có Set-Cookie header");
  const rtCookie = cookies.find((c) => c.startsWith("refreshToken="));
  assert.ok(rtCookie, "Cookie phải chứa refreshToken");
  assert.ok(rtCookie.includes("HttpOnly"), "Cookie phải có cờ HttpOnly");
  assert.ok(rtCookie.includes("Path=/api/auth"), "Cookie phải có path /api/auth");
});

test("RTR 2 (Happy Path): Xoay vòng Refresh Token (Rotation) thành công khi gửi RT1", async () => {
  // 1. Đăng nhập để lấy RT1
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  const rt1 = loginRes.body.data.refreshToken;
  const rt1Cookie = loginRes.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));

  // 2. Gọi /refresh-token bằng Cookie RT1
  const refreshRes = await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", [rt1Cookie]);

  assert.equal(refreshRes.status, 200);
  assert.equal(refreshRes.body.ok, true);
  assert.ok(refreshRes.body.data.token, "Phải có Access Token mới");

  const rt2 = refreshRes.body.data.refreshToken;
  assert.notEqual(rt1, rt2, "Refresh Token 2 phải khác Refresh Token 1");

  // 3. Kiểm tra DB: RT1 phải có isUsed = true, RT2 có isUsed = false và CÙNG familyId
  const hash1 = crypto.tokenHash(rt1);
  const hash2 = crypto.tokenHash(rt2);

  const dbRt1 = await prisma.refreshToken.findUnique({ where: { tokenHash: hash1 } });
  const dbRt2 = await prisma.refreshToken.findUnique({ where: { tokenHash: hash2 } });

  assert.equal(dbRt1.isUsed, true, "RT1 phải được đánh dấu đã sử dụng");
  assert.equal(dbRt2.isUsed, false, "RT2 mới tạo phải chưa sử dụng");
  assert.equal(dbRt1.familyId, dbRt2.familyId, "Cả 2 token phải cùng một Family ID");
});

test("RTR 3 (Reuse Detection): Kẻ gian dùng lại RT1 -> Phát hiện gian lận và khóa sạch toàn bộ Family", async () => {
  // 1. Đăng nhập -> Sinh RT1
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const rt1 = loginRes.body.data.refreshToken;

  // 2. User thật xoay vòng RT1 -> Nhận RT2 (RT1 đã chuyển sang isUsed = true)
  const rotate1Res = await request(app)
    .post("/api/auth/refresh-token")
    .send({ refreshToken: rt1 });
  assert.equal(rotate1Res.status, 200);
  const rt2 = rotate1Res.body.data.refreshToken;

  // 3. User thật tiếp tục dùng app, xoay vòng RT2 -> Nhận RT3
  const rotate2Res = await request(app)
    .post("/api/auth/refresh-token")
    .send({ refreshToken: rt2 });
  assert.equal(rotate2Res.status, 200);
  const rt3 = rotate2Res.body.data.refreshToken;

  // 4. BÂY GIỜ: KẺ GIAN (HACKER) CỐ TÌNH GỬI LẠI RT1 ĐÃ BỊ DÙNG!
  const attackRes = await request(app)
    .post("/api/auth/refresh-token")
    .send({ refreshToken: rt1 });

  assert.equal(attackRes.status, 403, "Phải chặn lại với mã 403 Forbidden");
  assert.equal(attackRes.body.error.code, "REUSE_DETECTED");

  // 5. Kiểm tra DB: Toàn bộ gia phả Family của chuỗi này phải bị thu hồi (isRevoked = true)
  const hash1 = crypto.tokenHash(rt1);
  const hash3 = crypto.tokenHash(rt3);

  const dbRt1 = await prisma.refreshToken.findUnique({ where: { tokenHash: hash1 } });
  const dbRt3 = await prisma.refreshToken.findUnique({ where: { tokenHash: hash3 } });

  assert.equal(dbRt1.isRevoked, true, "RT1 phải bị thu hồi");
  assert.equal(dbRt3.isRevoked, true, "RT3 của người dùng thật cũng bị thu hồi để bảo vệ an toàn");

  // 6. Người dùng thật cố dùng RT3 sau đó cũng sẽ bị đá ra ngoài đăng nhập lại
  const userAttemptRes = await request(app)
    .post("/api/auth/refresh-token")
    .send({ refreshToken: rt3 });

  assert.equal(userAttemptRes.status, 401);
  assert.equal(userAttemptRes.body.error.code, "REVOKED_REFRESH_TOKEN");
});

test("RTR 4: Đăng xuất (/logout) xóa Cookie và thu hồi token trong DB", async () => {
  // 1. Đăng nhập
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const rt = loginRes.body.data.refreshToken;
  const cookie = loginRes.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));

  // 2. Đăng xuất
  const logoutRes = await request(app)
    .post("/api/auth/logout")
    .set("Cookie", [cookie]);

  assert.equal(logoutRes.status, 200);

  // Cookie bị xóa (hết hạn hoặc rỗng)
  const clearedCookies = logoutRes.headers["set-cookie"];
  assert.ok(clearedCookies.some((c) => c.includes("refreshToken=;")));

  // Token trong DB bị đánh dấu isRevoked = true
  const hash = crypto.tokenHash(rt);
  const dbToken = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  assert.equal(dbToken.isRevoked, true);
});
