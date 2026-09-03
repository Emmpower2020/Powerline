/**
 * module-access.ts — v4.3.82
 *
 * فهرست ماژول‌های (بخش‌های) برنامه برای ماتریس دسترسی کاربران + ابزارهای ریز هر بخش.
 * کلیدها همان id آیتم‌های منوی اصلی (dashboard-layout) هستند؛
 * «داشبورد» عمداً جزو لیست نیست چون صفحهٔ خانه است و همیشه در دسترس می‌ماند.
 *
 * فرمت ذخیره در users.module_permissions (JSON):
 *   { "<کلید ماژول>": true | false | { view?, create?, edit?, delete?, import?, export? } }
 *   • true  → دسترسی کامل (مشاهده + همهٔ ابزارهای آن بخش)
 *   • false → بدون دسترسی به بخش
 *   • آبجکت → فقط کلیدهای true حساب می‌شوند؛ view پیش‌فرض true است
 *   • کلیدِ غایب → مثل v4.3.81 بخش «دیده می‌شود» ولی هیچ ابزاری فعال نیست (کاربر فقط‌خواننده)
 *
 * قواعد دسترسی (در auth-context پیاده شده):
 *   ۱) کاربر بدون امور (مدیر سیستم) → همیشه دسترسی کامل به همهٔ بخش‌ها و ابزارها
 *   ۲) module_permissions = null → همهٔ بخش‌ها «قابل مشاهده» ولی ابزارها خاموش (فقط‌خواننده)
 *      — سازگار با کاربران قبلی: منو مثل قبل می‌ماند؛ ایجاد/ویرایش/حذف/ایمپورت/اکسپورت خاموش می‌شود
 *   ۳) ماژول‌های adminOnly (کاربران/لاگ خطاها) فقط برای مدیر سیستم نمایش داده می‌شوند
 *   ۴) ابزارِ غایب در آبجکت → خاموش؛ ابزارِ تعریف‌نشده برای ماژول (مثلاً ایمپورت در گزارش‌ها) → خاموش
 */

export type ToolKey = "view" | "create" | "edit" | "delete" | "import" | "export";

/** ابزارهای قابل کنترل — ترتیب نمایش ستون‌های ماتریس */
export const TOOL_KEYS: ToolKey[] = ["view", "create", "edit", "delete", "import", "export"];

export const TOOL_LABELS: Record<ToolKey, string> = {
  view: "مشاهده",
  create: "ایجاد",
  edit: "ویرایش",
  delete: "حذف",
  import: "ایمپورت",
  export: "اکسپورت",
};

/** برچسب فارسی هر ابزار برای پیام‌های سرور/توست */
export const TOOL_LABELS_FA: Record<ToolKey, string> = TOOL_LABELS;

export interface ModuleAccessDef {
  key: string;
  label: string;
  /** ابزارهایی که در آن بخش معنا دارند — بقیهٔ ابزارها در ماتریس رندر نمی‌شوند */
  tools: ToolKey[];
  /** گروه منو برای دسته‌بندی ردیف‌های ماتریس دسترسی */
  group: string;
  /** فقط مدیر سیستم (بدون امور) — حتی اگر تیک خورده باشد برای غیرمدیر اعمال نمی‌شود */
  adminOnly?: boolean;
}

/** مقدار ذخیره‌شدهٔ یک ماژول در users.module_permissions */
export type ModulePermValue = boolean | Partial<Record<ToolKey, boolean>>;

/** ساختار نهایی تفکیک‌شدهٔ یک ماژول بعد از resolve */
export interface ResolvedModulePerm {
  view: boolean;
  tools: Partial<Record<ToolKey, boolean>>;
}

