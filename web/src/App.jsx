import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";

// Views cho món ăn (Client)
import DishList from "./views/dishes/DishList";
import DishDetail from "./views/dishes/DishDetail";

// Views cho xác thực (Auth - Bài 1)
import Login from "./views/auth/Login";
import Register from "./views/auth/Register";
import Activate from "./views/auth/Activate";
import ForgotPassword from "./views/auth/ForgotPassword";
import ResetPassword from "./views/auth/ResetPassword";
import ChangePassword from "./views/auth/ChangePassword";

// Views cho món ăn (Admin)
import AdminDishList from "./views/admin/dishes/AdminDishList";
import AdminDishDetail from "./views/admin/dishes/AdminDishDetail";
import DishForm from "./views/admin/dishes/DishForm";
import DishDelete from "./views/admin/dishes/DishDelete";

// Views cho đầu bếp (Admin)
import AdminChefList from "./views/admin/chefs/AdminChefList";
import ChefForm from "./views/admin/chefs/ChefForm";
import ChefDelete from "./views/admin/chefs/ChefDelete";

// Views cho nguyên liệu (Admin)
import AdminIngredientList from "./views/admin/ingredients/AdminIngredientList";
import IngredientForm from "./views/admin/ingredients/IngredientForm";
import IngredientDelete from "./views/admin/ingredients/IngredientDelete";

// Trang 404
import NotFound from "./views/NotFound";

export default function App() {
  return (
    <AuthProvider>
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <Routes>
            {/* Trang chủ tự động chuyển về /dishes */}
            <Route path="/" element={<Navigate to="/dishes" replace />} />
            <Route path="/admin" element={<Navigate to="/admin/dishes" replace />} />

            {/* Món ăn (Public Client) */}
            <Route path="/dishes" element={<DishList />} />
            <Route path="/dishes/:id" element={<DishDetail />} />

            {/* Xác thực (Auth) */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/activate" element={<Activate />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />

            {/* Món ăn Admin (Bảo vệ: Yêu cầu đăng nhập) */}
            <Route
              path="/admin/dishes"
              element={
                <ProtectedRoute>
                  <AdminDishList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dishes/new"
              element={
                <ProtectedRoute>
                  <DishForm isEdit={false} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dishes/:id"
              element={
                <ProtectedRoute>
                  <AdminDishDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dishes/:id/edit"
              element={
                <ProtectedRoute>
                  <DishForm isEdit={true} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dishes/:id/delete"
              element={
                <ProtectedRoute>
                  <DishDelete />
                </ProtectedRoute>
              }
            />

            {/* Đầu bếp (Bảo vệ: Yêu cầu đăng nhập) */}
            <Route
              path="/admin/chefs"
              element={
                <ProtectedRoute>
                  <AdminChefList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chefs/new"
              element={
                <ProtectedRoute>
                  <ChefForm isEdit={false} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chefs/:id/edit"
              element={
                <ProtectedRoute>
                  <ChefForm isEdit={true} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chefs/:id/delete"
              element={
                <ProtectedRoute>
                  <ChefDelete />
                </ProtectedRoute>
              }
            />

            {/* Nguyên liệu (Bảo vệ: Yêu cầu đăng nhập) */}
            <Route
              path="/admin/ingredients"
              element={
                <ProtectedRoute>
                  <AdminIngredientList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ingredients/new"
              element={
                <ProtectedRoute>
                  <IngredientForm isEdit={false} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ingredients/:id/edit"
              element={
                <ProtectedRoute>
                  <IngredientForm isEdit={true} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ingredients/:id/delete"
              element={
                <ProtectedRoute>
                  <IngredientDelete />
                </ProtectedRoute>
              }
            />

            {/* Trang không tìm thấy (404) */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}
