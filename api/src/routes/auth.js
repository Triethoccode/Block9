const express = require("express");
const { policy } = require("../config/authPolicy");
const crypto = require("../services/crypto");
const rate = require("../services/rateLimit");
const captcha = require("../services/captcha");
const otp = require("../services/otp");
const { atomic } = require("../services/atomic");
const mail = require("../services/mail");
const { signAccessToken } = require("../services/jwt");
const { authenticateToken } = require("../middleware/authenticateToken");
const {
  REFRESH_TOKEN_COOKIE_NAME,
  getCookieOptions,
  createRefreshTokenSession,
  rotateRefreshToken,
  revokeRefreshToken,
} = require("../services/refreshTokenService");
const prisma = require("../prisma");

const router = express.Router();
const pepper = process.env.OTP_PEPPER || "s1J7QT6nWmxkSMk0ubIGWIq-XK1QCoZftcsML3-fa3RtaeJX7SYSfkrRC57I7uqr";

// Dummy hash để tính thời gian đồng đều chống timing attack khi email không tồn tại
const dummyHash = crypto.hashPassword(crypto.random());
const dummy = () => dummyHash;

const emailOf = req => crypto.normalizeEmail(req.body?.email || req.query?.email || "");
const ipKey = (req, purpose) => `${purpose}:ip:${req.ip}`;

/**
 * GET /api/auth/captcha
 * Trả về SVG CAPTCHA và challengeId
 */
router.get("/captcha", async (req, res) => {
  try {
    const purpose = req.query.purpose === "login" ? "login" : "register";
    const anonId = req.headers["x-anon-id"] || req.query.anonId || crypto.random(16);

    const allowed = await rate.consume(
      prisma,
      ipKey(req, "captcha"),
      policy.captchaIssueLimit,
      policy.captchaIssueWindow
    );
    if (!allowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Yêu cầu CAPTCHA quá thường xuyên. Vui lòng thử lại sau." },
      });
    }

    const challenge = await captcha.issue(prisma, anonId, purpose);
    res.json({
      ok: true,
      data: {
        challengeId: challenge.challengeId,
        anonId,
        svg: challenge.svg,
      },
    });
  } catch (err) {
    console.error("Lỗi cấp phát CAPTCHA:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Không thể tạo CAPTCHA." } });
  }
});

/**
 * POST /api/auth/register
 * Đăng ký tài khoản với email, password, và giải CAPTCHA
 */
router.post("/register", async (req, res) => {
  try {
    const email = emailOf(req);
    const { password, captchaAnswer, challengeId, anonId: bodyAnonId } = req.body;
    const anonId = bodyAnonId || req.headers["x-anon-id"] || "";

    // 1. Kiểm tra Rate limit theo IP
    const allowed = await rate.consume(prisma, ipKey(req, "register"), policy.registerIP, 3600000);
    if (!allowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Quá nhiều lượt đăng ký từ địa chỉ này. Vui lòng thử lại sau." },
      });
    }

    // 2. Kiểm tra CAPTCHA
    const captchaValid = await captcha.verify(
      prisma,
      anonId || "",
      "register",
      challengeId || "",
      captchaAnswer || ""
    );
    if (!captchaValid) {
      return res.status(400).json({
        ok: false,
        error: { code: "CAPTCHA_FAILED", message: "Mã xác nhận CAPTCHA không hợp lệ hoặc đã hết hạn." },
      });
    }

    // 3. Kiểm tra tính hợp lệ của email và mật khẩu
    if (!crypto.validEmail(email) || !crypto.validPassword(password)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Email không đúng định dạng hoặc mật khẩu chưa đủ 8–128 ký tự (gồm cả chữ và số).",
        },
      });
    }

    // 4. Băm mật khẩu bằng Argon2id
    const passwordHash = await crypto.hashPassword(password);
    const minuteBudget = await rate.consume(prisma, `resend:minute:${email}`, 1, policy.resendDelay);
    const hourBudget = await rate.consume(prisma, `resend:hour:${email}`, policy.resendLimit, policy.resendWindow);

    // Kiểm tra tài khoản đã tồn tại và đã kích hoạt chưa
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.status === "active") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "EMAIL_EXISTS",
          message: "Email này đã được đăng ký và kích hoạt tài khoản. Bạn vui lòng chuyển sang trang Đăng nhập hoặc Quên mật khẩu.",
        },
      });
    }

    // 5. Lưu User trong Serializable Transaction
    const issued = await atomic(prisma, async tx => {
      let user = await tx.user.findUnique({ where: { email } });
      const isNew = !user;
      if (isNew) {
        user = await tx.user.create({
          data: {
            email,
            emailRaw: req.body.email,
            passwordHash,
            status: "pending",
            role: "viewer",
          },
        });
      } else if (user.status === "pending") {
        // Cập nhật lại mật khẩu mới nếu đăng ký lại khi chưa kích hoạt
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, emailRaw: req.body.email },
        });
      }

      if (user.status !== "pending") return null;
      if (!isNew && (!minuteBudget || !hourBudget)) return null;

      const result = await otp.issue(tx, user, pepper);
      return result.otp ? { email: user.email, code: result.otp } : null;
    });

    if (issued) {
      mail.send(
        issued.email,
        "Mã kích hoạt tài khoản Restaurant App",
        `Chào bạn,\nMã kích hoạt của bạn là: ${issued.code}\nMã có hiệu lực trong 10 phút.`
      );
    }

    res.status(201).json({
      ok: true,
      data: {
        message: "Đăng ký thành công! Vui lòng kiểm tra email để lấy mã kích hoạt OTP.",
        email,
      },
    });
  } catch (err) {
    console.error("Lỗi đăng ký:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Đã xảy ra lỗi khi đăng ký." } });
  }
});

