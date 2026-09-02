"use client";

import { useMemo } from "react";
import { useBootstrap } from "@/hooks/use-bootstrap";
import type { SearchableOption } from "@/components/searchable-select";

/**
 * Hook مشترک گزینه‌های پرسنل — v3.0.0
 *
 * سرپرست‌های اکیپ و کارشناس‌های خط از جدول پرسنل خوانده می‌شوند تا در فرم‌های
 * خطوط/دکل‌ها به‌صورت کمبوباکس (قابل جستجو) نمایش داده شوند.
 *
 * سازگار با هر دو حالت داده:
 *  - جدید: personnel_type = crew_supervisor / line_expert (بعد از اجرای import_v3.0.0.sql)
 *  - قدیمی: position = 'سرپرست اکیپ' / 'کارشناس خط' (داده فعلی هاست قبل از مهاجرت)
 *
 * نام‌ها یکتا (dedupe) می‌شوند چون خطوط فقط نام (نه شناسه) ذخیره می‌کنند.
 *
 * v3.5.2: داده از endpoint تجمیعی /bootstrap می‌آید (درخواست مشترک + کش محلی).
 */

export interface PersonnelPerson {
  id: number;
  personnel_code?: string;
  first_name: string;
  last_name: string;
  personnel_type?: string | null;
  full_name?: string;
}

export function usePersonnelOptions() {
  const { data, refresh } = useBootstrap();

  const personnel = useMemo<PersonnelPerson[]>(
    () => (data?.personnel || []) as PersonnelPerson[],
    [data]
  );

  /** نام کامل یکتا از پرسنل — برای مقایسه با line_supervisor / line_expert */
  const fullNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of personnel) {
      const fn = (p.first_name || "").trim();
      const ln = (p.last_name || "").trim();
      const full = `${fn} ${ln}`.trim();
      if (full) names.add(full);
    }
    return names;
  }, [personnel]);

  /** سرپرست‌های اکیپ (برای کمبوباکس «سرپرست خط») */
  const supervisorOptions = useMemo<SearchableOption[]>(() => {
    const seen = new Set<string>();
    const out: SearchableOption[] = [];
    for (const p of personnel) {
      const typeOk = p.personnel_type === "crew_supervisor";
      if (!typeOk) continue;
      const fn = (p.first_name || "").trim();
      const ln = (p.last_name || "").trim();
      const full = `${fn} ${ln}`.trim();
      if (!full || seen.has(full)) continue;
      seen.add(full);
      out.push({ value: full, label: full }); // v3.4.0: بدون description — همه سرپرست‌اند، لازم نیست تکرار شود
    }
    return out;
  }, [personnel]);

  /** کارشناس‌های خط (برای کمبوباکس «کارشناس خط») */
  const expertOptions = useMemo<SearchableOption[]>(() => {
    const seen = new Set<string>();
    const out: SearchableOption[] = [];
    for (const p of personnel) {
      const typeOk = p.personnel_type === "line_expert";
      if (!typeOk) continue;
      const fn = (p.first_name || "").trim();
      const ln = (p.last_name || "").trim();
      const full = `${fn} ${ln}`.trim();
      if (!full || seen.has(full)) continue;
      seen.add(full);
      out.push({ value: full, label: full }); // v3.4.0: بدون description — همه سرپرست‌اند، لازم نیست تکرار شود
    }
    return out;
  }, [personnel]);

  return { personnel, supervisorOptions, expertOptions, fullNames, loading: false, reload: refresh };
}
