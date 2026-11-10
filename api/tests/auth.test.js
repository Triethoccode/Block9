const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/prisma");
const { signAccessToken } = require("../src/services/jwt");

test.after(async () => {
  await prisma.$disconnect();
});

test("Auth 1: GET /api/auth/captcha cấp phát SVG và challengeId hợp lệ", async () => {
  const res = await request(app).get("/api/auth/captcha?purpose=register");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.data.challengeId);
  assert.ok(res.body.data.svg.includes("<svg"));
});

test("Auth 2: POST /api/auth/register từ chối khi nhập sai CAPTCHA", async () => {
  const res = await request(app).post("/api/auth/register").send({
    email: "test_new_user@example.com",
    password: "Password123",
    captchaAnswer: "WRONG",
    challengeId: "00000000-0000-0000-0000-000000000000",
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "CAPTCHA_FAILED");
});

test("Auth 3: POST /api/auth/login trả về 401 INVALID_CREDENTIALS khi sai thông tin", async () => {
  const res = await request(app).post("/api/auth/login").send({
    email: "nonexistent_user@example.com",
    password: "WrongPassword123",
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("Auth 4: GET /api/auth/me trả về 401 UNAUTHORIZED khi thiếu Bearer token", async () => {
  const res = await request(app).get("/api/auth/me");
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("Auth 5: GET /api/auth/me trả về 401 MALFORMED_TOKEN khi token sai định dạng", async () => {
  const res = await request(app)
    .get("/api/auth/me")
    .set("Authorization", "Basic 123456");
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "MALFORMED_TOKEN");
});

test("Auth 6: POST /api/dishes chặn 401 UNAUTHORIZED khi chưa đăng nhập (không có token)", async () => {
  const res = await request(app).post("/api/dishes").send({ name: "Món Mới", price: 50000 });
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("Auth 7: PATCH /api/dishes/:id chặn 401 UNAUTHORIZED khi chưa đăng nhập", async () => {
  const res = await request(app).patch("/api/dishes/1").send({ name: "Món Sửa" });
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("Auth 8: DELETE /api/dishes/:id chặn 401 UNAUTHORIZED khi chưa đăng nhập", async () => {
  const res = await request(app).delete("/api/dishes/1");
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("Auth 9: POST /api/dishes cho phép người dùng có Token hợp lệ truy cập", async () => {
  const validToken = signAccessToken({
    sub: "00000000-0000-0000-0000-000000000005",
    email: "logged_user@example.com",
    role: "viewer",
  });
  // Gửi với dữ liệu trống để xem server vượt qua bước Auth và đi vào validation nghiệp vụ
  const res = await request(app)
    .post("/api/dishes")
    .set("Authorization", `Bearer ${validToken}`)
    .send({});
  
  // Không bị chặn 401 Unauthorized nữa!
  assert.notEqual(res.status, 401);
  assert.equal(res.body.error?.code, "VALIDATION_FAILED");
});

test("Auth 10: POST /api/auth/change-password chặn 401 khi chưa đăng nhập", async () => {
  const res = await request(app)
    .post("/api/auth/change-password")
    .send({ currentPassword: "OldPass123!", newPassword: "NewPass123!" });
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
});

test("Auth 11: POST /api/auth/change-password từ chối khi nhập sai mật khẩu hiện tại", async () => {
  // Lấy 1 user từ DB (editora@example.test)
  const token = signAccessToken({
    sub: "c23f7643-c1e4-4d27-94b3-20c9db314234",
    email: "editora@example.test",
    role: "editor",
  });

  const res = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: "WrongPassword999!", newPassword: "NewValidPassword123!" });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, "INVALID_CURRENT_PASSWORD");
});

test("Auth 12: POST /api/auth/change-password ưu tiên kiểm tra mật khẩu hiện tại trước khi so khớp trùng mật khẩu mới", async () => {
  const token = signAccessToken({
    sub: "c23f7643-c1e4-4d27-94b3-20c9db314234",
    email: "editora@example.test",
    role: "editor",
  });

  // Dù currentPassword === newPassword, nhưng currentPassword sai -> phải báo sai mật khẩu hiện tại trước!
  const res = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: "WrongPassword999!", newPassword: "WrongPassword999!" });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "INVALID_CURRENT_PASSWORD");
});

test("Auth 13: POST /api/auth/change-password khóa 5 phút khi thử sai mật khẩu hiện tại 5 lần (Brute-Force Protection)", async () => {
  const testSub = "00000000-0000-0000-0000-000000000099";
  const token = signAccessToken({
    sub: testSub,
    email: "bruteforce_test@example.com",
    role: "viewer",
  });

  // Tạo user ảo trong DB để test
  const prismaClient = require("../src/prisma");
  const testHash = await require("../src/services/crypto").hashPassword("CorrectPass123!");
  await prismaClient.user.upsert({
    where: { email: "bruteforce_test@example.com" },
    create: { id: testSub, email: "bruteforce_test@example.com", emailRaw: "bruteforce_test@example.com", passwordHash: testHash, status: "active" },
    update: { passwordHash: testHash },
  });

  // Reset rate limit của user này trước khi test
  await prismaClient.rateLimit.deleteMany({ where: { key: `change-password:user:${testSub}` } });

  // Thử sai 4 lần đầu -> trả 400
  for (let i = 0; i < 4; i++) {
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "WrongPassword!", newPassword: "NewValidPassword123!" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_CURRENT_PASSWORD");
  }

  // Lần thứ 5 -> Khóa tài khoản, trả 429 ACCOUNT_LOCKED!
  const lockedRes = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${token}`)
    .send({ currentPassword: "WrongPassword!", newPassword: "NewValidPassword123!" });

  assert.equal(lockedRes.status, 429);
  assert.equal(lockedRes.body.error.code, "ACCOUNT_LOCKED");

  // Dọn dẹp dữ liệu test
  await prismaClient.rateLimit.deleteMany({ where: { key: `change-password:user:${testSub}` } });
  await prismaClient.user.deleteMany({ where: { id: testSub } });
});
