"use client";

import dynamic from "next/dynamic";
import type { Tower } from "@/lib/types";

// بارگذاری نقشه به‌صورت داینامیک (فقط در کلاینت)
// این کار برای جلوگیری از خطای "window is not defined" در SSR ضروری است
const TowerMapInner = dynamic(
  () => import("./tower-map-inner").then((mod) => mod.TowerMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-800 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">در حال بارگذاری نقشه...</p>
        </div>
      </div>
    ),
  }
);

interface TowerMapProps {
  towers: Tower[];
  onTowerClick?: (tower: Tower) => void;
  height?: string;
  center?: [number, number];
  zoom?: number;
}

export function TowerMap(props: TowerMapProps) {
  return <TowerMapInner {...props} />;
}
