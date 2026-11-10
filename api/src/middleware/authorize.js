/**
 * Middleware kiểm tra vai trò (RBAC)
 * @param {string[]} allowedRoles - Danh sách các role được phép
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Yêu cầu đăng nhập." },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: `Hành động này yêu cầu quyền [${allowedRoles.join(", ")}]. Bạn hiện có vai trò: ${req.user.role}.`,
        },
      });
    }

    next();
  };
}

module.exports = {
  requireRole,
};
