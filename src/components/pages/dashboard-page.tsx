"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { DashboardStats } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Cable,
  Bug,
  ClipboardCheck,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Radio,
} from "lucide-react";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await apiClient.get<DashboardStats>(API_ENDPOINTS.dashboardStats);
        setStats(data);
      } catch (err) {
        console.error("خطا در دریافت آمار:", err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

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
        <CardContent className="py-12 text-center text-slate-500">
          خطا در دریافت آمار. لطفاً صفحه را رفرش کنید.
        </CardContent>
      </Card>
    );
  }

  const statCards = [
    {
      label: "خطوط انتقال",
      value: stats.lines.total,
      sub: `${stats.lines.transmission} انتقال، ${stats.lines.sub_transmission} فوق‌انتقال`,
      icon: Zap,
      color: "indigo",
    },
    {
      label: "دکل‌ها",
      value: stats.towers.total,
      sub: "مجموع دکل‌های فعال",
      icon: Radio,
      color: "purple",
    },
    {
      label: "عیوب فعال",
      value: stats.defects.new + stats.defects.approved + stats.defects.in_progress,
      sub: `${stats.defects.critical} بحرانی، ${stats.defects.high} بالا`,
      icon: Bug,
      color: "red",
    },
    {
      label: "بازدیدهای امروز",
      value: stats.inspections.today,
      sub: `${stats.inspections.this_week} در هفته`,
      icon: ClipboardCheck,
      color: "green",
    },
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100" },
    red: { bg: "bg-red-50", text: "text-red-600", border: "border-red-100" },
    green: { bg: "bg-green-50", text: "text-green-600", border: "border-green-100" },
  };

  return (
    <div className="space-y-6">
      {/* آمار کلی */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          const colors = colorClasses[stat.color];
          return (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-slate-800 nums-fa">
                      {stat.value.toLocaleString("fa-IR")}
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${colors.bg} ${colors.border} border`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 nums-fa">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* نمودار ۷ روز اخیر + خلاصه عیوب */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* نمودار فعالیت */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">فعالیت ۷ روز اخیر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-48">
              {stats.activity_7_days.map((day, i) => {
                const maxValue = Math.max(
                  ...stats.activity_7_days.map((d) => Math.max(d.defects, d.inspections)),
                  5
                );
                const defectsHeight = (day.defects / maxValue) * 100;
                const inspectionsHeight = (day.inspections / maxValue) * 100;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center gap-1 h-40">
                      <div
                        className="w-3 bg-indigo-500 rounded-t hover:bg-indigo-600 transition-colors"
                        style={{ height: `${defectsHeight}%` }}
                        title={`عیوب: ${day.defects}`}
                      />
                      <div
                        className="w-3 bg-emerald-500 rounded-t hover:bg-emerald-600 transition-colors"
                        style={{ height: `${inspectionsHeight}%` }}
                        title={`بازدید: ${day.inspections}`}
                      />
                    </div>
                    <span className="text-xs text-slate-400 nums-fa">
                      {new Date(day.date).toLocaleDateString("fa-IR", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-indigo-500 rounded" />
                <span className="text-xs text-slate-600">عیوب ثبت‌شده</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded" />
                <span className="text-xs text-slate-600">بازدیدها</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* خلاصه عیوب بر اساس وضعیت */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">وضعیت عیوب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              icon={<Bug className="w-4 h-4" />}
              label="جدید"
              value={stats.defects.new}
              color="text-blue-600 bg-blue-50"
            />
            <StatusRow
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="تأیید شده"
              value={stats.defects.approved}
              color="text-indigo-600 bg-indigo-50"
            />
            <StatusRow
              icon={<Wrench className="w-4 h-4" />}
              label="در حال تعمیر"
              value={stats.defects.in_progress}
              color="text-amber-600 bg-amber-50"
            />
            <StatusRow
              icon={<Clock className="w-4 h-4" />}
              label="تعمیر شده"
              value={stats.defects.repaired}
              color="text-purple-600 bg-purple-50"
            />
            <StatusRow
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="راستی‌آزمایی شده"
              value={stats.defects.verified}
              color="text-green-600 bg-green-50"
            />
            {stats.defects.critical > 0 && (
              <div className="pt-3 border-t mt-3">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {stats.defects.critical.toLocaleString("fa-IR")} عیب بحرانی
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* خلاصه دستورکارها و ایمنی */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Wrench className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">دستورکارهای باز</p>
                <p className="text-2xl font-bold text-slate-800 nums-fa">
                  {stats.work_orders.open.toLocaleString("fa-IR")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">دستورکارهای معوق</p>
                <p className="text-2xl font-bold text-slate-800 nums-fa">
                  {stats.work_orders.overdue.toLocaleString("fa-IR")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">حوادث این ماه</p>
                <p className="text-2xl font-bold text-slate-800 nums-fa">
                  {stats.safety.incidents_this_month.toLocaleString("fa-IR")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded ${color}`}>{icon}</div>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-800 nums-fa">
        {value.toLocaleString("fa-IR")}
      </span>
    </div>
  );
}
