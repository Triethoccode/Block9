# CẨM NANG TOÀN DIỆN: LÝ THUYẾT, CẤU HÌNH & THUẬT TOÁN BÀI 1 (SSR)

> **Môn học:** Phát triển ứng dụng Web 2  
> **Kiến trúc:** Server-Side Rendering (SSR) — Node.js + Express + EJS + Prisma ORM + PostgreSQL/SQLite  
> **Tài liệu căn cứ:** Slide Block 8 (*Xác thực tài khoản trên SSR*) & Slide Block 9 (*Phân quyền & Kiểm soát truy cập*).

---

## 1. TỔNG QUAN VỀ SESSION TRONG BÀI 1

### Câu hỏi cốt lõi: *"Ở Bài 1 có dùng Session không?"*
**CÓ, 100% BẮT BUỘC DÙNG SESSION!**

* **Kiến trúc SSR (Server-Side Rendering):** Mọi giao diện quản trị (`/admin/*`) và luồng xác thực (Đăng ký, Đăng nhập, Đăng xuất, Đổi mật khẩu) được xử lý bằng cơ chế **Session-Cookie truyền thống**.
* **Khác biệt hoàn toàn với Bài 2 (CSR / SPA):**
  - **Bài 1 (SSR):** Dùng **Session ID (`sid`)** lưu trong Cookie trình duyệt. Server quản lý trạng thái phiên trong Database.
  - **Bài 2 (CSR / SPA):** Dùng **JWT Bearer Token** lưu ở LocalStorage/Memory, gửi qua Header `Authorization: Bearer <token>`.

```mermaid
sequenceDiagram
    autonumber
    actor Browser as Trình duyệt (Client)
    participant Server as Express Server (SSR)
    participant DB as Database (Prisma Session Table)

    Browser->>Server: POST /login { email, password }
    Server->>Server: Kiểm tra RateLimit & Argon2id verify password
    Server->>DB: Tạo bản ghi Session mới (sid, userId, expiresAt)
    Server-->>Browser: HTTP 303 See Other /admin<br>Set-Cookie: sid=s%3A...; HttpOnly; SameSite=Lax; Path=/
    Note over Browser,Server: Các request tiếp theo tới /admin/*:
    Browser->>Server: GET /admin/dishes (Tự động đính kèm Cookie: sid=...)
    Server->>DB: Tra cứu sid trong bảng Session (Kiểm tra hết hạn)
    DB-->>Server: Trả về userId và role
    Server-->>Browser: Render mã HTML trang quản trị (200 OK)
```

---

## 2. QUẢN LÝ SESSION & CẤU HÌNH COOKIE

### 2.1 Cơ chế lưu trữ Session bền vững (Persistent Session Store)
* **Tuyệt đối không dùng RAM (`MemoryStore`):** Lưu trong RAM sẽ gây rò rỉ bộ nhớ, mất toàn bộ phiên khi server restart, và không thể chạy nhiều process song song.
* **Cài đặt thực tế:** Kế thừa lớp `express-session.Store`, viết một Session Store tùy biến kết nối trực tiếp với **Prisma ORM** lưu vào bảng `Session` trong Database.
* **Cấu trúc bảng `Session` trong Schema:**
  - `sid` (String, Khóa chính): Mã định danh phiên ngẫu nhiên độ dài lớn.
  - `userId` (Int, có Index): Dùng để truy vấn và **hủy hàng loạt phiên** của một tài khoản khi cần (ví dụ: khi người dùng đổi mật khẩu hoặc đăng xuất khỏi mọi thiết bị).
  - `data` (String / JSON): Chứa dữ liệu phiên (`{ userId, role, createdAt, ... }`).
  - `expiresAt` (DateTime, có Index): Thời điểm phiên hết hạn để dọn dẹp tự động.

### 2.2 Vòng đời phiên (Session Lifecycle & Rolling)
Hệ thống áp dụng cơ chế hai tầng hạn dùng độc lập:
1. **Hạn không hoạt động (Rolling Idle TTL - 30 phút):**
   - Mỗi khi người dùng gửi một request mới, server tự động gia hạn thêm 30 phút (`touch session`).
   - Nếu người dùng không có bất kỳ thao tác nào trong 30 phút liên tiếp $\rightarrow$ Phiên tự động hết hạn.