/**
 * POST /api/auth/activate
 * Nhập mã OTP kích hoạt tài khoản
 */
router.post("/activate", async (req, res) => {
  try {
    const email = emailOf(req);
    const { otp: otpInput } = req.body;

    const ipBudget = await rate.consume(prisma, ipKey(req, "activate"), policy.activationLimit, policy.loginWindow);
    const emailBudget = await rate.consume(prisma, `activate:email:${email}`, policy.activationLimit, policy.loginWindow);
    if (!ipBudget || !emailBudget) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Thao tác quá nhiều lần. Vui lòng thử lại sau." },
      });
    }

    const result = await otp.activate(prisma, email, otpInput, pepper);
    if (result === "already_active") {
      return res.json({
        ok: true,
        data: {
          message: "Tài khoản của bạn đã được kích hoạt thành công từ trước. Bạn có thể đăng nhập ngay.",
        },
      });
    }

    if (result === "limited") {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Đã vượt quá số lần thử OTP cho phép. Tài khoản bị tạm khóa 15 phút." },
      });
    }

    if (result !== "active") {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_OTP", message: "Mã kích hoạt không đúng hoặc đã hết hạn." },
      });
    }

    res.json({
      ok: true,
      data: {
        message: "Kích hoạt tài khoản thành công! Bây giờ bạn có thể đăng nhập.",
      },
    });
  } catch (err) {
    console.error("Lỗi kích hoạt:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Lỗi trong quá trình kích hoạt." } });
  }
});

/**
 * POST /api/auth/activate/resend
 * Gửi lại mã OTP kích hoạt
 */
router.post("/activate/resend", async (req, res) => {
  try {
    const email = emailOf(req);
    if (!email) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Email không được để trống." } });
    }

    const ipBudget = await rate.consume(prisma, ipKey(req, "activate-resend"), policy.activationLimit, policy.loginWindow);
    const minBudget = await rate.consume(prisma, `resend:minute:${email}`, 1, policy.resendDelay);
    const hourBudget = await rate.consume(prisma, `resend:hour:${email}`, policy.resendLimit, policy.resendWindow);

    if (!ipBudget || !minBudget || !hourBudget) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Vui lòng chờ ít nhất 1 phút trước khi yêu cầu gửi lại mã." },
      });
    }

    const sent = await atomic(prisma, async tx => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user) return { status: "NOT_FOUND" };
      if (user.status === "active") return { status: "ALREADY_ACTIVE" };
      const issueRes = await otp.issue(tx, user, pepper);
      return { status: "OK", otp: issueRes.otp };
    });

    if (sent?.status === "ALREADY_ACTIVE") {
      return res.status(400).json({
        ok: false,
        error: { code: "ALREADY_ACTIVE", message: "Tài khoản này đã được kích hoạt rồi. Bạn có thể đăng nhập ngay mà không cần kích hoạt lại." },
      });
    }

    if (sent?.status === "NOT_FOUND") {
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy tài khoản với email này. Vui lòng đăng ký tài khoản mới." },
      });
    }

    if (sent?.otp) {
      mail.send(
        email,
        "Mã kích hoạt tài khoản Restaurant App",
        `Chào bạn,\nMã kích hoạt mới của bạn là: ${sent.otp}\nMã có hiệu lực trong 10 phút.`
      );
    }

    res.json({
      ok: true,
      data: {
        message: "Mã OTP kích hoạt mới đã được gửi vào email của bạn.",
      },
    });
  } catch (err) {
    console.error("Lỗi gửi lại OTP:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Không thể gửi lại mã kích hoạt." } });
  }
});

