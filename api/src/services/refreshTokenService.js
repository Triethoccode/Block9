const crypto = require("node:crypto");
const prisma = require("../prisma");
const { tokenHash } = require("./crypto");

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  };
}

/**
 * Sinh chuỗi Refresh Token ngẫu nhiên (Opaque Cryptographic Random String)
 */
function generateOpaqueToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Tạo một Refresh Token phiên mới khi đăng nhập
 * @param {string} userId - ID người dùng
 * @param {string} [familyId] - ID dòng họ token (nếu không truyền sẽ tự sinh UUID mới)
 */
async function createRefreshTokenSession(userId, familyId = null) {
  const activeFamilyId = familyId || crypto.randomUUID();
  const rawToken = generateOpaqueToken();
  const hash = tokenHash(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  const record = await prisma.refreshToken.create({
    data: {
      userId,
      familyId: activeFamilyId,
      tokenHash: hash,
      expiresAt,
      isUsed: false,
      isRevoked: false,
    },
  });

  return {
    token: rawToken,
    recordId: record.id,
    familyId: activeFamilyId,
    expiresAt,
  };
}

/**
 * Thực hiện Xoay vòng Refresh Token (Rotation) và Phát hiện Dùng lại (Reuse Detection)
 * @param {string} rawToken - Refresh token gửi từ client
 * @returns {Promise<{ newRawToken: string, user: Object, familyId: string, expiresAt: Date }>}
 */
async function rotateRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    const error = new Error("Refresh token không được để trống.");
    error.status = 401;
    error.code = "MISSING_REFRESH_TOKEN";
    throw error;
  }

  const hash = tokenHash(rawToken.trim());

  // Tìm token trong DB kèm thông tin User
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          chefId: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    const error = new Error("Refresh token không hợp lệ hoặc không tồn tại.");
    error.status = 401;
    error.code = "INVALID_REFRESH_TOKEN";
    throw error;
  }

  // 1. Kiểm tra nếu cả Family hoặc Token này đã bị thu hồi trước đó
  if (tokenRecord.isRevoked) {
    const error = new Error("Phiên làm việc đã bị thu hồi. Vui lòng đăng nhập lại.");
    error.status = 401;
    error.code = "REVOKED_REFRESH_TOKEN";
    throw error;
  }

  // 2. PHÁT HIỆN DÙNG LẠI (AUTOMATIC REUSE DETECTION)
  // Nếu token này đã được đánh dấu là "isUsed = true" mà lại được gửi lên một lần nữa:
  // => Chắc chắn có kẻ gian lấy cắp hoặc rò rỉ token cũ!
  if (tokenRecord.isUsed) {
    // Ngay lập tức TRẢM toàn bộ dòng họ Token Family này
    await prisma.refreshToken.updateMany({
      where: { familyId: tokenRecord.familyId },
      data: { isRevoked: true },
    });

    const error = new Error(
      "Cảnh báo bảo mật: Phát hiện Refresh Token đã qua sử dụng được gửi lại (Reuse Detection). Toàn bộ phiên làm việc của thiết bị này đã bị vô hiệu hóa!"
    );
    error.status = 403;
    error.code = "REUSE_DETECTED";
    error.familyId = tokenRecord.familyId;
    error.userId = tokenRecord.userId;
    throw error;
  }

  // 3. Kiểm tra hạn sử dụng (7 ngày)
  if (new Date() > new Date(tokenRecord.expiresAt)) {
    const error = new Error("Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
    error.status = 401;
    error.code = "EXPIRED_REFRESH_TOKEN";
    throw error;
  }

  // 4. Kiểm tra trạng thái tài khoản User
  if (!tokenRecord.user || tokenRecord.user.status !== "active") {
    const error = new Error("Tài khoản chưa được kích hoạt hoặc đã bị khóa.");
    error.status = 403;
    error.code = "ACCOUNT_INACTIVE";
    throw error;
  }

  // 5. HAPPY PATH: THỰC HIỆN XOAY VÒNG (ROTATION)
  // Đánh dấu token hiện tại thành isUsed = true
  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { isUsed: true },
  });

  // Sinh token mới gắn với cùng FamilyId
  const newRawToken = generateOpaqueToken();
  const newHash = tokenHash(newRawToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await prisma.refreshToken.create({
    data: {
      userId: tokenRecord.userId,
      familyId: tokenRecord.familyId,
      tokenHash: newHash,
      expiresAt: newExpiresAt,
      isUsed: false,
      isRevoked: false,
    },
  });

  return {
    newRawToken,
    user: tokenRecord.user,
    familyId: tokenRecord.familyId,
    expiresAt: newExpiresAt,
  };
}

/**
 * Thu hồi một phiên hoặc cả dòng họ token khi người dùng bấm Đăng xuất
 */
async function revokeRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return;
  const hash = tokenHash(rawToken.trim());
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
  });

  if (tokenRecord) {
    // Thu hồi toàn bộ family của token này khi logout
    await prisma.refreshToken.updateMany({
      where: { familyId: tokenRecord.familyId },
      data: { isRevoked: true },
    });
  }
}

module.exports = {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_EXPIRY_MS,
  getCookieOptions,
  generateOpaqueToken,
  createRefreshTokenSession,
  rotateRefreshToken,
  revokeRefreshToken,
};
