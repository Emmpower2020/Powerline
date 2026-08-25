"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { DashboardStats } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";

export function ReportsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const data = await apiClient.get<DashboardStats>(API_ENDPOINTS.dashboardStats); setStats(data); }
      catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700"><Download className="w-4 h-4 ml-2" />خروجی چاپ</Button>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">خطوط</p><p className="text-2xl font-bold nums-fa">{stats?.lines.total.toLocaleString("fa-IR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">دکل‌ها</p><p className="text-2xl font-bold nums-fa">{stats?.towers.total.toLocaleString("fa-IR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">عیوب</p><p className="text-2xl font-bold nums-fa">{stats?.defects.total.toLocaleString("fa-IR")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">بازدیدها</p><p className="text-2xl font-bold nums-fa">{stats?.inspections.total.toLocaleString("fa-IR")}</p></CardContent></Card>
      </div>
    </div>
  );
}