/**
 * POST /api/auth/login
 * Đăng nhập và nhận JWT Bearer Token
 */
router.post("/login", async (req, res) => {
  try {
    const email = emailOf(req);
    const { password, captchaAnswer, challengeId, anonId: bodyAnonId } = req.body;
    const anonId = bodyAnonId || req.headers["x-anon-id"] || "";
    const key = `login:email:${email}`;

    // 1. Kiểm tra trạng thái khóa brute force
    const failures = await rate.read(prisma, key, policy.loginWindow);
    if (failures.locked) {
      return res.status(429).json({
        ok: false,
        error: {
          code: "ACCOUNT_LOCKED",
          message: "Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau 5 phút.",
        },
      });
    }

    // 2. Giới hạn số request login theo IP
    const ipAllowed = await rate.consume(prisma, ipKey(req, "login"), policy.loginIP, policy.loginWindow);
    if (!ipAllowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Quá nhiều yêu cầu đăng nhập từ IP này. Vui lòng chờ." },
      });
    }

    // 3. Nếu sai từ 3 lần trở lên -> Bắt buộc phải giải CAPTCHA
    const requireCaptcha = failures.count >= policy.loginCaptchaAfter;
    if (requireCaptcha) {
      const captchaValid = await captcha.verify(prisma, anonId || "", "login", challengeId || "", captchaAnswer || "");
      if (!captchaValid) {
        return res.status(400).json({
          ok: false,
          requireCaptcha: true,
          error: { code: "CAPTCHA_FAILED", message: "Mã CAPTCHA không chính xác hoặc đã hết hạn." },
        });
      }
    }

    // 4. Tìm kiếm user và kiểm tra password
    const user = await prisma.user.findUnique({ where: { email } });
    const matches = await crypto.verifyPassword(user?.passwordHash || (await dummy()), password);

    if (!matches) {
      // Tăng số lần thử sai, khóa 5 phút nếu đạt 10 lần
      await rate.consume(prisma, key, policy.loginLockAfter, policy.loginWindow, policy.loginLock);
      const current = await rate.read(prisma, key, policy.loginWindow);
      return res.status(401).json({
        ok: false,
        requireCaptcha: current.count >= policy.loginCaptchaAfter,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email hoặc mật khẩu không chính xác.",
        },
      });
    }

    // 5. Kiểm tra tài khoản đã kích hoạt chưa
    if (user.status !== "active") {
      return res.status(403).json({
        ok: false,
        error: {
          code: "ACTIVATION_REQUIRED",
          message: "Tài khoản chưa được kích hoạt qua OTP. Vui lòng kích hoạt tài khoản.",
          email: user.email,
        },
      });
    }

    // 6. Xóa bộ đếm thất bại sau khi đăng nhập thành công
    await prisma.rateLimit.deleteMany({ where: { key } });

    // 7. Cấp phát JWT Access Token (ngắn hạn - 15 phút)
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      chefId: user.chefId,
    });

    // 8. Cấp phát Refresh Token (dài hạn - 7 ngày) kèm Token Family
    const session = await createRefreshTokenSession(user.id);

    // Gắn Refresh Token vào HttpOnly Cookie
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, session.token, getCookieOptions());

    res.json({
      ok: true,
      data: {
        token,
        refreshToken: session.token, // Phục vụ môi trường test/mobile nếu cần
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          chefId: user.chefId,
        },
      },
    });
  } catch (err) {
    console.error("Lỗi đăng nhập:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Đã xảy ra lỗi khi đăng nhập." } });
  }
});

/**
 * POST /api/auth/refresh-token
 * Xoay vòng Refresh Token (Rotation) và Phát hiện gian lận dùng lại (Reuse Detection)
 */
