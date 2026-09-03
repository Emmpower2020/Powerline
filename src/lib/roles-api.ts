/**
 * roles-api.ts — v4.3.83
 *
 * نقش‌ها (RBAC): دسترسی‌ها به‌جای هر کاربر، برای هر «نقش» تعریف می‌شوند و
 * در تب کاربران به هر نفر یک نقش اختصاص داده می‌شود.
 *
 * قواعد دسترسی مؤثر (بک‌اند 4.3.83):
 *   ۱) کاربر بدون امور (مدیر سیستم) → همیشه دسترسی کامل
 *   ۲) کاربرِ دارای نقش با ماتریس دسترسی → ماتریس همان نقش ملاک است
 *   ۳) کاربر بدون نقش → مجوز شخصی قبلی (users.module_permissions) به‌عنوان پشتیبان
 *   ۴) هیچ‌کدام null → فقط‌خوانده (همهٔ بخش‌ها دیده می‌شوند، ابزارها خاموش)
 *
 * مثل users-api: قبل از هر نوشتن، نسخهٔ بک‌اند کنترل می‌شود تا PUT/POST قدیمی
 * (که role_id/module_permissions نقش را نادیده می‌گرفت) «موفقیت کاذب» نسازد.
 */

import { apiClient } from "./api-client";

const REQUIRED = [4, 3, 83];
let backendOk: boolean | null = null;
let backendChecked = false;

export interface RoleRow {
  id: number;
  /** شناسهٔ لاتین/داخلی نقش (برای نقش‌های تعریفی همان نام فارسی است) */
  name: string | null;
  /** نام نمایشی فارسی — همان چیزی که کاربر می‌بیند */
  display_name: string;
  description: string | null;
  is_system: number | boolean;
  status: string;
  /** ماتریس دسترسی نقش — null یعنی تعریف‌نشده (فقط‌خوانده برای دارندگان) */
  module_permissions?: Record<string, boolean | Record<string, boolean>> | null;
  users_count: number;
  created_at: string | null;
}

function parseVersion(raw: string): number[] | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function versionAtLeast(v: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i] > REQUIRED[i]) return true;
    if (v[i] < REQUIRED[i]) return false;
  }
  return true;
}

const OLD_BACKEND_MESSAGE =
  "بک‌اند سرور هنوز نسخهٔ 4.3.83 نیست — فایل‌های پوشهٔ Powerline را از بستهٔ zip نسخهٔ 4.3.83 روی هاست آپلود و SQL نقش‌ها را اجرا کنید تا مدیریت نقش‌ها و دسترسی‌ها فعال شود (نوشتن روی بک‌اند قدیمی بی‌اثر است و انجام نشد)";

/** آیا بک‌اند از نقش‌ها + role_id پشتیبانی می‌کند؟ (با کش) */
export async function backendSupportsRoles(): Promise<boolean> {
  if (backendChecked) return backendOk === true;
  backendChecked = true;
  let ok = false;
  try {
    const res = await apiClient.get<any>("backend-version");
    const raw = String(res?.version ?? "");
    const parsed = parseVersion(raw);
    ok = parsed ? versionAtLeast(parsed) : false;
  } catch {
    ok = false;
  }
  backendOk = ok;
  return ok;
}

async function ensureBackend(): Promise<void> {
  const ok = await backendSupportsRoles();
  if (!ok) throw new Error(OLD_BACKEND_MESSAGE);
}

/** GET /roles — فهرست نقش‌ها با تعداد کاربران هر نقش */
export async function getRoles(): Promise<RoleRow[]> {
  await ensureBackend();
  const result = await apiClient.get<any>("roles", { page: 1, page_size: 500 });
  const rows = Array.isArray(result) ? result : (result?.data || []);
  return rows as RoleRow[];
}

/** POST /roles — ثبت نقش جدید (ماتریس دسترسی بعداً از تب «دسترسی‌ها») */
export async function postRole(body: {
  display_name: string;
  description?: string | null;
  status?: string;
  module_permissions?: Record<string, unknown> | null;
}): Promise<any> {
  await ensureBackend();
  return apiClient.post("roles", body);
}

/** PUT /roles/{id} — ویرایش نقش / ماتریس دسترسی نقش */
export async function putRole(id: number, body: Record<string, unknown>): Promise<void> {
  await ensureBackend();
  await apiClient.put(`roles/${id}`, body);
}

/** DELETE /roles/{id} — حذف نقش (بک‌اند: نقش سیستمی/در حال استفاده حذف نمی‌شود) */
export async function deleteRole(id: number): Promise<void> {
  await ensureBackend();
  await apiClient.delete(`roles/${id}`);
}
