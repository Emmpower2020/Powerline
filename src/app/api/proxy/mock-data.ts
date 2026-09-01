/**
 * Mock API — فقط برای محیط توسعه و پیش‌نمایش
 *
 * این ماژول داده‌های نمونه برمی‌گرداند تا بتوانیم UI را بدون اتصال به سرور PHP بررسی کنیم.
 * در production فعال نیست — فقط زمانی استفاده می‌شود که سرور اصلی (jibimarket.com) در دسترس نباشد.
 *
 * کاربر نمونه:
 *   username: admin
 *   password: admin123
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ─── توکن جعلی برای session ───
const FAKE_ACCESS_TOKEN = "dev-mock-access-token-admin";
const FAKE_REFRESH_TOKEN = "dev-mock-refresh-token-admin";

/** v3.2.2: تولید id بعدی روی آرایه (امن برای آرایه خالی — Math.max خالی یعنی -Infinity) */
const nextId = (arr: any[]): number => arr.reduce((m: number, x: any) => Math.max(m, x?.id ?? 0), 0) + 1;

// ─── کاربر نمونه ───
const MOCK_USER = {
  id: 1,
  username: "admin",
  full_name: "مدیر سیستم",
  email: "admin@jibimarket.com",
  status: "active",
  roles: ["super_admin"],
  permissions: ["*"],
};

// ─── خطوط نمونه (با همه ستون‌های جدول lines) ───
// v3.2.2: طبق درخواست کاربر، هیچ داده نمایشی بارگذاری نمی‌شود — جداول از دیتابیس واقعی پر می‌شوند
// (قبلاً ۷ خط نمونه «پارس خزر» و... اینجا بود که هنگام قطعی موقت هاست نمایش داده می‌شد و سبب سردرگمی می‌شد)
const MOCK_LINES: any[] = [];

// ─── دکل‌های نمونه ───
const TOWER_STRUCTURES = ["مشبک فلزی", "تیر چوبی", "تیر بتنی", "تلسکوپی بتنی", "تلسکوپی فلزی"];
const TOWER_TYPES = ["کششی", "آویزی"];
const INSULATOR_TYPES = ["سرامیکی", "شیشه‌ای", "سیلیکونی"];

function generateMockTowers(lineId: number, lineCode: string, count: number, startNumber = 1) {
  const towers: any[] = [];
  // v2.6.0: voltage_kv خط را به tower هم اضافه می‌کنیم تا در جدول دکل‌ها بتوانیم نام خط را بر اساس ولتاژ رنگ‌بندی کنیم
  const lineVoltageKv = MOCK_LINES.find(l => l.id === lineId)?.voltage_kv;
  for (let i = 0; i < count; i++) {
    const towerNumber = startNumber + i;
    const towerCode = `${lineCode}-${String(towerNumber).padStart(3, "0")}`;
    const towerType = TOWER_TYPES[i % 2];
    const structure = TOWER_STRUCTURES[i % TOWER_STRUCTURES.length];
    const insulator = INSULATOR_TYPES[i % INSULATOR_TYPES.length];
    const hasGps = i % 5 !== 0; // 80% have GPS
    towers.push({
      id: lineId * 1000 + towerNumber,
      tower_code: towerCode,
      tower_number: towerNumber,
      line_id: lineId,
      line_code: lineCode,
      line_name: MOCK_LINES.find(l => l.id === lineId)?.name || "",
      voltage_kv: lineVoltageKv ?? null, // v2.6.0
      tower_structure: structure,
      tower_type_code: towerType === "کششی" ? "NN" : "AN",
      tower_type: towerType,
      base_height_a: 12 + (i % 5),
      base_height_b: 11.5 + (i % 4),
      base_height_c: 11 + (i % 3),
      base_height_d: 10.5 + (i % 2),
      insulator_r1: insulator,
      insulator_s1: insulator,
      insulator_t1: insulator,
      insulator_r2: insulator,
      insulator_s2: insulator,
      insulator_t2: insulator,
      insulator_count_r1: 7 + (i % 5),
      insulator_count_s1: 7 + (i % 4),
      insulator_count_t1: 7 + (i % 3),
      insulator_count_r2: 7 + (i % 5),
      insulator_count_s2: 7 + (i % 4),
      insulator_count_t2: 7 + (i % 3),
      gps_lat: hasGps ? 35.6892 + (i * 0.001) : null,
      gps_lng: hasGps ? 51.3890 + (i * 0.001) : null,
      line_supervisor: MOCK_LINES.find(l => l.id === lineId)?.line_supervisor || "",
      status: "active",
    });
  }
  return towers;
}

// v3.2.2: خالی — بدون داده نمایشی
const MOCK_TOWERS: any[] = [];

// ─── آمار داشبورد ───
// ─── آمار داشبورد — v2.7.0 هماهنگ با types.ts ───
// v3.2.2: آمار صفر — از آرایه‌های خالی محاسبه می‌شود (بدون داده نمایشی)
const MOCK_DASHBOARD_STATS: any = {
  lines: { total: 0, by_voltage: {} },
  towers: { total: 0, by_type: {}, with_gps: 0, linked: 0 },
  defects: { total: 0, new: 0, approved: 0, in_progress: 0, repaired: 0, verified: 0, critical: 0, high: 0 },
  inspections: { total: 0, today: 0, this_week: 0, pending_approval: 0 },
  work_orders: { total: 0, open: 0, overdue: 0 },
  users: { total: 1, active: 1 },
  contractors: { total: 0 },
  safety: { incidents_this_month: 0, near_miss_this_month: 0 },
  activity_7_days: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), defects: 0, inspections: 0 };
  }),
};

// ─── عیوب نمونه (v2.8.1 — برای تست فرم ثبت عیب در حالت توسعه) ───
// v3.2.2: خالی — بدون داده نمایشی
const MOCK_DEFECTS: any[] = [];

// ─── فهرست بها نمونه (v2.8.1) ───
// v3.2.2: خالی — بدون داده نمایشی
const MOCK_PRICE_LISTS: any[] = [];
// v3.2.2: خالی — بدون داده نمایشی
const MOCK_PRICE_LIST_ITEMS: any[] = [];

// ─── چک‌لیست نمونه (v2.8.1) ───
// v3.2.2: خالی — بدون داده نمایشی
const MOCK_CHECKLIST_TEMPLATES: any[] = [];

// v3.2.2: خالی — بدون داده نمایشی (۴۶ مدار واقعی در دیتابیس هستند)
const MOCK_CIRCUITS: any[] = [];

// v3.2.2: خالی — بدون داده نمایشی
const MOCK_PERSONNEL: any[] = [];


