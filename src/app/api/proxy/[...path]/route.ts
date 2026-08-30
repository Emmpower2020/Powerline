/**
 * API Proxy Route — تمام درخواست‌های API رو از طریق Next.js به سرور اصلی می‌فرسته
 *
 * این روش مشکل CORS رو حل می‌کنه چون مرورگر فقط با همین دامنه‌ای که اپ روش اجرا می‌شه
 * صحبت می‌کنه و Next.js به API سرور وصل می‌شه (بدون محدودیت CORS).
 *
 * v3.3.1 — سیاست «همیشه داده واقعی» (درخواست صریح کاربر):
 *   ۱) GET ها: فقط از سرور واقعی. پاسخ موفق کش می‌شود؛ اگر هاست لحظه‌ای قطع بود،
 *      آخرین داده واقعی کش‌شده نمایش داده می‌شود (هدر X-Served-From-Cache) — نه داده ساختگی، نه جدول خالی.
 *   ۲) نوشتن‌ها (POST/PUT/DELETE): هیچ‌وقت به mock برنمی‌گردند — اگر هاست قطع باشد خطای واقعی
 *      نمایش داده می‌شود تا هرگز «موفقیت کاذب» رخ ندهد و داده‌ای گم نشود.
 *   ۳) mock فقط برای /auth/* در حالت توسعه فعال است (تا پیش‌نمایش قابل لاگین بماند) —
 *      جدول‌ها همیشه از دیتابیس واقعی می‌آیند.
 *
 * تاریخچه: v2.5.2 fallback کامل mock داشت که با ناپایداری هاست اشتراکی دو مشکل ساخت:
 * نمایش داده ساختگی (v3.2.2 خالی شد) و جذب بی‌صدا import ها به حافظه موقت (گم‌شدن ظاهری داده).
 */

import { NextRequest, NextResponse } from "next/server";
import { handleMockRequest } from "../mock-data";

const API_BASE_URL = "https://jibimarket.com/Powerline/api.php";
const DEV_MODE = process.env.NODE_ENV !== "production";

/**
 * v3.5.1 — حل خودکار چالش ضد DDoS هاست:
 * هاست jibimarket.com بعد از چند درخواست پشت‌سرهم، به‌جای JSON صفحه HTML می‌فرستد که
 * فقط یک کوکی `_dgjsc` ست می‌کند و رفرش می‌شود. چون مقدار کوکی (hval) داخل خود HTML هست،
 * پراکسی می‌تواند آن را بردارد، کوکی را نگه دارد و درخواست را با کوکی تکرار کند —
 * بدون نیاز به اجرای JavaScript. کوکی تا انقضای آن برای درخواست‌های بعدی نگه داشته می‌شود.
 */
const DDG_COOKIE_NAME = "_dgjsc";
let ddgCookie: { value: string; expiresAt: number } | null = null;

/** استخراج کوکی چالش از HTML (اگر صفحه چالش بود) */
function parseDdgChallenge(html: string): { value: string; expiresAt: number } | null {
  if (!html.includes(DDG_COOKIE_NAME)) return null;
  const hvalMatch = html.match(/var\s+hval\s*=\s*"([^"]+)"/);
  const expMatch = html.match(/var\s+exp\s*=\s*"(\d+)"/);
  if (!hvalMatch) return null;
  return {
    value: hvalMatch[1],
    expiresAt: expMatch ? Number(expMatch[1]) * 1000 : Date.now() + 60_000,
  };
}

/** آیا پاسخ، صفحه چالش ضد DDoS است؟ */
function isDdgChallenge(resp: Response | null, text: string): boolean {
  if (!resp) return false;
  if (resp.status !== 200 && resp.status !== 403) return false;
  return text.includes(DDG_COOKIE_NAME) && text.includes("hval");
}

/** کوکی معتبر چالش (اگر موجود و منقضی‌نشده باشد) */
function validDdgCookieHeader(): string | null {
  if (ddgCookie && ddgCookie.expiresAt > Date.now() + 5_000) {
    return `${DDG_COOKIE_NAME}=${ddgCookie.value}`;
  }
  return null;
}

