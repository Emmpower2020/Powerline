"use client";

import dynamic from "next/dynamic";
import type { TowerMapInnerProps } from "./tower-map-inner";

// بارگذاری نقشه به‌صورت داینامیک (فقط در کلاینت)
// این کار برای جلوگیری از خطای "window is not defined" در SSR ضروری است
const TowerMapInner = dynamic(
  () => import("./tower-map-inner").then((mod) => mod.TowerMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full w-full bg-slate-100 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">در حال بارگذاری نقشه...</p>
        </div>
      </div>
    ),
  }
);

export function TowerMap(props: TowerMapInnerProps) {
  return <TowerMapInner {...props} />;
}

// re-export type برای استفاده‌ی همگانی
export type { TowerMapInnerProps } from "./tower-map-inner";
export type { MapTool } from "./tower-map-inner";
