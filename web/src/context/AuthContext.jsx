import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi, getAuthToken, setAuthToken, removeAuthToken } from "../apiClient";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getAuthToken());
  const [loading, setLoading] = useState(true);

  // Nạp thông tin user khi có token
  useEffect(() => {
    async function loadUser() {
      const savedToken = getAuthToken();
      if (!savedToken) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        console.warn("Không thể nạp thông tin phiên đăng nhập:", err);
        removeAuthToken();
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    // Lắng nghe sự kiện 401 Unauthorized từ apiClient
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const login = async (credentials) => {
    const result = await authApi.login(credentials);
    if (result.token) {
      setAuthToken(result.token);
      setToken(result.token);
      setUser(result.user);
    }
    return result;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Bỏ qua lỗi nếu mạng rớt khi logout
    } finally {
      removeAuthToken();
      setToken(null);
      setUser(null);
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === "admin",
    isEditor: user?.role === "editor",
    isViewer: user?.role === "viewer",
    loading,
    login,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth phải được sử dụng bên trong AuthProvider");
  }
  return context;
}
