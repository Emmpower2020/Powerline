"use client";

import { useMemo } from "react";
import { StatsBarManager, type StatsCardDef } from "@/components/stats-bar-manager";
import { Radio, MapPin, Link2 as Link2Icon, AlertTriangle, Zap, Cable, Layers, Activity } from "lucide-react";

interface TowersStatsBarProps {
  data: any[];
  issuesCount: number;
  onIssuesClick?: () => void;
  issuesFilterActive?: boolean;
}

/**
 * v2.6.0: نوار آمار بالای جدول دکل‌ها — بازنویسی با StatsBarManager
 *
 * قابلیت‌ها:
 *  - کارت «تعداد دکل‌ها به تفکیک ولتاژ» (جدید)
 *  - کارت‌های زیبا با گرادیان و سایه
 *  - drag-and-drop و انتخاب تا ۵ کارت فعال (per-user)
 *  - ذخیره در localStorage با کلید powerline_stats_<userId>_towers
 */
export function TowersStatsBar({ data, issuesCount, onIssuesClick, issuesFilterActive }: TowersStatsBarProps) {
  const stats = useMemo(() => {
    let withGps = 0;
    let linked = 0;
    let tension = 0;
    let suspension = 0;
    // v2.6.0: تفکیک دکل‌ها بر اساس ولتاژ خط
    const byVoltage = new Map<number, number>();
    let activeCount = 0;

    for (const row of data) {
      if (row.gps_lat != null && row.gps_lng != null) withGps++;
      if (row.line_id != null) linked++;
      if (row.tower_type === "کششی") tension++;
      if (row.tower_type === "آویزی") suspension++;
      const v = Number(row.voltage_kv);
      if (Number.isFinite(v) && v > 0) byVoltage.set(v, (byVoltage.get(v) || 0) + 1);
      if (row.status === "active") activeCount++;
    }

    return {
      count: data.length,
      withGps,
      linked,
      tension,
      suspension,
      byVoltage: Array.from(byVoltage.entries()).sort((a, b) => b[0] - a[0]),
      activeCount,
      inactiveCount: data.length - activeCount,
    };
  }, [data]);

  const fmt = (n: number) => n.toLocaleString("fa-IR");

  // رشته‌ی چیپ‌های ولتاژ — v2.7.1: حذف «kv» — فقط عدد رنگی در بج تمیز
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

  // v2.7.1: کششی/آویزی در یک ردیف افقی — بج‌های فشرده‌تر
  const foundationText = (
    <div className="flex items-center gap-1 flex-wrap leading-tight text-[11px] font-medium">
      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 px-2 py-0.5">
        <span>کششی</span>
        <span className="font-bold nums-fa">{fmt(stats.tension)}</span>
      </span>
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 px-2 py-0.5">
        <span>آویزی</span>
        <span className="font-bold nums-fa">{fmt(stats.suspension)}</span>
      </span>
    </div>
  );

  // ─── لیست همه کارت‌های ممکن ───
  const allCards: StatsCardDef[] = [
    {
      id: "total_towers",
      label: "تعداد کل دکل‌ها",
      value: fmt(stats.count),
      icon: <Radio className="w-4 h-4" />,
      color: "indigo",
    },
    {
      id: "by_voltage",
      label: "تفکیک بر اساس ولتاژ",
      value: voltageChips,
      icon: <Zap className="w-4 h-4" />,
      color: "purple",
    },
    {
      id: "with_gps",
      label: "دکل‌های دارای GPS",
      value: fmt(stats.withGps),
      icon: <MapPin className="w-4 h-4" />,
      color: "emerald",
    },
    {
      id: "linked",
      label: "متصل به خط",
      value: fmt(stats.linked),
      icon: <Link2Icon className="w-4 h-4" />,
      color: "blue",
    },
    {
      id: "foundation",
      label: "نوع دکل (کششی/آویزی)",
      value: foundationText,
      icon: <Layers className="w-4 h-4" />,
      color: "slate",
    },
    {
      id: "active_count",
      label: "دکل‌های فعال",
      value: fmt(stats.activeCount),
      icon: <Activity className="w-4 h-4" />,
      color: "green",
    },
    {
      id: "data_quality",
      label: "سلامت داده",
      value: issuesCount > 0 ? `${fmt(issuesCount)} دکل با خطا` : "بدون خطا",
      icon: <AlertTriangle className="w-4 h-4" />,
      color: issuesCount > 0 ? "amber" : "emerald",
      onClick: onIssuesClick,
      active: issuesFilterActive,
    },
  ];

  // پیش‌فرض: ۵ کارت اول فعال
  return (
    <StatsBarManager
      layoutKey="towers"
      cards={allCards}
      defaultActiveIds={["total_towers", "by_voltage", "with_gps", "linked", "data_quality"]}
    />
  );
}
