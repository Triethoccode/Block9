import { ArrowRight, Menu, X, LogIn, LogOut, User, KeyRound, ShieldCheck, ChevronDown } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const isAuthPage = [
    "/register",
    "/login",
    "/activate",
    "/forgot-password",
    "/reset-password",
    "/change-password",
  ].some((path) => location.pathname.startsWith(path));

  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  const userMenuRef = useRef(null);

  // Đóng user menu khi click bên ngoài
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Trên các trang quản trị, trang xác thực (login/register) hoặc khi cuộn trang: luôn có nền tối để chữ và logo không bị chìm
  const isSolid = isAdmin || isAuthPage || isScrolled;

  function closeMenu(restoreFocus = false) {
    setMenuOpen(false);
    if (restoreFocus) {
      toggleRef.current?.focus({ preventScroll: true });
    }
  }

  function handleNavigationClick(event) {
    if (event.target.closest("a") || event.target.closest("button")) {
      closeMenu();
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Đóng menu mobile khi chuyển route
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 768px)");
    function handleBreakpointChange() {
      setMenuOpen(false);
    }
    mobile.addEventListener("change", handleBreakpointChange);
    return () => mobile.removeEventListener("change", handleBreakpointChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const body = document.body;
    const overflow = body.style.getPropertyValue("overflow");
    const priority = body.style.getPropertyPriority("overflow");
    body.style.setProperty("overflow", "hidden");
    panelRef.current?.querySelector("a")?.focus({ preventScroll: true });

    function handleEscape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (overflow) {
        body.style.setProperty("overflow", overflow, priority);
      } else {
        body.style.removeProperty("overflow");
      }
    };
  }, [menuOpen]);

  const canAccessAdmin = isAuthenticated;

  const renderUserMenu = () => (
    <div ref={userMenuRef} style={{ position: "relative", marginLeft: "12px" }}>
      <button
        type="button"
        onClick={() => setUserMenuOpen((prev) => !prev)}
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          borderRadius: "20px",
          padding: "5px 12px",
          color: "#ffffff",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          fontWeight: "500",
        }}
        title="Quản lý tài khoản"
        aria-expanded={userMenuOpen}
        aria-haspopup="true"
      >
        <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", color: "#1c1917" }}>
          <User size={13} strokeWidth={2.5} />
        </div>
        <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user?.email || "Tài khoản"}
        </span>
        <ChevronDown size={14} style={{ transform: userMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {userMenuOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            width: "240px",
            background: "#ffffff",
            borderRadius: "14px",
            boxShadow: "0 18px 40px -6px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.06)",
            border: "1px solid rgba(229, 231, 235, 0.8)",
            padding: "8px 0",
            zIndex: 1050,
            color: "#1f2937",
            animation: "fadeInDown 0.2s ease",
          }}
        >
          <div style={{ padding: "10px 16px 12px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <p style={{ margin: 0, fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
                Tài khoản
              </p>
              <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", background: user?.role === "admin" ? "#fef3c7" : "#f3f4f6", color: user?.role === "admin" ? "#b45309" : "#4b5563", fontWeight: "700" }}>
                {user?.role === "admin" ? "Quản Trị Viên" : "Thành Viên"}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email}
            </p>
          </div>

          <div style={{ padding: "6px 0" }}>
            <Link
              to="/change-password"
              onClick={() => {
                setUserMenuOpen(false);
                closeMenu();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 16px",
                fontSize: "13px",
                color: "#374151",
                textDecoration: "none",
                fontWeight: "500",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <KeyRound size={16} color="#d97706" />
              <span>Đặt lại mật khẩu</span>
            </Link>
          </div>

          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "4px" }}>
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                closeMenu();
                logout();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "9px 16px",
                fontSize: "13px",
                color: "#dc2626",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontWeight: "500",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fef2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <LogOut size={16} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <nav
      aria-label="Điều hướng chính"
      className={`navbar ${isAdmin || isAuthPage ? "navbar--admin" : ""} ${isSolid ? "navbar--scrolled" : ""}`}
      style={isSolid ? { background: "var(--charcoal, #1c1917)", borderBottom: "2px solid var(--gold, #d97706)" } : {}}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          closeMenu();
        }
      }}
    >
      {menuOpen && (
        <button
          type="button"
          className="navbar__backdrop"
          tabIndex={-1}
          aria-label="Đóng menu bằng vùng ngoài"
          onClick={() => closeMenu(true)}
        />
      )}
      <div className="navbar__inner" style={{ width: "100%", maxWidth: "100%", padding: "0 clamp(20px, 3.5vw, 48px)", boxSizing: "border-box" }}>
        {isAdmin ? (
          /* ==================== PHÍA QUẢN TRỊ (ADMIN) ==================== */
          <>
            <Link to="/admin/dishes" className="navbar__logo" onFocus={() => closeMenu()}>
              <img src="/assets/img/logo-white.svg" alt="RESTORAN ADMIN" />
            </Link>

            <div ref={panelRef} id="main-navigation" className={`navbar__menu ${menuOpen ? "open" : ""}`} onClick={handleNavigationClick}>
              <NavLink
                to="/admin/dishes"
                className={({ isActive }) =>
                  `navbar__link ${location.pathname.startsWith("/admin/dishes") ? "navbar__link--active" : ""}`
                }
              >
                Món Ăn
              </NavLink>

              <NavLink
                to="/admin/chefs"
                className={({ isActive }) =>
                  `navbar__link ${location.pathname.startsWith("/admin/chefs") ? "navbar__link--active" : ""}`
                }
              >
                Đầu Bếp
              </NavLink>

              <NavLink
                to="/admin/ingredients"
                className={({ isActive }) =>
                  `navbar__link ${location.pathname.startsWith("/admin/ingredients") ? "navbar__link--active" : ""}`
                }
              >
                Nguyên Liệu
              </NavLink>

              <Link to="/dishes" className="navbar__link navbar__link--client">
                Xem Trang Khách <ArrowRight className="ui-icon" aria-hidden="true" />
              </Link>

              {/* Thông tin user & Menu Thao tác */}
              {renderUserMenu()}
            </div>
          </>
        ) : (
          /* ==================== PHÍA THỰC KHÁCH (CLIENT) ==================== */
          <>
            <Link to="/dishes" className="navbar__logo" onFocus={() => closeMenu()}>
              <img src="/assets/img/logo-white.svg" alt="RESTORAN" />
            </Link>

            <div ref={panelRef} id="main-navigation" className={`navbar__menu ${menuOpen ? "open" : ""}`} onClick={handleNavigationClick}>
              <NavLink
                to="/dishes"
                end
                className={({ isActive }) =>
                  `navbar__link ${isActive ? "navbar__link--active" : ""}`
                }
              >
                Thực Đơn
              </NavLink>

              {canAccessAdmin && (
                <Link to="/admin/dishes" className="navbar__link navbar__link--admin">
                  Cổng Quản Trị
                </Link>
              )}

              {/* Khu vực Xác thực người dùng */}
              {isAuthenticated ? (
                renderUserMenu()
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "8px" }}>
                  <Link to="/login" className="navbar__link" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <LogIn size={15} /> Đăng Nhập
                  </Link>
                  <Link to="/register" className="btn btn--primary" style={{ padding: "6px 14px", fontSize: "13px" }}>
                    Đăng Ký
                  </Link>
                </div>
              )}
            </div>
          </>
        )}

        <button
          ref={toggleRef}
          type="button"
          className={`navbar__toggle ${menuOpen ? "active" : ""}`}
          aria-label={menuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => {
            if (menuOpen) {
              closeMenu(true);
            } else {
              setMenuOpen(true);
            }
          }}
        >
          {menuOpen ? <X className="ui-icon ui-icon--menu" aria-hidden="true" /> : <Menu className="ui-icon ui-icon--menu" aria-hidden="true" />}
        </button>
      </div>
    </nav>
  );
}
