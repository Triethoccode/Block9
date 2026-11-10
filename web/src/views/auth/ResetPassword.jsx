import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../../apiClient";
import { Lock, RefreshCw, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 128 || !/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) {
      setError("Mật khẩu mới phải từ 8–128 ký tự, gồm cả chữ cái và số.");
      return;
    }

    setLoading(true);

    try {
      const res = await authApi.resetPassword({ token, newPassword });
      navigate("/login", {
        state: { message: res.message || "Mật khẩu đã được thay đổi thành công! Vui lòng đăng nhập với mật khẩu mới." },
      });
    } catch (err) {
      setError(err.message || "Không thể đặt lại mật khẩu. Token có thể đã hết hạn.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card-pro">
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <div className="auth-icon-badge">
            <Lock size={24} color="#d97706" />
          </div>
          <h1 className="auth-card-title">Đặt Lại Mật Khẩu</h1>
          <p className="auth-card-desc">Tạo mật khẩu mới cho tài khoản của bạn</p>
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
              Mã Token Xác Nhận
            </label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Dán mã token từ email..."
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
              Mật khẩu mới (8–128 ký tự, gồm chữ và số)
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showNewPassword ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: "10px 42px 10px 14px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "15px", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px" }}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
              Xác nhận Mật khẩu mới
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

          <button
            type="submit"
            disabled={loading || !token || !newPassword || !confirmPassword}
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
              opacity: (loading || !token || !newPassword || !confirmPassword) ? 0.45 : 1,
              cursor: (loading || !token || !newPassword || !confirmPassword) ? "not-allowed" : "pointer",
              filter: (loading || !token || !newPassword || !confirmPassword) ? "grayscale(40%)" : "none",
              transition: "all 0.2s ease-in-out",
            }}
          >
            {loading ? <RefreshCw className="spinner" size={18} /> : "Cập Nhật Mật Khẩu"}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <Link to="/login" style={{ color: "#ea580c", fontSize: "14px", textDecoration: "none", fontWeight: "500" }}>
            Quay lại Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
