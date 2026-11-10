# BÁO CÁO TOÀN DIỆN: HỆ THỐNG XÁC THỰC CHO RESTAURANT APP (CSR)
**Khóa học:** Lập Trình Web 2  
**Học phần:** Block 9 — Bài 1: Xác thực cho ứng dụng Nhà hàng kiến trúc CSR (Client-Side Rendering)  
**Nền tảng phát triển:** Base từ Block 7 (REST API Express + React 18 SPA) & Logic an ninh bảo mật kế thừa từ Block 8  
**Thời điểm hoàn thành:** 10/11/2026  
**Trạng thái kiểm thử:** 10/10 API Tests PASS · 9/9 Auth Tests PASS · 10/10 Web SPA Tests PASS · Vite Build: 100% SUCCESS  

---

## 1. Technical Stack (Ngăn xếp công nghệ)

Hệ thống được thiết kế theo mô hình **Cross-Origin Client-Side Rendering (CSR)** tách biệt hoàn toàn giữa Backend API và Frontend Web Client:

| Thành phần | Công nghệ / Thư viện | Phiên bản | Vai trò & Trách nhiệm kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Backend API Server** | Node.js (Express 4) | `4.21.1` | Máy chủ RESTful API phi trạng thái (Stateless), trả dữ liệu theo chuẩn JSON envelope: `{ ok, data, error }`. |
| **Database & ORM** | Supabase (PostgreSQL) + Prisma Client | `5.21.1` | Cơ sở dữ liệu quan hệ lưu trữ thông tin món ăn, tài khoản và thử thách bảo mật; truy vấn an toàn bằng Parameterized Query và Serializable Transaction. |
| **Băm mật khẩu** | `argon2` (Argon2id) | `0.45.2` | Thuật toán băm mật khẩu chuẩn hiện đại, kháng tấn công phần cứng GPU/ASIC và tấn công kênh phụ (Side-Channel Timing Attack). |
| **Chứng thực danh tính** | `jsonwebtoken` (JWT) | `9.0.2` | Phát hành và kiểm tra chữ ký Bearer Access Token không trạng thái phục vụ xác thực giữa React SPA và Express API. |
| **Mã bảo vệ CAPTCHA** | `svg-captcha` | `1.4.0` | Sinh ảnh vector SVG mã xác thực 5 ký tự cục bộ, không phụ thuộc dịch vụ bên thứ ba (Google reCAPTCHA). |
| **Dịch vụ Email OTP** | `nodemailer` | `10.3.1` | Gửi email chứa mã OTP kích hoạt tài khoản và liên kết đặt lại mật khẩu. |
| **Kiểm tra dữ liệu** | `validator` + Node Native Crypto | `13.15.35` | Chuẩn hóa email, kiểm tra định dạng mật khẩu, sinh chuỗi ngẫu nhiên an toàn (`crypto.randomBytes`, `crypto.randomInt`). |
| **Frontend Web SPA** | React 18 + Vite | `18.3.1` / `5.4.10` | Ứng dụng Single Page Application (SPA), định tuyến bằng `react-router-dom` v6, bảo vệ màn hình qua Route Guard. |
| **Biểu tượng UI** | `lucide-react` | `1.61.0` | Thư viện Icon vector tối giản, hiệu năng cao. |

---

## 2. Chi Tiết Thuật Toán Mật Mã & An Ninh (Cryptography Deep-Dive)

