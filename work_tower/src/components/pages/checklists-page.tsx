"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Loader2, Plus, ClipboardList } from "lucide-react";
import { GenericBulkActions } from "@/components/generic-bulk-actions";

/**
 * صفحه چک‌لیست‌ها — v2.8.1
 *
 * این صفحه در منو از v1.0.0 وجود داشت اما در switch صفحه اصلی case نداشت و
 * به‌جایش داشبورد نمایش داده می‌شد. حالا با endpoint های آماده modules.php وصل است:
 *   GET   /checklist-templates — قالب‌های فعال
 *   POST  /checklist-templates — ایجاد قالب جدید (name + description + applies_to)
 *
 * applies_to دقیقاً مطابق enum جدول checklist_templates در دیتابیس:
 *   line | tower | equipment | all
 */

interface ChecklistTemplate {
  id: number;
  name: string;
  description: string | null;
  applies_to: "line" | "tower" | "equipment" | "all";
  is_active: number;
  created_at: string;
}

const asArray = (r: unknown): any[] => (Array.isArray(r) ? r : ((r as any)?.data || []));

export function ChecklistsPage() {
  const [data, setData] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await apiClient.get<unknown>(API_ENDPOINTS.checklistTemplates);
        setData(asArray(r));
      } catch (err) {
        console.error("خطا در بارگذاری چک‌لیست‌ها:", err);
      } finally { setLoading(false); }
    };
    load();
  }, [refreshKey]);

  const columns: DataTableColumn<ChecklistTemplate>[] = [
    { key: "name", header: "نام چک‌لیست", sortable: true, filterable: true, wrap: true },
    { key: "description", header: "توضیحات", wrap: true },
    {
      key: "applies_to", header: "دامنه", sortable: true, filterable: true, type: "badge",
      badgeLabels: { line: "خط", tower: "دکل", equipment: "تجهیزات", all: "همه" },
      badgeColors: {
        line: "bg-blue-100 text-blue-700",
        tower: "bg-indigo-100 text-indigo-700",
        equipment: "bg-purple-100 text-purple-700",
        all: "bg-slate-100 text-slate-700",
      },
    },
    { key: "is_active", header: "فعال", type: "boolean" },
    { key: "created_at", header: "تاریخ ایجاد", type: "date" },
  ];

  return (
    <div className="space-y-4">
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          </CardContent>
        </Card>
      ) : data.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <ClipboardList className="w-12 h-12 mb-3 opacity-50" />
              <p className="mb-4">هنوز چک‌لیستی ثبت نشده</p>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 ml-2" />
                چک‌لیست جدید
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          loading={loading}
          searchKeys={["name", "description"]}
          title="چک‌لیست‌ها"
          layoutKey="checklist-templates"
          onAdd={() => setShowCreate(true)}
          onRefresh={() => setRefreshKey(k => k + 1)}
          toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.checklistTemplates} entityName="چک‌لیست" onApplied={() => setRefreshKey(k => k + 1)} canToggleActive />}
        />
      )}

      <CreateChecklistDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); setRefreshKey(k => k + 1); }}
      />
    </div>
  );
}

// ─── دیالوگ ایجاد چک‌لیست ───
function CreateChecklistDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", applies_to: "tower" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("نام چک‌لیست الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.post(API_ENDPOINTS.checklistTemplates, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        applies_to: form.applies_to,
      });
      setForm({ name: "", description: "", applies_to: "tower" });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد چک‌لیست");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">چک‌لیست جدید</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <div className="space-y-2">
            <Label className="text-right block">نام چک‌لیست (اجباری)</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: چک‌لیست بازدید دوره‌ای دکل" className="text-right" autoFocus />
          </div>
          <div className="space-y-2">
            <Label className="text-right block">دامنه استفاده</Label>
            <Select value={form.applies_to} onValueChange={v => setForm({ ...form, applies_to: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tower">دکل</SelectItem>
                <SelectItem value="line">خط</SelectItem>
                <SelectItem value="equipment">تجهیزات</SelectItem>
                <SelectItem value="all">همه</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-right block">توضیحات</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="text-right" placeholder="مثلاً: بررسی سازه، مقره و یراق‌آلات" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : "ایجاد چک‌لیست"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
