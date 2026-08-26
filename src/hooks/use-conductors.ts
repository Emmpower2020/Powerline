"use client";

import { useMemo } from "react";
import { useBootstrap } from "@/hooks/use-bootstrap";
import type { SearchableOption } from "@/components/searchable-select";

/**
 * Hook گزینه‌های سیم از جدول conductors — v3.5.0
 *
 * فرم خطوط و عملیات گروهی از این جدول می‌خوانند (به‌جای فهرست ثابت).
 * گزینه‌ها فقط بر اساس «نام سیم» نمایش داده می‌شوند؛ بدون سطح مقطع و دسته‌بندی.
 * سازگار با داده قدیمی: اگر جدول خالی بود (هنوز SQL اجرا نشده)،
 * فهرست ثابت قبلی برگردانده می‌شود تا فرم‌ها بی‌گزینه نمانند.
 *
 * v3.5.2: داده از endpoint تجمیعی /bootstrap می‌آید (درخواست مشترک + کش محلی).
 */

export interface Conductor {
  id: number;
  name: string;
  standard: string | null;
  sectional_area_all: number | null;
  [k: string]: unknown;
}

/**
 * فهرست ثابت قبلی حذف شد: فرم خط باید مستقیماً از جدول انواع سیم‌ها تغذیه شود.
 * اگر جدول خالی باشد، فهرست هم خالی می‌ماند تا کاربر متوجه کمبود داده مرجع شود.
 */
export const FALLBACK_CONDUCTOR_OPTIONS: SearchableOption[] = [
  { value: "لینکس (Lynx)", label: "لینکس (Lynx)" },
  { value: "کاناری (Canary)", label: "کاناری (Canary)" },
  { value: "کرلو (Curlew)", label: "کرلو (Curlew)" },
  { value: "فینچ (Finch)", label: "فینچ (Finch)" },
  { value: "پارتریج (Partridge)", label: "پارتریج (Partridge)" },
  { value: "رابین (Robin)", label: "رابین (Robin)" },
  { value: "کلاغ (Raven)", label: "کلاغ (Raven)" },
  { value: "قرقاول (Pheasant)", label: "قرقاول (Pheasant)" },
  { value: "شاهین (Hawk)", label: "شاهین (Hawk)" },
  { value: "ماهی‌خورک (Osprey)", label: "ماهی‌خورک (Osprey)" },
  { value: "کورمورنت (Cormorant)", label: "کورمورنت (Cormorant)" },
  { value: "پلیکان (Pelican)", label: "پلیکان (Pelican)" },
  { value: "فلامینگو (Flamingo)", label: "فلامینگو (Flamingo)" },
  { value: "سایر", label: "سایر" },
];

/** v3.5.1: حذف کوتیشن/فاصله اضافه دور نام — دیتای قدیمی با 'Fox' (کوتیشن) درج شده بود */
export function normalizeConductorName(name: unknown): string {
  return String(name ?? "").trim().replace(/^'+|'+$/g, "").trim();
}

/**
 * نام فارسی سیم‌های استاندارد — v3.5.3
 * نمایش به شکل «لینکس (Lynx)» — نام‌های ناشناخته بدون تغییر برمی‌گردند
 */
const CONDUCTOR_NAME_FA: Record<string, string> = {
  fox: "فاکس",
  mink: "مینک",
  dog: "داگ",
  hyena: "هاینا",
  partridge: "پارتریج",
  oriole: "اوریول",
  lynx: "لینکس",
  hawk: "شاهین",
  peacock: "طاووس",
  squab: "اسکواب",
  drake: "دریک",
  canary: "کاناری",
  cardinal: "کاردینال",
  curlew: "کرلو",
  martin: "مارتین",
};

/** نمایش نام سیم: «لینکس (Lynx)» — نام ناشناخته همان خام برمی‌گردد */
export function conductorDisplayName(name: unknown): string {
  const n = normalizeConductorName(name);
  if (!n) return n;
  const fa = CONDUCTOR_NAME_FA[n.toLowerCase()];
  return fa ? `${fa} (${n})` : n;
}

export function useConductors() {
  const { data, refresh } = useBootstrap();

  const conductors = useMemo<Conductor[]>(
    () => ((data?.conductors || []) as Conductor[]).map(c => ({ ...c, name: normalizeConductorName(c.name) })),
    [data]
  );

  /**
   * گزینه‌های کمبوباکس مستقیماً از جدول conductors.
   * فقط نام سیم نمایش داده می‌شود و هیچ عدد/سطح مقطع یا group ندارد.
   */
  const options = useMemo<SearchableOption[]>(() => {
    return conductors
      .map(c => {
        const rawName = normalizeConductorName(c.name);
        return {
          value: rawName,
          label: rawName,
        };
      })
      .filter(o => o.value)
      .sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }, [conductors]);

  return { conductors, options, fromDb: conductors.length > 0, loading: false, reload: refresh };
}