### 2.1. Thuật toán băm mật khẩu: Argon2id
- **Lựa chọn:** `argon2.argon2id` (với tham số: `memoryCost: 65536` (64 MB RAM), `timeCost: 3` vòng, `parallelism: 1` luồng).
- **Lý do lựa chọn:** Argon2id là thuật toán chiến thắng cuộc thi Password Hashing Competition (PHC). Đây là sự kết hợp giữa Argon2d (chống bẻ khóa bằng phần cứng GPU) và Argon2i (chống tấn công kênh phụ theo thời gian). Argon2id vượt trội hoàn toàn so với MD5, SHA-1, SHA-256 thuần và bcrypt truyền thống.
- **Vị trí mã nguồn:** [`api/src/services/crypto.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/services/crypto.js#L10) hàm `hashPassword` và `verifyPassword`.

### 2.2. Thuật toán sinh và kiểm tra Bearer Access Token: JWT (JSON Web Token)
- **Lựa chọn:** Cố định thuật toán **HMAC-SHA256 (`HS256`)** với khóa bí mật `JWT_SECRET` (độ dài $\ge 32$ ký tự ngẫu nhiên trong `.env`).
- **Cấu trúc Payload (Claims):**
  - `sub`: UUID định danh duy nhất của người dùng.
  - `email`: Email đã được chuẩn hóa.
  - `role`: Vai trò người dùng (`viewer`, `editor`, `admin`).
  - `chefId`: ID đầu bếp liên kết (nếu có).
  - `iss`: `"restaurant-api"`.
  - `exp`: Thời hạn sống 2 giờ (`2h`).
- **Nguyên tắc bảo vệ:** Khi giải mã (`jwt.verify`), backend **luôn cố định cứng mảng thuật toán `algorithms: ["HS256"]`**, ngăn chặn hoàn toàn lỗ hổng giải mạo token với `alg: "none"`.
- **Vị trí mã nguồn:** [`api/src/services/jwt.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/services/jwt.js#L1-L60).

### 2.3. Thuật toán sinh và kiểm tra CAPTCHA
- **Thuật toán sinh:** `svg-captcha.create({ size: 5, noise: 2, ignoreChars: "0oO1ilI", color: false, background: "#fffdf5" })`.
  - Tạo ảnh SVG vector chứa 5 ký tự ngẫu nhiên cùng 2 đường nhiễu.
  - Loại trừ các ký tự dễ nhầm lẫn thị giác: số `0` & chữ `o/O`, số `1` & chữ `i/l/I`.
- **Cơ chế xác thực một lần (Consume-First):**
  - Đáp án được chuyển về chữ thường và lưu trữ trong bảng `CaptchaChallenge` ở Database với hạn dùng 5 phút.
  - Khi client gửi đáp án lên, server thực hiện `updateMany` đánh dấu `usedAt = now` ngay lập tức (**Consume trước khi đối chiếu đáp án**). Nếu một kẻ tấn công gửi nhiều request đồng thời với cùng một `challengeId`, chỉ duy nhất 1 request xử lý thành công, loại bỏ triệt để Replay Attack.
- **So khớp an toàn:** So sánh chuỗi bằng `crypto.timingSafeEqual` để tránh rò rỉ độ dài hoặc thời gian phản hồi.
- **Vị trí mã nguồn:** [`api/src/services/captcha.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/services/captcha.js#L5-L22).

### 2.4. Thuật toán sinh mã kích hoạt OTP & Pepper
- **Thuật toán sinh:** `String(crypto.randomInt(0, 1000000)).padStart(6, "0")`. Sử dụng bộ sinh số ngẫu nhiên mật mã của hệ thống, sinh đúng 6 chữ số (000000 – 999999).
- **Thuật toán băm lưu trữ:** `crypto.createHmac("sha256", OTP_PEPPER).update(userId + ":" + otp).digest("hex")`.
  - Tuyệt đối không lưu OTP dưới dạng văn bản rõ.
  - Băm bằng HMAC-SHA256 kết hợp chuỗi `OTP_PEPPER` bí mật riêng của server và gắn liền với `userId`.
- **Chống phát lại:** Sau khi kích hoạt thành công, trường `usedAt` được cập nhật thời gian. Mã cũ sẽ không thể tái sử dụng.
- **Vị trí mã nguồn:** [`api/src/services/otp.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/services/otp.js#L1-L45) và [`api/src/services/crypto.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/services/crypto.js#L17-L18).

### 2.5. Cơ chế phòng thủ Brute-force & Khóa tài khoản tạm thời
- Hệ thống áp dụng cơ chế bộ đếm thời gian trượt (Sliding Window) thông qua bảng `RateLimit`:
  - **Đăng ký:** Tối đa 10 lượt / giờ trên một địa chỉ IP.
  - **Đăng nhập thất bại < 3 lần:** Đăng nhập thông thường, không yêu cầu CAPTCHA.
  - **Đăng nhập thất bại $\ge 3$ lần:** Bắt buộc phải giải đúng CAPTCHA mới được kiểm tra mật khẩu.
  - **Đăng nhập thất bại $\ge 10$ lần liên tiếp:** Tạm thời khóa tài khoản trong vòng **5 phút** (`lockedUntil`).
- **Chống dò quét Email (User Enumeration Protection):** Nếu người dùng nhập email không tồn tại trong DB, server vẫn thực hiện một lần băm mật khẩu giả lập `dummyHash = crypto.hashPassword(crypto.random())`. Nhờ đó, thời gian phản hồi (response time) giữa tài khoản có thật và không có thật là đồng đều, kẻ tấn công không thể dựa vào độ trễ để biết email đã đăng ký hay chưa.
- **Vị trí mã nguồn:** [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L235-L315).

---

## 3. Bảng Đối Chiếu Từng Yêu Cầu Đề Bài — Vị Trí Triển Khai & Lựa Chọn Kỹ Thuật

| STT | Yêu cầu bài toán Xác thực (Bài 1) | File mã nguồn & Hàm xử lý | Lựa chọn kỹ thuật & Giải thích lý do |
| :---: | :--- | :--- | :--- |
| **1** | **Cơ sở dữ liệu lưu trữ Xác thực** | [`api/prisma/schema.prisma`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/prisma/schema.prisma#L47-L135) | Bổ sung các bảng: `User`, `RecoveryCode`, `ActivationChallenge`, `PasswordReset`, `CaptchaChallenge`, `RateLimit`. Sử dụng kiểu dữ liệu chuẩn UUID cho khóa chính của người dùng. |
| **2** | **Cấu hình CORS cho kiến trúc CSR** | [`api/src/app.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/app.js#L10-L24) | Thiết lập `Access-Control-Allow-Origin: http://localhost:5173` (chỉ định origin cụ thể, không dùng wildcard `*`), cho phép headers `Authorization` và `Content-Type`. Hỗ trợ xử lý Preflight `OPTIONS` trả về mã 204. |
| **3** | **Cấp phát ảnh CAPTCHA vector** | Endpoint `GET /api/auth/captcha` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L26-L56) | Trả về chuỗi SVG vector cùng mã `challengeId` dạng JSON. Phía React render an toàn trong container cô lập, tải lại tức thì khi bấm nút Refresh. |
| **4** | **Đăng ký tài khoản mới** | Endpoint `POST /api/auth/register` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L62-L148) | Bắt buộc giải đúng CAPTCHA $\rightarrow$ Chuẩn hóa email $\rightarrow$ Băm mật khẩu bằng Argon2id $\rightarrow$ Tạo tài khoản ở trạng thái `pending` $\rightarrow$ Phát hành OTP kích hoạt gửi qua email. |
| **5** | **Kích hoạt tài khoản bằng OTP** | Endpoint `POST /api/auth/activate` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L154-L192) | Đối chiếu mã OTP với mã băm HMAC trong DB, giới hạn 5 lần thử sai. Kích hoạt thành công chuyển tài khoản sang `status = active`. |
| **6** | **Gửi lại mã OTP (Resend Cooldown)** | Endpoint `POST /api/auth/activate/resend` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L198-L235) | Áp dụng thời gian chờ (cooldown 60s) chống spam gửi mail, giao diện React có đồng hồ đếm ngược. |
| **7** | **Đăng nhập & Cấp phát JWT Bearer Token** | Endpoint `POST /api/auth/login` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L240-L330) | Kiểm tra brute force $\rightarrow$ Yêu cầu CAPTCHA nếu sai $\ge 3$ lần $\rightarrow$ So khớp mật khẩu Argon2id $\rightarrow$ Kiểm tra trạng thái kích hoạt $\rightarrow$ Cấp phát JWT Access Token dạng Bearer. |
| **8** | **Lấy thông tin tài khoản hiện tại** | Endpoint `GET /api/auth/me` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L336-L368) | Xác thực token qua Bearer header, trả về thông tin người dùng (`id`, `email`, `role`, `chefId`) để React SPA đồng bộ trạng thái khi refresh (F5). |
| **9** | **Quên & Đặt lại mật khẩu** | Endpoint `POST /forgot-password` & `POST /reset-password` tại [`api/src/routes/auth.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/auth.js#L374-L460) | Sinh token ngẫu nhiên 32 bytes URL-safe, lưu hash SHA-256 có hạn 15 phút. Gửi liên kết đặt lại mật khẩu đến email người dùng. |
| **10** | **Middleware bảo vệ API (Auth Gate)** | [`api/src/middleware/authenticateToken.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/middleware/authenticateToken.js#L1-L60) | Bóc tách header `Authorization: Bearer <token>`, verify chữ ký với HS256. Nếu thiếu token hoặc token sai/hết hạn $\rightarrow$ Trả về mã lỗi HTTP `401 Unauthorized` (`UNAUTHORIZED`, `TOKEN_EXPIRED`, `MALFORMED_TOKEN`). |
| **11** | **Bảo vệ toàn bộ thao tác ghi CRUD** | Các route ghi trong [`dishes.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/dishes.js#L240-L460), [`chefs.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/chefs.js#L78-L175), [`ingredients.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/api/src/routes/ingredients.js#L138-L235) | Mọi thao tác `POST` (thêm mới), `PATCH` (chỉnh sửa), `DELETE` (xóa) đều được gắn middleware `authenticateToken`. Người dùng chưa đăng nhập bị chặn 401; người dùng đã đăng nhập được thực thi thao tác. |
| **12** | **Lớp gọi API tập trung ở Web SPA** | [`web/src/apiClient.js`](file:///D:/III_HK1/Web2/Block%208-9/Block9/web/src/apiClient.js#L1-L150) | Tự động đọc `access_token` từ `localStorage` và gắn vào header `Authorization: Bearer <token>`. Khi gặp lỗi `401 Unauthorized` $\rightarrow$ Tự động xóa token và phát sự kiện `auth:unauthorized` để điều hướng về `/login`. |
| **13** | **Quản lý trạng thái đăng nhập `AuthContext`** | [`web/src/context/AuthContext.jsx`](file:///D:/III_HK1/Web2/Block%208-9/Block9/web/src/context/AuthContext.jsx#L1-L70) | Cung cấp state `user`, `token`, `isAuthenticated`, các hàm `login()`, `logout()`. Khi mở web, tự động gọi `authApi.getMe()` để khôi phục phiên nếu token còn hiệu lực. |
| **14** | **Route Guard bảo vệ giao diện Quản trị** | [`web/src/components/ProtectedRoute.jsx`](file:///D:/III_HK1/Web2/Block%208-9/Block9/web/src/components/ProtectedRoute.jsx#L1-L30) | Bọc toàn bộ các view `/admin/*`. Nếu `isAuthenticated === true` $\rightarrow$ Cho phép truy cập; nếu chưa đăng nhập $\rightarrow$ Chuyển hướng người dùng sang trang `/login`. |
| **15** | **Giao diện xác thực chuyên nghiệp** | Thư mục [`web/src/views/auth/`](file:///D:/III_HK1/Web2/Block%208-9/Block9/web/src/views/auth/) gồm `Login.jsx`, `Register.jsx`, `Activate.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` | Giao diện hiện đại, tự động hiển thị khối CAPTCHA khi phát hiện người dùng thử sai nhiều lần, đếm ngược thời gian gửi lại mã OTP (60s cooldown). |
| **16** | **Thanh điều hướng Navbar nhận biết đăng nhập** | [`web/src/components/Navbar.jsx`](file:///D:/III_HK1/Web2/Block%208-9/Block9/web/src/components/Navbar.jsx#L1-L220) | Khi chưa đăng nhập: Hiển thị liên kết "Đăng Nhập" và "Đăng Ký". Khi đã đăng nhập: Hiển thị email người dùng, nút truy cập "Cổng Quản Trị" và nút "Đăng xuất". |

---

## 4. Cơ Chế Xác Thực Bài 1 (Quy Tắc Truy Cập)

- **Nguyên tắc cốt lõi của Bài 1:** Cứ có Token đăng nhập hợp lệ là được phép truy cập và thao tác toàn bộ các chức năng trong phân hệ Quản trị (`/admin/*`), chưa phân chia vai trò phức tạp.
- **Xử lý phía API:**
  - `GET /api/dishes`, `GET /api/dishes/:id`: Công khai, cho phép thực khách xem thực đơn mà không cần đăng nhập.
  - `POST /api/dishes`, `PATCH /api/dishes/:id`, `DELETE /api/dishes/:id` (và các thao tác ghi tương tự trên chefs/ingredients): Bắt buộc có header `Authorization: Bearer <token>`. Nếu không có $\rightarrow$ Phản hồi `401 Unauthorized` ngay từ tầng middleware.
- **Xử lý phía React Web SPA:**
  - Khi người dùng bấm vào các đường dẫn `/admin/*` mà chưa có token đăng nhập $\rightarrow$ Component `<ProtectedRoute>` tự động chuyển hướng về trang `/login` và ghi nhớ đường dẫn trước đó (`location.state.from`) để chuyển hướng lại sau khi đăng nhập thành công.

---

## 5. Kết Quả Kiểm Thử Nghiệm Thu (Acceptance Test Evidence)

### 5.1. Bộ Kiểm Thử API Chức Năng & Phân Trang (`tests/api.test.js`)
```text
✔ 1. CORS Headers: Response phải có Access-Control-Allow-Origin đúng origin của SPA (3039ms)
✔ 2. CORS Preflight: OPTIONS request phải trả về 204 kèm các headers cho phép (4.9ms)
✔ 3. Lỗi Kỹ thuật 404: Gọi sai URL route phải trả về HTTP 404 và KHÔNG có trường ok (3.9ms)
✔ 4. GET /api/dishes: Trả về trang món ăn với status 200 và metadata phân trang (942ms)
✔ 5. GET /api/dishes/:id (Không tồn tại): Trả về status 200 và lỗi nghiệp vụ NOT_FOUND (181ms)
✔ 6. GET /api/dishes/:id (ID sai định dạng chữ): Xử lý như không tồn tại (status 200, NOT_FOUND) (3.1ms)
✔ 7. POST /api/dishes (Dữ liệu không hợp lệ): Trả về status 200 và lỗi nghiệp vụ VALIDATION_FAILED kèm fields (19ms)
✔ Dish validation requires one chef and at least one ingredient (0.23ms)
✔ 8. GET /api/chefs: Trả về status 200 và response shape { ok: true, data } (587ms)
✔ 9. GET /api/ingredients: Trả về status 200 và response shape { ok: true, data } (222ms)
tests 10 | pass 10 | fail 0 (100% PASS)
```

### 5.2. Bộ Kiểm Thử Bảo Mật & Xác Thực CSR (`tests/auth.test.js`)
```text
✔ Auth 1: GET /api/auth/captcha cấp phát SVG và challengeId hợp lệ (2395ms)
✔ Auth 2: POST /api/auth/register từ chối khi nhập sai CAPTCHA (1005ms)
✔ Auth 3: POST /api/auth/login trả về 401 INVALID_CREDENTIALS khi sai thông tin (1613ms)
✔ Auth 4: GET /api/auth/me trả về 401 UNAUTHORIZED khi thiếu Bearer token (4.9ms)
✔ Auth 5: GET /api/auth/me trả về 401 MALFORMED_TOKEN khi token sai định dạng (3.1ms)
✔ Auth 6: POST /api/dishes chặn 401 UNAUTHORIZED khi chưa đăng nhập (không có token) (2.5ms)
✔ Auth 7: PATCH /api/dishes/:id chặn 401 UNAUTHORIZED khi chưa đăng nhập (2.1ms)
✔ Auth 8: DELETE /api/dishes/:id chặn 401 UNAUTHORIZED khi chưa đăng nhập (1.8ms)
✔ Auth 9: POST /api/dishes cho phép người dùng có Token hợp lệ truy cập (4.6ms)
tests 9 | pass 9 | fail 0 (100% PASS)
```

### 5.3. Bộ Kiểm Thử Giao Diện Web SPA (`web/tests/*.test.js`)
```text
✔ Server diagnostics are never forwarded to the interface (17ms)
✔ Useful validation messages and field errors remain available (0.6ms)
✔ Client chef search uses names, ignores Vietnamese accents and leaves source data intact (2.6ms)
✔ Client ingredient search combines typo-tolerant names with category and unit filters (1.6ms)
✔ Vietnamese search normalizes case, accents, đ and combining marks (0.1ms)
✔ Dish search combines the fixed text rule with every advanced filter and keeps zero/false (0.4ms)
✔ Chef search matches names and specialties without changing ids or data (0.2ms)
✔ Popup fits the mobile viewport and opens below when there is room (0.6ms)
✔ Popup flips above, stays below the navbar and limits tall results (0.1ms)
✔ Visual viewport offsets, narrow screens and navbar clipping are respected (0.7ms)
tests 10 | pass 10 | fail 0 (100% PASS)
```

### 5.4. Đóng Gói Ứng Dụng Web SPA (`npm run build`)
```text
vite v5.4.21 building for production...
transforming...
✓ 1979 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.89 kB │ gzip:  0.50 kB
dist/assets/index-BsSj3Au0.js  311.78 kB │ gzip: 88.26 kB
✓ built in 1.80s
```

### 5.5. Cải Tiến Trải Nghiệm Người Dùng (UX) & Cơ Chế Giám Sát Email
1. **Khóa cố định Email trang kích hoạt (`Activate.jsx`):** Email được tự động chuyển từ trang đăng ký sang với thuộc tính `readOnly`/`disabled` và nhãn hiển thị trực quan; ngăn ngừa người dùng vô tình sửa sai email dẫn đến không kích hoạt được.
2. **Minh bạch hóa trạng thái tài khoản:**
   - Khi đăng ký với email đã được kích hoạt từ trước: API phản hồi `409 EMAIL_EXISTS` hướng dẫn chuyển sang Đăng nhập, thay vì giả lập thành công rồi chuyển vào trang kích hoạt chờ OTP vô ích.
   - Khi gửi lại OTP hoặc kích hoạt lại với tài khoản đã hoạt động: API phản hồi rõ ràng tài khoản đã kích hoạt và tự động gợi ý đăng nhập.
3. **Log OTP & Email Realtime trong môi trường phát triển (Dev Console):**
   - Backend in trực tiếp thông báo `[MAIL DEV]` và `[OTP/TOKEN DEV]` kèm mã số OTP lên terminal console, giúp lập trình viên kiểm thử tức thì kể cả khi email bị chuyển vào thư mục Spam.
4. **Phòng vệ Brute-Force & Trật Tự Kiểm Tra Đổi Mật Khẩu (`change-password`):**
   - Áp dụng cơ chế chống dò mật khẩu: Nếu nhập sai mật khẩu hiện tại 5 lần liên tiếp sẽ tạm khóa chức năng đổi mật khẩu trong 5 phút (`ACCOUNT_LOCKED`).
   - Ưu tiên kiểm tra mật khẩu hiện tại bằng **Argon2id** trước; chỉ khi mật khẩu hiện tại đã đúng thì hệ thống mới kiểm tra xem mật khẩu mới có trùng mật khẩu cũ hay không.
5. **Tinh Giản Menu Tài Khoản Navbar:**
   - Dropdown menu tài khoản chỉ tập trung hiển thị 2 tùy chọn thiết yếu của phiên làm việc: **"Đặt lại mật khẩu"** và **"Đăng xuất"**, loại bỏ hoàn toàn các liên kết điều hướng trùng lặp đã có trên Navbar chính.

---

## 6. Hướng Dẫn Khởi Động & Trải Nghiệm Ứng Dụng

### 1. Khởi động Backend API:
```powershell
cd "D:\III_HK1\Web2\Block 8-9\Block9\api"
npm start
# Server chạy tại: http://localhost:3000
```

### 2. Khởi động Frontend Web SPA:
```powershell
cd "D:\III_HK1\Web2\Block 8-9\Block9\web"
npm run dev
# Mở trình duyệt tại: http://localhost:5173
```

### 3. Kịch bản kiểm chứng nhanh:
1. Mở `http://localhost:5173/admin/dishes` khi chưa đăng nhập $\rightarrow$ Quan sát hệ thống tự động chặn và chuyển hướng về `/login`.
2. Mở `/register` để đăng ký tài khoản với ảnh CAPTCHA vector tự sinh.
3. Kích hoạt tài khoản bằng mã OTP 6 chữ số tại `/activate`.
4. Đăng nhập tại `/login` để nhận JWT Access Token.
5. Sau khi đăng nhập, thanh điều hướng xuất hiện mục **"Cổng Quản Trị"** và cho phép truy cập đầy đủ vào các trang quản lý món ăn, đầu bếp, nguyên liệu.

