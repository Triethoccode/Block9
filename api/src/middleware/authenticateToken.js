const { verifyAccessToken } = require("../services/jwt");

/**
 * Middleware xác thực Bearer JWT Token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  
  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Không tìm thấy Authorization header. Vui lòng đăng nhập.",
      },
    });
  }

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return res.status(401).json({
      ok: false,
      error: {
        code: "MALFORMED_TOKEN",
        message: "Định dạng Authorization header phải là: Bearer <token>",
      },
    });
  }

  const token = parts[1];
  const result = verifyAccessToken(token);

  if (!result.valid) {
    return res.status(401).json({
      ok: false,
      error: {
        code: result.error,
        message: result.expired
          ? "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại."
          : "Token xác thực không hợp lệ.",
      },
    });
  }

  // Gán thông tin đã giải mã từ token vào req.user
  req.user = {
    id: result.payload.sub,
    email: result.payload.email,
    role: result.payload.role,
    chefId: result.payload.chefId,
  };

  next();
}

/**
 * Middleware tùy chọn: Nếu có token thì giải mã, không có thì bỏ qua (dành cho route công khai nhưng muốn cá nhân hóa)
 */
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.trim().split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      const result = verifyAccessToken(parts[1]);
      if (result.valid) {
        req.user = {
          id: result.payload.sub,
          email: result.payload.email,
          role: result.payload.role,
          chefId: result.payload.chefId,
        };
      }
    }
  }
  next();
}

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
};
