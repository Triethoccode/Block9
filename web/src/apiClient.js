// Nơi duy nhất định nghĩa URL gốc của API (Slide 29, 50)
export const API_BASE_URL = "http://localhost:3000/api";

const TOKEN_KEY = "access_token";
const ANON_ID_KEY = "anon_device_id";

/**
 * Lấy Token từ LocalStorage (An toàn trên cả Node.js test và Browser)
 */
export function getAuthToken() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Lưu Token vào LocalStorage
 */
export function setAuthToken(token) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

/**
 * Xóa Token
 */
export function removeAuthToken() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/**
 * Lấy hoặc sinh Anon ID cho CAPTCHA
 */
export function getAnonId() {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null;
  try {
    let id = sessionStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = "anon_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      sessionStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Hàm gọi API tổng quát bóc tách chính xác 3 tầng lỗi theo tiêu chuẩn bài giảng
 * @param {string} endpoint - Ví dụ: '/dishes', '/dishes/2'
 * @param {object} options - Cấu hình fetch (method, headers, body...)
 * @returns {Promise<any>} data trả về khi ok: true
 */
export async function apiRequest(endpoint, options = {}) {
  let response;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Tự động gắn Bearer Token nếu đã đăng nhập
  const token = getAuthToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Tự động gắn X-Anon-Id cho các endpoint liên quan đến xác thực / CAPTCHA
  if (endpoint.startsWith("/auth")) {
    const anonId = getAnonId();
    if (anonId && !headers["X-Anon-Id"]) {
      headers["X-Anon-Id"] = anonId;
    }
  }

  // --- TẦNG 1: Kiểm tra lỗi mạng hoặc bị CORS chặn ---
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (networkError) {
    if (networkError.name === "AbortError") throw networkError;
    throw {
      type: "NETWORK_ERROR",
      isTechnical: true,
      message: "Không thể kết nối. Vui lòng kiểm tra lại đường truyền mạng hoặc thử lại sau.",
    };
  }

  // --- TẦNG 2: Kiểm tra lỗi kỹ thuật HTTP Status (404 sai URL, 500 lỗi máy chủ, 401/403) ---
  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // payload rỗng hoặc non-json
    }

    // Xử lý 401 Unauthorized: Phiên hết hạn hoặc chưa đăng nhập -> Xóa token
    if (response.status === 401) {
      removeAuthToken();
      // Phát sự kiện toàn cục để Context hoặc UI bắt
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
      throw {
        type: "UNAUTHORIZED",
        isTechnical: false,
        status: 401,
        code: payload?.error?.code || "UNAUTHORIZED",
        message: payload?.error?.message || "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.",
      };
    }

    // Xử lý 403 Forbidden: Không đủ quyền
    if (response.status === 403) {
      throw {
        type: "FORBIDDEN",
        isTechnical: false,
        status: 403,
        code: payload?.error?.code || "FORBIDDEN",
        message: payload?.error?.message || "Bạn không có quyền thực hiện thao tác này.",
      };
    }

    // Xử lý tất cả các lỗi nghiệp vụ trả về từ API (400, 409 Conflict, 422, 429 Rate Limit...)
    if (payload?.error || payload?.ok === false || response.status === 400 || response.status === 409 || response.status === 429) {
      throw {
        type: "BUSINESS_ERROR",
        isTechnical: false,
        status: response.status,
        code: payload?.error?.code || (response.status === 429 ? "RATE_LIMITED" : "BAD_REQUEST"),
        message: payload?.error?.message || "Dữ liệu không hợp lệ hoặc đã vượt giới hạn thao tác.",
        requireCaptcha: payload?.requireCaptcha || false,
        fields: payload?.error?.fields || {},
      };
    }

    const errMessage = response.status === 404
      ? "Không tìm thấy thông tin bạn yêu cầu."
      : "Không thể hoàn tất yêu cầu lúc này. Vui lòng thử lại sau.";

    throw {
      type: "HTTP_ERROR",
      isTechnical: true,
      status: response.status,
      message: errMessage,
    };
  }

  // Đọc dữ liệu JSON
  let payload;
  try {
    payload = await response.json();
  } catch (jsonErr) {
    throw {
      type: "PARSE_ERROR",
      isTechnical: true,
      message: "Không thể xử lý dữ liệu. Vui lòng thử lại sau.",
    };
  }

  // --- TẦNG 3: Kiểm tra lỗi nghiệp vụ (ok: false) ---
  if (!payload.ok) {
    throw {
      type: "BUSINESS_ERROR",
      isTechnical: false,
      code: payload.error?.code || "UNKNOWN_BUSINESS_ERROR",
      message: payload.error?.message || "Không thể hoàn tất thao tác. Vui lòng thử lại.",
      fields: payload.error?.fields || {},
    };
  }

  // Thành công hoàn toàn -> trả về dữ liệu nghiệp vụ sạch
  return payload.data;
}