2. **Hạn tuyệt đối (Absolute Max Lifetime - 8 giờ):**
   - Khi tạo phiên lúc đăng nhập, server ghi nhận mốc thời gian tuyệt đối `createdAt = Date.now()`.
   - Dù người dùng liên tục click để rolling session, khi chạm ngưỡng 8 giờ tính từ lúc đăng nhập, server bắt buộc hủy phiên và yêu cầu đăng nhập lại để đảm bảo an ninh.

### 2.3 Thuộc tính an toàn của Session Cookie (`sid`)

| Thuộc tính (Flag) | Giá trị | Ý nghĩa phòng thủ bảo mật |
| :--- | :--- | :--- |
| **`HttpOnly`** | `true` | **Chống XSS đánh cắp phiên:** Cấm hoàn toàn mã JavaScript truy cập vào cookie qua `document.cookie`. Dù web bị tấn công XSS, kẻ gian không đọc được `sid`. |
| **`Secure`** | `true` (Production)<br>`false` (Dev HTTP) | **Chống nghe lén (Sniffing):** Trình duyệt chỉ gửi cookie qua kết nối được mã hóa HTTPS. |
| **`SameSite`** | `'Lax'` | **Chống tấn công CSRF:** Trình duyệt không gửi kèm cookie khi request xuất phát từ website thứ ba (ngoại trừ các thao tác điều hướng Top-level navigation an toàn như click link). |
| **`Path`** | `/` | Cookie có hiệu lực trên toàn bộ các route của ứng dụng. |
| **`Domain`** | Không đặt | Giới hạn cookie chỉ có giá trị trên chính Hostname hiện tại, không chia sẻ cho subdomain. |

### 2.4 Cơ chế thu hồi phiên (Revocation)
- **Đăng xuất (`POST /logout`):** Server xóa bản ghi `sid` trong bảng `Session` và gọi `res.clearCookie('sid')`.
- **Đổi mật khẩu / Reset Password:** Server gọi lệnh:
  ```javascript
  await prisma.session.deleteMany({ where: { userId: user.id } });
  ```
  Lệnh này lập tức vô hiệu hóa **toàn bộ các phiên đang hoạt động** trên mọi máy tính/điện thoại khác của tài khoản đó.

---

## 3. BẢNG CẤU HÌNH RATELIMIT & CHỐNG TẤN CÔNG BRUTE-FORCE

