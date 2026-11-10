import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../../apiClient";
import { UserPlus, RefreshCw, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaData, setCaptchaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCaptcha = async () => {
    try {
      const data = await authApi.getCaptcha("register");
      setCaptchaData(data);
      setCaptchaAnswer("");
    } catch (err) {
      console.error("Không thể nạp CAPTCHA:", err);
      setError("Không thể tải mã bảo mật. Vui lòng thử lại.");
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (password.length < 8 || password.length > 128 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
      setError("Mật khẩu phải từ 8–128 ký tự, bao gồm cả chữ cái và số.");
      return;
    }

    setLoading(true);

    try {
      await authApi.register({
        email,
        password,
        captchaAnswer,
        challengeId: captchaData?.challengeId,
      });

      navigate(`/activate?email=${encodeURIComponent(email)}`, {
        state: { email, message: "Đăng ký thành công! Vui lòng nhập mã OTP đã được gửi đến email của bạn." },
      });
    } catch (err) {
      console.error("Lỗi đăng ký:", err);
      setError(err.message || "Đăng ký không thành công. Vui lòng thử lại.");
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", paddingLeft: "16px", paddingRight: "16px", maxWidth: "480px", margin: "0 auto", minHeight: "calc(100vh - 80px)" }}>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#fff7ed", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <UserPlus size={24} color="#ea580c" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#1a202c", margin: "0 0 8px" }}>Tạo Tài Khoản Mới</h1>
          <p style={{ color: "#718096", fontSize: "14px", margin: 0 }}>Đăng ký để khám phá và quản trị Restaurant App</p>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px" }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
              Địa chỉ Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@restaurant.vn"
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "15px", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
              Mật khẩu (Ít nhất 8 ký tự, gồm chữ và số)
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: "10px 42px 10px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "15px", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px" }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
              Xác nhận Mật khẩu
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: "10px 42px 10px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "15px", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px" }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "20px", background: "#f9fafb", padding: "14px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#4b5563", marginBottom: "8px" }}>
              Mã xác nhận bảo mật (Bắt buộc khi đăng ký)
            </label>
            {captchaData ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <div
                  dangerouslySetInnerHTML={{ __html: captchaData.svg }}
                  style={{ border: "1px solid #d1d5db", borderRadius: "6px", overflow: "hidden", lineHeight: 0 }}
                />
                <button
                  type="button"
                  onClick={loadCaptcha}
                  className="btn btn--secondary"
                  style={{ padding: "8px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Tải mã khác"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "#6b7280" }}>Đang tải mã bảo mật...</p>
            )}
            <input
              type="text"
              required
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              placeholder="Nhập 5 ký tự trong hình trên..."
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password || !confirmPassword || !captchaAnswer}
            className="btn btn--primary"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "15px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: (loading || !email || !password || !confirmPassword || !captchaAnswer) ? 0.45 : 1,
              cursor: (loading || !email || !password || !confirmPassword || !captchaAnswer) ? "not-allowed" : "pointer",
              filter: (loading || !email || !password || !confirmPassword || !captchaAnswer) ? "grayscale(40%)" : "none",
              transition: "all 0.2s ease-in-out",
            }}
          >
            {loading ? <RefreshCw className="spinner" size={18} /> : "Đăng Ký Tài Khoản"}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center", fontSize: "14px", color: "#6b7280" }}>
          Đã có tài khoản?{" "}
          <Link to="/login" style={{ color: "#ea580c", fontWeight: "600", textDecoration: "none" }}>
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
