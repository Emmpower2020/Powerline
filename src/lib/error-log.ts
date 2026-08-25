"use client";

/**
 * لاگ مرکزی خطاها — v3.4.0
 *
 * هر خطایی در هر نقطه از اپ رخ دهد در این استور ثبت می‌شود و مدیر سیستم
 * از منوی «لاگ خطاها» می‌تواند همه را همزمان ببیند و رفع عیب کند:
 *  - خطاهای API (همه درخواست‌ها — از api-client)
 *  - خطاهای بارگذاری صفحات
 *  - خطاهای فرم‌ها و عملیات گروهی
 *
 * هر ردیف: زمان، عنوان، پیام، مسیر/منبع، کد وضعیت HTTP (در صورت وجود)
 * حداکثر ۵۰۰ ردیف در حافظه (حلقه‌ای) + پاک‌کردن دستی.
 * این لاگ سمت کلاینت است — برای تاریخچه بلندمدت باید audit_log سمت سرور فعال شود.
 */

export interface ErrorLogEntry {
  id: number;
  at: string; // ISO
  title: string;
  message: string;
  source?: string; // مسیر/کامپوننت/endpoint
  statusCode?: number | null;
}

const MAX_ENTRIES = 500;
let counter = 1;
// v3.5.1: به‌جای آرایه mutable (که useSyncExternalStore تغییرش را نمی‌دید و صفحه
// لاگ خطاها زنده آپدیت نمی‌شد)، هر تغییر یک آرایه جدید می‌سازد — مرجع جدید = رندر مجدد
let entriesSnapshot: ErrorLogEntry[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

export function subscribeErrorLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getErrorLog(): ErrorLogEntry[] {
  return entriesSnapshot;
}

export function getUnreadErrorCount(): number {
  return entriesSnapshot.length;
}

export function logError(e: {
  title: string;
  message: string;
  source?: string;
  statusCode?: number | null;
}): void {
  const entry: ErrorLogEntry = {
    id: counter++,
    at: new Date().toISOString(),
    title: e.title,
    message: e.message,
    source: e.source,
    statusCode: e.statusCode ?? null,
  };
  entriesSnapshot = [entry, ...entriesSnapshot].slice(0, MAX_ENTRIES);
  notify();
}

export function clearErrorLog(): void {
  entriesSnapshot = [];
  notify();
}

/**
 * اتصال خودکار: هر ApiError که از api-client پرتاب شود اینجا هم ثبت می‌شود
 * (یک‌بار در ابتدای برنامه صدا زده می‌شود)
 */
export function attachApiErrorLogging(): void {
  // از require دوری می‌کنیم — حلقه import با api-client
  import("@/lib/api-client").then(({ ApiError, apiClient }) => {
    apiClient.onError = (err: unknown) => {
      if (err instanceof ApiError) {
        logError({
          title: `API ${err.statusCode || 0}`,
          message: err.message,
          source: err.endpoint || "api",
          statusCode: err.statusCode,
        });
      }
    };
  });
}
