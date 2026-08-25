"use client";

import { useEffect, useState, useSyncExternalStore, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import {
  subscribeErrorLog, getErrorLog, clearErrorLog, type ErrorLogEntry,
} from "@/lib/error-log";
import { AlertOctagon, Trash2, RefreshCw } from "lucide-react";

/**
 * لاگ خطاها — v3.4.0
 *
 * همه خطاهای برنامه (API + صفحات + فرم‌ها) در یک جدول:
 * زمان شمسی، عنوان، پیام، منبع، کد HTTP — با جستجو و فیلتر.
 * مخصوص مدیر سیستم برای رفع عیب همزمان.
 */

function useErrorLogEntries(): ErrorLogEntry[] {
  return useSyncExternalStore(subscribeErrorLog, getErrorLog, getErrorLog);
}

const statusColor = (code: number | null | undefined): string => {
  if (code == null) return "bg-slate-100 text-slate-600 hover:bg-slate-100";
  if (code === 0) return "bg-amber-100 text-amber-700 hover:bg-amber-100"; // شبکه/تایم‌اوت
  if (code < 500) return "bg-orange-100 text-orange-700 hover:bg-orange-100";
  return "bg-red-100 text-red-700 hover:bg-red-100";
};

export function ErrorLogPage() {
  const entries = useErrorLogEntries();
  const [refreshKey, setRefreshKey] = useState(0);
  const tableRef = useState<DataTableHandle | null>(null)[0]; // فقط برای type — از ref واقعی استفاده نمی‌کنیم

  // جدول با کلید refresh — DataTable خودش سورت/فیلتر/جستجو دارد
  const rows = entries.map(e => ({
    ...e,
    timeFa: new Date(e.at).toLocaleString("fa-IR"),
    codeLabel: e.statusCode == null ? "—" : String(e.statusCode),
  }));

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "timeFa", header: "زمان", sortable: true, align: "right", width: "170px",
      render: (r) => <span className="text-xs text-slate-500 nums-fa">{r.timeFa}</span>,
    },
    {
      key: "codeLabel", header: "کد", sortable: true, filterable: true, align: "center", width: "90px",
      render: (r) => (
        <Badge className={statusColor(r.statusCode)} variant="secondary">
          {r.codeLabel}
        </Badge>
      ),
    },
    { key: "title", header: "عنوان", sortable: true, filterable: true, align: "right" },
    { key: "message", header: "پیام خطا", wrap: true, align: "right" },
    { key: "source", header: "منبع (صفحه/مسیر)", sortable: true, filterable: true, align: "right", wrap: true },
  ];

  return (
    <div className="space-y-2">
      {/* نوار خلاصه */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md shrink-0">
                <AlertOctagon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {entries.length.toLocaleString("fa-IR")} خطا ثبت‌شده
                </div>
                <div className="text-xs text-slate-500">
                  حداکثر ۵۰۰ خطای اخیر در این نشست — خطاهای API، صفحات و فرم‌ها
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
                <RefreshCw className="w-4 h-4 ml-1" />
                بروزرسانی
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 border-red-200"
                onClick={clearErrorLog}
                disabled={entries.length === 0}
              >
                <Trash2 className="w-4 h-4 ml-1" />
                پاک‌کردن همه
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <AlertOctagon className="w-12 h-12 mb-3 opacity-40" />
              <p className="font-medium">هیچ خطایی ثبت نشده</p>
              <p className="text-xs mt-1">هر خطایی که در برنامه رخ دهد به‌صورت خودکار اینجا ثبت می‌شود</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          key={refreshKey}
          data={rows}
          columns={columns}
          loading={false}
          searchKeys={["title", "message", "source", "codeLabel"]}
          title="لاگ خطاها"
          layoutKey="error-log"
          onRefresh={() => setRefreshKey(k => k + 1)}
          pageSize={20}
        />
      )}
    </div>
  );
}