// ─── کش پاسخ‌های GET واقعی (v3.3.1) — داده واقعی دیتابیس برای نمایش هنگام قطعی موقت ───
// v3.5.1: کلید کش شامل هش توکن کاربر است تا داده کش‌شده‌ی یک کاربر به کاربر دیگر نشان داده نشود
const GET_CACHE = new Map<string, { body: string; contentType: string; at: number }>();
const GET_CACHE_MAX = 120;
const GET_CACHE_TTL_MS = 1000 * 60 * 30; // ۳۰ دقیقه — بعد از آن دیگر کهنه تلقی نمی‌شود ولی باز هم به‌روزرسانی می‌شود

/** هش کوتاه برای تفکیک کاربران در کلید کش */
function userScope(request: NextRequest): string {
  const auth = request.headers.get("authorization") || "";
  if (!auth) return "anon";
  let h = 0;
  for (let i = 0; i < auth.length; i++) {
    h = (h * 31 + auth.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** ذخیره پاسخ موفق GET */
function cacheGetResponse(scope: string, path: string, search: string, body: string, contentType: string): void {
  const key = `${scope}|${path}${search}`;
  if (GET_CACHE.size >= GET_CACHE_MAX) {
    // حذف قدیمی‌ترین
    const firstKey = GET_CACHE.keys().next().value;
    if (firstKey) GET_CACHE.delete(firstKey);
  }
  GET_CACHE.set(key, { body, contentType, at: Date.now() });
}

/** خواندن کش معتبر */
function getCachedGet(scope: string, path: string, search: string): { body: string; contentType: string; at: number } | null {
  const hit = GET_CACHE.get(`${scope}|${path}${search}`);
  if (!hit) return null;
  if (Date.now() - hit.at > GET_CACHE_TTL_MS) {
    GET_CACHE.delete(`${scope}|${path}${search}`);
    return null;
  }
  return hit;
}

/** با نوشتن موفق، کل کش بی‌اعتبار می‌شود (v3.5.1: ساده و مطمئن — نوشتن در یک موجودیت
 *  می‌تواند داشبورد/دکل‌ها/عیوب هم تغییر دهد؛ پاک‌سازی کامل از داده کهنه جلوگیری می‌کند) */
function invalidateAllCache(): void {
  GET_CACHE.clear();
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function PUT(request: NextRequest) {
  return handleRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "3600",
    },
  });
}

async function handleRequest(request: NextRequest) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/proxy/, "");
  const search = url.search;
  const isGet = request.method === "GET" || request.method === "HEAD";

  const targetUrl = `${API_BASE_URL}${path}${search}`;

  // هدرها
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const authHeader = request.headers.get("authorization");
  if (authHeader) headers.set("Authorization", authHeader);

  // body — یک‌بار خواندنی
  let bodyText: string | undefined;
  if (!isGet) {
    try {
      bodyText = await request.text();
    } catch {
      // body خالی
    }
  }

  // آیا fallback مجاز است؟ فقط auth در توسعه (v3.3.1)
  // v3.5.1: مجوز mock موقت /conductors حذف شد — PHP جدید هاست آپلود شده و endpoint واقعی پاسخ می‌دهد
  const isAuthPath = path.startsWith("/auth");
  const allowMock = DEV_MODE && isAuthPath;

  /** تلاش به سرور اصلی با retry یک‌باره روی 5xx (v3.2.1) + حل چالش ضد DDoS (v3.5.1) */
  const fetchUpstream = async (): Promise<Response> => {
    const doFetch = () => {
      const finalHeaders = new Headers(headers);
      const cookie = validDdgCookieHeader();
      if (cookie) finalHeaders.set("Cookie", cookie);
      return fetch(targetUrl, {
        method: request.method,
        headers: finalHeaders,
        body: bodyText,
        cache: "no-store",
      });
    };
    let response: Response = await doFetch();
    // v3.5.1: اگر پاسخ صفحه چالش ضد DDoS بود، کوکی را بردار و یک‌بار تکرار کن
    let firstText = await response.clone().text().catch(() => "");
    if (isDdgChallenge(response, firstText)) {
      const solved = parseDdgChallenge(firstText);
      if (solved) {
        ddgCookie = solved;
        console.log(`[DDoS-Challenge] چالش هاست حل شد — تکرار درخواست ${request.method} ${path}`);
        response = await doFetch();
      }
    }
    if (response.status >= 500) {
      await new Promise(r => setTimeout(r, 600));
      const retry = await doFetch();
      if (retry.status < 500) response = retry;
    }
    return response;
  };

  /** آیا پاسخ به‌عنوان «سرور در دسترس نیست» تلقی می‌شود؟ */
  const looksLikeHostDown = (resp: Response | null, text: string): boolean => {
    if (!resp) return true; // خطای شبکه
    if (resp.status === 405) return true; // nginx به‌جای PHP

    // پاسخ JSON از خود API حتی اگر 4xx/5xx باشد، «سرور قطع» نیست؛
    // این یک خطای واقعی برنامه/دیتابیس است و باید عیناً به کلاینت برسد تا علت مشخص بماند.
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        JSON.parse(text);
        return false;
      } catch {
        // JSON نامعتبر → بررسی HTML در ادامه
      }
    }

    if (
      text.includes("<html") ||
      text.includes("<!DOCTYPE") ||
      text.includes("<head>")
    ) {
      return true; // صفحه خطای HTML/محافظ هاست
    }

    // خطاهای 5xx بدون بدنه JSON معمولاً از وب‌سرور/هاست هستند.
    if (resp.status >= 500) return true;
    return false;
  };

  let response: Response | null = null;
  let networkErrorMessage = "";
  try {
    response = await fetchUpstream();
  } catch (error) {
    networkErrorMessage = error instanceof Error ? error.message : "Unknown error";
  }

  const responseText = response ? await response.text() : "";
  const hostDown = looksLikeHostDown(response, responseText);

  // ─── مسیر ۱: auth در حالت توسعه → mock (لاگین پیش‌نمایش حتی وقتی هاست پایین است) ───
  if (hostDown && allowMock) {
    const mockRequest = new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyText,
    });
    console.log(`[DEV MOCK] auth → mock for ${request.method} ${path}`);
    return await handleMockRequest(mockRequest);
  }

  // ─── مسیر ۲: هاست قطع + GET → آخرین داده واقعی کش‌شده، وگرنه خطای صادقانه ───
  const scope = userScope(request);
  if (hostDown && isGet) {
    const cached = getCachedGet(scope, path, search);
    if (cached) {
      console.log(`[CACHE] سرو کردن آخرین داده واقعی برای GET ${path} (هاست موقتاً قطع)`);
      return new NextResponse(cached.body, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Served-From-Cache": "1",
        },
      });
    }
    // کشی نیست — خطای واضح به کاربر (نه جدول خالی بی‌صدا)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 503,
          message: "سرور دیتابیس (jibimarket.com) موقتاً در دسترس نیست — داده‌های شما سالم است؛ چند لحظه بعد دوباره تلاش کنید یا دکمه بروزرسانی را بزنید",
        },
      },
      { status: 503 }
    );
  }

  // ─── مسیر ۳: هاست قطع + نوشتن → خطای واقعی (هرگز موفقیت کاذب؛ جلوگیری از گم‌شدن داده) ───
  if (hostDown && !isGet) {
    const reason = response
      ? `سرور پاسخ ${response.status} داد`
      : `خطای شبکه: ${networkErrorMessage}`;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 503,
          message: `ثبت/ویرایش انجام نشد چون سرور دیتابیس موقتاً در دسترس نیست (${reason}). داده ذخیره نشد — دوباره تلاش کنید. داده‌های قبلی شما سالم است`,
        },
      },
      { status: 503 }
    );
  }

  // ─── پاسخ واقعی سرور ───
  const respContentType = response!.headers.get("content-type") || "application/json";

  // v3.3.1: کش پاسخ‌های موفق GET (فقط JSON موفق)
  if (isGet && response!.status === 200 && respContentType.includes("json")) {
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.success !== false) {
        cacheGetResponse(scope, path, search, responseText, respContentType);
      }
    } catch {
      // JSON نیست — کش نکن
    }
  }

  // v3.5.1: با نوشتن موفق، کل کش تازه شود
  if (!isGet && response!.status >= 200 && response!.status < 300) {
    invalidateAllCache();
  }

  return new NextResponse(responseText, {
    status: response!.status,
    headers: {
      "Content-Type": respContentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
