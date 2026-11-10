import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../../apiClient";
import { HelpCircle, RefreshCw, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await authApi.forgotPassword({ email });
      setMessage(res.message || "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi đến bạn.");
    } catch (err) {
      setError(err.message || "Không thể gửi yêu cầu đặt lại mật khẩu lúc này.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-pro">
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <div className="auth-icon-badge">
            <HelpCircle size={24} color="#d97706" />
          </div>
          <h1 className="auth-card-title">Quên Mật Khẩu</h1>
          <p className="auth-card-desc">Nhập email đã đăng ký để nhận mã đặt lại mật khẩu</p>
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
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

          <button
            type="submit"
            disabled={loading || !email}
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
              opacity: (loading || !email) ? 0.45 : 1,
              cursor: (loading || !email) ? "not-allowed" : "pointer",
              filter: (loading || !email) ? "grayscale(40%)" : "none",
              transition: "all 0.2s ease-in-out",
            }}
          >
            {loading ? <RefreshCw className="spinner" size={18} /> : "Gửi Hướng Dẫn"}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <Link to="/login" style={{ color: "#4b5563", fontSize: "14px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ArrowLeft size={16} /> Quay lại Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
