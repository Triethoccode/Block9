import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../apiClient";
import { LogIn, RefreshCw, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaData, setCaptchaData] = useState(null);
  const [requireCaptcha, setRequireCaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(location.state?.message || null);

  const from = location.state?.from?.pathname || "/dishes";

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dishes", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const loadCaptcha = async () => {
    try {
      const data = await authApi.getCaptcha("login");
      setCaptchaData(data);
      setCaptchaAnswer("");
    } catch (err) {
      console.error("Không thể nạp CAPTCHA:", err);
    }
  };

  useEffect(() => {
    if (requireCaptcha) {
      loadCaptcha();
    }
  }, [requireCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      await login({
        email,
        password,
        captchaAnswer: requireCaptcha ? captchaAnswer : undefined,
        challengeId: captchaData?.challengeId,
      });
      navigate(from, { replace: true });
    } catch (err) {
      console.error("Lỗi đăng nhập:", err);
      setError(err.message || "Email hoặc mật khẩu không chính xác.");
      if (err.requireCaptcha) {
        setRequireCaptcha(true);
        loadCaptcha();
      } else if (requireCaptcha) {
        loadCaptcha();
      }

      // Nếu tài khoản chưa kích hoạt
      if (err.code === "ACTIVATION_REQUIRED") {
        setTimeout(() => {
          navigate(`/activate?email=${encodeURIComponent(email)}`);
        }, 1500);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", paddingLeft: "16px", paddingRight: "16px", maxWidth: "460px", margin: "0 auto", minHeight: "calc(100vh - 80px)" }}>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#fff7ed", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <LogIn size={24} color="#ea580c" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#1a202c", margin: "0 0 8px" }}>Đăng Nhập</h1>
          <p style={{ color: "#718096", fontSize: "14px", margin: 0 }}>Truy cập vào hệ thống quản lý Restaurant App</p>
        </div>

        {successMessage && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px" }}>
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

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
              placeholder="chef@example.com"
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "15px", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "14px", fontWeight: "500", color: "#374151" }}>
                Mật khẩu
              </label>
              <Link to="/forgot-password" style={{ fontSize: "13px", color: "#ea580c", textDecoration: "none" }}>
                Quên mật khẩu?
              </Link>
            </div>
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

          {requireCaptcha && captchaData && (
            <div style={{ marginBottom: "20px", background: "#f9fafb", padding: "14px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#4b5563", marginBottom: "8px" }}>
                Xác nhận mã bảo mật (Phát hiện thử sai nhiều lần)
              </label>
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
              <input
                type="text"
                required
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Nhập 5 ký tự trong hình..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password || (requireCaptcha && !captchaAnswer)}
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
              opacity: (loading || !email || !password || (requireCaptcha && !captchaAnswer)) ? 0.45 : 1,
              cursor: (loading || !email || !password || (requireCaptcha && !captchaAnswer)) ? "not-allowed" : "pointer",
              filter: (loading || !email || !password || (requireCaptcha && !captchaAnswer)) ? "grayscale(40%)" : "none",
              transition: "all 0.2s ease-in-out",
            }}
          >
            {loading ? (
              <>
                <RefreshCw className="spinner" size={18} />
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              "Đăng Nhập"
            )}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center", fontSize: "14px", color: "#6b7280" }}>
          Chưa có tài khoản?{" "}
          <Link to="/register" style={{ color: "#ea580c", fontWeight: "600", textDecoration: "none" }}>
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </div>
  );
}
