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
 * امورِ کاربرِ وارد‌شده — از اطلاعات ذخیره‌شدهٔ لاگین.
 * null یعنی مدیر برنامه است و همهٔ امور را می‌بیند.
 */
export function currentUserDistrictId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("powerline_user");
    const user = raw ? JSON.parse(raw) : null;
    const d = user?.district_id;
    return (d === null || d === undefined || d === "" || Number(d) <= 0) ? null : Number(d);
  } catch {
    return null;
  }
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
  return currentUserDistrictId() === null;
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
