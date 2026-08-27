"use client";

/**
 * دیتابیس محلی مرورگر (localStorage) — v3.5.2
 *
 * «دیتابیس روی سیستم هر کاربر»: داده‌های مرجع (پرسنل/مدارها/سیم‌ها/خطوط)
 * بعد از اولین دریافت، روی سیستم کاربر ذخیره می‌شوند و دفعات بعد:
 *  - فوراً از حافظه محلی نمایش داده می‌شوند (بدون صبر برای هاست کند)
 *  - در پس‌زمینه از سرور تازه‌سازی می‌شوند (stale-while-revalidate)
 *  - اگر اینترنت/هاست قطع بود، همان داده محلی با نشان «آفلاین» می‌ماند
 *
 * TTL یعنی «مهلت تازگی»: بعد از TTL داده کهنه است و تلاش برای تازه‌سازی
 * انجام می‌شود، ولی تا رسیدن پاسخ جدید، همان داده کهنه نمایش داده می‌شود.
 *
 * دکل‌ها (~۲۶۰۰ ردیف) عمداً اینجا کش نمی‌شوند — سهمیه localStorage محدود است؛
 * آن‌ها را کش in-memory پراکسی (۳۰ دقیقه) پوشش می‌دهد.
 */

const NS = "pl_cache_v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // حداکثر ۷ روز نگه‌داری مطلق

export interface CacheEntry<T> {
  data: T;
  at: number; // زمان ذخیره (ms)
  stale: boolean; // گذشته از TTL؟
}

function safeLS(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // حالت خصوصی مرورگر
  }
}

export function readCache<T>(key: string, ttlMs: number): CacheEntry<T> | null {
  const ls = safeLS();
  if (!ls) return null;
  try {
    const raw = ls.getItem(`${NS}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; at: number; ttl: number };
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      ls.removeItem(`${NS}:${key}`);
      return null;
    }
    return { data: parsed.data, at: parsed.at, stale: Date.now() - parsed.at > (parsed.ttl ?? ttlMs) };
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T, ttlMs: number): void {
  const ls = safeLS();
  if (!ls) return;
  try {
    ls.setItem(`${NS}:${key}`, JSON.stringify({ data, at: Date.now(), ttl: ttlMs }));
  } catch {
    // سهمیه پر است — قدیمی‌های همین namespace را خالی کن و یک‌بار دیگر تلاش کن
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(`${NS}:`)) toRemove.push(k);
      }
      for (const k of toRemove) ls.removeItem(k);
      ls.setItem(`${NS}:${key}`, JSON.stringify({ data, at: Date.now(), ttl: ttlMs }));
    } catch {
      // باز نشد — بی‌صدا رد شو (کش محلی اختیاری است، اپ نمی‌شکند)
    }
  }
}

/** پاک‌سازی کش — همه یا فقط کلیدهایی که با prefix شروع می‌شوند */
export function invalidateCache(prefix?: string): void {
  const ls = safeLS();
  if (!ls) return;
  try {
    const full = prefix ? `${NS}:${prefix}` : `${NS}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(full)) toRemove.push(k);
    }
    for (const k of toRemove) ls.removeItem(k);
  } catch {
    // ignore
  }
}

/** آیا مرورگر آنلاین است؟ (تقریب — وضعیت واقعی با نتیجه fetch مشخص می‌شود) */
export function browserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

// ─── نشانه «کش کهنه شد» (epoch) — v3.5.2 ───
// api-client بعد از هر نوشتن موفق این را صدا می‌زند؛ مصرف‌کننده‌های کش (مثل
// use-bootstrap) با مقایسه epoch می‌فهمند باید دوباره از سرور بخوانند.
// این‌طور وابستگی چرخشی api-client → hooks پیش نمی‌آید.
let epoch = 0;

export function markCacheDirty(): void {
  epoch++;
  invalidateCache();
}

export function cacheEpoch(): number {
  return epoch;
}
