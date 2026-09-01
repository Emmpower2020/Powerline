"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/searchable-select";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { CreateDefectDialog } from "@/components/defects/create-defect-dialog";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";
import type { Defect } from "@/lib/types";
import {
  Bug, Loader2, CheckCircle2, ShieldCheck, MoreHorizontal, ListChecks,
  AlertOctagon, Clock, Wrench, BadgeCheck, Link2, Gauge, Flame, ShieldAlert,
} from "lucide-react";

/**
 * صفحه عیوب — v3.0.0 بازنویسی، v3.1.0 کامل شد
 *
 * v3.1.0 — همان امکانات کامل جدول خطوط/دکل‌ها:
 *  - کپی TSV + کپی به‌عنوان عیب جدید + ورود انبوه اکسل (defects/bulk-import)
 *  - عملیات گروهی: تغییر شدت / اولویت / ریسک ایمنی روی عیوب انتخاب‌شده
 *  - همه ستون‌ها راست‌چین
 *  - ستون دسته (از عیوب استاندارد — JOIN با defect_definitions)
 */

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

const severityLabels: Record<string, { label: string; color: string }> = {
  minor: { label: "جزئی", color: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
  major: { label: "عمده", color: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
  critical: { label: "بحرانی", color: "bg-red-100 text-red-700 hover:bg-red-100" },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  critical: { label: "بحرانی", color: "bg-red-100 text-red-700 hover:bg-red-100" },
  high: { label: "بالا", color: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
  medium: { label: "متوسط", color: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  low: { label: "پایین", color: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
};

export function DefectsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Defect | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Defect | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [acting, setActing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tableRef = useRef<DataTableHandle | null>(null);

  // v3.2.0: حذف انبوه با همان روش دکل‌ها/خطوط — دسته‌های ۵۰۰تایی + پروگرس بار + پاک شدن خودکار انتخاب‌ها
  const bulkDelete = useBulkDelete<Defect>({
    endpoint: "defects/bulk-delete",
    entityName: "عیب",
    tableRef,
    refresh: () => setRefreshKey(k => k + 1),
  });

  // عملیات گروهی — فیلد و مقدار انتخابی
  const [bulkField, setBulkField] = useState<"severity" | "priority" | "safety_risk" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const [bulkRows, setBulkRows] = useState<Defect[]>([]);
  const [bulkApplying, setBulkApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.defects, { page: 1, page_size: 100000 });
      setData(result?.data || []);
    } catch (err: any) {
      console.error("خطا:", err);
      // v3.3.1: پیام واضح به کاربر — جدول خالی بی‌صدا یعنی «داده پاک شده» به نظر می‌رسد؛ اینطور نیست
      toast({
        title: "سرور دیتابیس موقتاً در دسترس نیست",
        description: err?.statusCode === 503
          ? "داده‌های شما در دیتابیس کاملاً سالم است — چند لحظه بعد دکمه بروزرسانی را بزنید"
          : (err?.message || "خطا در دریافت داده از سرور"),
        variant: "destructive",
      });
      logError({
        title: "خطا در بارگذاری عیوب",
        message: err?.message || "خطای نامشخص",
        source: "pages/defects",
        statusCode: err?.statusCode ?? null,
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load, refreshKey]);

  // ─── اکشن‌های چرخه عمر عیب ───

  const doAction = async (defect: Defect, action: "approve" | "verify", e: React.MouseEvent) => {
    e.stopPropagation();
    setActing(true);
    try {
      if (action === "approve") {
        await apiClient.post(API_ENDPOINTS.defectApprove(defect.id));
        toast({ title: "عیب تأیید شد", description: `${defect.defect_code} → ${statusLabels.approved.label}` });
      } else {
        await apiClient.post(API_ENDPOINTS.defectVerify(defect.id));
        toast({ title: "راستی‌آزمایی شد", description: `${defect.defect_code} → ${statusLabels.verified.label}` });
      }
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast({
        title: action === "approve" ? "تأیید ناموفق" : "راستی‌آزمایی ناموفق",
        description: err?.message || "خطا",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  };


  // v3.1.0: کپی TSV
  const handleCopy = useCallback((rows: Defect[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
      return;
    }
    toast({
      title: "کپی شد",
      description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`,
    });
  }, [toast]);

  // v3.1.0: کپی عیب به‌عنوان جدید
  const handleDuplicate = useCallback((row: Defect) => {
    setEditRow(null);
    setDuplicateFrom(row);
    setShowCreate(true);
  }, []);

  // v3.1.0: عملیات گروهی
  const getSelection = useCallback((): Defect[] => {
    const ids = tableRef.current?.getSelectedRows() || [];
    return data.filter(d => ids.includes(d.id));
  }, [data]);

  const startBulk = (field: "severity" | "priority" | "safety_risk") => {
    const sel = getSelection();
    if (sel.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "ابتدا با چک‌باکس، عیوب مورد نظر را انتخاب کنید" });
      return;
    }
    setBulkRows(sel);
    setBulkValue("");
    setBulkField(field);
  };

  const applyBulk = async () => {
    if (!bulkField || !bulkValue) return;
    setBulkApplying(true);
    let success = 0;
    const errs: string[] = [];
    for (const row of bulkRows) {
      try {
        await apiClient.put(`${API_ENDPOINTS.defects}/${row.id}`, { [bulkField]: bulkValue });
        success++;
      } catch (err: any) {
        errs.push(`${row.defect_code}: ${err?.message || "خطا"}`);
      }
    }
    setBulkApplying(false);
    setBulkField(null);
    setRefreshKey(k => k + 1);
    // v3.2.0: پاک شدن خودکار انتخاب‌ها بعد از عملیات گروهی
    if (tableRef.current) tableRef.current.clearSelection();
    if (errs.length === 0) {
      toast({ title: "انجام شد", description: `${success.toLocaleString("fa-IR")} عیب به‌روزرسانی شد` });
    } else {
      toast({ title: "اعمال ناقص", description: `${success.toLocaleString("fa-IR")} موفق، ${errs.length.toLocaleString("fa-IR")} ناموفق — اولین خطا: ${errs[0]}`, variant: "destructive" });
    }
  };

  // v3.1.0: import عیب از اکسل
  const handleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    if (mode === "update" && existingId) {
      const patch: Record<string, unknown> = {};
      for (const k of ["title", "description", "defect_type", "severity", "priority", "safety_risk", "location_desc", "notes"]) {
        if (row[k] !== undefined && row[k] !== "") patch[k] = row[k];
      }
      await apiClient.put(`${API_ENDPOINTS.defects}/${existingId}`, patch);
    } else {
      await apiClient.post(API_ENDPOINTS.defects, {
        title: row.title,
        description: row.description || null,
        defect_type: row.defect_type || null,
        severity: row.severity || "minor",
        priority: row.priority || "medium",
        safety_risk: row.safety_risk || "none",
        location_desc: row.location_desc || null,
        line_code: row.line_code || undefined,
        tower_code: row.tower_code || undefined,
      });
    }
  };

  const handleImportBatch = async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const rows = items.map(it => it.row);
    const res = await apiClient.post<any>("defects/bulk-import", { rows }, { timeoutMs: 60_000 });
    const statuses: string[] = res?.statuses || [];
    const errors: Array<string | null> = res?.errors || [];
    return items.map((_, idx) => {
      const st = statuses[idx];
      if (st === "failed") return { status: "failed" as const, error: errors[idx] || res?.first_error || "خطای نامشخص" };
      return { status: "inserted" as const };
    });
  };

  // ─── ستون‌های جدول — همه راست‌چین (v3.1.0) ───

  const columns: DataTableColumn<Defect>[] = [
    {
      key: "defect_code", header: "کد رهگیری", sortable: true, filterable: true, align: "right",
      render: (row) => <span className="font-mono text-xs font-bold text-indigo-700">{row.defect_code}</span>,
    },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true, align: "right" },
    { key: "title", header: "عنوان عیب", sortable: true, filterable: true, wrap: true, align: "right" },
    {
      // v3.1.0: دسته عیب استاندارد (از JOIN با defect_definitions)
      key: "category_name", header: "دسته", sortable: true, filterable: true, wrap: true, align: "right",
      render: (row) => (row as any).category_name
        ? <span className="text-slate-600">{(row as any).category_name}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      key: "severity", header: "شدت", sortable: true, filterable: true, type: "badge", align: "right",
      badgeLabels: Object.fromEntries(Object.entries(severityLabels).map(([k, v]) => [k, v.label])),
      badgeColors: Object.fromEntries(Object.entries(severityLabels).map(([k, v]) => [k, v.color])),
    },
    {
      key: "priority", header: "اولویت", sortable: true, filterable: true, type: "badge", align: "right",
      badgeLabels: Object.fromEntries(Object.entries(priorityLabels).map(([k, v]) => [k, v.label])),
      badgeColors: Object.fromEntries(Object.entries(priorityLabels).map(([k, v]) => [k, v.color])),
    },
    {
      key: "status", header: "وضعیت", sortable: true, filterable: true, type: "badge", align: "right",
      badgeLabels: Object.fromEntries(Object.entries(statusLabels).map(([k, v]) => [k, v.label])),
      badgeColors: Object.fromEntries(Object.entries(statusLabels).map(([k, v]) => [k, v.color])),
    },
    {
      key: "line_name", header: "خط", sortable: true, filterable: true, wrap: true, align: "right",
      render: (row) => row.line_name
        ? <span className="text-slate-600" title={row.line_name || ""}>{(row.line_name || "").slice(0, 45)}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      key: "tower_code", header: "دکل", align: "right",
      render: (row) => row.tower_code || <span className="text-slate-300">—</span>,
    },
    {
      key: "discovered_by_name", header: "ثبت‌کننده", sortable: true, filterable: true, align: "right",
      render: (row) => (row as any).discovered_by_name || <span className="text-slate-300">—</span>,
    },
    { key: "discovered_at", header: "تاریخ ثبت", type: "date", sortable: true, align: "right" },
    { key: "location_desc", header: "محل", wrap: true, hidden: true, align: "right" },
    {
      key: "_actions", header: "عملیات", align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status === "new" && (
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
              title="تأیید عیب (new → approved)"
              disabled={acting}
              onClick={(e) => doAction(row, "approve", e)}
            >
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          )}
          {row.status === "repaired" && (
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
              title="راستی‌آزمایی رفع عیب (repaired → verified)"
              disabled={acting}
              onClick={(e) => doAction(row, "verify", e)}
            >
              <ShieldCheck className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100"
            title="ویرایش عیب"
            onClick={(e) => { e.stopPropagation(); setDuplicateFrom(null); setEditRow(row); }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  // headerMap برای import اکسل عیوب
  const importHeaderMap: Record<string, string> = {
    "عنوان عیب": "title", "عنوان": "title",
    "توضیحات": "description",
    "نوع عیب": "defect_type",
    "شدت": "severity", "اولویت": "priority", "ریسک ایمنی": "safety_risk",
    "کد خط": "line_code", "نام خط": "line_code",
    "کد دکل": "tower_code",
    "محل": "location_desc", "یادداشت": "notes",
  };
  const importTemplateColumns = [
    { key: "title", header: "عنوان عیب" },
    { key: "line_code", header: "کد خط" },
    { key: "tower_code", header: "کد دکل" },
    { key: "severity", header: "شدت (minor/major/critical)" },
    { key: "priority", header: "اولویت (low/medium/high/critical)" },
    { key: "description", header: "توضیحات" },
    { key: "location_desc", header: "محل" },
  ];

  const bulkLabels: Record<string, { title: string; options: { value: string; label: string }[] }> = {
    severity: {
      title: "تغییر گروهی شدت",
      options: [
        { value: "minor", label: "جزئی" },
        { value: "major", label: "عمده" },
        { value: "critical", label: "بحرانی" },
      ],
    },
    priority: {
      title: "تغییر گروهی اولویت",
      options: [
        { value: "low", label: "پایین" },
        { value: "medium", label: "متوسط" },
        { value: "high", label: "بالا" },
        { value: "critical", label: "بحرانی" },
      ],
    },
    safety_risk: {
      title: "تغییر گروهی ریسک ایمنی",
      options: [
        { value: "none", label: "ندارد" },
        { value: "low", label: "کم" },
        { value: "medium", label: "متوسط" },
        { value: "high", label: "زیاد" },
      ],
    },
  };

  return (
    <div className="space-y-2">
      {/* نوار آمار */}
      <DefectsStatsBar data={data} />

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchKeys={["defect_code", "title", "line_name", "tower_code", "location_desc", "defect_type", "category_name"]}
        title="عیوب"
        layoutKey="defects"
        tableRef={tableRef}
        onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onEdit={(row) => { setDuplicateFrom(null); setEditRow(row); }}
        onDuplicate={handleDuplicate}
        onCopy={handleCopy}
        onDelete={bulkDelete.requestDelete}
        onImport={() => setShowImport(true)}
        toolbarExtra={(rows) => <div className="flex items-center gap-1">
          <GenericBulkActions
            rows={rows}
            endpoint={API_ENDPOINTS.defects}
            entityName="عیب"
            onApplied={() => setRefreshKey(k => k + 1)}
            canChangeContract
            additionalActions={<>
              <ItemRow icon={<Flame className="w-4 h-4 text-orange-500" />} label="شدت" onClick={() => startBulk("severity")} />
              <ItemRow icon={<Gauge className="w-4 h-4 text-amber-500" />} label="اولویت" onClick={() => startBulk("priority")} />
              <ItemRow icon={<ShieldAlert className="w-4 h-4 text-red-500" />} label="ریسک ایمنی" onClick={() => startBulk("safety_risk")} />
            </>}
          />
        </div>}
      />

      <CreateDefectDialog
        open={showCreate || editRow !== null}
        editRow={editRow}
        duplicateFrom={duplicateFrom}
        onClose={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); }}
        onCreated={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); setRefreshKey(k => k + 1); }}
      />

      {/* v3.1.0: ورود انبوه عیب از اکسل */}
      <ImportExcelDialog
        open={showImport}
        onClose={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
        onImportRow={handleImportRow}
        onImportBatch={handleImportBatch}
        getExistingRows={async () => data as any}
        defaultUniqueKey="defect_code"
        uniqueKeyOptions={[{ value: "defect_code", label: "کد رهگیری" }]}
        entityName="عیب"
        headerMap={importHeaderMap}
        templateColumns={importTemplateColumns}
      />

      {/* تأیید حذف انبوه با پروگرس بار — v3.2.0 */}
      <BulkDeleteDialog
        open={bulkDelete.pendingRows !== null}
        rowsCount={bulkDelete.pendingRows?.length ?? 0}
        entityName="عیب"
        description={(bulkDelete.pendingRows?.length ?? 0) === 1
          ? `عیب «${bulkDelete.pendingRows?.[0].title}» (${bulkDelete.pendingRows?.[0].defect_code}) به‌طور کامل حذف می‌شود. سابقه وضعیت آن نیز از بین می‌رود.`
          : `${(bulkDelete.pendingRows?.length ?? 0).toLocaleString("fa-IR")} عیب انتخاب‌شده به‌طور کامل حذف می‌شوند. سابقه وضعیت آن‌ها نیز از بین می‌رود. این عمل قابل بازگشت نیست.`}
        isDeleting={bulkDelete.isDeleting}
        progress={bulkDelete.deleteProgress}
        onCancel={bulkDelete.cancelDelete}
        onConfirm={bulkDelete.confirmDelete}
      />

      {/* دیالوگ عملیات گروهی */}
      <Dialog open={bulkField !== null} onOpenChange={(o) => { if (!o && !bulkApplying) setBulkField(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{bulkField ? bulkLabels[bulkField].title : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-right">
              این مقدار روی <span className="font-bold text-indigo-600 nums-fa">{bulkRows.length.toLocaleString("fa-IR")}</span> عیب انتخاب‌شده اعمال می‌شود.
            </p>
            {bulkField && (
              <div className="space-y-2">
                <Label className="text-right block">مقدار جدید</Label>
                <SearchableSelect
                  value={bulkValue}
                  onChange={setBulkValue}
                  options={bulkLabels[bulkField].options}
                  placeholder="انتخاب..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkField(null)} disabled={bulkApplying}>انصراف</Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={bulkApplying || !bulkValue}
              onClick={applyBulk}
            >
              {bulkApplying ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال اعمال...</> : "اعمال روی همه"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** آیتم منو */
function ItemRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <DropdownMenuItem className="gap-2 cursor-pointer text-right" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

/** نوار آمار عیوب — کل + تفکیک وضعیت + اولویت بحرانی */
function DefectsStatsBar({ data }: { data: Defect[] }) {
  const count = (fn: (d: Defect) => boolean) => data.filter(fn).length;

  const newCount = count(d => d.status === "new");
  const inProgress = count(d => d.status === "in_progress");
  const criticalHigh = count(d => (d.priority === "critical" || d.priority === "high") && !["verified", "cancelled", "rejected"].includes(d.status));
  const verified = count(d => d.status === "verified");
  const withLine = count(d => d.line_id != null);

  const cards = [
    {
      key: "total", label: "کل عیوب", value: data.length,
      icon: <Bug className="w-5 h-5 text-white" />, iconClass: "from-indigo-500 to-indigo-600",
      cardClass: "from-indigo-50 via-white to-indigo-100/60",
    },
    {
      key: "new", label: "جدید", value: newCount,
      icon: <Clock className="w-5 h-5 text-white" />, iconClass: "from-blue-500 to-blue-600",
      cardClass: "from-blue-50 via-white to-blue-100/60",
    },
    {
      key: "in_progress", label: "در حال تعمیر", value: inProgress,
      icon: <Wrench className="w-5 h-5 text-white" />, iconClass: "from-amber-500 to-amber-600",
      cardClass: "from-amber-50 via-white to-amber-100/60",
    },
    {
      key: "critical", label: "بحرانی / بالا", value: criticalHigh,
      icon: <AlertOctagon className="w-5 h-5 text-white" />, iconClass: "from-red-500 to-red-600",
      cardClass: criticalHigh > 0 ? "from-red-50 via-white to-red-100/70 ring-1 ring-red-200" : "from-red-50 via-white to-red-100/60",
    },
    {
      key: "verified", label: "تأیید نهایی", value: verified,
      icon: <BadgeCheck className="w-5 h-5 text-white" />, iconClass: "from-green-500 to-green-600",
      cardClass: "from-green-50 via-white to-green-100/60",
    },
    {
      key: "with_line", label: "متصل به خط", value: withLine,
      icon: <Link2 className="w-5 h-5 text-white" />, iconClass: "from-purple-500 to-purple-600",
      cardClass: "from-purple-50 via-white to-purple-100/60",
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hover">
      {cards.map(card => (
        <div
          key={card.key}
          className={`flex items-center gap-3 shrink-0 w-[200px] h-[96px] rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-l ${card.cardClass} p-3 shadow-sm hover:shadow-md transition-shadow`}
        >
          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${card.iconClass} flex items-center justify-center shadow-md shrink-0`}>
            {card.icon}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 truncate">{card.label}</div>
            <div className="text-xl font-bold text-slate-800 dark:text-slate-100 nums-fa">{card.value.toLocaleString("fa-IR")}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
