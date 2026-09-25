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

const API_BASE_URL = "https://bot.sabadgame.com/Powerline/api.php";
const DEV_MODE = process.env.NODE_ENV !== "production";

/**
 * v3.5.1 — حل خودکار چالش ضد DDoS هاست:
 * هاست bot.sabadgame.com بعد از چند درخواست پشت‌سرهم، به‌جای JSON صفحه HTML می‌فرستد که
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

// ─── v4.3.83 (فقط توسعه): شبیه‌ساز مدیریت کاربران/نقش‌ها ───
// بک‌اند قدیمی هاست endpoint نقش‌ها ندارد و role_id در PUT /users را نادیده
// می‌گرفت. تا زمان آپلود بک‌اند جدید (4.3.85: چند-اموری)، نوشتن‌های /users
// و /roles در حالت توسعه به‌صورت محلی شبیه‌سازی می‌شوند (روی overlay حافظه‌ای)
// و هرگز به هاست نمی‌رسند. با آپلود بک‌اند جدید، شبیه‌ساز خودش غیرفعال می‌شود.
// v4.3.86: نسخهٔ بستهٔ فعلی ۴.۳.۸۶ است؛ شبیه‌ساز کاربران/نقش‌ها به نسخهٔ
// اختصاصی خودش (۴.۳.۸۵) گره خورد تا با هاست ۴.۳.۸۵ خاموش بماند.
const SIM_VERSION = [4, 3, 87];
const SIM_USERS_VERSION = [4, 3, 85];
let upstreamVersionCache: number[] | null = null;

function versionAtLeast(v: number[], ref: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i] > ref[i]) return true;
    if (v[i] < ref[i]) return false;
  }
  return true;
}

/** نسخهٔ واقعی بک‌اند هاست (کش‌شده) — [major, minor, patch] یا [] در خطا */
async function upstreamBackendVersion(): Promise<number[]> {
  if (upstreamVersionCache) return upstreamVersionCache;
  try {
    const res = await fetch(`${API_BASE_URL}/backend-version`, { cache: "no-store" });
    const text = await res.text();
    const parsed = JSON.parse(text);
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(parsed?.data?.version ?? ""));
    upstreamVersionCache = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [];
    // v4.3.86: فهرست قابلیت‌های هاست هم کش می‌شود (برای گیت شبیه‌ساز فهرست بها)
    upstreamFeaturesCache = Array.isArray(parsed?.data?.features) ? parsed.data.features.map(String) : [];
  } catch {
    upstreamVersionCache = [];
  }
  return upstreamVersionCache;
}

/** v4.3.86: قابلیت‌های اعلام‌شدهٔ بک‌اند هاست (features در پاسخ backend-version).
 *  بک‌اند ۴.۳.۸۶ این فهرست را برمی‌گرداند؛ هاست‌های قدیمی/تغییریافته که endpoint
 *  های جدید را ندارند اینجا چیزی اعلام نمی‌کنند و شبیه‌ساز فعال می‌شود. */
let upstreamFeaturesCache: string[] | null = null;

async function hostHasFeature(feature: string): Promise<boolean> {
  if (upstreamFeaturesCache === null) {
    await upstreamBackendVersion();
    if (upstreamFeaturesCache === null) upstreamFeaturesCache = [];
  }
  return upstreamFeaturesCache.includes(feature);
}

/** وضعیت حافظه‌ای شبیه‌ساز کاربران */
const simUserPatches = new Map<number, Record<string, any>>();
const simCreatedUsers: any[] = [];
const simDeletedIds = new Set<number>();
let simNextUserId = 100001;
let simDistrictNames: Map<number, string> | null = null;

