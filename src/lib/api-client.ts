/**
 * API Client - Handles all HTTP requests to the Powerline API
 * Manages JWT tokens, automatic refresh, and error handling
 */

import { API_BASE_URL, API_ENDPOINTS, TOKEN_KEY, REFRESH_TOKEN_KEY } from "./api-config";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * تحلیل خطای شبکه — تشخیص علت واقعی خطا برای نمایش به کاربر
 */
function analyzeNetworkError(error: TypeError): string {
  const message = error.message || "";
  const apiHost = "sabadgame.com";
  const currentHost = typeof window !== "undefined" ? window.location.hostname : "";

  // خطای CORS معمول
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    if (currentHost && !currentHost.includes(apiHost)) {
      return `ارتباط با سرور ناموفق بود. احتمالاً به دلیل CORS (مرورگر درخواست از ${currentHost} به ${apiHost} را بلاک کرده).\n\nراه‌حل: در فایل config.php سرور، CORS_ALLOW_ORIGIN را روی '*' تنظیم کنید.`;
    }
    return "ارتباط با سرور ناموفق بود. لطفاً بررسی کنید:\n۱. آیا اینترنت وصل است؟\n۲. آیا سرور sabadgame.com در دسترس است؟\n۳. آیا فایروال/Tor/VPN روشن است؟";
  }

  // خطای Mixed Content (HTTP از HTTPS)
  if (message.includes("mixed content") || message.includes("blocked")) {
    return "درخواست بلاک شده. احتمالاً به دلیل Mixed Content (HTTPS به HTTP).";
  }

  // خطای timeout
  if (message.includes("timeout") || message.includes("aborted")) {
    return "درخواست با تاخیر زیاد روبرو شد. لطفاً دوباره تلاش کنید.";
  }

  return `خطای شبکه: ${message}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  headers?: Record<string, string>;
}

class ApiClient {
  private getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  clearTokens(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem("powerline_user");
  }

  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    const url = `${API_BASE_URL}${endpoint}`;
    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, params, skipAuth, headers = {} } = options;

    const url = this.buildUrl(endpoint, params);

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (!skipAuth) {
      const token = this.getAccessToken();
      if (token) {
        requestHeaders["Authorization"] = `Bearer ${token}`;
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // اگه توکن منقضی شده، تلاش برای رفرش
        if (response.status === 401 && !skipAuth) {
          const refreshed = await this.tryRefresh();
          if (refreshed) {
            // تلاش مجدد درخواست
            return this.request<T>(endpoint, options);
          }
          // رفرش ناموفق — لاگ اوت
          this.clearTokens();
          if (typeof window !== "undefined") {
            window.location.href = "/";
          }
          throw new ApiError(401, "نشست شما منقضی شده است");
        }

        const errorMessage =
          data?.error?.message || data?.message || `خطای سرور (${response.status})`;
        throw new ApiError(response.status, errorMessage, data?.error?.details);
      }

      // اگر پاسخ شامل pagination است، کل ساختار را برگردان (data + pagination)
      // در غیر این صورت فقط data را برگردان
      if (data && typeof data === "object" && "pagination" in data) {
        return data as T;
      }
      return (data?.data ?? data) as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof TypeError) {
        // خطای شبکه — معمولاً CORS یا Mixed Content یا سرور در دسترس نیست
        const reason = analyzeNetworkError(error);
        throw new ApiError(0, reason);
      }
      throw error;
    }
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.refresh}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (data.success && data.data?.access_token) {
        this.setTokens(data.data.access_token, data.data.refresh_token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Helper methods
  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>(endpoint, { method: "GET", params });
  }

  async post<T = unknown>(endpoint: string, body?: unknown, options?: Partial<RequestOptions>): Promise<T> {
    return this.request<T>(endpoint, { method: "POST", body, ...options });
  }

  async put<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: "PUT", body });
  }

  async delete<T = unknown>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
