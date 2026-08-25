"use client";

import { useMemo } from "react";
import { useBootstrap } from "@/hooks/use-bootstrap";
import type { SearchableOption } from "@/components/searchable-select";

/**
 * Hook مشترک گزینه‌های مدارها (کدهای دیسپاچینگ) — v3.0.0
 *
 * در فرم خطوط، کد دیسپاچینگ به‌جای ورودی متنی از جدول مدارها انتخاب می‌شود.
 * فیلتر ولتاژ: با انتخاب ولتاژ خط، فقط کدهای هم‌ولتاژ نمایش داده می‌شوند.
 *
 * v3.5.2: داده از endpoint تجمیعی /bootstrap می‌آید (یک درخواست مشترک برای
 * همه فرم‌ها + کش محلی مرورگر) — بدون تغییر در خروجی این هوک.
 */

export interface Circuit {
  id: number;
  dispatch_code: string;
  name: string | null;
  voltage: number | null;
}

export function useCircuits() {
  const { data, refresh } = useBootstrap();

  const circuits = useMemo<Circuit[]>(
    () => (data?.circuits || []) as Circuit[],
    [data]
  );

  /** کدهای دیسپاچینگ فیلترشده بر اساس ولتاژ — برای کمبوباکس فرم خطوط */
  const optionsForVoltage = useMemo(() => (voltage: string | number | null | undefined): SearchableOption[] => {
    if (voltage === null || voltage === undefined || voltage === "") return [];
    const v = Number(voltage);
    return circuits
      .filter(c => c.voltage === v)
      .map(c => ({
        value: c.dispatch_code,
        label: c.dispatch_code,
        description: c.name || undefined,
        group: `${v} kV`,
      }));
  }, [circuits]);

  /** همه کدها گروه‌بندی‌شده بر اساس ولتاژ — برای صفحه مدارها و جستجوی بدون فیلتر */
  const allOptions = useMemo<SearchableOption[]>(() => {
    return circuits.map(c => ({
      value: c.dispatch_code,
      label: c.dispatch_code,
      description: c.name || undefined,
      group: c.voltage ? `${c.voltage} kV` : undefined,
    }));
  }, [circuits]);

  /** تفکیک تعداد مدارها بر اساس ولتاژ */
  const byVoltage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of circuits) {
      const k = c.voltage != null ? String(c.voltage) : "unknown";
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [circuits]);

  return { circuits, optionsForVoltage, allOptions, byVoltage, loading: false, reload: refresh };
}
