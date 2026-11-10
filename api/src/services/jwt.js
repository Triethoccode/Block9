const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET hoặc SESSION_SECRET phải có ít nhất 32 ký tự.");
}

const ISSUER = "restaurant-api";
const DEFAULT_EXPIRES_IN = "2h";

/**
 * Ký tạo Access Token JWT
 * @param {Object} payload - Thông tin người dùng { sub, email, role, chefId }
 * @param {string} [expiresIn] - Thời hạn token (mặc định 2h)
 * @returns {string} JWT Token
 */
function signAccessToken(payload, expiresIn = DEFAULT_EXPIRES_IN) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role || "viewer",
      chefId: payload.chefId ?? null,
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn,
      issuer: ISSUER,
    }
  );
}

/**
 * Xác minh tính hợp lệ của JWT token
 * Cố định thuật toán HS256 và kiểm tra hạn dùng exp
 * @param {string} token 
 * @returns {Object} decoded payload
 */
function verifyAccessToken(token) {
  try {
    return {
      valid: true,
      payload: jwt.verify(token, JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: ISSUER,
      }),
    };
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return { valid: false, expired: true, error: "TOKEN_EXPIRED" };
    }
    return { valid: false, expired: false, error: "INVALID_TOKEN" };
  }
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