async function simDistrictName(id: number | null, authHeader = ""): Promise<string | null> {
  if (id == null) return null;
  if (!simDistrictNames) {
    simDistrictNames = new Map();
    try {
      const res = await fetch(`${API_BASE_URL}/districts?page=1&page_size=100`, {
        cache: "no-store",
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      const parsed = await res.json();
      const list = parsed?.data?.data ?? parsed?.data ?? [];
      if (Array.isArray(list)) {
        for (const d of list) simDistrictNames.set(Number(d.id), String(d.name ?? ""));
      }
    } catch { /* بدون نام — فقط شناسه */ }
  }
  return simDistrictNames.get(Number(id)) ?? null;
}

/** شبیه‌سازی نوشتن روی /users — همیشه فقط در DEV */
async function simulateUsersWrite(method: string, path: string, bodyText: string, authHeader = ""): Promise<Response> {
  let body: any = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { /* خالی */ }
  const idMatch = /^\/users\/(\d+)$/.exec(path);
  const json = (payload: any, status = 200) => new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Dev-Simulated": "users" },
  });

  if (method === "PUT" && idMatch) {
    const id = Number(idMatch[1]);
    const patch: Record<string, any> = { ...(simUserPatches.get(id) ?? {}), ...body };
    // role_id عددی → نام نقش هم روی overlay گذاشته می‌شود تا ستون نقش درست نمایش داده شود
    if (body.role_id !== undefined) {
      const role = simAllRoles().find(r => r.id === Number(body.role_id));
      patch.role_id = body.role_id == null ? null : Number(body.role_id);
      patch.role_name = role ? role.display_name : null;
      patch.roles = role ? role.display_name : null;
    }
    // v4.3.85: چند-اموری — district_ids نرمال + همگام‌سازی district_id/district_names
    if (body.district_ids !== undefined) {
      const ids: number[] = Array.isArray(body.district_ids)
        ? [...new Set<number>((body.district_ids as any[]).map((v: any) => Number(v)).filter((n: number) => n > 0))]
        : [];
      if (ids.length && !simDistrictNames) await simDistrictName(ids[0], authHeader); // گرم‌کردن کش نام امورها
      patch.district_ids = ids;
      patch.district_id = ids.length ? ids[0] : null;
      patch.district_names = ids.length ? ids.map((n: number) => simDistrictNames?.get(n) ?? null) : [];
      patch.district_name = ids.length ? (simDistrictNames?.get(ids[0]) ?? null) : null;
    } else if (body.district_id !== undefined) {
      // کلاینت قدیمی — تک‌امور
      const one = body.district_id == null ? null : Number(body.district_id);
      if (one != null && !simDistrictNames) await simDistrictName(one, authHeader);
      patch.district_id = one;
      patch.district_ids = one ? [one] : [];
      patch.district_name = one != null ? (simDistrictNames?.get(one) ?? null) : null;
      patch.district_names = one ? [simDistrictNames?.get(one) ?? null] : [];
    }
    simUserPatches.set(id, patch);
    simDeletedIds.delete(id);
    console.log(`[DEV SIM] users PUT ${id} — patch اعمال شد روی overlay`);
    return json({ success: true, message: "کاربر ویرایش شد (شبیه‌ساز توسعه)", data: null });
  }
  if (method === "DELETE" && idMatch) {
    const id = Number(idMatch[1]);
    simDeletedIds.add(id);
    simUserPatches.delete(id);
    const idx = simCreatedUsers.findIndex(u => u.id === id);
    if (idx >= 0) simCreatedUsers.splice(idx, 1);
    console.log(`[DEV SIM] users DELETE ${id}`);
    return json({ success: true, message: "کاربر حذف شد (شبیه‌ساز توسعه)", data: null });
  }
  if (method === "POST" && path === "/users") {
    const id = simNextUserId++;
    // v4.3.85: چند-اموری — district_ids (آرایه) مقدم؛ district_id پشتیبان
    const districtIds: number[] = Array.isArray(body.district_ids)
      ? [...new Set<number>((body.district_ids as any[]).map((v: any) => Number(v)).filter((n: number) => n > 0))]
      : (body.district_id != null ? [Number(body.district_id)] : []);
    const districtId = districtIds.length ? districtIds[0] : null;
    const role = body.role_id != null ? simAllRoles().find(r => r.id === Number(body.role_id)) : undefined;
    const user = {
      id,
      username: String(body.username ?? ""),
      full_name: String(body.full_name ?? ""),
      email: body.email ?? null,
      status: body.status === "inactive" ? "inactive" : "active",
      role_id: role ? role.id : null,
      role_name: role ? role.display_name : null,
      roles: role ? role.display_name : null,
      district_id: districtId,
      district_name: await simDistrictName(districtId, authHeader),
      district_ids: districtIds,
      district_names: districtIds.length
        ? await Promise.all(districtIds.map((n: number) => simDistrictName(n, authHeader)))
        : [],
      module_permissions: body.module_permissions ?? null,
      last_login_at: null,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    simCreatedUsers.push(user);
    console.log(`[DEV SIM] users POST — کاربر ${user.username} ساخته شد (${districtIds.length} امور)`);
    return json({ success: true, message: `کاربر ایجاد شد (شبیه‌ساز توسعه)${body.password ? "" : " — رمز پیش‌فرض 123456"}`, data: { id } }, 201);
  }
  return json({ success: false, error: { code: 404, message: "مسیر شبیه‌ساز کاربران پیدا نشد" } }, 404);
}

// ─── v4.3.83 (فقط توسعه): شبیه‌ساز نقش‌ها — GET/POST/PUT/DELETE /roles ───
// بک‌اند قدیمی endpoint نقش‌ها ندارد؛ دانه‌های اولیه از dump SQL واقعی هاست ساخته شده‌اند.
const SIM_SEED_ROLES: any[] = [
  { id: 1, name: "super_admin", display_name: "مدیر ارشد سیستم", description: "دسترسی کامل به همه ماژول‌ها", is_system: 1, status: "active", module_permissions: null, users_count: 1, created_at: "2026-08-18 18:51:41" },
  { id: 2, name: "مدیر", display_name: "مدیر", description: "مشاهده داشبورد و گزارش‌ها", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 3, name: "maintenance_mgr", display_name: "مدیر تعمیرات", description: "مدیریت بازدید‌ها و عیوب", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 4, name: "gis_specialist", display_name: "کارشناس GIS", description: "مدیریت خطوط، دکل‌ها و نقشه", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 5, name: "safety_officer", display_name: "کارشناس ایمنی", description: "مدیریت اطلاعات ایمنی", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 6, name: "contract_mgr", display_name: "کارشناس قراردادها", description: "مدیریت قراردادها و پیمانکاران", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 7, name: "financial", display_name: "کارشناس مالی", description: "صورت‌وضعیت و پرداخت‌ها", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 8, name: "پیمانکار", display_name: "پیمانکار", description: "ثبت بازدید و عملیات", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 9, name: "inspector", display_name: "بازرس", description: "ثبت بازدید و عیوب", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 10, name: "اپراتور", display_name: "اپراتور", description: "دسترسی محدود به ثبت اطلاعات", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-08-18 18:51:41" },
  { id: 11, name: "district_user", display_name: "کاربر امور", description: "کاربر امور بهره‌برداری (سازگار با نسخه‌های قبل)", is_system: 1, status: "active", module_permissions: null, users_count: 0, created_at: "2026-09-01 00:00:00" },
  // نقش نمونهٔ غیرسیستمی برای پیش‌نمایش تب دسترسی‌ها
  { id: 12, name: "سیمبان", display_name: "سیمبان", description: "مشاهده خطوط/دکل‌ها و ثبت بازدید و عیب", is_system: 0, status: "active",
    module_permissions: { maps: true, circuits: { view: true }, lines: true, towers: true, inspections: true, defects: true },
    users_count: 0, created_at: "2026-09-04 00:00:00" },
];
const simRolePatches = new Map<number, Record<string, any>>();
const simCreatedRoles: any[] = [];
const simDeletedRoleIds = new Set<number>();
let simNextRoleId = 900001;

/** فهرست کامل نقش‌های شبیه‌ساز (دانه + ساخته‌شده + patch) */
function simAllRoles(): any[] {
  const base = [...SIM_SEED_ROLES, ...simCreatedRoles].filter(r => !simDeletedRoleIds.has(Number(r.id)));
  return base.map(r => ({ ...r, ...(simRolePatches.get(Number(r.id)) ?? {}) }));
}

/** پاسخ GET /roles شبیه‌ساز — هم‌شکل Response::paginated بک‌اند */
function simulateRolesGet(): Response {
  const rows = simAllRoles();
  return new NextResponse(JSON.stringify({
    success: true,
    message: "فهرست نقش‌ها (شبیه‌ساز توسعه)",
    data: { data: rows, total: rows.length, page: 1, page_size: 500 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Dev-Simulated": "roles" },
  });
}

/** شبیه‌سازی نوشتن روی /roles — همیشه فقط در DEV */
function simulateRolesWrite(method: string, path: string, bodyText: string): Response {
  let body: any = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { /* خالی */ }
  const idMatch = /^\/roles\/(\d+)$/.exec(path);
  const json = (payload: any, status = 200) => new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Dev-Simulated": "roles" },
  });

  if (method === "GET") return simulateRolesGet();

  if (method === "PUT" && idMatch) {
    const id = Number(idMatch[1]);
    const existing = simAllRoles().find(r => Number(r.id) === id);
    if (!existing) return json({ success: false, error: { code: 404, message: "نقش پیدا نشد" } }, 404);
    if (Number(existing.is_system) === 1 && body.display_name !== undefined && String(body.display_name) !== existing.display_name) {
      return json({ success: false, error: { code: 403, message: "نام نقش سیستمی قابل تغییر نیست" } }, 403);
    }
    const patch: Record<string, any> = { ...(simRolePatches.get(id) ?? {}) };
    if (body.display_name !== undefined) patch.display_name = String(body.display_name);
    if (body.description !== undefined) patch.description = body.description ?? null;
    if (body.status !== undefined) patch.status = String(body.status) === "inactive" ? "inactive" : "active";
    if (body.module_permissions !== undefined) patch.module_permissions = body.module_permissions;
    simRolePatches.set(id, patch);
    console.log(`[DEV SIM] roles PUT ${id}`);
    return json({ success: true, message: "نقش ویرایش شد (شبیه‌ساز توسعه)", data: null });
  }
  if (method === "DELETE" && idMatch) {
    const id = Number(idMatch[1]);
    const existing = simAllRoles().find(r => Number(r.id) === id);
    if (!existing) return json({ success: false, error: { code: 404, message: "نقش پیدا نشد" } }, 404);
    if (Number(existing.is_system) === 1) {
      return json({ success: false, error: { code: 403, message: "نقش سیستمی حذف نمی‌شود" } }, 403);
    }
    if (Number(existing.users_count ?? 0) > 0) {
      return json({ success: false, error: { code: 409, message: `این نقش به ${existing.users_count} کاربر اختصاص دارد — ابتدا نقش کاربران را تغییر دهید` } }, 409);
    }
    simDeletedRoleIds.add(id);
    simRolePatches.delete(id);
    const idx = simCreatedRoles.findIndex(r => Number(r.id) === id);
    if (idx >= 0) simCreatedRoles.splice(idx, 1);
    console.log(`[DEV SIM] roles DELETE ${id}`);
    return json({ success: true, message: "نقش حذف شد (شبیه‌ساز توسعه)", data: null });
  }
  if (method === "POST" && path === "/roles") {
    const displayName = String(body.display_name ?? "").trim();
    if (!displayName) return json({ success: false, error: { code: 400, message: "نام نقش الزامی است" } }, 400);
    if (simAllRoles().some(r => r.display_name === displayName)) {
      return json({ success: false, error: { code: 409, message: "این نام نقش قبلاً ثبت شده است" } }, 409);
    }
    const id = simNextRoleId++;
    simCreatedRoles.push({
      id, name: displayName, display_name: displayName,
      description: body.description ?? null,
      is_system: 0,
      status: String(body.status ?? "active") === "inactive" ? "inactive" : "active",
      module_permissions: body.module_permissions ?? null,
      users_count: 0,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    console.log(`[DEV SIM] roles POST — نقش ${displayName} ساخته شد`);
    return json({ success: true, message: "نقش ایجاد شد (شبیه‌ساز توسعه)", data: { id } }, 201);
  }
  return json({ success: false, error: { code: 404, message: "مسیر شبیه‌ساز نقش‌ها پیدا نشد" } }, 404);
}

/** اعمال overlay شبیه‌ساز روی پاسخ GET /users (فقط DEV) */
function applyUsersSimulatorToGet(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.success === false) return bodyText;
    let rows: any[] = parsed?.data?.data ?? (Array.isArray(parsed?.data) ? parsed.data : []);
    if (!Array.isArray(rows)) return bodyText;
    rows = rows.filter((u: any) => !simDeletedIds.has(Number(u.id)));
    // v4.3.85: کاربران ساخته‌شدهٔ شبیه‌ساز اول prepend می‌شوند تا patch های
    // بعدی (district_ids/role_id/...) روی آن‌ها هم اعمال شود
    rows = [...simCreatedUsers.slice().reverse(), ...rows];
    rows = rows.map((u: any) => {
      const patch = simUserPatches.get(Number(u.id));
      let merged = patch ? { ...u, ...patch } : u;
      // role_id بدون role_name (بک‌اند قدیمی) → نام نقش از شبیه‌ساز نقش‌ها پر می‌شود
      if (merged.role_id != null && !merged.role_name) {
        const role = simAllRoles().find(r => Number(r.id) === Number(merged.role_id));
        if (role) merged = { ...merged, role_name: role.display_name, roles: role.display_name };
      }
      return merged;
    });
    let total = parsed?.data?.total;
    if (typeof total === "number") total = rows.length;
    if (parsed?.data && !Array.isArray(parsed.data)) {
      parsed.data.data = rows;
      if (typeof total === "number") parsed.data.total = total;
    } else {
      parsed.data = rows;
    }
    return JSON.stringify(parsed);
  } catch {
    return bodyText;
  }
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

function describeUpstreamNetworkFailure(code: string, message: string): string {
  const c = code.toUpperCase();
  if (c.includes("ENOTFOUND") || c.includes("EAI_AGAIN") || c.includes("ENODATA")) {
    return "DNS دامنه سرور API حل نشد؛ دامنه یا DNS سرور مقصد را بررسی کنید.";
  }
  if (c.includes("ECONNREFUSED")) {
    return "اتصال به سرور API رد شد؛ وب‌سرور یا پورت سرویس مقصد در دسترس نیست.";
  }
  if (c.includes("ECONNRESET") || c.includes("EPIPE")) {
    return "اتصال به سرور API در میانه راه قطع شد؛ احتمالاً فایروال یا سرویس میزبان اتصال را بسته است.";
  }
  if (c.includes("ETIMEDOUT") || c.includes("TIMEOUT") || message.toLowerCase().includes("timeout")) {
    return "اتصال به سرور API به پایان مهلت رسید؛ سرور مقصد کند، شلوغ یا مسدود است.";
  }
  if (c.includes("CERT") || message.toLowerCase().includes("certificate") || message.toLowerCase().includes("tls")) {
    return "اعتبار گواهی HTTPS یا TLS سرور API قابل تأیید نبود.";
  }
  return message ? `خطای اتصال به سرور API: ${message}` : "اتصال به سرور API برقرار نشد.";
}

// ═══════════════════════════════════════════════════════════════
// v4.3.86 (فقط توسعه): شبیه‌ساز فهرست بها + بازدید + صورت‌وضعیت
// تا آپلود بک‌اند ۴.۳.۸۶ روی هاست و اجرای SQL جدید، این مسیرها محلی
// شبیه‌سازی می‌شوند: overlay اقلام فهرست (فیلدهای طبقه‌بندی + ضرایب)،
// بازدیدهای ساخت محلی (نوع صعودی/پیمایشی + خط/دکل/زمین)، تطبیق قلم،
// کاندیدهای دوره، صدور صورت‌وضعیت و اقلام آن.
// ═══════════════════════════════════════════════════════════════
const simPriceItemPatches = new Map<number, Record<string, any>>();
const simPriceItemsCreated: any[] = [];
const simPriceItemDeleted = new Set<number>();
let simPriceItemNextId = 900001;
const simInspectionsCreated: any[] = [];
let simInspectionNextId = 910001;
const simPriceListsCreated: any[] = [];
const simPriceListPatches = new Map<number, Record<string, any>>();
let simPriceListNextId = 930001;
const simInvoicesCreated: any[] = [];
const simInvoiceItemsStore = new Map<number, any[]>();
let simInvoiceNextId = 920001;

const simJson = (payload: any, status = 200) => new NextResponse(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "X-Dev-Simulated": "pricelist-invoices" },
});

async function simFetchHost(pathWithQuery: string, authHeader: string): Promise<any | null> {
  try {
    const finalHeaders: Record<string, string> = {};
    if (authHeader) finalHeaders.Authorization = authHeader;
    const cookie = validDdgCookieHeader();
    if (cookie) finalHeaders.Cookie = cookie;
    const res = await fetch(`${API_BASE_URL}${pathWithQuery}`, { cache: "no-store", headers: finalHeaders });
    return await res.json();
  } catch {
    return null;
  }
}

/** اقلام فهرست = اقلام هاست + پچ‌های محلی + اقلام ساخته‌شده محلی */
async function simMergedPriceItems(authHeader: string): Promise<any[]> {
  const host = await simFetchHost("/price-list-items?page=1&page_size=5000", authHeader);
  const hostItems: any[] = Array.isArray(host?.data) ? host.data : [];
  const merged = hostItems
    .filter((it: any) => !simPriceItemDeleted.has(Number(it.id)))
    .map((it: any) => ({ ...it, ...(simPriceItemPatches.get(Number(it.id)) ?? {}) }));
  return [...simPriceItemsCreated.filter(it => !simPriceItemDeleted.has(Number(it.id))), ...merged];
}

/** آیا ردیف «فعال» است؟ — سازگار با status 'active'/'1'/1 و is_active=1 */
function simIsActive(it: any): boolean {
  const st = it?.status;
  return st === "active" || st === "1" || st === 1 || Number(it?.is_active) === 1;
}

// ─── مدل فهرست بهای کشوری v4.3.87 — قرینهٔ PHP ───
const SIM_TERRAIN_LABELS: Record<string, string> = {
  plain: "دشت", hilly: "تپه‌ماهور", semi_mountainous: "نیمه‌کوهستانی", impassable: "صعب‌العبور",
};
const SIM_TERRAIN_GROUP_LABELS: Record<string, string> = {
  plain_hilly: "دشت و تپه‌ماهور", semi_mountainous: "نیمه‌کوهستانی (جنگل)", impassable: "صعب‌العبور (باتلاقی/شالیزار)",
};
const SIM_METHOD_LABELS: Record<string, string> = {
  climbing: "بازدید صعودی", patrol: "بازدید پیمایشی", drone: "بازدید پهبادی",
};
const SIM_COEF_KIND_LABELS: Record<string, string> = {
  two_person: "بازدید دو نفره",
  bundle_2: "اضافه بها خطوط دو باندل", bundle_3: "اضافه بها خطوط سه باندل", bundle_4: "اضافه بها خطوط چهار باندل",
  double_insulator: "مقره دوبل",
  terrain_semi_mountainous: "اضافه بها مسیر نیمه‌کوهستانی", terrain_impassable: "اضافه بها مسیر صعب‌العبور و باتلاقی",
  tower_wooden_concrete: "کاهش بها تیر چوبی و بتنی", tower_telescopic: "کاهش بها دکل تلسکوپی", tower_h_pole: "کاهش بها پایه H",
};

/** گروه زمین کشوری از زمین دکل: plain| hilly → plain_hilly */
function simTerrainGroup(t: any): string | null {
  if (!t) return null;
  if (t === "plain" || t === "hilly" || t === "plain_hilly") return "plain_hilly";
  if (t === "semi_mountainous") return "semi_mountainous";
  if (t === "impassable") return "impassable";
  return null;
}

/** آیا ضریبِ سازه برای این نوع دکل صدق می‌کند؟ (قرینهٔ PHP) */
function simStructureMatches(kind: string, structure: string | null | undefined): boolean {
  if (!structure) return false;
  const s = String(structure).trim();
  if (kind === "tower_wooden_concrete") return s.includes("چوبی") || s.includes("بتنی");
  if (kind === "tower_telescopic") return s.includes("تلسکوپی");
  if (kind === "tower_h_pole") return s === "H" || s === "h" || s.includes("پایه H") || s.includes("پایه h");
  return false;
}

/** اعمال ضرایب فرزندِ ردیف پایه بر اساس زمینه (قرینهٔ PHP pl_apply_coefficients) */
function simApplyCoefficients(items: any[], item: any, ctx: any) {
  const bundles = ctx.bundle_count != null ? Number(ctx.bundle_count) : null;
  const crewSize = Math.max(1, Number(ctx.crew_size ?? 1));
  const structure = ctx.tower_structure || null;
  const terrainGroup = simTerrainGroup(ctx.terrain_type);
  const itemTerrain = simTerrainGroup(item.terrain_type);
  const itemBundle = item.bundle_count != null ? Number(item.bundle_count) : null;
  const coefs: any[] = [];
  let sum = 0;
  for (const c of items) {
    if (String(c.item_kind) !== "coefficient" || !simIsActive(c)) continue;
    if (String(c.parent_code ?? "") !== String(item.code)) continue;
    const kind = String(c.coefficient_kind ?? "");
    let apply = false;
    if (kind === "bundle_2") apply = bundles === 2 && itemBundle !== 2;
    else if (kind === "bundle_3") apply = bundles === 3 && itemBundle !== 3;
    else if (kind === "bundle_4") apply = bundles === 4 && itemBundle !== 4;
    else if (kind === "two_person") apply = crewSize >= 2;
    else if (["tower_wooden_concrete", "tower_telescopic", "tower_h_pole"].includes(kind)) apply = simStructureMatches(kind, structure);
    else if (kind === "terrain_semi_mountainous") apply = terrainGroup === "semi_mountainous" && itemTerrain !== "semi_mountainous";
    else if (kind === "terrain_impassable") apply = terrainGroup === "impassable" && itemTerrain !== "impassable";
    if (!apply) continue;
    const amount = Number(c.unit_price ?? 0);
    sum += amount;
    coefs.push({
      id: Number(c.id), code: String(c.code), title: String(c.title), kind,
      kind_label: SIM_COEF_KIND_LABELS[kind] || "ضریب", amount,
    });
  }
  return { coefficients: coefs, coefficient_amount: Math.round(sum * 100) / 100 };
}

/** منطق تطبیق ردیف پایه فهرست بهای کشوری — قرینهٔ PHP pl_match_price_item */
function simMatchPriceItem(items: any[], ctx: any) {
  const num = (v: any) => (v == null || v === "" ? null : Number(v));
  const voltage = num(ctx.voltage_kv);
  const circuits = num(ctx.circuit_count);
  const bundles = num(ctx.bundle_count);
  const activity = ctx.activity_type ?? null;
  const method = ctx.inspection_method ?? null;
  const chapter = ctx.chapter != null ? Number(ctx.chapter) : null;
  const terrainGroup = simTerrainGroup(ctx.terrain_type);
  const isBase = (it: any) => it.item_kind !== "coefficient" && Number(it.is_coefficient) !== 1;

  // فیلترهای سخت: فقط ردیف‌های سازگار (NULL = عمومی)
  const cands = items.filter(it =>
    isBase(it) && simIsActive(it) &&
    (method == null || !it.inspection_method || it.inspection_method === method) &&
    (activity == null || !it.activity_type || it.activity_type === activity) &&
    (voltage == null || it.voltage_kv == null || Number(it.voltage_kv) === voltage) &&
    (circuits == null || it.circuit_count == null || Number(it.circuit_count) === circuits) &&
    (chapter == null || it.chapter == null || Number(it.chapter) === chapter));
  if (!cands.length) return null;

  // امتیازدهی — دقیق‌ترین تطابق اول (قرینهٔ ORDER BY در PHP)
  const terrainScore = (it: any) => {
    const tg = simTerrainGroup(it.terrain_type);
    if (tg && tg === terrainGroup) return 3;
    if (!it.terrain_type) return 2;
    return 1; // ردیف گروه دیگر → پایه + ضریب زمین
  };
  const bundleScore = (it: any) => {
    if (it.bundle_count != null && bundles != null && Number(it.bundle_count) === bundles) return 3;
    if (it.bundle_count != null && Number(it.bundle_count) === 1) return 2;
    if (it.bundle_count == null) return 1;
    return 0;
  };
  const score = (it: any) =>
    (it.inspection_method && it.inspection_method === method ? 1000 : 0) +
    (it.activity_type && it.activity_type === activity ? 300 : 0) +
    (it.voltage_kv != null && Number(it.voltage_kv) === voltage ? 100 : 0) +
    (it.circuit_count != null && Number(it.circuit_count) === circuits ? 40 : 0) +
    terrainScore(it) * 8 + bundleScore(it) * 2 +
    (it.inspection_method ? 4 : 0) + (it.activity_type ? 2 : 0) +
    (it.voltage_kv != null ? 1.5 : 0) + (it.circuit_count != null ? 1 : 0) + (it.terrain_type ? 0.5 : 0);
  cands.sort((a, b) => score(b) - score(a) || Number(a.sort_order ?? a.id) - Number(b.sort_order ?? b.id) || Number(a.id) - Number(b.id));
  const item = cands[0];

  const base = Number(item.unit_price ?? 0);
  const applied = simApplyCoefficients(items, item, ctx);
  const final = Math.round((base + applied.coefficient_amount) * 100) / 100;
  return {
    item,
    base_unit_price: base,
    coefficients: applied.coefficients,
    coefficient_amount: applied.coefficient_amount,
    coefficient_percent: base > 0 && applied.coefficient_amount !== 0 ? Math.round(applied.coefficient_amount * 100 / base * 100) / 100 : 0,
    unit_price: final,
    terrain_group: terrainGroup,
    terrain_label: SIM_TERRAIN_GROUP_LABELS[terrainGroup ?? ""] || "همه زمین‌ها",
  };
}

/** شبیه‌ساز فهرست‌ها: ساخت/ویرایش محلی + merge در لیست (تا آپلود بک‌اند 4.3.87) */
async function simulatePriceListsRequest(method: string, path: string, search: string, bodyText: string, authHeader: string): Promise<Response | null> {
  const body: any = (() => { try { return bodyText ? JSON.parse(bodyText) : {}; } catch { return {}; } })();
  // GET — merge هاست + محلی
  if (method === "GET" && path === "/price-lists") {
    const host = await simFetchHost(`${path}${search}`, authHeader);
    const hostRows: any[] = Array.isArray(host?.data) ? host.data : [];
    const merged = [...simPriceListsCreated, ...hostRows.map((l: any) => ({ ...l, ...(simPriceListPatches.get(Number(l.id)) ?? {}) }))];
    return simJson({ success: true, data: merged });
  }
  // POST — ساخت محلی
  if (method === "POST" && path === "/price-lists") {
    if (!body.name) return simJson({ success: false, error: { code: 400, message: "نام فهرست الزامی است" } }, 400);
    const id = simPriceListNextId++;
    simPriceListsCreated.unshift({
      id, name: String(body.name), version: body.version ?? "1.0",
      effective_date: body.effective_date || new Date().toISOString().slice(0, 10),
      contract_id: body.contract_id ? Number(body.contract_id) : null,
      is_active: 1, status: "active",
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    console.log(`[DEV SIM] فهرست بها محلی ساخته شد #${id} ${body.name}`);
    return simJson({ success: true, message: "فهرست بها ایجاد شد (شبیه‌ساز توسعه)", data: { id } }, 201);
  }
  // PUT — پچ محلی یا هاست
  const putM = /^\/price-lists\/(\d+)$/.exec(path);
  if (method === "PUT" && putM) {
    const id = Number(putM[1]);
    const idx = simPriceListsCreated.findIndex(l => Number(l.id) === id);
    if (idx >= 0) simPriceListsCreated[idx] = { ...simPriceListsCreated[idx], ...body, id };
    else simPriceListPatches.set(id, { ...(simPriceListPatches.get(id) ?? {}), ...body });
    return simJson({ success: true, message: "فهرست بها ویرایش شد (شبیه‌ساز توسعه)", data: null });
  }
  return null; // DELETE و سایر متدها → هاست
}

async function simulatePriceListRequest(method: string, path: string, search: string, bodyText: string, authHeader: string): Promise<Response> {
  const body: any = (() => { try { return bodyText ? JSON.parse(bodyText) : {}; } catch { return {}; } })();
  const params = new URLSearchParams(search);

  // GET — لیست اقلام (merge هاست + محلی) با فیلترهای طبقه‌بندی کشوری
  if (method === "GET" && path === "/price-list-items") {
    const all = await simMergedPriceItems(authHeader);
    const listId = Number(params.get("list_id") || 0);
    const isCoefRow = (i: any) => i.item_kind === "coefficient" || Number(i.is_coefficient) === 1;
    let rows = listId ? all.filter(i => Number(i.price_list_id) === listId) : all;
    const fActivity = params.get("activity_type");
    if (fActivity) rows = rows.filter(i => (i.activity_type || "") === fActivity);
    const fMethod = params.get("inspection_method");
    if (fMethod) rows = rows.filter(i => (i.inspection_method || "") === fMethod);
    const fKind = params.get("item_kind");
    if (fKind === "coefficient") rows = rows.filter(isCoefRow);
    else if (fKind === "base") rows = rows.filter(i => !isCoefRow(i));
    const fCoef = params.get("coefficient");
    if (fCoef === "1") rows = rows.filter(isCoefRow);
    else if (fCoef === "0") rows = rows.filter(i => !isCoefRow(i));
    const fVoltage = params.get("voltage_kv");
    if (fVoltage) rows = fVoltage === "general" ? rows.filter(i => i.voltage_kv == null) : rows.filter(i => Number(i.voltage_kv) === Number(fVoltage));
    const fChapter = params.get("chapter");
    if (fChapter) rows = rows.filter(i => Number(i.chapter) === Number(fChapter));
    const fCoefKind = params.get("coefficient_kind");
    if (fCoefKind) rows = rows.filter(i => (i.coefficient_kind || "") === fCoefKind);
    const fParent = params.get("parent_code");
    if (fParent) rows = rows.filter(i => String(i.parent_code ?? "") === fParent);
    const fTerrain = params.get("terrain_type");
    if (fTerrain) rows = fTerrain === "general" ? rows.filter(i => i.terrain_type == null) : rows.filter(i => i.terrain_type === fTerrain);
    const q = params.get("search");
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(i => `${i.code} ${i.title} ${i.category ?? ""} ${i.parent_code ?? ""}`.toLowerCase().includes(needle));
    }
    // ترتیب فایل رسمی: ردیف اصلی و بعد ضرایبش
    rows.sort((a, b) => Number(a.sort_order ?? a.id) - Number(b.sort_order ?? b.id) || Number(a.id) - Number(b.id));
    return simJson({ success: true, data: rows });
  }

  // POST — ردیف جدید (با فیلدهای طبقه‌بندی کشوری)
  if (method === "POST" && path === "/price-list-items") {
    const id = simPriceItemNextId++;
    const code = body.code || ("PL-" + String(id % 10000).padStart(4, "0"));
    simPriceItemsCreated.push({
      id, price_list_id: Number(body.price_list_id), code, title: body.title,
      unit: body.unit || (body.item_kind === "coefficient" ? "ضریب" : "برج"),
      unit_price: Number(body.unit_price || 0), category: body.category || "",
      item_kind: body.item_kind === "coefficient" ? "coefficient" : "base",
      chapter: body.chapter ?? null, parent_code: body.parent_code ?? null,
      coefficient_kind: body.coefficient_kind ?? null, sort_order: body.sort_order ?? null,
      activity_type: body.activity_type ?? null, inspection_method: body.inspection_method ?? null,
      voltage_kv: body.voltage_kv ?? null, circuit_count: body.circuit_count ?? null, bundle_count: body.bundle_count ?? null,
      terrain_type: body.terrain_type ?? null, tower_structure: body.tower_structure ?? null,
      status: "active",
    });
    console.log(`[DEV SIM] ردیف فهرست ساخته شد #${id} ${code}`);
    return simJson({ success: true, message: "قلم ایجاد شد (شبیه‌ساز توسعه)", data: { id, code } }, 201);
  }

  // PUT — ویرایش (پچ روی هاست یا محلی)
  const putMatch = /^\/price-list-items\/(\d+)$/.exec(path);
  if (method === "PUT" && putMatch) {
    const id = Number(putMatch[1]);
    const localIdx = simPriceItemsCreated.findIndex(i => Number(i.id) === id);
    if (localIdx >= 0) simPriceItemsCreated[localIdx] = { ...simPriceItemsCreated[localIdx], ...body, id };
    else simPriceItemPatches.set(id, { ...(simPriceItemPatches.get(id) ?? {}), ...body });
    simPriceItemDeleted.delete(id);
    return simJson({ success: true, message: "قلم فهرست بها ویرایش شد (شبیه‌ساز توسعه)", data: null });
  }

  // DELETE — حذف ردیف + ضرایب فرزندش
  const delMatch = /^\/price-list-items\/(\d+)$/.exec(path);
  if (method === "DELETE" && delMatch) {
    const id = Number(delMatch[1]);
    const all = await simMergedPriceItems(authHeader);
    const row = all.find(i => Number(i.id) === id);
    if (row?.code) {
      for (const c of all) {
        if (String(c.parent_code ?? "") === String(row.code)) simPriceItemDeleted.add(Number(c.id));
      }
    }
    simPriceItemDeleted.add(id);
    simPriceItemPatches.delete(id);
    const idx = simPriceItemsCreated.findIndex(i => Number(i.id) === id);
    if (idx >= 0) simPriceItemsCreated.splice(idx, 1);
    return simJson({ success: true, message: "قلم حذف شد (شبیه‌ساز توسعه)", data: null });
  }

  // POST import — ایمپورت گروهی فهرست کشوری (اقلام پارس‌شده از فرمت استاندارد)
  if (method === "POST" && path === "/price-list-items/import") {
    const items: any[] = Array.isArray(body.items) ? body.items : [];
    if (!body.price_list_id || !items.length) return simJson({ success: false, error: { code: 400, message: "فهرست و اقلام الزامی است" } }, 400);
    if (body.replace) {
      for (const it of await simMergedPriceItems(authHeader)) {
        if (Number(it.price_list_id) === Number(body.price_list_id)) simPriceItemDeleted.add(Number(it.id));
      }
    }
    let normal = 0, coefs = 0;
    for (const it of items) {
      const id = simPriceItemNextId++;
      const isCoefIt = it.item_kind === "coefficient" || !!it.is_coefficient;
      simPriceItemsCreated.push({
        id, price_list_id: Number(body.price_list_id),
        code: it.code || ("PL-" + String(id % 10000).padStart(4, "0")),
        title: it.title,
        unit: it.unit || (isCoefIt ? "ضریب" : "برج"),
        unit_price: Number(it.unit_price || 0), category: it.category || "",
        item_kind: isCoefIt ? "coefficient" : "base",
        chapter: it.chapter ?? null, parent_code: it.parent_code ?? null,
        coefficient_kind: it.coefficient_kind ?? null, sort_order: it.sort_order ?? null,
        activity_type: it.activity_type ?? null, inspection_method: it.inspection_method ?? null,
        voltage_kv: it.voltage_kv ?? null, circuit_count: it.circuit_count ?? null, bundle_count: it.bundle_count ?? null,
        terrain_type: it.terrain_type ?? null, tower_structure: it.tower_structure ?? null,
        status: "active",
      });
      if (isCoefIt) coefs++; else normal++;
    }
    console.log(`[DEV SIM] ایمپورت فهرست کشوری: ${normal} ردیف اصلی + ${coefs} ضریب`);
    return simJson({ success: true, message: `ایمپورت انجام شد (شبیه‌ساز توسعه) — ${normal} ردیف اصلی و ${coefs} ضریب`, data: { imported_items: normal, imported_coefficients: coefs } }, 201);
  }

  // GET match — تطبیق ردیف با خط/دکل/روش بازدید (زمین از دکل)
  if (method === "GET" && path === "/price-list-items/match") {
    const lineId = Number(params.get("line_id") || 0);
    const towerId = Number(params.get("tower_id") || 0);
    const methodRaw = params.get("inspection_method") || params.get("inspection_type") || "climbing";
    const methodMap: Record<string, string> = { "صعودی": "climbing", "پیمایشی": "patrol", "پهبادی": "drone", "پهپادی": "drone", climbing: "climbing", patrol: "patrol", drone: "drone" };
    const method = methodMap[methodRaw] || methodRaw;
    const terrainOverride = params.get("terrain_type") || null;
    const crewSize = Number(params.get("crew_size") || 1);
    let priceListId = Number(params.get("price_list_id") || 0);
    const items = await simMergedPriceItems(authHeader);
    if (!priceListId) {
      const lists = await simFetchHost("/price-lists", authHeader);
      const arr: any[] = Array.isArray(lists?.data) ? lists.data : [];
      const active = arr.filter(l => simIsActive(l));
      priceListId = active.length ? Number(active[active.length - 1].id) : (arr.length ? Number(arr[0].id) : 0);
    }
    const scoped = items.filter(i => Number(i.price_list_id) === priceListId);
    let line: any = null, tower: any = null;
    if (lineId) {
      const lines = await simFetchHost(`/lines?page=1&page_size=500`, authHeader);
      line = (Array.isArray(lines?.data) ? lines.data : (lines?.data?.data || [])).find((l: any) => Number(l.id) === lineId) || null;
    }
    if (towerId) {
      const towers = await simFetchHost(`/towers?page=1&page_size=1000${lineId ? `&line_id=${lineId}` : ""}`, authHeader);
      const tArr: any[] = Array.isArray(towers?.data) ? towers.data : (towers?.data?.data || []);
      tower = tArr.find(t => Number(t.id) === towerId) || null;
      if (!tower && !lineId) {
        const all = await simFetchHost(`/towers?page=1&page_size=2000`, authHeader);
        tower = (Array.isArray(all?.data) ? all.data : (all?.data?.data || [])).find((t: any) => Number(t.id) === towerId) || null;
      }
    }
    const structure = tower?.tower_structure || line?.tower_structure || null;
    // v4.3.87: زمین از موقعیت دکل (اولویت)
    const terrain = tower?.terrain_type || terrainOverride || "plain";
    const chapter = method === "drone" ? 8 : 2;
    const match = simMatchPriceItem(scoped, {
      price_list_id: priceListId,
      voltage_kv: line?.voltage_kv ?? null, circuit_count: line?.circuit_count ?? null, bundle_count: line?.bundle_count ?? null,
      activity_type: "inspection", inspection_method: method, tower_structure: structure,
      terrain_type: terrain, crew_size: crewSize, chapter,
    });
    return simJson({
      success: true,
      data: {
        price_list_id: priceListId, line, tower, inspection_method: method, terrain_type: terrain,
        terrain_label: SIM_TERRAIN_LABELS[terrain] || terrain, tower_structure: structure,
        matched: match ? {
          item_id: Number(match.item.id), code: match.item.code, title: match.item.title, unit: match.item.unit,
          chapter: match.item.chapter ?? null,
          base_unit_price: match.base_unit_price, coefficients: match.coefficients,
          coefficient_amount: match.coefficient_amount, unit_price: match.unit_price,
          terrain_label: match.terrain_label,
        } : null,
      },
    });
  }

  return simJson({ success: false, error: { code: 404, message: `مسیر شبیه‌ساز پشتیبانی نمی‌شود: ${method} ${path}` } }, 404);
}

/** شبیه‌ساز بازدیدها: ساخت محلی (با نوع بازدید/خط/دکل/زمین/نفرات) + merge در لیست */
async function simulateInspectionsRequest(method: string, path: string, bodyText: string, authHeader: string): Promise<Response | null> {
  if (method === "POST" && path === "/inspections") {
    const body: any = (() => { try { return JSON.parse(bodyText || "{}"); } catch { return {}; } })();
    const id = simInspectionNextId++;
    const lineId = body.line_id ? Number(body.line_id) : null;
    const towerId = body.tower_id ? Number(body.tower_id) : null;
    let lineCode: string | null = null, towerCode: string | null = null, contractTitle: string | null = null;
    if (lineId) {
      const lines = await simFetchHost(`/lines?page=1&page_size=500`, authHeader);
      const l = (Array.isArray(lines?.data) ? lines.data : (lines?.data?.data || [])).find((x: any) => Number(x.id) === lineId);
      lineCode = l?.line_code ?? null;
    }
    if (towerId) {
      const towers = await simFetchHost(`/towers?page=1&page_size=2000`, authHeader);
      const t = (Array.isArray(towers?.data) ? towers.data : (towers?.data?.data || [])).find((x: any) => Number(x.id) === towerId);
      towerCode = t?.tower_code ?? null;
    }
    if (body.contract_id) {
      const contracts = await simFetchHost(`/contracts?page=1&page_size=100`, authHeader);
      const c = (Array.isArray(contracts?.data) ? contracts.data : (contracts?.data?.data || [])).find((x: any) => Number(x.id) === Number(body.contract_id));
      contractTitle = c?.title ?? null;
    }
    // نکتهٔ تست: بازدید محلی با وضعیت «ارسال شده» ذخیره می‌شود تا در کاندیدهای
    // صورت‌وضعیت ظاهر شود (در production این مقدار از گردش کار واقعی می‌آید)
    const row = {
      id, inspection_code: `INS-SIM-${String(id % 100000)}`, line_id: lineId, line_code: lineCode, line_name: null,
      tower_id: towerId, tower_code: towerCode, contract_id: body.contract_id ? Number(body.contract_id) : null,
      contract_title: contractTitle, inspector_name: "کاربر آزمایشی",
      inspection_date: body.inspection_date || new Date().toISOString().slice(0, 10),
      inspection_method: body.inspection_method || body.inspection_type || "climbing", terrain_type: body.terrain_type || null,
      crew_size: Math.max(1, Number(body.crew_size ?? 1)),
      status: "submitted", priority: body.priority || "routine", weather: body.weather || null, notes: body.notes || null,
      activity_status: "active", district_id: body.district_id ? Number(body.district_id) : null, district_name: null,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    simInspectionsCreated.unshift(row);
    console.log(`[DEV SIM] بازدید محلی ساخته شد #${id} (${row.inspection_method}) — وضعیت submitted برای تست صورت‌وضعیت`);
    return simJson({ success: true, message: "بازدید ثبت شد (شبیه‌ساز توسعه)", data: { id, inspection_code: row.inspection_code } }, 201);
  }
  return null;
}

/** شبیه‌ساز صورت‌وضعیت: کاندیدها + صدور (با ردیف‌های ضریب مجزا) + اقلام */
async function simulateInvoicesRequest(method: string, path: string, search: string, bodyText: string, authHeader: string): Promise<Response | null> {
  const body: any = (() => { try { return bodyText ? JSON.parse(bodyText) : {}; } catch { return {}; } })();
  const params = new URLSearchParams(search);

  // کاندیدهای دوره — بازدیدهای submitted/approved هاست + محلی (زمین از دکل)
  if (method === "GET" && path === "/invoices/candidates") {
    const contractId = Number(params.get("contract_id") || 0);
    const periodStart = params.get("period_start") || "";
    const periodEnd = params.get("period_end") || "";
    let priceListId = Number(params.get("price_list_id") || 0);
    if (!periodStart || !periodEnd) return simJson({ success: false, error: { code: 400, message: "ابتدا دوره (از تاریخ / تا تاریخ) را مشخص کنید" } }, 400);
    const items = await simMergedPriceItems(authHeader);
    if (!priceListId) {
      const lists = await simFetchHost("/price-lists", authHeader);
      const arr: any[] = Array.isArray(lists?.data) ? lists.data : [];
      const active = arr.filter(l => simIsActive(l));
      priceListId = active.length ? Number(active[active.length - 1].id) : (arr.length ? Number(arr[0].id) : 0);
    }
    const scoped = items.filter(i => Number(i.price_list_id) === priceListId);

    const linesJson = await simFetchHost(`/lines?page=1&page_size=500`, authHeader);
    const lines: any[] = Array.isArray(linesJson?.data) ? linesJson.data : (linesJson?.data?.data || []);
    const inspJson = await simFetchHost(`/inspections?page=1&page_size=1000`, authHeader);
    let hostInsp: any[] = Array.isArray(inspJson?.data) ? inspJson.data : (inspJson?.data?.data || []);
    const allInsp = [...hostInsp.filter(i => !simInspectionsCreated.some(s => Number(s.id) === Number(i.id))), ...simInspectionsCreated];

    const towerCache = new Map<number, any[]>();
    const loadTowers = async (lineId: number) => {
      if (!towerCache.has(lineId)) {
        const t = await simFetchHost(`/towers?page=1&page_size=1000&line_id=${lineId}`, authHeader);
        towerCache.set(lineId, Array.isArray(t?.data) ? t.data : (t?.data?.data || []));
      }
      return towerCache.get(lineId) || [];
    };

    const out: any[] = [];
    for (const ins of allInsp) {
      if (!["submitted", "approved"].includes(String(ins.status))) continue;
      if (periodStart && String(ins.inspection_date) < periodStart) continue;
      if (periodEnd && String(ins.inspection_date) > periodEnd) continue;
      if (contractId && Number(ins.contract_id) !== contractId) continue;
      const line = lines.find(l => Number(l.id) === Number(ins.line_id)) || null;
      const towers = ins.line_id ? await loadTowers(Number(ins.line_id)) : [];
      const tower = towers.find(t => Number(t.id) === Number(ins.tower_id)) || null;
      const method = ins.inspection_method || ins.inspection_type || "climbing";
      // v4.3.87: زمین از دکل (اولویت) — سپس بازدید
      const terrain = tower?.terrain_type || ins.terrain_type || "plain";
      const structure = tower?.tower_structure || line?.tower_structure || null;
      const crewSize = Math.max(1, Number(ins.crew_size ?? 1));
      const chapter = method === "drone" ? 8 : 2;
      const match = simMatchPriceItem(scoped, {
        price_list_id: priceListId,
        voltage_kv: line?.voltage_kv ?? null, circuit_count: line?.circuit_count ?? null, bundle_count: line?.bundle_count ?? null,
        activity_type: "inspection", inspection_method: method, tower_structure: structure,
        terrain_type: terrain, crew_size: crewSize, chapter,
      });
      out.push({
        inspection_id: Number(ins.id), inspection_code: ins.inspection_code, inspection_date: ins.inspection_date,
        line_code: ins.line_code || line?.line_code || null, line_name: line?.name || null,
        tower_code: ins.tower_code || tower?.tower_code || null,
        activity_type: "inspection", inspection_method: method, chapter,
        terrain_type: terrain, terrain_label: SIM_TERRAIN_LABELS[terrain] || terrain,
        tower_structure: structure, crew_size: crewSize,
        voltage_kv: line?.voltage_kv ?? null, circuit_count: line?.circuit_count ?? null, bundle_count: line?.bundle_count ?? null,
        matched: match ? {
          item_id: Number(match.item.id), code: match.item.code, title: match.item.title, unit: match.item.unit,
          chapter: match.item.chapter ?? null,
          base_unit_price: match.base_unit_price, coefficients: match.coefficients,
          coefficient_amount: match.coefficient_amount, unit_price: match.unit_price,
          terrain_label: match.terrain_label,
        } : null,
      });
    }
    return simJson({ success: true, data: { price_list_id: priceListId, items: out } });
  }

  // صدور صورت‌وضعیت — محاسبهٔ محلی (قرینهٔ PHP؛ ضرایب ردیف مستقل می‌گیرند)
  if (method === "POST" && path === "/invoices/generate") {
    const contractId = Number(body.contract_id || 0);
    const itemsBody: any[] = Array.isArray(body.items) ? body.items : [];
    if (!contractId || !itemsBody.length) return simJson({ success: false, error: { code: 400, message: "قرارداد و اقلام الزامی است" } }, 400);
    let priceListId = Number(body.price_list_id || 0);
    const items = await simMergedPriceItems(authHeader);
    if (!priceListId) {
      const lists = await simFetchHost("/price-lists", authHeader);
      const arr: any[] = Array.isArray(lists?.data) ? lists.data : [];
      const active = arr.filter(l => simIsActive(l));
      priceListId = active.length ? Number(active[active.length - 1].id) : (arr.length ? Number(arr[0].id) : 0);
    }
    const scoped = items.filter(i => Number(i.price_list_id) === priceListId);
    const linesJson = await simFetchHost(`/lines?page=1&page_size=500`, authHeader);
    const lines: any[] = Array.isArray(linesJson?.data) ? linesJson.data : (linesJson?.data?.data || []);
    const inspJson = await simFetchHost(`/inspections?page=1&page_size=1000`, authHeader);
    const hostInsp: any[] = Array.isArray(inspJson?.data) ? inspJson.data : (inspJson?.data?.data || []);
    const allInsp = [...hostInsp.filter(i => !simInspectionsCreated.some(s => Number(s.id) === Number(i.id))), ...simInspectionsCreated];
    const contractsJson = await simFetchHost(`/contracts?page=1&page_size=100`, authHeader);
    const contracts: any[] = Array.isArray(contractsJson?.data) ? contractsJson.data : (contractsJson?.data?.data || []);
    const contract = contracts.find(c => Number(c.id) === contractId);

    const towerCache = new Map<number, any[]>();
    const loadTowers = async (lineId: number) => {
      if (!towerCache.has(lineId)) {
        const t = await simFetchHost(`/towers?page=1&page_size=1000&line_id=${lineId}`, authHeader);
        towerCache.set(lineId, Array.isArray(t?.data) ? t.data : (t?.data?.data || []));
      }
      return towerCache.get(lineId) || [];
    };

    /** افزودن ردیف پایه + ردیف‌های ضریب (هر ضریب یک ردیف مستقل — مثل فهرست کشوری) */
    const pushEntry = (match: any, quantity: number, inspectionId: any, workOrderId: any, context: string, terrain: any, structure: any) => {
      const item = match.item;
      const base = Number(match.base_unit_price ?? 0);
      const unit = item.unit || "عدد";
      const desc = `${item.title}${context ? ` — ${context}` : ""} [${item.code}]`;
      const lineBase = Math.round(base * quantity * 100) / 100;
      sumBase += lineBase; sumNet += lineBase;
      linesOut.push({
        inspection_id: inspectionId, work_order_id: workOrderId, price_list_item_id: Number(item.id), pli_code: item.code,
        description: desc, unit, quantity, unit_price: base, total_price: lineBase,
        base_amount: lineBase, coefficient_percent: null, coefficient_amount: 0,
        terrain_type: terrain, tower_structure: structure,
      });
      for (const coef of match.coefficients) {
        const amount = Number(coef.amount);
        const lineCoef = Math.round(amount * quantity * 100) / 100;
        sumCoef += lineCoef; sumNet += lineCoef;
        linesOut.push({
          inspection_id: inspectionId, work_order_id: workOrderId, price_list_item_id: Number(coef.id), pli_code: coef.code,
          description: `${coef.title}${context ? ` — ${context}` : ""} [${coef.code}]`,
          unit, quantity, unit_price: amount, total_price: lineCoef,
          base_amount: 0, coefficient_percent: null, coefficient_amount: lineCoef,
          terrain_type: terrain, tower_structure: structure,
        });
      }
    };

    const linesOut: any[] = [];
    let sumBase = 0, sumCoef = 0, sumNet = 0;
    for (const it of itemsBody) {
      if (!it || typeof it !== "object") continue;
      const quantity = Math.max(0.001, Number(it.quantity ?? 1));
      let workOrderId: any = it.work_order_id ? Number(it.work_order_id) : null;
      if (it.inspection_id) {
        const inspectionId = Number(it.inspection_id);
        const ins = allInsp.find(x => Number(x.id) === inspectionId);
        if (!ins) return simJson({ success: false, error: { code: 404, message: `بازدید #${inspectionId} پیدا نشد` } }, 404);
        const line = lines.find(l => Number(l.id) === Number(ins.line_id)) || null;
        const towers = ins.line_id ? await loadTowers(Number(ins.line_id)) : [];
        const tower = towers.find(t => Number(t.id) === Number(ins.tower_id)) || null;
        const method = ins.inspection_method || ins.inspection_type || "climbing";
        const terrain = tower?.terrain_type || ins.terrain_type || "plain";
        const structure = tower?.tower_structure || line?.tower_structure || null;
        const crewSize = Math.max(1, Number(ins.crew_size ?? 1));
        const chapter = method === "drone" ? 8 : 2;
        const match = simMatchPriceItem(scoped, {
          price_list_id: priceListId, voltage_kv: line?.voltage_kv ?? null, circuit_count: line?.circuit_count ?? null,
          bundle_count: line?.bundle_count ?? null, activity_type: "inspection", inspection_method: method,
          tower_structure: structure, terrain_type: terrain, crew_size: crewSize, chapter,
        });
        if (!match || match.unit_price == null) return simJson({ success: false, error: { code: 422, message: `برای بازدید ${ins.inspection_code} ردیف مناسبی در فهرست بها یافت نشد (${SIM_METHOD_LABELS[method] || method} / ${SIM_TERRAIN_LABELS[terrain] || terrain})` } }, 422);
        const context = `دکل ${ins.tower_code || "—"} — خط ${ins.line_code || line?.line_code || "—"} — ${SIM_TERRAIN_LABELS[terrain] || terrain}${structure ? ` — ${structure}` : ""}`;
        pushEntry(match, quantity, inspectionId, workOrderId, context, terrain, structure);
      } else if (it.price_list_item_id) {
        const pli = scoped.find(p => Number(p.id) === Number(it.price_list_item_id));
        if (!pli) return simJson({ success: false, error: { code: 404, message: "قلم فهرست بها پیدا نشد" } }, 404);
        if (String(pli.item_kind) === "coefficient") return simJson({ success: false, error: { code: 400, message: `ردیف‌های ضریب به‌تنهایی قابل انتخاب نیستند (${pli.code})` } }, 400);
        // زمینه: دکل → خط؛ یا خط مستقیم؛ یا مقدار صریح
        let line: any = null, tower: any = null, structure: any = null, terrain: any = null, crewSize = Math.max(1, Number(it.crew_size ?? 1));
        if (it.tower_id) {
          const allT = await simFetchHost(`/towers?page=1&page_size=2000`, authHeader);
          tower = (Array.isArray(allT?.data) ? allT.data : (allT?.data?.data || [])).find((x: any) => Number(x.id) === Number(it.tower_id)) || null;
          if (tower?.line_id) line = lines.find(l => Number(l.id) === Number(tower.line_id)) || null;
          structure = tower?.tower_structure || null;
          terrain = tower?.terrain_type || null;
        } else if (it.line_id) {
          line = lines.find(l => Number(l.id) === Number(it.line_id)) || null;
          structure = line?.tower_structure || null;
        }
        if (it.terrain_type) terrain = it.terrain_type || terrain;
        if (it.tower_structure) structure = it.tower_structure || structure;
        const match = {
          item: pli,
          base_unit_price: Number(pli.unit_price ?? 0),
          coefficients: [] as any[],
          coefficient_amount: 0,
        };
        const applied = simApplyCoefficients(scoped, pli, {
          bundle_count: line?.bundle_count ?? null, crew_size: crewSize,
          tower_structure: structure, terrain_type: terrain,
        });
        match.coefficients = applied.coefficients;
        match.coefficient_amount = applied.coefficient_amount;
        let context = "";
        if (line) context += `خط ${line.line_code || "—"}`;
        if (tower) context += `${context ? " — " : ""}دکل ${tower.tower_code || "—"}`;
        if (terrain) context += `${context ? " — " : ""}${SIM_TERRAIN_LABELS[terrain] || ""}`;
        if (workOrderId) context += `${context ? " — " : ""}دستورکار #${workOrderId}`;
        pushEntry(match, quantity, null, workOrderId, context, terrain, structure);
      } else {
        continue;
      }
    }
    if (!linesOut.length) return simJson({ success: false, error: { code: 400, message: "هیچ قلم معتبری یافت نشد" } }, 400);
    const taxPercent = Number(body.tax_percent ?? 10);
    const tax = Math.round(sumNet * taxPercent / 100 * 100) / 100;
    const final = Math.round((sumNet + tax) * 100) / 100;
    const invoiceId = simInvoiceNextId++;
    const code = `INV-${new Date().getFullYear()}-${String(invoiceId % 10000).padStart(4, "0")}`;
    const invoice = {
      id: invoiceId, invoice_code: code, contract_id: contractId,
      contract_title: contract?.title || null,
      contractor_id: contract?.contractor_id ?? body.contractor_id ?? null,
      contractor_name: null,
      period_start: body.period_start || new Date().toISOString().slice(0, 10),
      period_end: body.period_end || new Date().toISOString().slice(0, 10),
      total_amount: Math.round(sumNet * 100) / 100, net_amount: Math.round(sumNet * 100) / 100,
      coefficient_amount: Math.round(sumCoef * 100) / 100,
      tax_amount: tax, tax_percent: taxPercent, final_amount: final,
      status: "draft", activity_status: "inactive", price_list_id: priceListId,
      district_id: body.district_id ? Number(body.district_id) : null, district_name: null,
      notes: body.notes || null,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    simInvoicesCreated.unshift(invoice);
    simInvoiceItemsStore.set(invoiceId, linesOut);
    console.log(`[DEV SIM] صورت‌وضعیت محلی صادر شد #${invoiceId} ${code} — ${linesOut.length} ردیف (پایه + ضرایب)`);
    return simJson({
      success: true, message: "صورت‌وضعیت صادر شد (شبیه‌ساز توسعه)",
      data: {
        id: invoiceId, invoice_code: code, items_count: linesOut.length,
        base_amount: Math.round(sumBase * 100) / 100, coefficient_amount: Math.round(sumCoef * 100) / 100,
        net_amount: Math.round(sumNet * 100) / 100, tax_amount: tax, final_amount: final,
      },
    }, 201);
  }

  // اقلام یک صورت‌وضعیت
  const itemsMatch = /^\/invoices\/(\d+)\/items$/.exec(path);
  if (method === "GET" && itemsMatch) {
    const id = Number(itemsMatch[1]);
    if (simInvoiceItemsStore.has(id)) {
      return simJson({ success: true, data: { invoice: simInvoicesCreated.find(i => Number(i.id) === id) || null, items: simInvoiceItemsStore.get(id) } });
    }
    return null; // صورت‌وضعیت هاست — به هاست واریس شود
  }

  return null;
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

  // v4.3.81 (فقط توسعه): شبیه‌ساز کاربر اموردار — لاگین «dev:12» و توکن‌های
  // شبیه‌ساز مستقیم به mock می‌روند تا UI بدون اجرای SQL روی هاست قابل تست باشد.
  if (DEV_MODE && isAuthPath) {
    const authHeader = request.headers.get("authorization") || "";
    const isSimToken = authHeader.includes("dev-mock-token-");
    const isSimLogin = request.method === "POST" && path === "/auth/login" && (bodyText || "").includes('"dev:');
    // رفرش هم بدون هدر Authorization می‌آید — از بدنه تشخیص داده می‌شود
    const isSimRefresh = request.method === "POST" && path === "/auth/refresh" && (bodyText || "").includes("dev-mock-token-");
    if (isSimToken || isSimLogin || isSimRefresh) {
      const mockRequest = new NextRequest(request.url, {
        method: request.method,
        headers: request.headers,
        body: bodyText,
      });
      console.log(`[DEV SIM] شبیه‌ساز کاربر اموردار → mock ${request.method} ${path}`);
      return await handleMockRequest(mockRequest);
    }
  }

  // v4.3.81 (فقط توسعه): فهرست امور برای کاربر شبیه‌ساز — تا کمبوباکس امورِ قفل،
  // نام امور خودش را نشان دهد (شناسه‌های دو رقمی ۱۰..۱۳ مثل SQL نسخه)
  if (DEV_MODE && isGet && path === "/districts" && (request.headers.get("authorization") || "").includes("dev-mock-token-")) {
    return NextResponse.json({
      success: true,
      data: {
        data: [
          { id: 10, name: "کردستان", status: "active" },
          { id: 11, name: "ایلام", status: "active" },
          { id: 12, name: "کرمانشاه غربی", status: "active" },
          { id: 13, name: "کرمانشاه شرقی", status: "active" },
        ],
      },
    });
  }

  // v4.3.83 (فقط توسعه): نسخهٔ بک‌اند هاست قدیمی است؟ نسخهٔ بستهٔ فعلی گزارش می‌شود تا
  // گیت بک‌اند فرانت (users-api/roles-api) در پیش‌نمایش باز باشد؛ خود هاست با آپلود واقعی می‌رسد.
  if (DEV_MODE && isGet && path === "/backend-version") {
    const upstream = await upstreamBackendVersion();
    if (!upstream.length || !versionAtLeast(upstream, SIM_VERSION)) {
      console.log(`[DEV SIM] backend-version هاست ${upstream.join(".") || "?"} قدیمی است — نسخهٔ بستهٔ 4.3.87 گزارش شد`);
      return NextResponse.json({
        success: true,
        message: "نسخه بک‌اند",
        data: { version: "v4.3.87", component: "Powerline PHP Backend (dev-sim)" },
      });
    }
  }

  // v4.3.83 (فقط توسعه): فهرست نقش‌ها — بک‌اند قدیمی endpoint ندارد؛ شبیه‌ساز محلی پاسخ می‌دهد
  if (DEV_MODE && isGet && path === "/roles") {
    const upstream = await upstreamBackendVersion();
    if (!upstream.length || !versionAtLeast(upstream, SIM_USERS_VERSION)) {
      return simulateRolesGet();
    }
  }

  // v4.3.83 (فقط توسعه): نوشتن‌های /users و /roles — تا آپلود بک‌اند 4.3.83 روی هاست، محلی شبیه‌سازی می‌شوند
  if (DEV_MODE && !isGet && (path.startsWith("/users") || path.startsWith("/roles"))) {
    const upstream = await upstreamBackendVersion();
    if (!upstream.length || !versionAtLeast(upstream, SIM_USERS_VERSION)) {
      if (path.startsWith("/roles")) return simulateRolesWrite(request.method, path, bodyText ?? "");
      return await simulateUsersWrite(request.method, path, bodyText ?? "", request.headers.get("authorization") || "");
    }
  }

  // v4.3.87 (فقط توسعه): شبیه‌ساز فهرست بهای کشوری + بازدید + صورت‌وضعیت — تا آپلود
  // بک‌اند ۴.۳.۸۷ روی هاست و اجرای SQL جدید، این مسیرها محلی پاسخ داده می‌شوند.
  // گیت: قابلیت boq-standard-import در backend-version هاست اعلام نشده باشد
  // (هاست ممکن است شماره نسخهٔ مشابه را خودش گزارش داده باشد — قابلیت‌ها معیارند)
  if (DEV_MODE && (
    path.startsWith("/price-list-items") ||
    path.startsWith("/price-lists") ||
    path === "/invoices/candidates" || path === "/invoices/generate" ||
    /^\/invoices\/\d+\/items$/.test(path) ||
    path === "/inspections" || path === "/invoices"
  )) {
    const hasFeature = await hostHasFeature("boq-standard-import");
    if (!hasFeature) {
      const simAuth = request.headers.get("authorization") || "";
      // بازدیدها: GET = پاسخ هاست + بازدیدهای محلی / POST = ساخت محلی
      if (path === "/inspections") {
        if (!isGet) {
          const insSim = await simulateInspectionsRequest(request.method, path, bodyText ?? "", simAuth);
          if (insSim) return insSim;
        } else if (simInspectionsCreated.length) {
          const host = await simFetchHost(`${path}${search}`, simAuth);
          const hostRows: any[] = Array.isArray(host?.data) ? host.data : [];
          const merged = [...simInspectionsCreated, ...hostRows];
          const pag = host?.pagination
            ? { ...host.pagination, total: (Number(host.pagination.total) || 0) + simInspectionsCreated.length }
            : { page: 1, page_size: 500, total: merged.length, total_pages: 1, has_next: false, has_prev: false };
          return simJson({ success: true, data: merged, pagination: pag });
        }
      }
      // صورت‌وضعیت‌ها: GET لیست = پاسخ هاست + صورت‌وضعیت‌های محلی
      if (isGet && path === "/invoices" && simInvoicesCreated.length) {
        const host = await simFetchHost(`${path}${search}`, simAuth);
        const hostRows: any[] = Array.isArray(host?.data) ? host.data : [];
        const merged = [...simInvoicesCreated, ...hostRows];
        const pag = host?.pagination
          ? { ...host.pagination, total: (Number(host.pagination.total) || 0) + simInvoicesCreated.length }
          : { page: 1, page_size: 500, total: merged.length, total_pages: 1, has_next: false, has_prev: false };
        return simJson({ success: true, data: merged, pagination: pag });
      }
      // فهرست‌ها: نوشتن محلی + merge در خواندن (بک‌اند هاست در نوشتن status می‌نویسد که نیست)
      if (path.startsWith("/price-lists")) {
        const plSim = await simulatePriceListsRequest(request.method, path, search, bodyText ?? "", simAuth);
        if (plSim) return plSim;
      }
      // اقلام فهرست بها — کامل محلی (overlay روی اقلام هاست)
      if (path.startsWith("/price-list-items")) {
        return await simulatePriceListRequest(request.method, path, search, bodyText ?? "", simAuth);
      }
      // کاندیدها / صدور / اقلام صورت‌وضعیت
      const invSim = await simulateInvoicesRequest(request.method, path, search, bodyText ?? "", simAuth);
      if (invSim) return invSim;
    }
  }

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
  let networkErrorCode = "";
  try {
    response = await fetchUpstream();
  } catch (error: any) {
    networkErrorMessage = error instanceof Error ? error.message : "Unknown error";
    networkErrorCode = String(error?.cause?.code || error?.code || "");
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
          message: "سرور دیتابیس (bot.sabadgame.com) موقتاً در دسترس نیست — داده‌های شما سالم است؛ چند لحظه بعد دوباره تلاش کنید یا دکمه بروزرسانی را بزنید",
        },
      },
      { status: 503 }
    );
  }

  // ─── مسیر ۳: هاست قطع + نوشتن → خطای واقعی (هرگز موفقیت کاذب؛ جلوگیری از گم‌شدن داده) ───
  if (hostDown && !isGet) {
    const reason = response
      ? `سرور API پاسخ ${response.status} داد`
      : describeUpstreamNetworkFailure(networkErrorCode, networkErrorMessage);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 503,
          message: `عملیات ثبت/ویرایش انجام نشد؛ ارتباط برنامه با سرور API برقرار نشد (${reason}). هیچ داده‌ای در این تلاش ذخیره نشد و داده‌های قبلی دست‌نخورده مانده‌اند.`,
        },
      },
      { status: 503 }
    );
  }

  // ─── پاسخ واقعی سرور ───
  const respContentType = response!.headers.get("content-type") || "application/json";

  // v4.3.82 (فقط توسعه): اعمال overlay شبیه‌ساز کاربران روی GET /users
  let finalText = responseText;
  if (DEV_MODE && isGet && path === "/users" && response!.status === 200 && respContentType.includes("json")
      && (simUserPatches.size || simCreatedUsers.length || simDeletedIds.size)) {
    finalText = applyUsersSimulatorToGet(responseText);
  }

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

  return new NextResponse(finalText, {
    status: response!.status,
    headers: {
      "Content-Type": respContentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
