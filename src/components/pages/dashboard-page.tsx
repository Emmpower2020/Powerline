"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { logError } from "@/lib/error-log";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { DashboardStats } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bug,
  ClipboardCheck,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Radio,
  Activity,
  ShieldCheck,
  Users,
  TrendingUp,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// v2.7.2: همان COLOR_THEMES استفاده‌شده در stats-bar-manager — برای هماهنگی بصری
const COLOR_THEMES: Record<string, { card: string; icon: string }> = {
  indigo: {
    card: "bg-gradient-to-br from-indigo-50 via-white to-indigo-100/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/60 border-indigo-200/70 dark:border-indigo-800/60 shadow-indigo-200/40",
    icon: "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/30",
  },
  purple: {
    card: "bg-gradient-to-br from-purple-50 via-white to-purple-100/60 dark:from-purple-950/40 dark:via-slate-900 dark:to-purple-950/60 border-purple-200/70 dark:border-purple-800/60 shadow-purple-200/40",
    icon: "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md shadow-purple-500/30",
  },
  red: {
    card: "bg-gradient-to-br from-red-50 via-white to-red-100/60 dark:from-red-950/40 dark:via-slate-900 dark:to-red-950/60 border-red-200/70 dark:border-red-800/60 shadow-red-200/40",
    icon: "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-md shadow-red-500/30",
  },
  emerald: {
    card: "bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/60 border-emerald-200/70 dark:border-emerald-800/60 shadow-emerald-200/40",
    icon: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30",
  },
  amber: {
    card: "bg-gradient-to-br from-amber-50 via-white to-amber-100/60 dark:from-amber-950/40 dark:via-slate-900 dark:to-amber-950/60 border-amber-200/70 dark:border-amber-800/60 shadow-amber-200/40",
    icon: "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30",
  },
  blue: {
    card: "bg-gradient-to-br from-blue-50 via-white to-blue-100/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-blue-950/60 border-blue-200/70 dark:border-blue-800/60 shadow-blue-200/40",
    icon: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30",
  },
  green: {
    card: "bg-gradient-to-br from-green-50 via-white to-green-100/60 dark:from-green-950/40 dark:via-slate-900 dark:to-green-950/60 border-green-200/70 dark:border-green-800/60 shadow-green-200/40",
    icon: "bg-gradient-to-br from-green-500 to-green-600 text-white shadow-md shadow-green-500/30",
  },
  slate: {
    card: "bg-gradient-to-br from-slate-50 via-white to-slate-100/60 dark:from-slate-800/40 dark:via-slate-900 dark:to-slate-800/60 border-slate-200/70 dark:border-slate-700/60 shadow-slate-200/40",
    icon: "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md shadow-slate-500/30",
  },
};

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadStats = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient.get<DashboardStats>(API_ENDPOINTS.dashboardStats);
      setStats(data);
    } catch (err: any) {
      console.error("خطا در دریافت آمار:", err);
      setLoadError(err?.message || "خطا در دریافت آمار از سرور");
      // v3.4.1: پیام صادقانه به کاربر + ثبت در لاگ خطاها (مثل بقیه صفحات)
      logError({
        title: "خطا در بارگذاری داشبورد",
        message: err?.message || "خطای نامشخص",
        source: "pages/dashboard",
        statusCode: err?.statusCode ?? null,
      });
      toast({
        title: "سرور دیتابیس موقتاً در دسترس نیست",
        description: err?.statusCode === 503
          ? "داده‌های شما در دیتابیس کاملاً سالم است — با دکمه تلاش مجدد یا بعد از لحظاتی دوباره امتحان کنید"
          : (err?.message || "خطا در دریافت آمار"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
          <p className="text-slate-500 max-w-md">
            {loadError || "خطا در دریافت آمار. لطفاً صفحه را رفرش کنید."}
          </p>
          {/* v3.4.1: دکمه تلاش مجدد به‌جای رفرش کامل صفحه */}
          <Button onClick={loadStats} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            تلاش مجدد
          </Button>
        </CardContent>
      </Card>
    );
  }

  const activeDefects = stats.defects.new + stats.defects.approved + stats.defects.in_progress;
  const totalActivity = stats.activity_7_days.reduce(
    (sum, d) => sum + d.defects + d.inspections, 0
  );

  return (
    <div className="space-y-3" dir="rtl">
      {/* ─── ردیف اول: ۴ کارت اصلی — v2.7.2: متن‌های بزرگ‌تر + ارتفاع بیشتر ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactStatCard
          icon={<Zap className="w-5 h-5" />}
          label="خطوط انتقال"
          value={stats.lines.total}
          sub={voltageSummary(stats.lines.by_voltage as Record<string, number>)}
          color="indigo"
        />
        <CompactStatCard
          icon={<Radio className="w-5 h-5" />}
          label="دکل‌ها"
          value={stats.towers.total}
          sub={`${(stats.towers.with_gps ?? 0).toLocaleString("fa-IR")} GPS · ${(stats.towers.linked ?? 0).toLocaleString("fa-IR")} متصل`}
          color="purple"
        />
        <CompactStatCard
          icon={<Bug className="w-5 h-5" />}
          label="عیوب فعال"
          value={activeDefects}
          sub={`${stats.defects.critical.toLocaleString("fa-IR")} بحرانی · ${stats.defects.high.toLocaleString("fa-IR")} بالا`}
          color="red"
        />
        <CompactStatCard
          icon={<ClipboardCheck className="w-5 h-5" />}
          label="بازدید امروز"
          value={stats.inspections.today}
          sub={`${stats.inspections.this_week.toLocaleString("fa-IR")} در هفته`}
          color="emerald"
        />
      </div>

      {/* ─── ردیف دوم: نمودار فعالیت + وضعیت عیوب ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* نمودار فعالیت */}
        <Card className="lg:col-span-2 border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                فعالیت ۷ روز اخیر
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-indigo-500" />
                  <span className="text-slate-600">عیوب</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                  <span className="text-slate-600">بازدیدها</span>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            <div className="flex items-end gap-3 h-44">
              {stats.activity_7_days.map((day, i) => {
                const maxValue = Math.max(
                  ...stats.activity_7_days.map((d) => Math.max(d.defects, d.inspections)),
                  5
                );
                const defectsHeight = (day.defects / maxValue) * 100;
                const inspectionsHeight = (day.inspections / maxValue) * 100;
                const dayNum = new Date(day.date).toLocaleDateString("fa-IR", { day: "numeric" });
                const dayName = new Date(day.date).toLocaleDateString("fa-IR", { weekday: "short" });

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="text-[10px] text-slate-400 nums-fa font-medium">
                      {day.defects + day.inspections > 0 ? (day.defects + day.inspections).toLocaleString("fa-IR") : ""}
                    </div>
                    <div className="w-full flex items-end justify-center gap-1.5 h-32">
                      <div
                        className="w-4 bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-md hover:from-indigo-700 hover:to-indigo-500 transition-all hover:scale-105 cursor-pointer"
                        style={{ height: `${defectsHeight}%`, minHeight: day.defects > 0 ? "4px" : "0" }}
                        title={`عیوب: ${day.defects}`}
                      />
                      <div
                        className="w-4 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md hover:from-emerald-700 hover:to-emerald-500 transition-all hover:scale-105 cursor-pointer"
                        style={{ height: `${inspectionsHeight}%`, minHeight: day.inspections > 0 ? "4px" : "0" }}
                        title={`بازدید: ${day.inspections}`}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 nums-fa">{dayNum}</div>
                      <div className="text-[10px] text-slate-400">{dayName}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* وضعیت عیوب */}
        <Card className="border-slate-200/60 shadow-sm">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bug className="w-4 h-4 text-red-500" />
              وضعیت عیوب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-1 pb-4">
            <StatusRow
              icon={<Bug className="w-3.5 h-3.5" />}
              label="جدید"
              value={stats.defects.new}
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
            />
            <StatusRow
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="تأیید شده"
              value={stats.defects.approved}
              color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
            />
            <StatusRow
              icon={<Wrench className="w-3.5 h-3.5" />}
              label="در حال تعمیر"
              value={stats.defects.in_progress}
              color="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
            />
            <StatusRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="تعمیر شده"
              value={stats.defects.repaired}
              color="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"
            />
            <StatusRow
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label="راستی‌آزمایی شده"
              value={stats.defects.verified}
              color="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
            />
            {stats.defects.critical > 0 && (
              <div className="mt-2 pt-2 border-t border-red-200/50 dark:border-red-900/30">
                <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">
                    {stats.defects.critical.toLocaleString("fa-IR")} عیب بحرانی
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── ردیف سوم: ۶ کارت خلاصه ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <MiniStatCard
          icon={<Wrench className="w-5 h-5" />}
          label="دستورکار باز"
          value={stats.work_orders.open}
          color="blue"
        />
        <MiniStatCard
          icon={<Clock className="w-5 h-5" />}
          label="دستورکار معوق"
          value={stats.work_orders.overdue}
          color="red"
          warning={stats.work_orders.overdue > 0}
        />
        <MiniStatCard
          icon={<ShieldCheck className="w-5 h-5" />}
          label="حوادث ماه"
          value={stats.safety.incidents_this_month}
          color="amber"
          warning={stats.safety.incidents_this_month > 0}
        />
        <MiniStatCard
          icon={<Users className="w-5 h-5" />}
          label="کاربران"
          value={stats.users.total}
          color="indigo"
          sub={`${stats.users.active.toLocaleString("fa-IR")} فعال`}
        />
        <MiniStatCard
          icon={<Layers className="w-5 h-5" />}
          label="پیمانکاران"
          value={stats.contractors.total}
          color="purple"
        />
        <MiniStatCard
          icon={<Activity className="w-5 h-5" />}
          label="فعالیت ۷ روز"
          value={totalActivity}
          color="emerald"
        />
      </div>
    </div>
  );
}

// ─── خلاصه ولتاژ (helper) ───
function voltageSummary(byVoltage: Record<string, number> | undefined): string {
  if (!byVoltage) return "مجموع خطوط";
  const entries = Object.entries(byVoltage)
    .filter(([v, c]) => Number(c) > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]));
  if (entries.length === 0) return "مجموع خطوط";
  return entries.map(([v, c]) => `${Number(v).toLocaleString("fa-IR")}: ${Number(c).toLocaleString("fa-IR")}`).join(" · ");
}

// ─── کارت آماری فشرده — v2.7.2: متن‌های بزرگ‌تر + ارتفاع بیشتر ───
function CompactStatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: keyof typeof COLOR_THEMES;
}) {
  const theme = COLOR_THEMES[color];
  return (
    <div className={cn(
      "rounded-xl border p-4 flex items-center gap-3 transition-all shadow-sm hover:shadow-md",
      theme.card,
    )}>
      <div className={cn(
        "shrink-0 w-12 h-12 rounded-lg flex items-center justify-center",
        theme.icon,
      )}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="text-xs text-slate-600 dark:text-slate-300 truncate leading-tight mb-1.5">
          {label}
        </div>
        <div className="text-xl font-bold text-slate-800 dark:text-slate-100 nums-fa leading-tight">
          {value.toLocaleString("fa-IR")}
        </div>
        <div className="text-[10px] text-slate-500 truncate nums-fa leading-tight mt-1">
          {sub}
        </div>
      </div>
    </div>
  );
}

// ─── ردیف وضعیت عیوب (با سایز متوسط) ───
function StatusRow({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded", color)}>{icon}</div>
        <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 nums-fa">
        {value.toLocaleString("fa-IR")}
      </span>
    </div>
  );
}

// ─── کارت آمار کوچک مینی — v2.7.2: متن‌های بزرگ‌تر + ارتفاع بیشتر ───
function MiniStatCard({
  icon, label, value, sub, color, warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: keyof typeof COLOR_THEMES;
  warning?: boolean;
}) {
  const theme = COLOR_THEMES[color];
  return (
    <div className={cn(
      "rounded-xl border p-3 flex items-center gap-2.5 transition-all shadow-sm hover:shadow-md",
      theme.card,
      warning && "ring-1 ring-amber-300 dark:ring-amber-700",
    )}>
      <div className={cn(
        "shrink-0 w-10 h-10 rounded-md flex items-center justify-center",
        theme.icon,
      )}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate leading-tight mb-1">
          {label}
        </div>
        <div className="text-lg font-bold text-slate-800 dark:text-slate-100 nums-fa leading-tight">
          {value.toLocaleString("fa-IR")}
        </div>
        {sub && (
          <div className="text-[10px] text-slate-500 truncate nums-fa leading-tight mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