router.post("/refresh-token", async (req, res) => {
  try {
    const rawToken =
      req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] ||
      req.body?.refreshToken ||
      req.headers["x-refresh-token"];

    if (!rawToken) {
      return res.status(401).json({
        ok: false,
        error: {
          code: "MISSING_REFRESH_TOKEN",
          message: "Vui lòng cung cấp Refresh Token qua HttpOnly Cookie hoặc body.",
        },
      });
    }

    // Thực hiện xoay vòng token trong service
    const rotated = await rotateRefreshToken(rawToken);

    // Cấp phát Access Token mới
    const newAccessToken = signAccessToken({
      sub: rotated.user.id,
      email: rotated.user.email,
      role: rotated.user.role,
      chefId: rotated.user.chefId,
    });

    // Cập nhật lại HttpOnly Cookie với Refresh Token đời mới
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, rotated.newRawToken, getCookieOptions());

    res.json({
      ok: true,
      data: {
        token: newAccessToken,
        refreshToken: rotated.newRawToken,
      },
    });
  } catch (err) {
    // Luôn xóa cookie nếu phát hiện lỗi token hoặc bị hack
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      path: "/api/auth",
    });

    if (err.code === "REUSE_DETECTED") {
      console.warn(`[SECURITY ALERT] ${err.message} (Family: ${err.familyId}, User: ${err.userId})`);
      return res.status(403).json({
        ok: false,
        error: {
          code: "REUSE_DETECTED",
          message: err.message,
        },
      });
    }

    if (err.status) {
      return res.status(err.status).json({
        ok: false,
        error: {
          code: err.code || "UNAUTHORIZED",
          message: err.message,
        },
      });
    }

    console.error("Lỗi xoay vòng refresh token:", err);
    res.status(500).json({
      ok: false,
      error: { code: "SERVER_ERROR", message: "Đã xảy ra lỗi khi làm mới phiên làm việc." },
    });
  }
});

/**
 * POST /api/auth/logout
 * Đăng xuất và thu hồi Refresh Token / Family
 */
router.post("/logout", async (req, res) => {
  try {
    const rawToken =
      req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] ||
      req.body?.refreshToken ||
      req.headers["x-refresh-token"];

    if (rawToken) {
      await revokeRefreshToken(rawToken);
    }

    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      path: "/api/auth",
    });

    res.json({
      ok: true,
      data: { message: "Đăng xuất thành công. Phiên làm việc đã được thu hồi." },
    });
  } catch (err) {
    console.error("Lỗi đăng xuất:", err);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      path: "/api/auth",
    });
    res.status(500).json({
      ok: false,
      error: { code: "SERVER_ERROR", message: "Đã xảy ra lỗi khi đăng xuất." },
    });
  }
});

/**
 * GET /api/auth/me
 * Trả về thông tin user hiện tại qua JWT
 */
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        chefId: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        chef: {
          select: { id: true, name: true, specialty: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: "USER_NOT_FOUND", message: "Không tìm thấy thông tin người dùng." },
      });
    }

    res.json({
      ok: true,
      data: user,
    });
  } catch (err) {
    console.error("Lỗi nạp thông tin user:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Không thể lấy thông tin tài khoản." } });
  }
});

