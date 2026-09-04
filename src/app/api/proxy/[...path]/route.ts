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

// ─── v4.3.83 (فقط توسعه): شبیه‌ساز مدیریت کاربران/نقش‌ها ───
// بک‌اند قدیمی هاست endpoint نقش‌ها ندارد و role_id در PUT /users را نادیده
// می‌گرفت. تا زمان آپلود بک‌اند جدید (4.3.85: چند-اموری)، نوشتن‌های /users
// و /roles در حالت توسعه به‌صورت محلی شبیه‌سازی می‌شوند (روی overlay حافظه‌ای)
// و هرگز به هاست نمی‌رسند. با آپلود بک‌اند جدید، شبیه‌ساز خودش غیرفعال می‌شود.
const SIM_VERSION = [4, 3, 85];
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
  } catch {
    upstreamVersionCache = [];
  }
  return upstreamVersionCache;
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
      console.log(`[DEV SIM] backend-version هاست ${upstream.join(".") || "?"} قدیمی است — نسخهٔ بستهٔ 4.3.85 گزارش شد`);
      return NextResponse.json({
        success: true,
        message: "نسخه بک‌اند",
        data: { version: "v4.3.85", component: "Powerline PHP Backend (dev-sim)" },
      });
    }
  }

  // v4.3.83 (فقط توسعه): فهرست نقش‌ها — بک‌اند قدیمی endpoint ندارد؛ شبیه‌ساز محلی پاسخ می‌دهد
  if (DEV_MODE && isGet && path === "/roles") {
    const upstream = await upstreamBackendVersion();
    if (!upstream.length || !versionAtLeast(upstream, SIM_VERSION)) {
      return simulateRolesGet();
    }
  }

  // v4.3.83 (فقط توسعه): نوشتن‌های /users و /roles — تا آپلود بک‌اند 4.3.83 روی هاست، محلی شبیه‌سازی می‌شوند
  if (DEV_MODE && !isGet && (path.startsWith("/users") || path.startsWith("/roles"))) {
    const upstream = await upstreamBackendVersion();
    if (!upstream.length || !versionAtLeast(upstream, SIM_VERSION)) {
      if (path.startsWith("/roles")) return simulateRolesWrite(request.method, path, bodyText ?? "");
      return await simulateUsersWrite(request.method, path, bodyText ?? "", request.headers.get("authorization") || "");
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
          message: "سرور دیتابیس (jibimarket.com) موقتاً در دسترس نیست — داده‌های شما سالم است؛ چند لحظه بعد دوباره تلاش کنید یا دکمه بروزرسانی را بزنید",
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
