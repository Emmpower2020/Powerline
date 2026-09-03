/**
 * نرمال‌سازی وضعیت فعال/غیرفعال — v4.3.77
 *
 * داده خام وضعیت در جداول مختلف با اسکیمای متفاوت به شکل‌های مختلف برمی‌گردد:
 *  - varchar: 'active' / 'inactive' (و مقدار قدیمی 'deactive')
 *  - tinyint / is_active: 1 / 0
 *  - برخی مسیرها JSON: true / false
 *
 * این ماژول همه را به یک نمایش واحد فارسی تبدیل می‌کند تا:
 *  - نمایش سلول همیشه «فعال» یا «غیرفعال» باشد
 *  - پنجره فیلتر فقط همین دو مقدار را نشان دهد (نه active/deactive/1)
 *  - قانون حذف: ردیف «فعال» هرگز حذف نمی‌شود
 */

/** برچسب فارسی وضعیت فعال — تنها مقدار مجاز «روشن» در فیلتر و نمایش */
export const STATUS_ACTIVE_LABEL = "فعال";

/** برچسب فارسی وضعیت غیرفعال — تنها مقدار مجاز «خاموش» در فیلتر و نمایش */
export const STATUS_INACTIVE_LABEL = "غیرفعال";

/**
 * آیا مقدار خام وضعیت به معنی «فعال» است؟
 * هر چیزی غیر از اشکال شناخته‌شدهٔ فعال (از جمله null/undefined/مقادیر ناشناخته)
 * غیرفعال در نظر گرفته می‌شود تا در نمایش و فیلتر فقط همین دو حالت وجود داشته باشد.
 */
export function isActiveStatus(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === "") return false;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (s === "active" || s === "1" || s === "true" || s === "yes" || s === "فعال" || s === "بله") return true;
  return false; // inactive / deactive / 0 / false / no / غیرفعال و هر مقدار دیگر
}

/** برچسب فارسی واحد وضعیت: «فعال» یا «غیرفعال» — نه هیچ چیز دیگر */
export function statusLabel(raw: unknown): string {
  return isActiveStatus(raw) ? STATUS_ACTIVE_LABEL : STATUS_INACTIVE_LABEL;
}
