/**
 * module-access.ts — v4.3.81
 *
 * فهرست ماژول‌های (بخش‌های) برنامه برای ماتریس دسترسی کاربران.
 * کلیدها همان id آیتم‌های منوی اصلی (dashboard-layout) هستند؛
 * «داشبورد» عمداً جزو لیست نیست چون صفحهٔ خانه است و همیشه در دسترس می‌ماند.
 *
 * قواعد دسترسی (در auth-context پیاده شده):
 *   ۱) کاربر بدون امور (مدیر سیستم) → همیشه دسترسی کامل
 *   ۲) module_permissions = null → همهٔ بخش‌ها مجاز (سازگار با کاربران قبلی)
 *   ۳) مقدار false برای یک کلید → آن بخش از منو حذف می‌شود؛
 *      کلیدِ غایب یعنی مجاز (پیش‌فرض مثبت تا ماژول‌های جدید خودکار دیده شوند)
 */

export interface ModuleAccessDef {
  key: string;
  label: string;
}

export const MODULE_ACCESS: ModuleAccessDef[] = [
  // ─── اصلی ───
  { key: "maps", label: "نقشه‌ها" },
  // ─── خطوط و مدارها ───
  { key: "circuits", label: "مدارها" },
  { key: "lines", label: "خطوط انتقال" },
  { key: "towers", label: "دکل‌ها" },
  // ─── بهره‌برداری و تعمیرات ───
  { key: "inspections", label: "بازدیدها" },
  { key: "defects", label: "عیوب" },
  { key: "work-orders", label: "دستورکارها" },
  // ─── پیمانکاری و مالی ───
  { key: "contractors", label: "پیمانکاران" },
  { key: "contracts", label: "قراردادها" },
  { key: "equipment", label: "تجهیزات" },
  { key: "personnel", label: "پرسنل پیمانکار" },
  { key: "price-lists", label: "فهرست بها" },
  { key: "invoices", label: "صورت‌وضعیت‌ها" },
  // ─── ایمنی ───
  { key: "safety", label: "حوادث ایمنی و شخصی" },
  { key: "line-incidents", label: "حوادث خطوط" },
  // ─── داده‌های پایه ───
  { key: "conductors", label: "انواع سیم‌ها" },
  { key: "tower-structures", label: "انواع ساختار دکل" },
  { key: "tower-type-codes", label: "انواع کد دکل" },
  { key: "districts", label: "امور بهره‌برداری" },
  // ─── سیستمی ───
  { key: "reports", label: "گزارش‌گیری" },
  { key: "users", label: "کاربران" },
  { key: "error-log", label: "لاگ خطاها" },
  { key: "settings", label: "تنظیمات" },
];
