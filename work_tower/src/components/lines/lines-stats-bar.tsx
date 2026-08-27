"use client";

import { useMemo } from "react";
import { StatsBarManager, type StatsCardDef } from "@/components/stats-bar-manager";
import { Route, Ruler, TowerControl, AlertTriangle, Zap, Layers } from "lucide-react";

interface LinesStatsBarProps {
  data: any[];
  /** تعداد ردیف‌های دارای خطای داده (محاسبه‌شده در صفحه اصلی) */
  issuesCount: number;
  /** کلیک روی کارت «دارای خطا» → فعال/غیرفعال کردن فیلتر سلامت داده */
  onIssuesClick?: () => void;
  /** حالت فعال بودن فیلتر سلامت داده (برای هایلایت کارت) */
  issuesFilterActive?: boolean;
}

/**
 * v2.6.0: نوار آمار بالای جدول خطوط — کاملاً بازنویسی‌شده با StatsBarManager
 *
 * قابلیت‌ها:
 *  - کارت‌های زیبا با گرادیان و سایه
 *  - همه کارت‌ها در یک خط
 *  - drag-and-drop برای جابجایی
 *  - تا ۵ کارت فعال (انتخاب توسط کاربر)
 *  - ذخیره per-user در localStorage با کلید powerline_stats_<userId>_lines
 */
export function LinesStatsBar({ data, issuesCount, onIssuesClick, issuesFilterActive }: LinesStatsBarProps) {
  const stats = useMemo(() => {
    let totalLength = 0;
    let totalTowers = 0;
    // v2.4.3: تفکیک بر اساس ولتاژ (به‌جای نوع خط)
    const byVoltage = new Map<number, number>();
    let activeCount = 0;
    let totalCircuits = 0;
    let totalTension = 0;
    let totalSuspension = 0;

    for (const row of data) {
      if (row.length_km != null && !isNaN(Number(row.length_km))) totalLength += Number(row.length_km);
      if (row.total_towers != null && !isNaN(Number(row.total_towers))) totalTowers += Number(row.total_towers);
      const v = Number(row.voltage_kv ?? row.voltage);
      if (Number.isFinite(v) && v > 0) byVoltage.set(v, (byVoltage.get(v) || 0) + 1);
      if (row.is_active) activeCount++;
      if (row.circuit_count != null) totalCircuits += Number(row.circuit_count);
      if (row.tension_towers != null) totalTension += Number(row.tension_towers);
      if (row.suspension_towers != null) totalSuspension += Number(row.suspension_towers);
    }

    return {
      count: data.length,
      totalLength,
      totalTowers,
      byVoltage: Array.from(byVoltage.entries()).sort((a, b) => b[0] - a[0]),
      activeCount,
      inactiveCount: data.length - activeCount,
      totalCircuits,
      totalTension,
      totalSuspension,
    };
  }, [data]);

  const fmt = (n: number, digits = 0) =>
    n.toLocaleString("fa-IR", { maximumFractionDigits: digits });

  // رشتهٔ چیپ‌های ولتاژ با رنگ‌بندی هماهنگ با جدول خطوط
  // v2.7.1: حذف «kv» و نشانه‌ها — فقط عدد رنگی در بج تمیز
  const voltageChips = stats.byVoltage.length === 0
    ? "—"
    : (
      <div className="flex items-center gap-1 flex-wrap leading-tight">
        {stats.byVoltage.map(([v, count]) => {
          const chipClass =
            v === 400 ? "bg-purple-200 text-purple-800 dark:bg-purple-900/80 dark:text-purple-200" :
            v === 230 ? "bg-red-200 text-red-800 dark:bg-red-900/80 dark:text-red-200" :
            v === 132 ? "bg-green-200 text-green-800 dark:bg-green-900/80 dark:text-green-200" :
            v === 63  ? "bg-blue-200 text-blue-800 dark:bg-blue-900/80 dark:text-blue-200" :
            "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200";
          return (
            <span
              key={v}
              className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold nums-fa ${chipClass}`}
            >
              {fmt(v)}
              <span className="mx-1 opacity-50">·</span>
              {fmt(count)}
            </span>
          );
        })}
      </div>
    );

  // ─── لیست همه کارت‌های ممکن — بیش از ۵ تا تا کاربر بتواند انتخاب کند ───
  const allCards: StatsCardDef[] = [
    {
      id: "total_lines",
      label: "تعداد خطوط",
      value: fmt(stats.count),
      icon: <Route className="w-4 h-4" />,
      color: "indigo",
    },
    {
      id: "total_length",
      label: "جمع طول خط",
      value: `${fmt(stats.totalLength, 1)} کیلومتر`,
      icon: <Ruler className="w-4 h-4" />,
      color: "blue",
    },
    {
      id: "total_towers",
      label: "جمع تعداد دکل‌ها",
      value: fmt(stats.totalTowers),
      icon: <TowerControl className="w-4 h-4" />,
      color: "emerald",
    },
    {
      id: "by_voltage",
      label: "تفکیک ولتاژ",
      value: voltageChips,
      icon: <Zap className="w-4 h-4" />,
      color: "purple",
    },
    {
      id: "active_lines",
      label: "خطوط فعال",
      value: fmt(stats.activeCount),
      icon: <Layers className="w-4 h-4" />,
      color: "green",
    },
    {
      id: "total_circuits",
      label: "جمع مدارها",
      value: fmt(stats.totalCircuits),
      icon: <Route className="w-4 h-4" />,
      color: "slate",
    },
    {
      id: "data_quality",
      label: "سلامت داده",
      value: issuesCount > 0 ? `${fmt(issuesCount)} خطا` : "بدون خطا",
      icon: <AlertTriangle className="w-4 h-4" />,
      color: issuesCount > 0 ? "amber" : "emerald",
      onClick: onIssuesClick,
      active: issuesFilterActive,
    },
  ];

  // پیش‌فرض: ۵ کارت اول فعال
  return (
    <StatsBarManager
      layoutKey="lines"
      cards={allCards}
      defaultActiveIds={["total_lines", "total_length", "total_towers", "by_voltage", "data_quality"]}
    />
  );
}
