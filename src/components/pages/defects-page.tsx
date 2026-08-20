"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { Defect, PaginatedResponse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus, Bug, Loader2 } from "lucide-react";

export function DefectsPage() {
  const [data, setData] = useState<PaginatedResponse<Defect> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await apiClient.get<PaginatedResponse<Defect>>(API_ENDPOINTS.defects, {
          page, page_size: 20, search: search || undefined,
        });
        setData(result);
      } catch (err) {
        console.error("خطا:", err);
      } finally { setLoading(false); }
    };
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [page, search]);

  const statusLabels: Record<string, { label: string; color: string }> = {
    new: { label: "جدید", color: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
    approved: { label: "تأیید شده", color: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100" },
    in_progress: { label: "در حال تعمیر", color: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
    repaired: { label: "تعمیر شده", color: "bg-purple-100 text-purple-700 hover:bg-purple-100" },
    verified: { label: "تأیید نهایی", color: "bg-green-100 text-green-700 hover:bg-green-100" },
    deferred: { label: "معوق", color: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
    rejected: { label: "رد شده", color: "bg-red-100 text-red-700 hover:bg-red-100" },
    cancelled: { label: "لغو شده", color: "bg-slate-100 text-slate-500 hover:bg-slate-100" },
  };

  const priorityLabels: Record<string, { label: string; color: string }> = {
    critical: { label: "بحرانی", color: "bg-red-100 text-red-700 hover:bg-red-100" },
    high: { label: "بالا", color: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
    medium: { label: "متوسط", color: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
    low: { label: "پایین", color: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="جستجوی عیب..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pr-9"
          />
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4 ml-2" />
          ثبت عیب جدید
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          ) : data && data.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-right">کد</TableHead>
                  <TableHead className="text-right">عنوان</TableHead>
                  <TableHead className="text-right">دسته</TableHead>
                  <TableHead className="text-right">اولویت</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                  <TableHead className="text-right">خط/دکل</TableHead>
                  <TableHead className="text-right">تاریخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((defect) => (
                  <TableRow key={defect.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-xs">{defect.defect_code}</TableCell>
                    <TableCell className="font-medium max-w-xs truncate">
                      {defect.title}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {defect.category_name || "—"}
                    </TableCell>
                    <TableCell>
                      {priorityLabels[defect.priority] && (
                        <Badge className={priorityLabels[defect.priority].color} variant="secondary">
                          {priorityLabels[defect.priority].label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {statusLabels[defect.status] && (
                        <Badge className={statusLabels[defect.status].color} variant="secondary">
                          {statusLabels[defect.status].label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {defect.line_code && <div className="text-slate-700">{defect.line_code}</div>}
                      {defect.tower_code && <div className="text-slate-400">{defect.tower_code}</div>}
                      {!defect.line_code && !defect.tower_code && "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 nums-fa">
                      {new Date(defect.discovered_at).toLocaleDateString("fa-IR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Bug className="w-12 h-12 mb-3 opacity-50" />
              <p>هیچ عیبی یافت نشد</p>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 nums-fa">
            نمایش {((page - 1) * 20) + 1} تا {Math.min(page * 20, data.pagination.total)} از{" "}
            {data.pagination.total} عیب
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data.pagination.has_prev} onClick={() => setPage(page - 1)}>
              قبلی
            </Button>
            <span className="flex items-center px-3 text-sm nums-fa">
              {page} / {data.pagination.total_pages}
            </span>
            <Button variant="outline" size="sm" disabled={!data.pagination.has_next} onClick={() => setPage(page + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
