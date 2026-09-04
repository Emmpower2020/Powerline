/**
 * users-api.ts — v4.3.85
 *
 * پوشش امن فراخوانی‌های نوشتاری /users — قبل از هر نوشتن، نسخهٔ بک‌اند
 * کنترل می‌شود: بک‌اند قدیمی فیلدهای جدید (role_id از 4.3.83 و district_ids
 * چند-اموری از 4.3.85) را نادیده می‌گرفت و «موفقیت کاذب» می‌داد — تخصیص
 * نقش/امورها بی‌صدا از دست می‌رفت. با این گیت از خراب‌شدن دسترسی‌ها جلوگیری
 * می‌شود. پاسخ GET backend-version کش می‌شود.
 */

import { apiClient } from "./api-client";
import { API_ENDPOINTS } from "./api-config";

const REQUIRED = [4, 3, 85];
let backendOk: boolean | null = null;
let backendChecked = false;

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
  "بک‌اند سرور هنوز نسخهٔ 4.3.85 نیست — فایل‌های پوشهٔ Powerline را از بستهٔ zip نسخهٔ 4.3.85 روی هاست آپلود کنید تا ذخیرهٔ کاربران/نقش‌ها/امورها فعال شود (نوشتن روی بک‌اند قدیمی می‌تواند دسترسی‌ها را خراب کند و انجام نشد)";

/** آیا بک‌اند از نقش‌ها + CRUD کاربران پشتیبانی می‌کند؟ (با کش) */
export async function backendSupportsUsersTools(): Promise<boolean> {
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

/** ریست کش نسخه (برای تست) */
export function resetBackendVersionCache(): void {
  backendChecked = false;
  backendOk = null;
}

async function ensureBackend(): Promise<void> {
  const ok = await backendSupportsUsersTools();
  if (!ok) throw new Error(OLD_BACKEND_MESSAGE);
}

/** PUT /users/{id} — فقط با بک‌اند سازگار */
export async function putUser(id: number, body: Record<string, unknown>): Promise<void> {
  await ensureBackend();
  await apiClient.put(`${API_ENDPOINTS.users}/${id}`, body);
}

/** POST /users — ساخت کاربر (فقط با بک‌اند سازگار) */
export async function postUser(body: Record<string, unknown>): Promise<any> {
  await ensureBackend();
  return apiClient.post(API_ENDPOINTS.users, body);
}

/** DELETE /users/{id} — حذف کاربر (فقط با بک‌اند سازگار) */
export async function deleteUser(id: number): Promise<void> {
  await ensureBackend();
  await apiClient.delete(`${API_ENDPOINTS.users}/${id}`);
}