// ==================== CÁC HÀM TIỆN ÍCH CHO XÁC THỰC (AUTH) ====================
export const authApi = {
  getCaptcha: (purpose = "register") => {
    const anonId = getAnonId();
    return apiRequest(`/auth/captcha?purpose=${encodeURIComponent(purpose)}&anonId=${encodeURIComponent(anonId)}`);
  },
  register: (data) =>
    apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...data, anonId: getAnonId() }),
    }),
  activate: (data) =>
    apiRequest("/auth/activate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resendOtp: (data) =>
    apiRequest("/auth/activate/resend", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ ...data, anonId: getAnonId() }),
    }),
  getMe: () => apiRequest("/auth/me"),
  forgotPassword: (data) =>
    apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resetPassword: (data) =>
    apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  changePassword: (data) =>
    apiRequest("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ==================== CÁC HÀM TIỆN ÍCH CHO MÓN ĂN ====================
export const dishApi = {
  listPage: (params = {}, signal) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    return apiRequest(`/dishes?${query.toString()}`, { signal });
  },
  list: (params = {}) => {
    const query = {
      mode: params.category || params.status ? "advanced" : "basic",
      sort: params.sort === "name" ? "name_asc" : params.sort || "id_asc",
      page: 1,
      pageSize: 100,
    };
    if (params.q) query.q = params.q;
    if (params.category) query.category = params.category;
    if (params.status === "available") query.available = "true";
    if (params.status === "unavailable") query.available = "false";

    const loadAll = async () => {
      const first = await dishApi.listPage(query);
      const items = [...first.items];
      for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
        const result = await dishApi.listPage({ ...query, page });
        items.push(...result.items);
      }
      return items;
    };
    return loadAll();
  },
  getById: (id) => apiRequest(`/dishes/${id}`),
  create: (data) =>
    apiRequest("/dishes", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    apiRequest(`/dishes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    apiRequest(`/dishes/${id}`, {
      method: "DELETE",
    }),
};

// ==================== CÁC HÀM TIỆN ÍCH CHO ĐẦU BẾP ====================
export const chefApi = {
  list: (params = {}, signal) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return apiRequest(`/chefs${qs}`, { signal });
  },
  getById: (id) => apiRequest(`/chefs/${id}`),
  create: (data) =>
    apiRequest("/chefs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    apiRequest(`/chefs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    apiRequest(`/chefs/${id}`, {
      method: "DELETE",
    }),
};

// ==================== CÁC HÀM TIỆN ÍCH CHO NGUYÊN LIỆU ====================
export const ingredientApi = {
  list: (params = {}, signal) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.category) query.set("category", params.category);
    if (params.unit) query.set("unit", params.unit);
    if (params.mode) query.set("mode", params.mode);
    if (params.match) query.set("match", params.match);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return apiRequest(`/ingredients${qs}`, { signal });
  },
  getById: (id) => apiRequest(`/ingredients/${id}`),
  create: (data) =>
    apiRequest("/ingredients", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    apiRequest(`/ingredients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    apiRequest(`/ingredients/${id}`, {
      method: "DELETE",
    }),
};
