/**
 * API Client - Handles all HTTP requests to the Powerline API
 * Manages JWT tokens, automatic refresh, and error handling
 */

import { API_BASE_URL, API_ENDPOINTS, TOKEN_KEY, REFRESH_TOKEN_KEY } from "./api-config";

const DIRECT_API_BASE_URL = "https://sabadgame.com/Powerline/api.php";
import { markCacheDirty } from "./local-cache";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
    /** v3.4.0: مسیر درخواستِ خطادار — برای «لاگ خطاها» */
    public endpoint?: string
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
  /** v2.4.1: مهلت پاسخ (ms) — پیش‌فرض ۳۰ ثانیه؛ عملیات سنگین مثل import انبوه می‌توانند بیشتر بدهند */
  timeoutMs?: number;
  /** v3.5.1: فقط داخلی — علامت «این درخواست قبلاً refresh+retry شده» برای جلوگیری از حلقه */
  _retried?: boolean;
}

class ApiClient {
  /**
   * v3.4.0: هوک خطا — هر ApiError به این هم ارسال می‌شود (برای «لاگ خطاها»)
   * بدون حلقه import: error-log خودش attachApiErrorLogging این را ست می‌کند
   */
  onError?: (err: ApiError) => void;

  /**
   * v3.5.1: رفرش single-flight — وقتی چند درخواست همزمان 401 می‌گیرند، فقط
   * یک /auth/refresh در پرواز است و بقیه نتیجه همان را صبر می‌کنند.
   * قبلاً: چون refresh token یک‌بارمصرف است، همه‌جز اولی fail → پاک‌شدن توکن →
   * لاگ‌اوت ناخواسته کاربر معتبر
   */
  private refreshInFlight: Promise<boolean> | null = null;

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

  private buildDirectUrl(endpoint: string, params?: Record<string, unknown>): string {
    const sep = endpoint.startsWith("/") ? "" : "/";
    const url = `${DIRECT_API_BASE_URL}${sep}${endpoint}`;
    if (!params) return url;
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") searchParams.append(key, String(value));
    });
    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    // endpoint بدون اسلش ابتدایی (مثل "lines/bulk-delete") هم درست به پروکسی وصل شود
    const sep = endpoint.startsWith("/") ? "" : "/";
    const url = `${API_BASE_URL}${sep}${endpoint}`;
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
    // v3.5.1: _retried فقط داخلی است — جلوگیری از حلقه بی‌نهایت 401→refresh→retry→401
    const { method = "GET", body, params, skipAuth, headers = {}, timeoutMs = 30_000, _retried } = options;

    // v4.3.39: Scope سراسری قرارداد برای ماژول‌های عملیاتی.
    // Endpointهای مرجع/قراردادها عمداً از این فیلتر مستثنا هستند.
    // endpointها در API_CONFIG با / شروع می‌شوند؛ مقایسه را نرمال می‌کنیم
    // تا Scope قرارداد واقعاً روی همه ماژول‌های عملیاتی اعمال شود.
    const normalizedEndpoint = endpoint.replace(/^\/+/, "");
    const contractScoped = method === "GET" && [
      "lines", "towers", "circuits", "personnel", "equipment",
      "inspections", "defects", "work-orders", "safety-incidents",
      "price-lists", "invoices", "dashboard/stats", "dashboard/recent-defects",
    ].some((name) => normalizedEndpoint === name || normalizedEndpoint.startsWith(`${name}/`));
    const scopedParams = contractScoped && typeof window !== "undefined"
      ? { ...(params || {}), contract_id: params?.contract_id ?? (() => {
          const selected = localStorage.getItem("powerline_selected_contract");
          return selected === "__unknown__" ? 0 : (selected || undefined);
        })() }
      : params;
    const url = this.buildUrl(endpoint, scopedParams);

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
      // v2.2.0: تایم‌اوت (پیش‌فرض ۳۰ ثانیه) — درخواست معلق به‌جای چرخش بی‌نهایت، خطای واضح می‌دهد
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // v4.3.61: اگر پراکسی Vercel نتوانست سرور مقصد را ببیند، برای GET یک‌بار
        // مستقیم از مرورگر به API واقعی تلاش می‌کنیم. برای POST/PUT/DELETE عمداً
        // fallback مستقیم نداریم تا در صورت پاسخ نامطمئن، عملیات دوبار اجرا نشود.
        if (method === "GET" && response.status === 503 && typeof window !== "undefined" && API_BASE_URL.startsWith("/")) {
          try {
            const directUrl = this.buildDirectUrl(endpoint, scopedParams);
            const directResponse = await fetch(directUrl, {
              method,
              headers: requestHeaders,
              cache: "no-store",
            });
            const directData = await directResponse.json().catch(() => ({}));
            if (directResponse.ok) {
              if (directData && typeof directData === "object" && "pagination" in directData) return directData as T;
              return (directData?.data ?? directData) as T;
            }
          } catch {
            // ادامه مسیر عادی و نمایش خطای پراکسی
          }
        }

        // اگه توکن منقضی شده، تلاش برای رفرش (فقط یک‌بار — v3.5.1)
        if (response.status === 401 && !skipAuth && !_retried) {
          const refreshed = await this.tryRefresh();
          if (refreshed) {
            // تلاش مجدد درخواست — فقط این یک سطح
            return this.request<T>(endpoint, { ...options, _retried: true });
          }
          // رفرش ناموفق — لاگ اوت
          this.clearTokens();
          if (typeof window !== "undefined") {
            window.location.href = "/";
          }
          const sessErr = new ApiError(401, "نشست شما منقضی شده است", undefined, endpoint);
          this.onError?.(sessErr);
          throw sessErr;
        }

        const errorMessage =
          data?.error?.message || data?.message || `خطای سرور (${response.status})`;
        const apiErr = new ApiError(response.status, errorMessage, data?.error?.details, endpoint);
        this.onError?.(apiErr);
        throw apiErr;
      }

      // v3.5.2: بعد از هر نوشتن موفق، کش محلی داده‌های مرجع کهنه علامت می‌خورد
      // تا خواندن بعدی دوباره از سرور بیاید (این نقطه فقط با response.ok اجرا می‌شود)
      if (method !== "GET") markCacheDirty();

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
      // v2.2.0: خطای تایم‌اوت درخواست
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutErr = new ApiError(0, "سرور ظرف مهلت مقرر پاسخ نداد — احتمالاً در دسترس نیست یا شلوغ است. بعداً دوباره تلاش کنید.", undefined, endpoint);
      this.onError?.(timeoutErr);
      throw timeoutErr;
      }
      if (error instanceof TypeError) {
        // خطای شبکه — معمولاً CORS یا Mixed Content یا سرور در دسترس نیست
        const reason = analyzeNetworkError(error);
        const netErr = new ApiError(0, reason, undefined, endpoint);
        this.onError?.(netErr);
        throw netErr;
      }
      throw error;
    }
  }

  private async tryRefresh(): Promise<boolean> {
    // v3.5.1: single-flight — همه فراخوان‌های همزمان همان پرومیس را شریک می‌شوند
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) return false;

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
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // Helper methods
  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>(endpoint, { method: "GET", params: params as RequestOptions["params"] });
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
