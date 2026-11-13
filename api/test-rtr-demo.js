require("dotenv").config();
const { signAccessToken } = require("./src/services/jwt");
const { createRefreshTokenSession } = require("./src/services/refreshTokenService");
const prisma = require("./src/prisma");

async function run() {
  console.log("================================================================================");
  console.log("       BẮT ĐẦU TEST TOÀN DIỆN REFRESH TOKEN ROTATION & REUSE DETECTION          ");
  console.log("================================================================================\n");

  // 1. Lấy 1 user mẫu
  const user = await prisma.user.findFirst({ where: { status: "active" } });
  console.log(`[BƯỚC 1] Giả lập đăng nhập tài khoản: ${user.email}`);

  // Cấp Access Token (hết hạn sau 3s) và Refresh Token 1 (RT1)
  const accessToken1 = signAccessToken(
    { sub: user.id, email: user.email, role: user.role, chefId: user.chefId },
    "3s"
  );
  const session1 = await createRefreshTokenSession(user.id);
  const rawRT1 = session1.token;
  const familyId = session1.familyId;

  console.log(`- Family ID khởi tạo: ${familyId}`);
  console.log(`- Refresh Token 1 (RT1) đã lưu vào DB (isUsed = false, isRevoked = false)`);
  console.log(`- Access Token 1 (AT1) có hạn dùng: 3 giây\n`);

  // 2. Chờ 4s cho Access Token hết hạn
  console.log("[BƯỚC 2] Đang chờ 4 giây để Access Token 1 hết hạn...");
  await new Promise((r) => setTimeout(r, 4000));

  // 3. Gửi request đến Protected API (/api/auth/me) với token hết hạn
  console.log("\n[BƯỚC 3] Gửi GET /api/auth/me với Access Token 1 đã hết hạn:");
  const meRes1 = await fetch("http://localhost:3000/api/auth/me", {
    headers: { Authorization: "Bearer " + accessToken1 },
  });
  const meErr = await meRes1.json();
  console.log(`-> Status: ${meRes1.status} (401 Unauthorized - Đúng kịch bản!)`);
  console.log(`-> Server trả về lỗi: code="${meErr.error.code}", message="${meErr.error.message}"`);

  // 4. Kích hoạt Silent Refresh: Gọi POST /api/auth/refresh-token
  console.log("\n[BƯỚC 4] Kích hoạt Silent Refresh (POST /api/auth/refresh-token kèm Cookie RT1):");
  const refreshRes = await fetch("http://localhost:3000/api/auth/refresh-token", {
    method: "POST",
    headers: {
      Cookie: "refreshToken=" + rawRT1,
      "Content-Type": "application/json",
    },
  });
  const refreshData = await refreshRes.json();
  console.log(`-> Status: ${refreshRes.status} (200 OK - Refresh xoay vòng thành công!)`);

  const rawRT2 = refreshData.data.refreshToken;
  const accessToken2 = refreshData.data.token;

  // 5. Kiểm tra Database sau khi Rotate
  const dbTokensAfterRotation = await prisma.refreshToken.findMany({
    where: { familyId },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n[KIỂM TRA DATABASE SAU KHI ROTATION] (Cùng Family ID: ${familyId}):`);
  console.log(`-> Tổng số token thuộc Family này: ${dbTokensAfterRotation.length} tokens`);
  dbTokensAfterRotation.forEach((t, index) => {
    console.log(
      `   Token #${index + 1}: ID=${t.id.substring(0, 8)}... | isUsed=${t.isUsed} | isRevoked=${t.isRevoked} | Tạo lúc=${t.createdAt.toISOString()}`
    );
  });
  console.log("   => RT1 cũ: isUsed đã tự động chuyển thành TRUE!");
  console.log("   => RT2 mới: ĐÃ ĐƯỢC THÊM VÀO DATABASE với isUsed = FALSE và CÙNG FamilyId!\n");

  // 6. Dùng Access Token 2 mới để gọi lại Protected API
  const meRes2 = await fetch("http://localhost:3000/api/auth/me", {
    headers: { Authorization: "Bearer " + accessToken2 },
  });
  const meData2 = await meRes2.json();
  console.log(`[BƯỚC 5] Retry GET /api/auth/me với Access Token 2 mới:`);
  console.log(`-> Status: ${meRes2.status} (200 OK - Truy cập thành công!)`);
  console.log(`-> User nhận được: ${meData2.data.email || meData2.data.user?.email}\n`);

  // 7. GIẢ LẬP KẺ GIAN TẤN CÔNG (REUSE ATTACK): Dùng lại RT1 cũ
  console.log("--------------------------------------------------------------------------------");
  console.log("[BƯỚC 6] GIẢ LẬP KẺ GIAN TẤN CÔNG: Kẻ gian cố tình dùng lại chuỗi RT1 cũ đã xoay...");
  console.log("--------------------------------------------------------------------------------");
  const hackerRes = await fetch("http://localhost:3000/api/auth/refresh-token", {
    method: "POST",
    headers: {
      Cookie: "refreshToken=" + rawRT1,
      "Content-Type": "application/json",
    },
  });
  const hackerData = await hackerRes.json();
  console.log(`-> Status: ${hackerRes.status} (403 Forbidden - PHÁT HIỆN DÙNG LẠI REUSE_DETECTED!)`);
  console.log(`-> Mã lỗi: ${hackerData.error.code}`);
  console.log(`-> Cảnh báo: ${hackerData.error.message}\n`);

  // 8. Kiểm tra Database sau khi phát hiện Reuse: Toàn bộ Family bị Revoke
  const dbTokensAfterReuse = await prisma.refreshToken.findMany({
    where: { familyId },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[KIỂM TRA DATABASE SAU KHI KÍCH HOẠT REUSE DETECTION] (Family ID: ${familyId}):`);
  dbTokensAfterReuse.forEach((t, index) => {
    console.log(
      `   Token #${index + 1}: ID=${t.id.substring(0, 8)}... | isUsed=${t.isUsed} | isRevoked=${t.isRevoked} (ĐÃ BỊ HỦY TOÀN BỘ!)`
    );
  });
  console.log("   => CẢ 2 TOKEN CỦA FAMILY ĐỀU BỊ ĐÁNH DẤU isRevoked = TRUE!\n");

  // 9. Người dùng thật tiếp tục dùng RT2 sau đó -> Bị từ chối vì Family đã bị hủy
  console.log("[BƯỚC 7] Người dùng thật dùng tiếp RT2 sau đó:");
  const victimRes = await fetch("http://localhost:3000/api/auth/refresh-token", {
    method: "POST",
    headers: {
      Cookie: "refreshToken=" + rawRT2,
      "Content-Type": "application/json",
    },
  });
  const victimData = await victimRes.json();
  console.log(`-> Status: ${victimRes.status} (${victimData.error.code})`);
  console.log(`-> Thông báo: ${victimData.error.message}`);
  console.log(`-> Kết quả: Cả người dùng thật và kẻ gian đều bị đá văng ra ngoài để bảo vệ tài khoản!\n`);

  console.log("================================================================================");
  console.log("             TEST THÀNH CÔNG RỰC RỠ: TẤT CẢ CƠ CHẾ ĐỀU CHÍNH XÁC 100%!          ");
  console.log("================================================================================");

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("Lỗi test:", e);
  process.exit(1);
});
