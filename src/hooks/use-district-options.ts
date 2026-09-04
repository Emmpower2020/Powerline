"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { SearchableOption } from "@/components/searchable-select";

export interface DistrictOptionRow {
  id: number;
  name: string;
  status?: string | null;
}

/**
 * v4.3.85: لیست امورهای قابل‌مشاهدهٔ کاربر وارد‌شده — از اطلاعات ذخیره‌شدهٔ لاگین.
 * [] یعنی مدیر برنامه است و همهٔ امور را می‌بیند (لیست خالی = دسترسی کامل).
 */
export function currentUserDistrictIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("powerline_user");
    const user = raw ? JSON.parse(raw) : null;
    // ستون جدید district_ids مقدم است؛ سازگار با district_id قدیمی
    const ids = user?.district_ids;
    if (Array.isArray(ids) && ids.length) return ids.map(Number).filter(n => n > 0);
    const d = user?.district_id;
    return (d === null || d === undefined || d === "" || Number(d) <= 0) ? [] : [Number(d)];
  } catch {
    return [];
  }
}

/**
 * امورِ اصلی کاربرِ وارد‌شده — اولین امورِ لیست (برای قفل فرم‌ها).
 * null یعنی مدیر برنامه است و همهٔ امور را می‌بیند.
 */
export function currentUserDistrictId(): number | null {
  const ids = currentUserDistrictIds();
  return ids.length ? ids[0] : null;
}

/** نام امور کاربر جاری (اگر موجود باشد) */
export function currentUserDistrictName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("powerline_user");
    const user = raw ? JSON.parse(raw) : null;
    return user?.district_name ?? null;
  } catch {
    return null;
  }
}

/** آیا کاربر جاری مدیر است (بدون محدودیت امور)؟ */
export function currentUserIsDistrictAdmin(): boolean {
  // v4.3.85: لیست خالی = همهٔ امور (مدیر سیستم)
  return currentUserDistrictIds().length === 0;
}

/**
 * v4.3.81: مقدار نهایی «امور بهره‌برداری» برای ذخیره در فرم‌ها/ایمپورت.
 * کاربر اموردار (غیرمدیر) همیشه امور خودش را برمی‌گرداند — هر چه در فرم باشد؛
 * مدیر همان مقدار فرم را (خالی = نامشخص).
 */
export function resolveDistrictValue(formValue: string | number | null | undefined): number | null {
  const own = currentUserDistrictId();
  if (own !== null) return own;
  const v = formValue as string | number | null | undefined;
  return (v === null || v === undefined || v === "" || Number(v) <= 0) ? null : Number(v);
}

/** v4.3.81: آیا کاربر جاری اجازهٔ تغییر امورِ رکوردها را دارد؟ (فقط مدیران) */
export function canChangeDistrict(): boolean {
  return currentUserIsDistrictAdmin();
}

/**
 * گزینه‌های «امور بهره‌برداری» — مشترک همهٔ فرم‌ها.
 * همهٔ امور (فعال و غیرفعال) نمایش داده می‌شوند تا ویرایش رکوردهای
 * امورِ غیرفعال هم ممکن باشد؛ امورهای فعال با نشان سبز جدا می‌شوند.
 */
export function useDistrictOptions(enabled = true) {
  const [rows, setRows] = useState<DistrictOptionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    apiClient.get<any>(API_ENDPOINTS.districts, { page: 1, page_size: 1000 })
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res) ? res : (res?.data || []);
        setRows(list.map((r: any) => ({
          id: Number(r.id),
          name: String(r.name ?? ""),
          status: r.status ?? null,
        })));
      })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [enabled]);

  const options = useMemo<SearchableOption[]>(() =>
    [...rows]
      .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.id - b.id)
      .map((r) => ({
        value: String(r.id),
        label: r.name,
        // امورهای غیرفعال با برچسب مشخص می‌شوند تا اشتباه انتخاب نشوند
        description: r.status === "active" ? undefined : "غیرفعال",
      })), [rows]);

  return { rows, options, loading };
}
