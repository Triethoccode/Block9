import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { authApi } from "../../apiClient";
import { KeyRound, RefreshCw, AlertCircle, CheckCircle2, ArrowRight, Lock } from "lucide-react";

export default function Activate() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const emailParam = searchParams.get("email") || location.state?.email || "";
  const [email] = useState(emailParam);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(location.state?.message || null);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Không xác định được email cần kích hoạt. Vui lòng thực hiện đăng ký tài khoản trước.");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await authApi.activate({ email, otp });
      navigate("/login", {
        state: { message: res.message || "Tài khoản của bạn đã được kích hoạt thành công! Hãy đăng nhập." },
      });
    } catch (err) {
      console.error("Lỗi kích hoạt:", err);
      if (err.code === "ALREADY_ACTIVE") {
        setMessage("Tài khoản này đã được kích hoạt từ trước! Đang chuyển hướng sang Đăng nhập...");
        setTimeout(() => navigate("/login"), 1500);
      } else {
        setError(err.message || "Mã kích hoạt không chính xác hoặc đã hết hạn.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setError(null);
    setMessage(null);
    setResending(true);

    try {
      const res = await authApi.resendOtp({ email });
      setMessage(res.message || "Mã OTP mới đã được gửi vào hòm thư.");
      setCooldown(60);
    } catch (err) {
      if (err.code === "ALREADY_ACTIVE") {
        setMessage("Tài khoản này đã được kích hoạt từ trước! Bạn có thể đăng nhập ngay.");
        setTimeout(() => navigate("/login"), 1500);
      } else {
        setError(err.message || "Không thể gửi lại mã kích hoạt lúc này.");
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: "120px", paddingBottom: "60px", paddingLeft: "16px", paddingRight: "16px", maxWidth: "460px", margin: "0 auto", minHeight: "calc(100vh - 80px)" }}>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <KeyRound size={24} color="#2563eb" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#1a202c", margin: "0 0 8px" }}>Kích Hoạt Tài Khoản</h1>
          <p style={{ color: "#718096", fontSize: "14px", margin: 0 }}>Nhập mã OTP 6 chữ số được gửi tới email</p>
        </div>

        {message && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px" }}>
            <CheckCircle2 size={18} />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "14px", display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px" }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleActivate}>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "14px", fontWeight: "500", color: "#374151" }}>
                Email cần kích hoạt
              </label>
              <span style={{ fontSize: "12px", color: "#6b7280", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <Lock size={12} /> 
              </span>
            </div>
            <input
              type="email"
              readOnly
              disabled
              value={email}
              placeholder="Chưa có email kích hoạt"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
                boxSizing: "border-box",
                backgroundColor: "#f3f4f6",
                color: "#1f2937",
                cursor: "not-allowed",
                fontWeight: "600",
              }}
            />
            {!email && (
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#ef4444" }}>
                Chưa có thông tin email. Vui lòng quay lại trang <Link to="/register" style={{ color: "#ea580c", fontWeight: "600" }}>Đăng ký</Link>.
              </p>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
              Mã xác nhận OTP (6 chữ số)
            </label>
            <input
              type="text"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              style={{ width: "100%", padding: "12px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "20px", textAlign: "center", letterSpacing: "6px", fontWeight: "700", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || otp.length !== 6 || !email}
            className="btn btn--primary"
            style={{ width: "100%", padding: "12px", fontSize: "15px", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            {loading ? <RefreshCw className="spinner" size={18} /> : "Xác Nhận Kích Hoạt"}
          </button>
        </form>

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" }}>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending || !email}
            style={{ background: "none", border: "none", color: cooldown > 0 || !email ? "#9ca3af" : "#ea580c", cursor: cooldown > 0 || !email ? "not-allowed" : "pointer", padding: 0, fontWeight: "500" }}
          >
            {resending ? "Đang gửi lại..." : cooldown > 0 ? `Gửi lại mã sau (${cooldown}s)` : "Gửi lại mã OTP"}
          </button>

          <Link to="/login" style={{ color: "#4b5563", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            Đăng nhập <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
