import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Route Guard cho Bài 1 (Xác thực CSR):
 * - Đã đăng nhập (có token hợp lệ) -> Cho phép truy cập vào trang quản trị
 * - Chưa đăng nhập -> Tự động chuyển hướng về trang /login
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="container" style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p>Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  // Nếu chưa đăng nhập -> Chuyển hướng sang trang Đăng nhập
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
