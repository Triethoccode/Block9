require("dotenv").config();
const express = require("express");

const dishesRouter = require("./routes/dishes");
const chefsRouter = require("./routes/chefs");
const ingredientsRouter = require("./routes/ingredients");
const authRouter = require("./routes/auth");

const app = express();

// 1. Cấu hình CORS chặt chẽ theo tiêu chuẩn bài học
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  CLIENT_ORIGIN,
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.endsWith(":5173"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Content-Type, Authorization, X-Anon-Id"
  );

  // Xử lý Preflight Request (OPTIONS) kích hoạt bởi PATCH/DELETE hoặc Content-Type / Authorization / X-Anon-Id
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// 2. Parse payload JSON (bắt buộc cho REST API)
app.use(express.json());

// 3. Đăng ký các tài nguyên REST API
app.use("/api/auth", authRouter);
app.use("/api/dishes", dishesRouter);
app.use("/api/chefs", chefsRouter);
app.use("/api/ingredients", ingredientsRouter);

// 4. Xử lý lỗi kỹ thuật 404: Route không tồn tại trên hệ thống
// Chú ý: Không bọc theo response shape { ok: false } để SPA phân biệt với lỗi nghiệp vụ!
app.use((req, res) => {
  res.status(404).json({
    statusCode: 404,
    error: "Not Found",
    message: `Đường dẫn "${req.originalUrl}" không tồn tại trên máy chủ API.`,
  });
});

// 5. Middleware xử lý lỗi kỹ thuật tập trung 500 (Hệ thống sập, mất DB) (Slide 49, 51)
app.use((err, req, res, next) => {
  // Ghi log lỗi máy chủ an toàn: KHÔNG in chuỗi kết nối database hay mật khẩu
  console.error("Lỗi Máy Chủ Nội Bộ:", {
    name: err && err.name,
    message: err && err.message,
    method: req.method,
    url: req.originalUrl,
  });

  if (res.headersSent) {
    return next(err);
  }

  // Trả về HTTP 500 kỹ thuật thuần túy, không có trường ok
  res.status(500).json({
    statusCode: 500,
    error: "Internal Server Error",
    message: "Đã xảy ra sự cố kỹ thuật trên máy chủ API. Vui lòng kiểm tra lại log server.",
  });
});

module.exports = app;