/**
 * POST /api/auth/forgot-password
 * Yêu cầu gửi mã đặt lại mật khẩu qua email
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const email = emailOf(req);
    const ipBudget = await rate.consume(prisma, ipKey(req, "forgot"), policy.forgotIP, 3600000);
    const emailBudget = await rate.consume(prisma, `forgot:email:${email}`, policy.forgotEmail, 3600000);

    if (!ipBudget || !emailBudget) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Quá nhiều yêu cầu. Vui lòng thử lại sau 1 giờ." },
      });
    }

    const token = crypto.random(32);
    const hash = crypto.tokenHash(token);
    const now = new Date();

    const user = await atomic(prisma, async tx => {
      const account = await tx.user.findUnique({ where: { email } });
      if (!account) return null;
      await tx.passwordReset.updateMany({ where: { userId: account.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordReset.create({
        data: {
          userId: account.id,
          tokenHash: hash,
          expiresAt: new Date(+now + policy.resetTTL),
        },
      });
      return account;
    });

    if (user) {
      const resetUrl = `http://localhost:5173/reset-password?token=${encodeURIComponent(token)}`;
      mail.send(
        user.email,
        "Hướng dẫn đặt lại mật khẩu Restaurant App",
        `Chào bạn,\nVui lòng mở liên kết sau để đặt lại mật khẩu (liên kết có hạn trong 15 phút):\n${resetUrl}\n\nHoặc nhập mã token: ${token}`
      );
    }

    res.json({
      ok: true,
      data: {
        message: "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi vào hòm thư.",
      },
    });
  } catch (err) {
    console.error("Lỗi forgot password:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Lỗi xử lý yêu cầu quên mật khẩu." } });
  }
});

/**
 * POST /api/auth/reset-password
 * Xác nhận token và đổi mật khẩu mới
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ ok: false, error: { code: "INVALID_TOKEN", message: "Thiếu mã đặt lại mật khẩu." } });
    }

    if (!crypto.validPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Mật khẩu mới phải có 8–128 ký tự, gồm cả chữ và số." },
      });
    }

    const tokenHash = crypto.tokenHash(token);
    const now = new Date();
    const resetRecord = await prisma.passwordReset.findUnique({ where: { tokenHash } });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt <= now) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_TOKEN", message: "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." },
      });
    }

    const newPasswordHash = await crypto.hashPassword(newPassword);

    await atomic(prisma, async tx => {
      await tx.passwordReset.update({ where: { id: resetRecord.id }, data: { usedAt: now } });
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      });
    });

    res.json({
      ok: true,
      data: { message: "Mật khẩu của bạn đã được cập nhật thành công! Hãy đăng nhập với mật khẩu mới." },
    });
  } catch (err) {
    console.error("Lỗi reset password:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Không thể đặt lại mật khẩu." } });
  }
});

/**
 * POST /api/auth/change-password
 * Đổi mật khẩu cho người dùng đã đăng nhập (yêu cầu mật khẩu hiện tại, chống brute-force)
 */
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const key = `change-password:user:${req.user.id}`;

    // 1. Kiểm tra trạng thái khóa Brute-Force đối với chức năng đổi mật khẩu
    const failures = await rate.read(prisma, key, policy.loginWindow);
    if (failures.locked) {
      return res.status(429).json({
        ok: false,
        error: {
          code: "ACCOUNT_LOCKED",
          message: "Bạn đã nhập sai mật khẩu hiện tại quá nhiều lần.",
        },
      });
    }

    // 2. Giới hạn số request đổi mật khẩu theo IP
    const ipAllowed = await rate.consume(prisma, ipKey(req, "change-password"), 20, policy.loginWindow);
    if (!ipAllowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau." },
      });
    }

    // 3. Bắt buộc phải nhập mật khẩu hiện tại
    if (!currentPassword || typeof currentPassword !== "string") {
      return res.status(400).json({
        ok: false,
        error: { code: "MISSING_CURRENT_PASSWORD", message: "Vui lòng nhập mật khẩu hiện tại." },
      });
    }

    // 4. Lấy thông tin user từ DB
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: "USER_NOT_FOUND", message: "Không tìm thấy thông tin tài khoản." },
      });
    }

    // 5. BƯỚC 1: KIỂM TRA MẬT KHẨU HIỆN TẠI ĐÃ ĐÚNG CHƯA (Argon2id + Brute-force)
    const isCurrentValid = await crypto.verifyPassword(user.passwordHash, currentPassword);
    if (!isCurrentValid) {
      // Ghi nhận lần thử sai; nếu sai >= 5 lần thì khóa 5 phút
      const lockThreshold = 5;
      await rate.consume(prisma, key, lockThreshold, policy.loginWindow, policy.loginLock);
      const current = await rate.read(prisma, key, policy.loginWindow);

      if (current.locked) {
        return res.status(429).json({
          ok: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: "Bạn đã nhập sai mật khẩu hiện tại quá nhiều lần.",
          },
        });
      }

      const remaining = Math.max(0, lockThreshold - current.count);
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_CURRENT_PASSWORD",
          message: `Mật khẩu hiện tại không chính xác.`,
        },
      });
    }

    // 6. Khi mật khẩu hiện tại ĐÃ ĐÚNG -> Xóa bộ đếm brute force
    await prisma.rateLimit.deleteMany({ where: { key } });

    // 7. BƯỚC 2: SAU KHI MẬT KHẨU HIỆN TẠI ĐÃ ĐÚNG, MỚI CHECK 2 TRƯỜNG KIA (MẬT KHẨU MỚI & XÁC NHẬN) CÓ HỢP LỆ HAY KHÔNG
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "PASSWORD_MISMATCH",
          message: "Mật khẩu xác nhận không khớp với mật khẩu mới.",
        },
      });
    }

    if (!newPassword || typeof newPassword !== "string" || !crypto.validPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Mật khẩu mới phải có từ 8–128 ký tự, gồm cả chữ cái và số.",
        },
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "SAME_PASSWORD",
          message: "Mật khẩu mới không được trùng với mật khẩu hiện tại. Vui lòng chọn một mật khẩu khác.",
        },
      });
    }

    // 8. Băm mật khẩu mới bằng Argon2id và cập nhật vào DB
    const newPasswordHash = await crypto.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    res.json({
      ok: true,
      data: { message: "Mật khẩu của bạn đã được thay đổi thành công!" },
    });
  } catch (err) {
    console.error("Lỗi change password:", err);
    res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: "Không thể đổi mật khẩu lúc này." } });
  }
});

module.exports = router;