Tất cả thông số được quy định tập trung tại [`config/authPolicy.js`](file:///d:/III_HK1/Web2/Block%208-9/Block8/Web-Block8/src/config/authPolicy.js) và lưu trữ bền vững trong bảng `RateLimit` của Database (restart server bộ đếm không bị mất):

| Tuyến đường (Route) | Khóa theo IP | Khóa theo Tài khoản (Email) | Ngưỡng tối đa | Cửa sổ đếm | Thời gian khóa / chờ | Xử lý khi vượt ngưỡng |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Đăng nhập (`/login`)** | Có (`login:ip:<ip>`) | Có (`login:email:<email>`) | **10 lần sai** (Email)<br>**30 req** (IP) | **15 phút** | Khóa **5 phút** | Trả về HTTP **`429 Too Many Requests`**; chặn kiểm tra mật khẩu. |
| **Kích hoạt CAPTCHA** | - | Theo Email chuẩn hóa | **Từ 3 lần sai** | **15 phút** | Đến khi đăng nhập đúng | Buộc hiển thị CAPTCHA; thiếu/sai CAPTCHA từ chối ngay. |
| **Kích hoạt OTP (`/activate`)** | Có (`act:ip:<ip>`) | Có (`act:email:<email>`) | **5 lần sai mã** | 10 phút | Khóa **15 phút** | Khóa phiên kích hoạt; mã bị đóng băng tạm thời. |
| **Gửi lại OTP (`/resend`)** | - | Theo Tài khoản | **5 lần** / giờ | 60 phút | Chờ **60 giây** giữa 2 lần | Chặn spam gửi email hàng loạt; không reset số lần thử sai. |
| **Đăng ký (`/register`)** | Có (`reg:ip:<ip>`) | Theo Email (Unique) | **10 tài khoản** / giờ | 60 phút | Hết 1 giờ | Trả về HTTP `429`, ngăn bot tạo tài khoản rác. |
| **Quên mật khẩu (`/forgot`)** | Có (`forgot:ip:<ip>`) | Có (`forgot:email:<email>`) | **20 req** / giờ (IP)<br>**5 req** / giờ (Email) | 60 phút | Hết 1 giờ | Trả về HTTP `429`, chống dò quét tài khoản và cạn kiệt SMTP quota. |
| **Cấp CAPTCHA (`/captcha/new`)** | Có (`cap:ip:<ip>`) | - | **60 lần** / 15 phút | 15 phút | Hết 15 phút | Chặn script refresh spam sinh SVG liên tục làm nghẽn CPU. |

### Nguyên tắc chống né RateLimit (Anti-Bypass Rules):
1. **Chuẩn hóa Email:** Email người dùng nhập luôn chạy qua hàm:  
   `email = emailRaw.trim().toLowerCase()`  
   trước khi làm khóa đếm RateLimit (tránh việc kẻ gian gõ `User@gmail.com` rồi `uSeR@gmail.com` để lách bộ đếm).
2. **Resend không reset đếm sai:** Thao tác "Gửi lại mã OTP" tạo ra mã hash mới nhưng **giữ nguyên số lần thử sai (`attempts`) và trạng thái khóa (`lockedUntil`)**. Kẻ tấn công không thể dùng nút gửi lại mã để xóa lịch sử thử sai.
3. **Đăng nhập thành công:** Chỉ xóa bộ đếm lỗi theo Email; **vẫn giữ nguyên bộ đếm theo IP** để ngăn 1 IP dùng dictionary attack thử tiếp tài khoản khác.

---

## 4. CÁC THUẬT TOÁN & CƠ CHẾ MẬT MÃ TRONG BÀI 1

### 4.1 Băm mật khẩu (Password Hashing)
* **Thuật toán:** **`Argon2id`** (theo chuẩn RFC 9106, phiên bản kết hợp chống cả tấn công Side-channel và tấn công GPU/ASIC).
* **Tham số cấu hình an ninh:**
  - `memoryCost: 65536` ($64\text{ MiB RAM}$) $\rightarrow$ Khiến các chip phần cứng chuyên dụng không thể băm hàng triệu mật khẩu cùng lúc vì thiếu RAM.
  - `timeCost: 3` (3 vòng lặp lặp lại).
  - `parallelism: 1` (1 luồng CPU).
* **Độ dài mật khẩu:** 8 đến 128 ký tự, bắt buộc chứa ít nhất một chữ cái và một chữ số.

### 4.2 Chống dò tài khoản qua thời gian (Dummy Hash - Timing Attack Defense)
* **Lỗ hổng Timing Attack:**
  - Nếu email tồn tại: Server tốn ~1.200 ms để chạy thuật toán băm Argon2id đối chiếu mật khẩu.
  - Nếu email không tồn tại: Nếu server trả về lỗi ngay trong 5 ms $\implies$ Kẻ tấn công đo thời gian phản hồi là biết email đó có trong hệ thống hay chưa!
* **Cách khắc phục trong code:**
  - Chuẩn bị sẵn một chuỗi hash giả lập (`DUMMY_HASH`).
  - Khi email **không tồn tại**, server vẫn ép chạy hàm `argon2.verify(DUMMY_HASH, password)` để thời gian phản hồi luôn đồng đều (~1.200 ms), xóa bỏ hoàn toàn dấu vết phân biệt tài khoản.

### 4.3 Mã kích hoạt OTP (Email Activation OTP)
* **Thuật toán sinh:** `crypto.randomInt(0, 1000000)` $\rightarrow$ Chuỗi 6 chữ số ngẫu nhiên có độ entropy cao (`"000000"` đến `"999999"`).
* **Thuật toán băm lưu trữ:** **`HMAC-SHA256`** kết hợp khóa bí mật riêng (`OTP_PEPPER`) và `userId`:
  $$\text{otpHash} = \text{HMAC-SHA256}(\text{OTP\_PEPPER},\ \text{userId} + \text{":"} + \text{otp})$$
* **So khớp an toàn:** Dùng `crypto.timingSafeEqual` để tránh tấn công kênh bên đo thời gian so chuỗi.
* **Thời hạn:** 10 phút.

### 4.4 Mã đặt lại mật khẩu (Password Reset Token)
* **Thuật toán sinh:** Sinh 32 byte ngẫu nhiên an toàn mật mã (256-bit entropy) mã hóa Base64url:  
  `const token = crypto.randomBytes(32).toString("base64url");`
* **Cơ chế Hash-at-Rest:**
  - Token gốc nằm trong đường link gửi qua email người dùng: `http://localhost:3000/reset?token=...`
  - Server **tuyệt đối không lưu token gốc vào database**.
  - Server chỉ lưu bản băm: `tokenHash = crypto.createHash("sha256").update(token).digest("hex")`.
  - Hạn dùng: 15 phút, chỉ dùng 1 lần duy nhất (`usedAt`).

---

## 5. CƠ CHẾ CAPTCHA CHỐNG BOT TRONG SSR

* **Thư viện:** `svg-captcha` (sinh mã CAPTCHA dạng ảnh vector SVG, không phụ thuộc vào dịch vụ bên thứ ba Google/Cloudflare).
* **Bảng `CaptchaChallenge` trong Database:**
  - `id`: Mã thử thách dạng chuỗi ngẫu nhiên.
  - `anonId`: Định danh phiên ẩn danh lưu trong cookie trình duyệt (để ràng buộc CAPTCHA với đúng người yêu cầu).
  - `purpose`: Mục đích cụ thể (`'register'` hoặc `'login'`). Không thể lấy CAPTCHA của trang đăng ký đem sang submit trang đăng nhập.
  - `answer`: Chuỗi đáp án đã chuyển chữ thường.
  - `expiresAt`: Hạn dùng 5 phút.
  - `usedAt`: Thời điểm đã tiêu thụ.
* **Nguyên tắc "Consume-on-Verify" (Tiêu thụ một lần duy nhất):**
  - Ngay khi nhận được câu trả lời từ người dùng, server đánh dấu `usedAt = now()` ngay lập tức trong database **trước khi** kiểm tra đáp án đúng hay sai.
  - Dù người dùng nhập đúng hay nhập sai, mã CAPTCHA đó đều bị hủy, ngăn chặn tuyệt đối việc phát lại (Replay Attack).

---

## 6. BẢO VỆ CHỐNG TẤN CÔNG CSRF (SYNCHRONIZER TOKEN PATTERN)

Trong mô hình SSR sử dụng Session-Cookie, nguy cơ lớn nhất là **CSRF (Cross-Site Request Forgery)** vì trình duyệt tự động gửi cookie `sid` khi submit form.

* **Giải pháp triển khai:**
  1. Khi khởi tạo phiên, server sinh một token bí mật ngẫu nhiên lưu trong Session: `req.session.csrfToken`.
  2. Mọi form HTML sử dụng method `POST`, `PATCH`, `DELETE` bắt buộc phải chèn một hidden field:
     ```html
     <input type="hidden" name="_csrf" value="<%= csrfToken %>">
     ```
  3. Khi nhận request, Middleware CSRF kiểm tra:
     - So khớp giá trị `req.body._csrf` với `req.session.csrfToken` bằng `crypto.timingSafeEqual`.
     - Kiểm tra header `Origin` phải trùng khớp với tên miền ứng dụng (`APP_ORIGIN`).
  4. Nếu thiếu token hoặc sai lệch $\rightarrow$ Server từ chối xử lý và phản hồi HTTP **`403 Forbidden`**.

---

## 7. PHÂN QUYỀN RBAC VÀ ABAC TRONG BÀI 1

### 7.1 Ma trận phân quyền chi tiết

| Vai trò (Role) | Quyền Xem (`GET`) | Quyền Tạo (`POST`) | Quyền Sửa (`PATCH`) | Quyền Xóa (`DELETE`) |
| :--- | :--- | :--- | :--- | :--- |
| **`viewer`** | Xem danh sách & chi tiết món ăn. | **Chặn (403)** | **Chặn (403)** | **Chặn (403)** |
| **`editor`** (Đầu bếp) | Xem danh sách & chi tiết món ăn. | **Cho phép.** Món tạo ra tự động nhận `chefId` của user và `status = 'draft'`. | **Kiểm tra 2 điều kiện ABAC:**<br>1. Đúng món mình phụ trách (`dish.chefId == user.chefId`).<br>2. Món phải còn là bản nháp (`dish.status == 'draft'`).<br>$\rightarrow$ Sai 1 trong 2 điều kiện trả về **403**. | **Chặn (403).** Không có quyền xóa bất kỳ món nào. |
| **`admin`** (Quản trị) | Toàn quyền xem. | Toàn quyền tạo món cho bất kỳ đầu bếp nào. | Toàn quyền sửa mọi món (kể cả món của đầu bếp khác và món đã `published`). Chỉ Admin mới được đổi `status`. | **Toàn quyền xóa** món ăn. |

### 7.2 Chuỗi kiểm tra Guard Order tại Server
Khi có request ghi (ví dụ `PATCH /admin/dishes/:id`), server bắt buộc đi qua chuỗi 4 cổng:
1. **Cổng 1 (Authentication):** Đã đăng nhập chưa? (`req.session.userId` tồn tại?). Nếu chưa $\rightarrow$ Chuyển hướng `303 See Other` về `/login`.
2. **Cổng 2 (RBAC Role):** Role có quyền sửa không? Nếu là `viewer` $\rightarrow$ Trả về `403 Forbidden`.
3. **Cổng 3 (Resource Existence):** Món ăn có tồn tại trong Database không? Nếu không $\rightarrow$ Trả về `404 Not Found`.
4. **Cổng 4 (ABAC Attributes):** Nếu là `editor`: Đối chiếu `dish.chefId === user.chefId` và `dish.status === 'draft'`. Nếu vi phạm $\rightarrow$ Trả về `403 Forbidden`.
5. **Thực thi:** Cập nhật DB và chuyển hướng `303 See Other` về danh sách món (Post/Redirect/Get pattern).

---

## 8. BẢNG MÃ TRẠNG THÁI HTTP TRONG BÀI 1 (SSR)

| Mã HTTP | Tên chuẩn | Tình huống áp dụng trong Bài 1 |
| :--- | :--- | :--- |
| **`200 OK`** | Success | Render thành công trang HTML xem dữ liệu hoặc trang hiển thị lỗi nhập liệu form (kèm dữ liệu đã nhập để user không phải gõ lại). |
| **`303 See Other`** | Redirect | Chuyển hướng sau khi thực hiện thao tác ghi thành công (Post/Redirect/Get) để tránh lỗi người dùng nhấn F5 bị submit form lại; hoặc chuyển hướng khách chưa đăng nhập về `/login`. |
| **`400 Bad Request`** | Client Error | Dữ liệu nhập vào form không hợp lệ (ví dụ: giá tiền âm, thiếu tên món, email sai định dạng). |
| **`403 Forbidden`** | Forbidden | Người dùng đã đăng nhập nhưng bị từ chối quyền hạn (Viewer tạo món, Editor sửa món người khác, sai token CSRF). |
| **`404 Not Found`** | Not Found | Đường dẫn sai hoặc ID bản ghi không tồn tại trong cơ sở dữ liệu. |
| **`429 Too Many Requests`**| Rate Limited | Vượt quá số lần thử sai (nhập sai mật khẩu 10 lần, sai OTP 5 lần, spam request). |