export const MODULE_ACCESS: ModuleAccessDef[] = [
  // ─── اصلی ───
  { key: "maps", label: "نقشه‌ها", group: "اصلی", tools: ["view", "export"] },
  // ─── خطوط و مدارها ───
  { key: "circuits", label: "مدارها", group: "خطوط و مدارها", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "lines", label: "خطوط انتقال", group: "خطوط و مدارها", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "towers", label: "دکل‌ها", group: "خطوط و مدارها", tools: ["view", "create", "edit", "delete", "import", "export"] },
  // ─── بهره‌برداری و تعمیرات ───
  { key: "inspections", label: "بازدیدها", group: "بهره‌برداری و تعمیرات", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "defects", label: "عیوب", group: "بهره‌برداری و تعمیرات", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "work-orders", label: "دستورکارها", group: "بهره‌برداری و تعمیرات", tools: ["view", "create", "edit", "delete", "import", "export"] },
  // ─── پیمانکاری و مالی ───
  { key: "contractors", label: "پیمانکاران", group: "پیمانکاری و مالی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "contracts", label: "قراردادها", group: "پیمانکاری و مالی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "equipment", label: "تجهیزات", group: "پیمانکاری و مالی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "personnel", label: "پرسنل پیمانکار", group: "پیمانکاری و مالی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "price-lists", label: "فهرست بها", group: "پیمانکاری و مالی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "invoices", label: "صورت‌وضعیت‌ها", group: "پیمانکاری و مالی", tools: ["view", "create", "edit", "delete", "export"] },
  // ─── ایمنی ───
  { key: "safety", label: "حوادث ایمنی و شخصی", group: "ایمنی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "line-incidents", label: "حوادث خطوط", group: "ایمنی", tools: ["view", "create", "edit", "delete", "import", "export"] },
  // ─── داده‌های پایه ───
  { key: "conductors", label: "انواع سیم‌ها", group: "داده‌های پایه", tools: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "tower-structures", label: "انواع ساختار دکل", group: "داده‌های پایه", tools: ["view", "create", "edit", "delete"] },
  { key: "tower-type-codes", label: "انواع کد دکل", group: "داده‌های پایه", tools: ["view", "create", "edit", "delete"] },
  { key: "districts", label: "امور بهره‌برداری", group: "داده‌های پایه", tools: ["view", "create", "edit", "delete"] },
  // ─── سیستمی ───
  { key: "reports", label: "گزارش‌گیری", group: "سیستمی", tools: ["view", "export"] },
  { key: "users", label: "کاربران", group: "سیستمی", tools: ["view", "create", "edit", "delete", "import", "export"], adminOnly: true },
  { key: "error-log", label: "لاگ خطاها", group: "سیستمی", tools: ["view", "delete"], adminOnly: true },
  { key: "settings", label: "تنظیمات", group: "سیستمی", tools: ["view", "edit"] },
];

export const MODULE_GROUPS = ["اصلی", "خطوط و مدارها", "بهره‌برداری و تعمیرات", "پیمانکاری و مالی", "ایمنی", "داده‌های پایه", "سیستمی"];

/** نقشهٔ کلید→تعریف برای دسترسی سریع */
export const MODULE_MAP: Record<string, ModuleAccessDef> = Object.fromEntries(
  MODULE_ACCESS.map(m => [m.key, m])
);

/** کاربر جاری — فقط فیلدهای موردنیاز resolve */
export interface PermUserLike {
  district_id?: number | null;
  module_permissions?: Record<string, ModulePermValue> | null;
}

/** آیا کاربر مدیر سیستم است؟ (بدون امور) */
export function isSystemAdmin(user: PermUserLike | null | undefined): boolean {
  if (!user) return true; // پیش از لاگین محدود نکن
  const d: unknown = user.district_id;
  return d === null || d === undefined || d === "" || Number(d) <= 0;
}

/**
 * تفکیک مقدار خام یک ماژول به {view, tools}
 * (مستقل از کاربر — فقط مقدار نقشه را نرمال می‌کند)
 */
export function parseModuleEntry(raw: ModulePermValue | undefined, def: ModuleAccessDef): ResolvedModulePerm {
  if (raw === true) return { view: true, tools: Object.fromEntries(def.tools.map(t => [t, true])) };
  if (raw === false || raw === undefined || raw === null) return { view: raw === false ? false : true, tools: {} };
  // آبجکت — view پیش‌فرض true؛ ابزار فقط اگر صریحاً true باشد
  const obj = raw as Partial<Record<ToolKey, boolean>>;
  const view = obj.view !== false;
  const tools: Partial<Record<ToolKey, boolean>> = {};
  for (const t of def.tools) {
    if (t === "view") continue;
    if (obj[t] === true) tools[t] = true;
  }
  return { view, tools };
}

/**
 * نقشهٔ کامل تفکیک‌شدهٔ کاربر — همهٔ ماژول‌ها با view/tools نهایی.
 * مدیر → همه‌چیز روشن؛ غیرمدیر طبق قواعد بالای فایل.
 */
export function resolveUserPermissions(user: PermUserLike | null | undefined): Record<string, ResolvedModulePerm> {
  const out: Record<string, ResolvedModulePerm> = {};
  const admin = isSystemAdmin(user);
  const mp = !admin ? (user?.module_permissions ?? null) : null;
  for (const def of MODULE_ACCESS) {
    if (admin) {
      // مدیر سیستم: دسترسی کامل به همهٔ بخش‌ها و ابزارها
      out[def.key] = { view: true, tools: Object.fromEntries(def.tools.map(t => [t, true])) };
      continue;
    }
    if (def.adminOnly) { out[def.key] = { view: false, tools: {} }; continue; }
    const raw = mp ? mp[def.key] : undefined;
    if (raw === true) {
      out[def.key] = { view: true, tools: Object.fromEntries(def.tools.map(t => [t, true])) };
    } else if (raw === false) {
      out[def.key] = { view: false, tools: {} };
    } else if (raw && typeof raw === "object") {
      out[def.key] = parseModuleEntry(raw, def);
    } else {
      // کلید غایب / نقشهٔ null → بخش قابل مشاهده، ابزارها خاموش (v4.3.82: پیش‌فرض فقط‌خواننده)
      out[def.key] = { view: true, tools: {} };
    }
  }
  return out;
}

/** آیا کاربر به ماژول (بخش) دسترسی دارد؟ */
export function userCanAccessModule(user: PermUserLike | null | undefined, moduleKey: string): boolean {
  if (!user) return true; // پیش از لاگین فیلتر نکن
  const resolved = resolveUserPermissions(user);
  return resolved[moduleKey]?.view !== false;
}

/** آیا کاربر اجازهٔ استفاده از ابزار مشخص در ماژول را دارد؟ */
export function userCanUseTool(user: PermUserLike | null | undefined, moduleKey: string, tool: ToolKey): boolean {
  if (!user) return true; // پیش از لاگین محدود نکن
  const resolved = resolveUserPermissions(user);
  const perm = resolved[moduleKey];
  if (!perm) return false;
  if (tool === "view") return perm.view;
  return perm.view === true && perm.tools?.[tool] === true;
}

// ─── سازنده‌های نقشه برای ذخیره (فرم کاربر / ماتریس دسترسی) ───

export type EditablePermRow = { view: boolean; tools: Partial<Record<ToolKey, boolean>> };

/** تبدیل نقشهٔ کاربر به ردیف‌های قابل‌ویرایش ماتریس (همهٔ ۲۳ ماژول) */
export function toEditableRows(user: PermUserLike | null | undefined): Record<string, EditablePermRow> {
  const resolved = resolveUserPermissions(user);
  const out: Record<string, EditablePermRow> = {};
  for (const def of MODULE_ACCESS) {
    const r = resolved[def.key] ?? { view: false, tools: {} };
    // برای ماژول adminOnly در ویرایش غیرمدیر، view را خاموش نگه می‌داریم
    out[def.key] = {
      view: def.adminOnly ? (isSystemAdmin(user) ? r.view : false) : r.view,
      tools: { ...r.tools },
    };
  }
  return out;
}

/** فشرده‌سازی ردیف‌های ویرایش‌شده به فرمت ذخیره در دیتابیس */
export function compactPermissions(rows: Record<string, EditablePermRow>): Record<string, ModulePermValue> {
  const out: Record<string, ModulePermValue> = {};
  for (const def of MODULE_ACCESS) {
    const row = rows[def.key];
    if (!row) continue;
    if (!row.view) { out[def.key] = false; continue; }
    const allToolsOn = def.tools.every(t => t === "view" || row.tools?.[t] === true);
    if (allToolsOn) { out[def.key] = true; continue; }
    const obj: Partial<Record<ToolKey, boolean>> = { view: true };
    for (const t of def.tools) {
      if (t !== "view" && row.tools?.[t] === true) obj[t] = true;
    }
    out[def.key] = obj;
  }
  return out;
}

/** سه پیش‌تنظیم دسترسی برای ساخت کاربر / عملیات گروهی */
export function presetRows(preset: "full" | "view-only" | "none"): Record<string, EditablePermRow> {
  const out: Record<string, EditablePermRow> = {};
  for (const def of MODULE_ACCESS) {
    if (preset === "full") out[def.key] = { view: true, tools: Object.fromEntries(def.tools.map(t => [t, true])) };
    else if (preset === "view-only") out[def.key] = { view: true, tools: {} };
    else out[def.key] = { view: false, tools: {} };
  }
  return out;
}

/** شمارش بخش‌های قابل مشاهده / ابزارهای فعال — برای خلاصهٔ جدول دسترسی‌ها */
export function summarizePermissions(rows: Record<string, EditablePermRow>): { modules: number; tools: number } {
  let modules = 0, tools = 0;
  for (const def of MODULE_ACCESS) {
    const r = rows[def.key];
    if (!r?.view) continue;
    modules++;
    for (const t of def.tools) if (t !== "view" && r.tools?.[t] === true) tools++;
  }
  return { modules, tools };
}