// ─── عیوب استاندارد نمونه (v3.1.0 — نمونه‌ای از عیوب_استاندارد.xlsx؛ نسخه کامل ۴۰۱ مورد در دیتابیس است) ───
const MOCK_DEFECT_DEFINITIONS: any[] = [
  { id: 205, category_id: null, category_name: "عیوب بدنه دکل فلزی مشبک مهاری", defect_code: 120, title: "انحراف بازوی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 206, category_id: null, category_name: "عیوب بدنه دکل فلزی مشبک مهاری", defect_code: 126, title: "انحراف و اعوجاج در پایه های اصلی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 207, category_id: null, category_name: "عیوب بدنه دکل فلزی مشبک مهاری", defect_code: 128, title: "انحراف و آسیب دیدگی استاب", default_priority: "high", default_severity: "major", status: "active" },
  { id: 121, category_id: null, category_name: "عیوب بدنه تیر چوبی", defect_code: 119, title: "اتصال نامناسب سیم مهار", default_priority: "high", default_severity: "major", status: "active" },
  { id: 122, category_id: null, category_name: "عیوب بدنه تیر چوبی", defect_code: 125, title: "انحراف تیر چوبی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 123, category_id: null, category_name: "عیوب بدنه تیر چوبی", defect_code: 131, title: "آسیب دیدگی اتصالات سیم مهار", default_priority: "high", default_severity: "major", status: "active" },
  { id: 106, category_id: null, category_name: "عیوب بدنه تیر بتنی", defect_code: 124, title: "انحراف تیر بتنی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 107, category_id: null, category_name: "عیوب بدنه تیر بتنی", defect_code: 137, title: "آسیب دیدگی کنسول", default_priority: "high", default_severity: "major", status: "active" },
  { id: 108, category_id: null, category_name: "عیوب بدنه تیر بتنی", defect_code: 144, title: "باز شدن سیم مهار", default_priority: "high", default_severity: "major", status: "active" },
  { id: 146, category_id: null, category_name: "عیوب بدنه دکل تلسکوپی بتنی", defect_code: 122, title: "انحراف بازوی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 147, category_id: null, category_name: "عیوب بدنه دکل تلسکوپی بتنی", defect_code: 150, title: "پوکه شدن بتن دکل تلسکوپی بتنی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 148, category_id: null, category_name: "عیوب بدنه دکل تلسکوپی بتنی", defect_code: 153, title: "پیچ و مهره های شل جوشکاری شده", default_priority: "high", default_severity: "major", status: "active" },
  { id: 160, category_id: null, category_name: "عیوب بدنه دکل تلسکوپی فلزی", defect_code: 121, title: "انحراف بازوی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 161, category_id: null, category_name: "عیوب بدنه دکل تلسکوپی فلزی", defect_code: 152, title: "پیچ و مهره های شل جوشکاری شده", default_priority: "high", default_severity: "major", status: "active" },
  { id: 162, category_id: null, category_name: "عیوب بدنه دکل تلسکوپی فلزی", defect_code: 159, title: "تغییر رنگ دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 292, category_id: null, category_name: "عیوب زنجیر مقره ها", defect_code: 313, title: "از بین رفتن چترک های زنجیره مقره", default_priority: "high", default_severity: "major", status: "active" },
  { id: 293, category_id: null, category_name: "عیوب زنجیر مقره ها", defect_code: 314, title: "افست در زنجیره مقره", default_priority: "high", default_severity: "major", status: "active" },
  { id: 294, category_id: null, category_name: "عیوب زنجیر مقره ها", defect_code: 315, title: "انحراف پین مقره", default_priority: "high", default_severity: "major", status: "active" },
  { id: 358, category_id: null, category_name: "عیوب یراق آلات", defect_code: 320, title: "بادکردگی آرموراد", default_priority: "high", default_severity: "major", status: "active" },
  { id: 359, category_id: null, category_name: "عیوب یراق آلات", defect_code: 321, title: "باز شدن کرونارینگ", default_priority: "high", default_severity: "major", status: "active" },
  { id: 360, category_id: null, category_name: "عیوب یراق آلات", defect_code: 322, title: "بیرون زدگی اشپیل مقره", default_priority: "high", default_severity: "major", status: "active" },
  { id: 273, category_id: null, category_name: "عیوب جمپر", defect_code: 300, title: "استفاده از شترگلویی در محل پرس", default_priority: "high", default_severity: "major", status: "active" },
  { id: 274, category_id: null, category_name: "عیوب جمپر", defect_code: 301, title: "جمپر با طول سیم کوتاه و تحت فشار", default_priority: "high", default_severity: "major", status: "active" },
  { id: 275, category_id: null, category_name: "عیوب جمپر", defect_code: 302, title: "جمپر با طول سیم بلند و غیر استاندارد", default_priority: "high", default_severity: "major", status: "active" },
  { id: 322, category_id: null, category_name: "عیوب فوندانسیون و پایه", defect_code: 272, title: "تخریب بتن سرقالب", default_priority: "high", default_severity: "major", status: "active" },
  { id: 323, category_id: null, category_name: "عیوب فوندانسیون و پایه", defect_code: 273, title: "تخریب پوشش محافظ بتن", default_priority: "high", default_severity: "major", status: "active" },
  { id: 324, category_id: null, category_name: "عیوب فوندانسیون و پایه", defect_code: 276, title: "در معرض برخورد ماشین آلات", default_priority: "high", default_severity: "major", status: "active" },
  { id: 305, category_id: null, category_name: "عیوب سیستم زمین دکل", defect_code: 268, title: "اتصال نامناسب سیم اتصال زمین", default_priority: "high", default_severity: "major", status: "active" },
  { id: 306, category_id: null, category_name: "عیوب سیستم زمین دکل", defect_code: 269, title: "بازشدن سیم از بدنه دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 307, category_id: null, category_name: "عیوب سیستم زمین دکل", defect_code: 270, title: "بریدگی سیم زمین", default_priority: "high", default_severity: "major", status: "active" },
  { id: 286, category_id: null, category_name: "عیوب دیوار حفاظتی دکل", defect_code: 274, title: "تخریب دیوار حفاظتی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 287, category_id: null, category_name: "عیوب دیوار حفاظتی دکل", defect_code: 280, title: "سرقت توری گابیون موجود", default_priority: "high", default_severity: "major", status: "active" },
  { id: 288, category_id: null, category_name: "عیوب دیوار حفاظتی دکل", defect_code: 284, title: "مسدود شدن مسیر خروج آب از دیوار حفاظتی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 255, category_id: null, category_name: "عیوب تابلو دکل", defect_code: 101, title: "ارتفاع یا محل نامناسب نصب تابلو", default_priority: "high", default_severity: "major", status: "active" },
  { id: 256, category_id: null, category_name: "عیوب تابلو دکل", defect_code: 102, title: "زنگ زدگی تابلو خطر", default_priority: "high", default_severity: "major", status: "active" },
  { id: 257, category_id: null, category_name: "عیوب تابلو دکل", defect_code: 103, title: "زنگ زدگی تابلو شماره", default_priority: "high", default_severity: "major", status: "active" },
  { id: 340, category_id: null, category_name: "عیوب نقض حریم", defect_code: 381, title: "احداث شبکه انتقال در حریم خط", default_priority: "high", default_severity: "major", status: "active" },
  { id: 341, category_id: null, category_name: "عیوب نقض حریم", defect_code: 382, title: "احداث شبکه توزیع در حریم خط", default_priority: "high", default_severity: "major", status: "active" },
  { id: 342, category_id: null, category_name: "عیوب نقض حریم", defect_code: 383, title: "احداث شبکه فوق توزیع در حریم خط", default_priority: "high", default_severity: "major", status: "active" },
  { id: 247, category_id: null, category_name: "عیوب برقگیر خط", defect_code: 260, title: "از بین رفتن چترک های برقگیر", default_priority: "high", default_severity: "major", status: "active" },
  { id: 248, category_id: null, category_name: "عیوب برقگیر خط", defect_code: 261, title: "آلوده بودن برقگیر", default_priority: "high", default_severity: "major", status: "active" },
  { id: 249, category_id: null, category_name: "عیوب برقگیر خط", defect_code: 262, title: "باز شدن اتصالات متصل به برقگیر", default_priority: "high", default_severity: "major", status: "active" },
  { id: 1, category_id: null, category_name: "عیوب سیم هادی فاز R", defect_code: 392, title: "بادکردگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 2, category_id: null, category_name: "عیوب سیم هادی فاز R", defect_code: 399, title: "پارگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 3, category_id: null, category_name: "عیوب سیم هادی فاز R", defect_code: 402, title: "پیچش سیم هادی باندل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 33, category_id: null, category_name: "عیوب سیم هادی فاز S", defect_code: 391, title: "باد کردگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 34, category_id: null, category_name: "عیوب سیم هادی فاز S", defect_code: 400, title: "پارگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 35, category_id: null, category_name: "عیوب سیم هادی فاز S", defect_code: 403, title: "پیچش سیم هادی باندل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 65, category_id: null, category_name: "عیوب سیم هادی فاز T", defect_code: 393, title: "بادکردگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 66, category_id: null, category_name: "عیوب سیم هادی فاز T", defect_code: 394, title: "بادکردگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 67, category_id: null, category_name: "عیوب سیم هادی فاز T", defect_code: 401, title: "پارگی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 17, category_id: null, category_name: "عیوب یراق آلات هادی فاز R", defect_code: 410, title: "جابجا شدن اسپیسر فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 18, category_id: null, category_name: "عیوب یراق آلات هادی فاز R", defect_code: 413, title: "جابجا شدن دمپر سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 19, category_id: null, category_name: "عیوب یراق آلات هادی فاز R", defect_code: 416, title: "جابجایی گوی هشدار بر روی سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 46, category_id: null, category_name: "عیوب یراق آلات هادی فاز S", defect_code: 386, title: "از بین رفتن رنگ گوی هشدار سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 47, category_id: null, category_name: "عیوب یراق آلات هادی فاز S", defect_code: 389, title: "آسیب دیدگی لاستیک اسپیسر فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 48, category_id: null, category_name: "عیوب یراق آلات هادی فاز S", defect_code: 396, title: "باز شدن اسپیسر فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 79, category_id: null, category_name: "عیوب یراق آلات هادی فاز T", defect_code: 387, title: "از بین رفتن رنگ گوی هشدار سیم هادی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 80, category_id: null, category_name: "عیوب یراق آلات هادی فاز T", defect_code: 390, title: "آسیب دیدگی لاستیک اسپیسر فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 81, category_id: null, category_name: "عیوب یراق آلات هادی فاز T", defect_code: 397, title: "باز شدن اسپیسر فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 100, category_id: null, category_name: "عیوب اسپیسر بین فازی", defect_code: 384, title: "از بین رفتن چترک اسپیسر بین فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 101, category_id: null, category_name: "عیوب اسپیسر بین فازی", defect_code: 398, title: "باز شدن اسپیسر بین فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 102, category_id: null, category_name: "عیوب اسپیسر بین فازی", defect_code: 405, title: "تخریب راد اسپیسر بین فازی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 311, category_id: null, category_name: "عیوب سیم محافظ", defect_code: 346, title: "اتصال بدنه غیر استاندارد (انشعاب گرفتن از کلمپ به بدنه دکل)", default_priority: "high", default_severity: "major", status: "active" },
  { id: 312, category_id: null, category_name: "عیوب سیم محافظ", defect_code: 351, title: "باز شدن اتصال بدنه یا جمپر سیم محافظ با دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 313, category_id: null, category_name: "عیوب سیم محافظ", defect_code: 356, title: "پارگی سیم محافظ", default_priority: "high", default_severity: "major", status: "active" },
  { id: 378, category_id: null, category_name: "عیوب یراق آلات سیم محافظ", defect_code: 347, title: "اتصال نامناسب لوپ فیبر نوری به بدنه دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 379, category_id: null, category_name: "عیوب یراق آلات سیم محافظ", defect_code: 348, title: "ارتفاع نامناسب محل نصب جوینت باکس", default_priority: "high", default_severity: "major", status: "active" },
  { id: 380, category_id: null, category_name: "عیوب یراق آلات سیم محافظ", defect_code: 349, title: "از بین رفتن رنگ گوی هشدار سیم محافظ", default_priority: "high", default_severity: "major", status: "active" },
  { id: 99, category_id: null, category_name: "عیب در جاده دسترسی به محل دکل", defect_code: 292, title: "نیاز به ترمیم جاده دسترسی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 98, category_id: null, category_name: "عیب در جاده دسترسی به محل دکل", defect_code: 282, title: "فاقد جاده دسترسی", default_priority: "high", default_severity: "major", status: "active" },
  { id: 173, category_id: null, category_name: "عیوب بدنه دکل فلزی مشبک", defect_code: 123, title: "انحراف بازوی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 174, category_id: null, category_name: "عیوب بدنه دکل فلزی مشبک", defect_code: 127, title: "انحراف و اعوجاج در پایه های اصلی دکل", default_priority: "high", default_severity: "major", status: "active" },
  { id: 175, category_id: null, category_name: "عیوب بدنه دکل فلزی مشبک", defect_code: 129, title: "انحراف و آسیب دیدگی استاب", default_priority: "high", default_severity: "major", status: "active" },
];

// ─── انواع سیم‌ها (v3.5.0 — از Conductors Standard.xlsx؛ نسخه کامل در دیتابیس) ───
const MOCK_CONDUCTORS: any[] = [
  { id: 1, name: "Fox", type: "ACSR", type_code: "ACSR", standard: "Bs", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "6/2.79", sectional_area_all: 42.8, overall_diameter_all: 8.37, weight_all: 148.0, ultimate_strength: 1340.0, resistance: 0.7822, status: "active" },
  { id: 2, name: "Mink", type: "ACSR", type_code: "ACSR", standard: "BS", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "6/3.66", sectional_area_all: 72.6, overall_diameter_all: 10.98, weight_all: 255.0, ultimate_strength: 2220.0, resistance: 0.4546, status: "active" },
  { id: 3, name: "Dog", type: "ACSR", type_code: "ACSR", standard: "Bs", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "6/4.72", sectional_area_all: 118.5, overall_diameter_all: 14.15, weight_all: 394.0, ultimate_strength: 3330.0, resistance: 0.2733, status: "active" },
  { id: 4, name: "Hyena", type: "ACSR", type_code: "ACSR", standard: "Bs", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "7/4.39", sectional_area_all: 126.5, overall_diameter_all: 14.57, weight_all: 451.0, ultimate_strength: 4180.0, resistance: 0.2707, status: "active" },
  { id: 5, name: "Partridge", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "26/2.573", sectional_area_all: 157.2, overall_diameter_all: 16.29, weight_all: 546.5, ultimate_strength: 5130.0, resistance: 0.2136, status: "active" },
  { id: 6, name: "Oriole", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "30/2.69", sectional_area_all: 210.3, overall_diameter_all: 18.83, weight_all: 784.6, ultimate_strength: 7870.0, resistance: 0.1698, status: "active" },
  { id: 7, name: "Lynx", type: "ACSR", type_code: "ACSR", standard: "Bs", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "30/2.79", sectional_area_all: 226.2, overall_diameter_all: 19.53, weight_all: 842.0, ultimate_strength: 8140.0, resistance: 0.1576, status: "active" },
  { id: 8, name: "Hawk", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "26/3.439", sectional_area_all: 280.8, overall_diameter_all: 21.78, weight_all: 976.5, ultimate_strength: 8850.0, resistance: 0.1196, status: "active" },
  { id: 9, name: "Peacock", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "24/4.034", sectional_area_all: 346.5, overall_diameter_all: 24.21, weight_all: 1161.0, ultimate_strength: 9790.0, resistance: 0.09413, status: "active" },
  { id: 10, name: "Squab", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "26/3.874", sectional_area_all: 356.4, overall_diameter_all: 24.53, weight_all: 1239.0, ultimate_strength: 11000.0, resistance: 0.09422, status: "active" },
  { id: 11, name: "Drake", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "26/4.442", sectional_area_all: 468.6, overall_diameter_all: 28.13, weight_all: 1628.0, ultimate_strength: 14300.0, resistance: 0.07167, status: "active" },
  { id: 12, name: "Canary", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "54/3.279", sectional_area_all: 515.1, overall_diameter_all: 29.51, weight_all: 1725.0, ultimate_strength: 14500.0, resistance: 0.06332, status: "active" },
  { id: 13, name: "Cardinal", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "54/3.376", sectional_area_all: 546.1, overall_diameter_all: 30.39, weight_all: 1828.0, ultimate_strength: 15400.0, resistance: 0.05973, status: "active" },
  { id: 14, name: "Curlew", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "54/3.513", sectional_area_all: 691.3, overall_diameter_all: 31.62, weight_all: 1980.0, ultimate_strength: 16600.0, resistance: 0.05518, status: "active" },
  { id: 15, name: "Martin", type: "ACSR", type_code: "ACSR", standard: "ASTM", core_type: "GS", material_outer: "Alum.", material_inner: "Steel", stranding_outer: "54/4.018", sectional_area_all: 771.4, overall_diameter_all: 36.16, weight_all: 2584.0, ultimate_strength: 21000.0, resistance: 0.04238, status: "active" },
];

// ─── پردازشگر اصلی ───
// v3.1.0: همیشه NextResponse برمی‌گرداند (fallback 404) — سازگار با نوع route handler های Next.js
export async function handleMockRequest(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/proxy/, "");
  const method = request.method;
  const search = url.searchParams;

  // ─── auth/login ───
  if (path === "/auth/login" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { username, password } = body;
    if (username === "admin" && (password === "admin123" || password === "admin")) {
      // v2.8.1: ساختار پاسخ با PHP واقعی و auth-context هم‌راستا شد — tokens داخل آبجکت tokens (قبلاً تخت بود و لاگین در حالت mock کرش می‌کرد)
      return NextResponse.json({
        success: true,
        data: {
          user: MOCK_USER,
          tokens: {
            access_token: FAKE_ACCESS_TOKEN,
            refresh_token: FAKE_REFRESH_TOKEN,
            token_type: "Bearer",
            expires_in: 3600,
          },
        },
      });
    }
    return NextResponse.json({
      success: false,
      error: { code: 401, message: "نام کاربری یا رمز عبور اشتباه است" },
    }, { status: 401 });
  }

  // ─── auth/me ───
  // v2.8.1: ساختار با GET /auth/me در PHP هم‌راستا شد — {user, roles, permissions} (قبلاً خود کاربر مستقیم برمی‌گشت)
  if (path === "/auth/me" && method === "GET") {
    return NextResponse.json({
      success: true,
      data: {
        user: MOCK_USER,
        roles: [{ name: "super_admin", display_name: "مدیر ارشد سیستم" }],
        permissions: ["*"],
      },
    });
  }

  // ─── auth/refresh ───
  // v2.8.1: فقط توکن‌ها برگردانده می‌شوند — هماهنگ با POST /auth/refresh در PHP
  if (path === "/auth/refresh" && method === "POST") {
    return NextResponse.json({
      success: true,
      data: {
        access_token: FAKE_ACCESS_TOKEN,
        refresh_token: FAKE_REFRESH_TOKEN,
        token_type: "Bearer",
        expires_in: 3600,
      },
    });
  }

  // ─── auth/logout ───
  if (path === "/auth/logout" && method === "POST") {
    return NextResponse.json({ success: true, data: null });
  }

  // ─── auth/change-password ───
  if (path === "/auth/change-password" && method === "POST") {
    return NextResponse.json({ success: true, data: null, message: "رمز عبور تغییر یافت" });
  }

  // ─── lines (GET) ───
  if (path === "/lines" && method === "GET") {
    const page = parseInt(search.get("page") || "1");
    const pageSize = parseInt(search.get("page_size") || "20");
    const q = search.get("search")?.toLowerCase().trim() || "";

    let filtered = MOCK_LINES;
    if (q) {
      filtered = MOCK_LINES.filter(l =>
        String(l.line_code).includes(q) ||
        String(l.name || "").toLowerCase().includes(q) ||
        String(l.dispatch_code || "").includes(q) ||
        String(l.line_supervisor || "").includes(q) ||
        String(l.line_expert || "").includes(q)
      );
    }

    return NextResponse.json({
      success: true,
      data: filtered,
      pagination: {
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
    });
  }

  // ─── lines (POST - create new) ───
  if (path === "/lines" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const newId = nextId(MOCK_LINES);
    const newLine = { ...body, id: newId, status: "active" }; // v3.2.1: id بعد از spread — ستون id خالی اکسل نباید id تولیدی را بازنویسی کند
    MOCK_LINES.push(newLine);
    return NextResponse.json({ success: true, data: newLine });
  }

  // ─── lines/bulk-import ───
  if (path === "/lines/bulk-import" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const rows: any[] = body.rows || [];
    const statuses: string[] = [];
    const errors: (string | null)[] = [];
    for (const row of rows) {
      const code = String(row.line_code || "").trim();
      const name = String(row.name || "").trim();
      if (!code) {
        statuses.push("failed");
        errors.push("کد خط خالی است");
      } else if (!name) {
        statuses.push("failed");
        errors.push("نام خط خالی است");
      } else if (MOCK_LINES.some(l => l.line_code === code)) {
        statuses.push("failed");
        errors.push(`کد خط «${code}» تکراری است`);
      } else {
        const newId = nextId(MOCK_LINES);
        MOCK_LINES.push({ ...row, id: newId, status: "active" }); // v3.2.1: id بعد از spread
        statuses.push("inserted");
        errors.push(null);
      }
    }
    return NextResponse.json({ success: true, data: { statuses, errors, first_error: null } });
  }

  // ─── lines/bulk-delete ───
  if (path === "/lines/bulk-delete" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = body.ids || [];
    let deleted = 0;
    for (const id of ids) {
      const idx = MOCK_LINES.findIndex(l => l.id === id);
      if (idx !== -1) { MOCK_LINES.splice(idx, 1); deleted++; }
    }
    return NextResponse.json({ success: true, data: { deleted } });
  }

  // ─── lines/{id} ───
  const lineMatch = path.match(/^\/lines\/(\d+)$/);
  if (lineMatch) {
    const id = parseInt(lineMatch[1]);
    if (method === "PUT") {
      let body: any = {};
      try { body = await request.json(); } catch { /* empty */ }
      const idx = MOCK_LINES.findIndex(l => l.id === id);
      if (idx !== -1) {
        MOCK_LINES[idx] = { ...MOCK_LINES[idx], ...body, id: MOCK_LINES[idx].id }; // v3.2.1: id محافظت می‌شود
        return NextResponse.json({ success: true, data: MOCK_LINES[idx] });
      }
      return NextResponse.json({
        success: false,
        error: { code: 404, message: "خط پیدا نشد" },
      }, { status: 404 });
    }
    if (method === "DELETE") {
      const idx = MOCK_LINES.findIndex(l => l.id === id);
      if (idx !== -1) {
        MOCK_LINES.splice(idx, 1);
        // Also remove towers of this line
        for (let i = MOCK_TOWERS.length - 1; i >= 0; i--) {
          if (MOCK_TOWERS[i].line_id === id) MOCK_TOWERS.splice(i, 1);
        }
        return NextResponse.json({ success: true, data: null });
      }
      return NextResponse.json({
        success: false,
        error: { code: 404, message: "خط پیدا نشد" },
      }, { status: 404 });
    }
    // GET /lines/{id}
    const line = MOCK_LINES.find(l => l.id === id);
    if (line) return NextResponse.json({ success: true, data: line });
    return NextResponse.json({
      success: false,
      error: { code: 404, message: "خط پیدا نشد" },
    }, { status: 404 });
  }

  // ─── lines/{id}/towers ───
  const lineTowersMatch = path.match(/^\/lines\/(\d+)\/towers$/);
  if (lineTowersMatch && method === "GET") {
    const lineId = parseInt(lineTowersMatch[1]);
    const towers = MOCK_TOWERS.filter(t => t.line_id === lineId);
    return NextResponse.json({ success: true, data: towers });
  }

  // ─── towers (GET) ───
  if (path === "/towers" && method === "GET") {
    const page = parseInt(search.get("page") || "1");
    const pageSize = parseInt(search.get("page_size") || "20");
    const q = search.get("search")?.toLowerCase().trim() || "";
    let filtered = MOCK_TOWERS;
    if (q) {
      filtered = MOCK_TOWERS.filter(t =>
        String(t.tower_code).includes(q) ||
        String(t.line_code).includes(q) ||
        String(t.line_name || "").toLowerCase().includes(q) ||
        String(t.tower_type || "").includes(q) ||
        String(t.line_supervisor || "").includes(q)
      );
    }
    return NextResponse.json({
      success: true,
      data: filtered,
      pagination: {
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      },
    });
  }

  // ─── towers (POST تکی — دیالوگ ثبت دکل) ───
  if (path === "/towers" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    if (!body.tower_number) {
      return NextResponse.json({ success: false, error: { code: 400, message: "شماره دکل الزامی است" } }, { status: 400 });
    }
    const line = body.line_id != null
      ? MOCK_LINES.find(l => String(l.id) === String(body.line_id))
      : undefined;
    if (body.line_id != null && !line) {
      return NextResponse.json({ success: false, error: { code: 404, message: "خط مورد نظر پیدا نشد" } }, { status: 404 });
    }
    const code = String(body.tower_code ?? "").trim() ||
      (line ? `${line.line_code}-${String(body.tower_number).padStart(3, "0")}` : "");
    if (line && code && MOCK_TOWERS.some(t => t.line_id === line.id && t.tower_code === code)) {
      return NextResponse.json({ success: false, error: { code: 409, message: "کد دکل در این خط قبلاً ثبت شده" } }, { status: 409 });
    }
    const newId = nextId(MOCK_TOWERS);
    MOCK_TOWERS.push({ ...body, id: newId, tower_code: code, status: "active" });
    return NextResponse.json({ success: true, data: { id: newId, tower_code: code }, message: "دکل با موفقیت ایجاد شد" }, { status: 201 });
  }

  // ─── towers/bulk-update — v4.3.32: شبیه‌سازی ویرایش گروهی ۱۰۰تایی ───
  if (path === "/towers/bulk-update" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = Array.isArray(body.ids) ? body.ids : [];
    const patch: Record<string, any> = body.patch && typeof body.patch === "object" ? body.patch : {};
    if (!ids.length) return NextResponse.json({ success: false, error: { code: 400, message: "لیست شناسه‌ها ارسال نشده" } }, { status: 400 });
    if (ids.length > 100) return NextResponse.json({ success: false, error: { code: 400, message: "حداکثر ۱۰۰ دکل در هر درخواست" } }, { status: 400 });
    const allowed = new Set(["tower_structure","tower_type","tower_type_code","insulator_r1","insulator_s1","insulator_t1","insulator_r2","insulator_s2","insulator_t2","line_supervisor","status"]);
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k)));
    if (!Object.keys(safePatch).length) return NextResponse.json({ success: false, error: { code: 400, message: "هیچ فیلد مجازی برای ویرایش ارسال نشده" } }, { status: 400 });
    let updated = 0;
    for (const id of ids) {
      const row = MOCK_TOWERS.find(t => t.id === id);
      if (!row) continue;
      Object.assign(row, safePatch);
      updated++;
    }
    return NextResponse.json({ success: true, data: { updated }, message: `${updated} دکل ویرایش شد` });
  }

  // ─── towers/bulk-import / bulk-delete ───
  if (path === "/towers/bulk-import" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const rows: any[] = body.rows || [];
    // v3.2.1: ردیف‌ها واقعاً به mock اضافه می‌شوند تا بعد از import در جدول دیده شوند
    // (قبلاً فقط وضعیت inserted برمی‌گشت و ردیف‌ها در نمایش mock پیدا نبودند)
    const statuses: string[] = [];
    const errors: (string | null)[] = [];
    let newTowerId = nextId(MOCK_TOWERS);
    const existingCodes = new Set(MOCK_TOWERS.map(t => t.tower_code));
    for (const r of rows) {
      // v3.2.2: resolve خط با id یا کد یا نام نرمال‌شده — و پیام راهنما اگر پیدا نشد
      const norm = (s: unknown) => String(s ?? "").trim()
        .replace(/\u200c/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").toLowerCase();
      const line = MOCK_LINES.find(l =>
        String(l.id) === String(r.line_id ?? "") ||
        (r.line_code != null && String(r.line_code).trim() !== "" && String(l.line_code) === String(r.line_code).trim()) ||
        (r.line_name != null && norm(r.line_name) !== "" && norm(l.name) === norm(r.line_name))
      );
      const num = Number(r.tower_number);
      const code = String(r.tower_code ?? "").trim() ||
        (line && Number.isFinite(num) && num > 0 ? `${line.line_code}-${String(num).padStart(3, "0")}` : "");
      if (!line) {
        const ref = r.line_name || r.line_code || "";
        statuses.push("failed");
        errors.push(ref
          ? `نام/کد خط «${ref}» با هیچ خط ثبت‌شده‌ای مطابقت ندارد — ابتدا اکسل خطوط را در بخش «خطوط انتقال» وارد کنید`
          : "ستون خط (نام خط یا کد خط) در فایل خالی است — ابتدا خطوط را وارد کنید");
        continue;
      }
      if (code && existingCodes.has(code)) { statuses.push("failed"); errors.push(`کد دکل ${code} تکراری است`); continue; }
      if (code) existingCodes.add(code);
      MOCK_TOWERS.push({ ...r, id: newTowerId++, tower_code: code, line_id: line.id, line_code: line.line_code, line_name: line.name, status: "active" });
      statuses.push("inserted");
      errors.push(null);
    }
    return NextResponse.json({ success: true, data: { statuses, errors, first_error: errors.find(Boolean) ?? null } });
  }
  if (path === "/towers/bulk-delete" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = body.ids || [];
    let deleted = 0;
    for (const id of ids) {
      const idx = MOCK_TOWERS.findIndex(t => t.id === id);
      if (idx !== -1) { MOCK_TOWERS.splice(idx, 1); deleted++; }
    }
    return NextResponse.json({ success: true, data: { deleted } });
  }

  // ─── towers/{id} ───
  const towerMatch = path.match(/^\/towers\/(\d+)$/);
  if (towerMatch) {
    const id = parseInt(towerMatch[1]);
    if (method === "PUT") {
      let body: any = {};
      try { body = await request.json(); } catch { /* empty */ }
      const idx = MOCK_TOWERS.findIndex(t => t.id === id);
      if (idx !== -1) {
        MOCK_TOWERS[idx] = { ...MOCK_TOWERS[idx], ...body, id: MOCK_TOWERS[idx].id }; // v3.2.1: id محافظت می‌شود
        return NextResponse.json({ success: true, data: MOCK_TOWERS[idx] });
      }
      return NextResponse.json({
        success: false,
        error: { code: 404, message: "دکل پیدا نشد" },
      }, { status: 404 });
    }
    if (method === "DELETE") {
      const idx = MOCK_TOWERS.findIndex(t => t.id === id);
      if (idx !== -1) {
        MOCK_TOWERS.splice(idx, 1);
        return NextResponse.json({ success: true, data: null });
      }
      return NextResponse.json({
        success: false,
        error: { code: 404, message: "دکل پیدا نشد" },
      }, { status: 404 });
    }
    const tower = MOCK_TOWERS.find(t => t.id === id);
    if (tower) return NextResponse.json({ success: true, data: tower });
    return NextResponse.json({
      success: false,
      error: { code: 404, message: "دکل پیدا نشد" },
    }, { status: 404 });
  }

  // ─── bulk-delete ها (v3.2.0) ───
  if (path === "/circuits/bulk-delete" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = body.ids || [];
    let deleted = 0;
    for (const id of ids) {
      const idx = MOCK_CIRCUITS.findIndex(c => c.id === id);
      if (idx !== -1) { MOCK_CIRCUITS.splice(idx, 1); deleted++; }
    }
    return NextResponse.json({ success: true, data: { deleted }, message: `${deleted} مدار حذف شد` });
  }
  if (path === "/personnel/bulk-delete" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = body.ids || [];
    let deleted = 0, skipped = 0;
    for (const id of ids) {
      const idx = MOCK_PERSONNEL.findIndex(p => p.id === id);
      if (idx === -1) continue;
      // اگر عیبی ثبت کرده و جانشین هست → انتقال، وگرنه رد
      const hasDefects = MOCK_DEFECTS.some(d => (d as any).discovered_by === id);
      const surrogate = MOCK_PERSONNEL.find(p => !ids.includes(p.id) && p.status);
      if (hasDefects && !surrogate) { skipped++; continue; }
      if (hasDefects && surrogate) {
        for (const d of MOCK_DEFECTS) { if ((d as any).discovered_by === id) (d as any).discovered_by = surrogate.id; }
      }
      MOCK_PERSONNEL.splice(idx, 1);
      deleted++;
    }
    return NextResponse.json({ success: true, data: { deleted, skipped }, message: `${deleted} پرسنل حذف شد` });
  }
  if (path === "/defects/bulk-delete" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = body.ids || [];
    let deleted = 0;
    for (const id of ids) {
      const idx = MOCK_DEFECTS.findIndex(d => d.id === id);
      if (idx !== -1) { MOCK_DEFECTS.splice(idx, 1); deleted++; }
    }
    return NextResponse.json({ success: true, data: { deleted }, message: `${deleted} عیب حذف شد` });
  }

  // ─── conductors (v3.5.0) ───
  if (path === "/conductors" && method === "GET") {
    const q = search.get("search")?.toLowerCase().trim() || "";
    let filtered = MOCK_CONDUCTORS;
    if (q) filtered = filtered.filter(c =>
      String(c.name).toLowerCase().includes(q) ||
      String(c.standard || "").toLowerCase().includes(q)
    );
    return NextResponse.json({ success: true, data: filtered });
  }
  if (path === "/conductors" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    if (!String(body.name || "").trim()) {
      return NextResponse.json({ success: false, error: { code: 400, message: "نام سیم الزامی است" } }, { status: 400 });
    }
    if (MOCK_CONDUCTORS.some(c => c.name === String(body.name).trim())) {
      return NextResponse.json({ success: false, error: { code: 409, message: "این نام سیم قبلاً ثبت شده است" } }, { status: 409 });
    }
    const newId = nextId(MOCK_CONDUCTORS);
    MOCK_CONDUCTORS.push({ ...body, id: newId, name: String(body.name).trim(), status: "active" });
    return NextResponse.json({ success: true, data: { id: newId }, message: "سیم ایجاد شد" }, { status: 201 });
  }
  const conductorMatch = path.match(/^\/conductors\/(\d+)$/);
  if (conductorMatch) {
    const id = parseInt(conductorMatch[1]);
    const idx = MOCK_CONDUCTORS.findIndex(c => c.id === id);
    if (method === "PUT") {
      let body: any = {};
      try { body = await request.json(); } catch { /* empty */ }
      if (idx !== -1) {
        MOCK_CONDUCTORS[idx] = { ...MOCK_CONDUCTORS[idx], ...body, id };
        return NextResponse.json({ success: true, data: null, message: "سیم ویرایش شد" });
      }
      return NextResponse.json({ success: false, error: { code: 404, message: "سیم پیدا نشد" } }, { status: 404 });
    }
    if (method === "DELETE") {
      if (idx !== -1) MOCK_CONDUCTORS.splice(idx, 1);
      return NextResponse.json({ success: true, data: null, message: "سیم حذف شد" });
    }
  }
  if (path === "/conductors/bulk-delete" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids: number[] = body.ids || [];
    let deleted = 0;
    for (const id of ids) {
      const idx = MOCK_CONDUCTORS.findIndex(c => c.id === id);
      if (idx !== -1) { MOCK_CONDUCTORS.splice(idx, 1); deleted++; }
    }
    return NextResponse.json({ success: true, data: { deleted }, message: `${deleted} سیم حذف شد` });
  }
  if (path === "/conductors/bulk-import" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const rows: any[] = body.rows || [];
    const statuses: string[] = [];
    const errors: (string | null)[] = [];
    let inserted = 0, updated = 0, failed = 0;
    for (const r of rows) {
      const name = String(r.name || "").trim();
      if (!name) { statuses.push("failed"); errors.push("نام سیم الزامی است"); failed++; continue; }
      const idx = MOCK_CONDUCTORS.findIndex(c => c.name === name);
      if (idx !== -1) {
        MOCK_CONDUCTORS[idx] = { ...MOCK_CONDUCTORS[idx], ...r, name, id: MOCK_CONDUCTORS[idx].id };
        statuses.push("updated"); errors.push(null); updated++;
      } else {
        const newId = nextId(MOCK_CONDUCTORS);
        MOCK_CONDUCTORS.push({ ...r, id: newId, name, status: "active" });
        statuses.push("inserted"); errors.push(null); inserted++;
      }
    }
    return NextResponse.json({ success: true, data: { inserted, updated, failed, statuses, errors, first_error: failed > 0 ? errors.find(Boolean) : null } });
  }

  // ─── defect-definitions (v3.1.0: عیوب استاندارد برای انتخاب در فرم عیب) ───
  if (path === "/defect-definitions" && method === "GET") {
    return NextResponse.json({ success: true, data: MOCK_DEFECT_DEFINITIONS });
  }

  // ─── bulk-import ها (v3.1.0) ───
  if (path === "/circuits/bulk-import" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const rows: any[] = body.rows || [];
    const statuses: string[] = [];
    const errors: (string | null)[] = [];
    let inserted = 0, updated = 0, failed = 0;
    for (const r of rows) {
      const code = String(r.dispatch_code || "").trim();
      const voltage = Number(r.voltage || 0);
      if (!code) { statuses.push("failed"); errors.push("کد دیسپاچینگ الزامی است"); failed++; continue; }
      if (!voltage) { statuses.push("failed"); errors.push("ولتاژ الزامی است"); failed++; continue; }
      const idx = MOCK_CIRCUITS.findIndex(c => c.dispatch_code === code);
      if (idx !== -1) {
        MOCK_CIRCUITS[idx] = { ...MOCK_CIRCUITS[idx], name: r.name || null, voltage };
        statuses.push("updated"); errors.push(null); updated++;
      } else {
        const newId = nextId(MOCK_CIRCUITS);
        MOCK_CIRCUITS.push({ id: newId, dispatch_code: code, name: r.name || null, voltage });
        statuses.push("inserted"); errors.push(null); inserted++;
      }
    }
    return NextResponse.json({ success: true, data: { inserted, updated, failed, statuses, errors, first_error: failed > 0 ? errors.find(Boolean) : null } });
  }
  if (path === "/personnel/bulk-import" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const rows: any[] = body.rows || [];
    const statuses: string[] = [];
    const errors: (string | null)[] = [];
    let inserted = 0, updated = 0, failed = 0;
    for (const r of rows) {
      if (!String(r.first_name || "").trim()) { statuses.push("failed"); errors.push("نام الزامی است"); failed++; continue; }
      const nat = r.national_id ? String(r.national_id).trim() : null;
      const idx = nat ? MOCK_PERSONNEL.findIndex(p => p.national_id === nat) : -1;
      if (idx !== -1) {
        MOCK_PERSONNEL[idx] = { ...MOCK_PERSONNEL[idx], ...r, national_id: nat };
        statuses.push("updated"); errors.push(null); updated++;
      } else {
        const newId = nextId(MOCK_PERSONNEL);
        MOCK_PERSONNEL.push({
          id: newId, personnel_code: r.personnel_code || ("P-" + (2000 + newId)),
          first_name: r.first_name, last_name: r.last_name || "",
          national_id: nat, father_name: r.father_name || null,
          personnel_type: r.personnel_type || "employee", position: r.position || null,
          mobile: r.mobile || null, supervisor_name: r.supervisor_name || null,
          collaboration_start: r.collaboration_start || null, status: "active",
        });
        statuses.push("inserted"); errors.push(null); inserted++;
      }
    }
    return NextResponse.json({ success: true, data: { inserted, updated, failed, statuses, errors, first_error: failed > 0 ? errors.find(Boolean) : null } });
  }
  if (path === "/defects/bulk-import" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const rows: any[] = body.rows || [];
    const statuses: string[] = [];
    const errors: (string | null)[] = [];
    let inserted = 0, failed = 0;
    for (const r of rows) {
      const title = String(r.title || "").trim();
      if (!title) { statuses.push("failed"); errors.push("عنوان عیب الزامی است"); failed++; continue; }
      let lineId = r.line_id ? Number(r.line_id) : null;
      let line = lineId ? MOCK_LINES.find(l => l.id === lineId) : null;
      if (!line && r.line_code) line = MOCK_LINES.find(l => String(l.line_code) === String(r.line_code).trim());
      if (!line && r.line_code) { statuses.push("failed"); errors.push(`خط «${r.line_code}» پیدا نشد`); failed++; continue; }
      const newId = nextId(MOCK_DEFECTS);
      const defectCode = "DEF-" + new Date().getFullYear() + "-" + String(100000 + newId * 13 % 900000);
      const def = r.defect_definition_id ? MOCK_DEFECT_DEFINITIONS.find((d: any) => String(d.id) === String(r.defect_definition_id)) : null;
      MOCK_DEFECTS.unshift({
        id: newId, defect_code: defectCode, title,
        description: r.description || null, defect_type: r.defect_type || def?.category_name || null,
        severity: r.severity || def?.default_severity || "minor",
        priority: r.priority || def?.default_priority || "medium",
        safety_risk: r.safety_risk || "none", status: "new",
        line_id: line?.id ?? null, line_code: line?.line_code || null,
        tower_code: r.tower_code || null, category_name: def?.category_name || null,
        defect_definition_id: def?.id ?? null,
        discovered_by_name: null,
        discovered_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      });
      statuses.push("inserted"); errors.push(null); inserted++;
    }
    return NextResponse.json({ success: true, data: { inserted, updated: 0, failed, statuses, errors, first_error: failed > 0 ? errors.find(Boolean) : null } });
  }

  // ─── defects (v2.8.1: GET صفحه‌بندی‌شده + POST برای تست فرم ثبت عیب) ───
  if (path === "/defects" && method === "GET") {
    const page = parseInt(search.get("page") || "1");
    const pageSize = parseInt(search.get("page_size") || "20");
    const q = search.get("search")?.toLowerCase().trim() || "";
    let filtered = MOCK_DEFECTS;
    if (q) {
      filtered = MOCK_DEFECTS.filter(d =>
        String(d.defect_code).includes(q) ||
        String(d.title).toLowerCase().includes(q) ||
        String(d.line_code || "").includes(q)
      );
    }
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    return NextResponse.json({
      success: true,
      data: filtered,
      pagination: {
        page,
        page_size: pageSize,
        total: filtered.length,
        total_pages: totalPages,
        has_prev: page > 1,
        has_next: page < totalPages,
      },
    });
  }
  if (path === "/defects" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const newId = nextId(MOCK_DEFECTS);
    const defectCode = "DEF-" + new Date().getFullYear() + "-" + String(100000 + newId * 7 % 900000);
    const lineId = body.line_id ? Number(body.line_id) : null;
    const line = MOCK_LINES.find(l => l.id === lineId);
    MOCK_DEFECTS.unshift({
      id: newId,
      defect_code: defectCode,
      title: body.title,
      description: body.description || null,
      defect_type: body.defect_type || null,
      severity: body.severity || "minor",
      priority: body.priority || "medium",
      safety_risk: body.safety_risk || "none",
      status: "new",
      line_id: lineId,
      line_code: line?.line_code || null,
      tower_code: null,
      category_name: null,
      discovered_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    return NextResponse.json({ success: true, data: { id: newId, defect_code: defectCode }, message: "عیب با موفقیت ثبت شد" }, { status: 201 });
  }

  // ─── price-lists (v2.8.1) ───
  if (path === "/price-lists" && method === "GET") {
    return NextResponse.json({ success: true, data: MOCK_PRICE_LISTS });
  }
  if (path === "/price-lists" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const newId = nextId(MOCK_PRICE_LISTS);
    MOCK_PRICE_LISTS.push({ id: newId, name: body.name, version: body.version || "1.0", effective_date: body.effective_date || "2026-03-21", status: "active" });
    return NextResponse.json({ success: true, data: { id: newId }, message: "فهرست بها ایجاد شد" }, { status: 201 });
  }
  if (path === "/price-list-items" && method === "GET") {
    const listId = parseInt(search.get("list_id") || "0");
    const items = listId ? MOCK_PRICE_LIST_ITEMS.filter(i => i.price_list_id === listId) : MOCK_PRICE_LIST_ITEMS;
    return NextResponse.json({ success: true, data: items });
  }
  if (path === "/price-list-items" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const newId = nextId(MOCK_PRICE_LIST_ITEMS);
    const code = body.code || ("P-" + String(newId).padStart(3, "0"));
    MOCK_PRICE_LIST_ITEMS.push({ id: newId, price_list_id: Number(body.price_list_id), code, title: body.title, unit: body.unit || "عدد", unit_price: Number(body.unit_price || 0), category: body.category || "عملیات", status: "active" });
    return NextResponse.json({ success: true, data: { id: newId, code }, message: "قلم ایجاد شد" }, { status: 201 });
  }
  const priceListItemMatch = path.match(/^\/price-list-items\/(\d+)$/);
  if (priceListItemMatch && method === "DELETE") {
    const id = parseInt(priceListItemMatch[1]);
    const idx = MOCK_PRICE_LIST_ITEMS.findIndex(i => i.id === id);
    if (idx !== -1) MOCK_PRICE_LIST_ITEMS.splice(idx, 1);
    return NextResponse.json({ success: true, data: null, message: "قلم حذف شد" });
  }

  // ─── checklist-templates (v2.8.1) ───
  if (path === "/checklist-templates" && method === "GET") {
    return NextResponse.json({ success: true, data: MOCK_CHECKLIST_TEMPLATES });
  }
  if (path === "/checklist-templates" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const newId = nextId(MOCK_CHECKLIST_TEMPLATES);
    MOCK_CHECKLIST_TEMPLATES.push({ id: newId, name: body.name, description: body.description || null, applies_to: body.applies_to || "tower", status: "active", created_at: new Date().toISOString().slice(0, 19).replace("T", " ") });
    return NextResponse.json({ success: true, data: { id: newId }, message: "چک‌لیست ایجاد شد" }, { status: 201 });
  }

  // ─── circuits (v3.0.0: کدهای دیسپاچینگ) ───
  if (path === "/circuits" && method === "GET") {
    const voltage = parseInt(search.get("voltage") || "0");
    const q = search.get("search")?.toLowerCase().trim() || "";
    let filtered = MOCK_CIRCUITS;
    if (voltage) filtered = filtered.filter(c => c.voltage === voltage);
    if (q) filtered = filtered.filter(c =>
      String(c.dispatch_code).toLowerCase().includes(q) ||
      String(c.name || "").toLowerCase().includes(q)
    );
    return NextResponse.json({ success: true, data: filtered });
  }
  if (path === "/circuits" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    if (!body.dispatch_code || !body.voltage) {
      return NextResponse.json({ success: false, error: { code: 400, message: "کد دیسپاچینگ و ولتاژ الزامی است" } }, { status: 400 });
    }
    if (MOCK_CIRCUITS.some(c => c.dispatch_code === String(body.dispatch_code).trim())) {
      return NextResponse.json({ success: false, error: { code: 409, message: "این کد دیسپاچینگ قبلاً ثبت شده است" } }, { status: 409 });
    }
    const newId = nextId(MOCK_CIRCUITS);
    MOCK_CIRCUITS.push({ id: newId, dispatch_code: String(body.dispatch_code).trim(), name: body.name || null, voltage: Number(body.voltage) });
    return NextResponse.json({ success: true, data: { id: newId }, message: "مدار ایجاد شد" }, { status: 201 });
  }
  const circuitMatch = path.match(/^\/circuits\/(\d+)$/);
  if (circuitMatch) {
    const id = parseInt(circuitMatch[1]);
    const idx = MOCK_CIRCUITS.findIndex(c => c.id === id);
    if (method === "PUT") {
      let body: any = {};
      try { body = await request.json(); } catch { /* empty */ }
      if (idx !== -1) {
        MOCK_CIRCUITS[idx] = { ...MOCK_CIRCUITS[idx], ...body, id };
        return NextResponse.json({ success: true, data: MOCK_CIRCUITS[idx], message: "مدار ویرایش شد" });
      }
      return NextResponse.json({ success: false, error: { code: 404, message: "مدار پیدا نشد" } }, { status: 404 });
    }
    if (method === "DELETE") {
      if (idx !== -1) MOCK_CIRCUITS.splice(idx, 1);
      return NextResponse.json({ success: true, data: null, message: "مدار حذف شد" });
    }
    if (method === "GET") {
      if (idx !== -1) return NextResponse.json({ success: true, data: MOCK_CIRCUITS[idx] });
      return NextResponse.json({ success: false, error: { code: 404, message: "مدار پیدا نشد" } }, { status: 404 });
    }
  }

  // ─── personnel (v3.0.0: پاسخ صفحه‌بندی‌شده + فیلتر نوع + جستجو — هم‌شکل با modules.php) ───
  if (path === "/personnel" && method === "GET") {
    const page = parseInt(search.get("page") || "1");
    const pageSize = parseInt(search.get("page_size") || "20");
    const q = search.get("search")?.toLowerCase().trim() || "";
    const type = search.get("personnel_type") || "";
    let filtered = MOCK_PERSONNEL;
    if (type) filtered = filtered.filter(p => p.personnel_type === type);
    if (q) filtered = filtered.filter(p =>
      String(p.personnel_code).includes(q) ||
      String(p.first_name).includes(q) ||
      String(p.last_name).includes(q) ||
      String(p.position || "").includes(q) ||
      String(p.national_id || "").includes(q)
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    return NextResponse.json({
      success: true,
      data: filtered,
      pagination: { page, page_size: pageSize, total: filtered.length, total_pages: totalPages, has_prev: page > 1, has_next: page < totalPages },
    });
  }
  if (path === "/personnel" && method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }
    const newId = nextId(MOCK_PERSONNEL);
    const code = body.personnel_code || ("P-" + String(2000 + newId));
    MOCK_PERSONNEL.push({
      id: newId, personnel_code: code,
      first_name: body.first_name || "", last_name: body.last_name || "",
      national_id: body.national_id || null, father_name: body.father_name || null,
      personnel_type: body.personnel_type || "employee", position: body.position || null,
      phone: body.phone || null, mobile: body.mobile || null, email: body.email || null,
      supervisor_name: body.supervisor_name || null, collaboration_start: body.collaboration_start || null,
      status: "active",
    });
    return NextResponse.json({ success: true, data: { id: newId, personnel_code: code }, message: "پرسنل ایجاد شد" }, { status: 201 });
  }
  const personnelMatch = path.match(/^\/personnel\/(\d+)$/);
  if (personnelMatch) {
    const id = parseInt(personnelMatch[1]);
    const idx = MOCK_PERSONNEL.findIndex(p => p.id === id);
    if (method === "PUT") {
      let body: any = {};
      try { body = await request.json(); } catch { /* empty */ }
      if (idx !== -1) {
        MOCK_PERSONNEL[idx] = { ...MOCK_PERSONNEL[idx], ...body, id };
        return NextResponse.json({ success: true, data: null, message: "پرسنل ویرایش شد" });
      }
      return NextResponse.json({ success: false, error: { code: 404, message: "پرسنل پیدا نشد" } }, { status: 404 });
    }
    if (method === "DELETE") {
      if (idx !== -1) MOCK_PERSONNEL.splice(idx, 1);
      return NextResponse.json({ success: true, data: null, message: "پرسنل حذف شد" });
    }
  }

  // ─── dashboard/stats ───
  if (path === "/dashboard/stats" && method === "GET") {
    return NextResponse.json({ success: true, data: MOCK_DASHBOARD_STATS });
  }
  if (path === "/dashboard/recent-defects" && method === "GET") {
    return NextResponse.json({ success: true, data: [] });
  }
  if (path === "/dashboard/defects-by-category" && method === "GET") {
    return NextResponse.json({ success: true, data: [] });
  }

  // ─── contractors / personnel / users / organization ───
  // v3.0.0: personnel و circuits از این لیست حذف شدند — handler اختصاصی بالاتر دارند
  for (const ep of ["/contractors", "/users", "/organization", "/crews", "/equipment", "/equipment-classes"]) {
    if (path === ep && method === "GET") {
      return NextResponse.json({ success: true, data: [] });
    }
  }

  // ─── عیوب اضافی / بازدیدها / دستورکارها ───
  // v2.8.1: defects و price-lists و checklist-templates از این لیست حذف شدند — handler اختصاصی بالاتر دارند
  for (const ep of ["/defect-categories", "/defect-definitions", "/inspections", "/work-orders", "/contracts", "/invoices", "/safety-incidents", "/audit-log"]) {
    if (path === ep && method === "GET") {
      return NextResponse.json({ success: true, data: [] });
    }
  }

  // ─── fallback ───
  return NextResponse.json({
    success: false,
    error: {
      code: 404,
      message: `[MOCK] مسیر پیدا نشد: ${method} ${path}`,
    },
  }, { status: 404 });
}

/**
 * آیا این مسیر در mock پشتیبانی می‌شود؟
 * برای جلوگیری از رفتن به سرور اصلی در حالت توسعه
 */
export function isMockSupported(method: string, path: string): boolean {
  // همه مسیرهای API پشتیبانی می‌شوند تا کل UI قابل تست باشد
  return true;
}
