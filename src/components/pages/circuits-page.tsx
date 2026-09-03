"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { FormSection } from "@/components/form-section";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { useToast } from "@/hooks/use-toast";
import { useStatsVisible } from "@/hooks/use-stats-visible";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { ContractSelect } from "@/components/contract-select";
import { DistrictSelect } from "@/components/district-select";
import { currentUserDistrictId } from "@/hooks/use-district-options";
import { logError } from "@/lib/error-log";
import { Loader2, Zap } from "lucide-react";

/**
 * صفحه مدارها — v3.0.0 ایجاد، v3.1.0 کامل شد
 *
 * همان امکانات جدول خطوط/دکل‌ها: افزودن، ویرایش، کپی به‌عنوان جدید،
 * حذف، ورود انبوه اکسل (bulk-import)، خروجی، چاپ، کپی TSV،
 * انتخاب همه، چیدمان ستون per-user + نوار آمار با تفکیک ولتاژ.
 *
 * v3.1.0: همه ستون‌ها راست‌چین شدند (مطابق خطوط/دکل‌ها).
 */

interface Circuit {
  id: number;
  dispatch_code: string;
  name: string | null;
  voltage: number | null;
  line_id: number | null;
  line_code?: string | null;
  line_name?: string | null;
  contract_id?: number | null;
  contract_title?: string | null;
  // v4.3.78: وضعیت فعال/غیرفعال + امور بهره‌برداری
  status?: string | null;
  district_id?: number | null;
  district_name?: string | null;
  created_at?: string | null;
}

const VOLTAGE_OPTIONS = [400, 230, 132, 63];

const voltageBadge: Record<string, { label: string; color: string }> = {
  "400": { label: "۴۰۰ کیلوولت", color: "bg-purple-100 text-purple-700 hover:bg-purple-100" },
  "230": { label: "۲۳۰ کیلوولت", color: "bg-red-100 text-red-700 hover:bg-red-100" },
  "132": { label: "۱۳۲ کیلوولت", color: "bg-green-100 text-green-700 hover:bg-green-100" },
  "63": { label: "۶۳ کیلوولت", color: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
};

export function CircuitsPage() {
  const { toast } = useToast();
  const showStats = useStatsVisible();
  const [data, setData] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Circuit | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Circuit | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tableRef = useRef<DataTableHandle | null>(null);

  // v3.2.0: حذف انبوه با همان روش دکل‌ها/خطوط — دسته‌های ۵۰۰تایی + پروگرس بار + پاک شدن خودکار انتخاب‌ها
  const bulkDelete = useBulkDelete<Circuit>({
    endpoint: "circuits/bulk-delete",
    entityName: "مدار",
    tableRef,
    refresh: () => setRefreshKey(k => k + 1),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.circuits);
      setData(Array.isArray(result) ? result : (result?.data || []));
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
        title: "خطا در بارگذاری مدارها",
        message: err?.message || "خطای نامشخص",
        source: "pages/circuits",
        statusCode: err?.statusCode ?? null,
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load, refreshKey]);

  // آمار تفکیک ولتاژ
  const byVoltage: Record<string, number> = {};
  for (const c of data) {
    const k = c.voltage != null ? String(c.voltage) : "unknown";
    byVoltage[k] = (byVoltage[k] || 0) + 1;
  }

  const columns: DataTableColumn<Circuit>[] = [
    {
      key: "dispatch_code", header: "کد دیسپاچینگ", sortable: true, filterable: true, align: "right",
      render: (row) => <span className="font-mono font-bold text-indigo-700">{row.dispatch_code}</span>,
    },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true, align: "right" },
    // v4.3.78: امور بهره‌برداری + وضعیت فعال/غیرفعال
    { key: "district_name", header: "امور بهره‌برداری", sortable: true, filterable: true, align: "right" },
    { key: "name", header: "نام مدار", sortable: true, filterable: true, wrap: true, align: "right" },
    {
      key: "voltage", header: "ولتاژ", sortable: true, filterable: true, type: "badge", align: "right",
      badgeLabels: { "400": "۴۰۰", "230": "۲۳۰", "132": "۱۳۲", "63": "۶۳" },
      badgeColors: {
        "400": voltageBadge["400"].color,
        "230": voltageBadge["230"].color,
        "132": voltageBadge["132"].color,
        "63": voltageBadge["63"].color,
      },
    },
    // v4.3.78: ستون وضعیت استاندارد (فعال/غیرفعال) — قابل فیلتر
    { key: "status", header: "وضعیت", type: "status", filterable: true, align: "right" },
    // v3.2.0: ستون «خط مرتبط» حذف شد (درخواست کاربر)
  ];

  // headerMap برای تبدیل سرستون‌های فارسی اکسل
  const headerMap: Record<string, string> = {};
  columns.forEach(col => { if (col.header && col.key) headerMap[col.header] = col.key; });
  headerMap["ولتاژ (kV)"] = "voltage";
  headerMap["کد"] = "dispatch_code";
  const templateColumns = [
    { key: "dispatch_code", header: "کد دیسپاچینگ" },
    { key: "name", header: "نام مدار" },
    { key: "voltage", header: "ولتاژ" },
  ];

  // v3.1.0: کپی TSV — خود جدول در کلیپ‌بورد می‌نویسد، فقط اعلان
  const handleCopy = useCallback((rows: Circuit[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
      return;
    }
    toast({
      title: "کپی شد",
      description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`,
    });
  }, [toast]);

  // v3.1.0: کپی مدار به‌عنوان جدید — فرم با مقادیر مبدأ پیش‌پر می‌شود، کد خالی
  const handleDuplicate = useCallback((row: Circuit) => {
    setEditRow(null);
    setDuplicateFrom(row);
    setShowCreate(true);
  }, []);


  // v3.1.0: import تک‌ردیفی (fallback) و انبوه از طریق bulk-import
  const handleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    const payload = {
      dispatch_code: row.dispatch_code,
      name: row.name || null,
      voltage: Number(row.voltage),
    };
    if (mode === "update" && existingId) {
      await apiClient.put(`${API_ENDPOINTS.circuits}/${existingId}`, payload);
    } else {
      await apiClient.post(API_ENDPOINTS.circuits, payload);
    }
  };

  const handleImportBatch = async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const rows = items.map(it => it.row);
    const res = await apiClient.post<any>("circuits/bulk-import", { rows }, { timeoutMs: 60_000 });
    const statuses: string[] = res?.statuses || [];
    const errors: Array<string | null> = res?.errors || [];
    return items.map((_, idx) => {
      const st = statuses[idx];
      if (st === "failed") return { status: "failed" as const, error: errors[idx] || res?.first_error || "خطای نامشخص" };
      return { status: st === "updated" ? "updated" as const : "inserted" as const };
    });
  };

  return (
    <div className="space-y-2">
      {/* نوار آمار — هماهنگ با خطوط/دکل‌ها */}
      {showStats && <CircuitsStatsBar total={data.length} byVoltage={byVoltage} />}

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchKeys={["dispatch_code", "name", "contract_title"]}
        title="مدارها (کدهای دیسپاچینگ)"
        layoutKey="circuits"
        defaultSort={[{ key: "voltage", direction: "asc", order: [400, 230, 132, 63] }, { key: "name", direction: "asc" }, { key: "dispatch_code", direction: "asc" }]}
        tableRef={tableRef}
        onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onEdit={(row) => { setDuplicateFrom(null); setEditRow(row); }}
        onDuplicate={handleDuplicate}
        onCopy={handleCopy}
        onDelete={bulkDelete.requestDelete}
        onImport={() => setShowImport(true)}
        toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.circuits} entityName="مدار" onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus canChangeContract />}
      />

      {/* دیالوگ ایجاد/ویرایش/کپی مدار */}
      <CircuitDialog
        open={showCreate || editRow !== null}
        editRow={editRow}
        duplicateFrom={duplicateFrom}
        existingCodes={data.map(c => c.dispatch_code)}
        onClose={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); }}
        onSaved={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); setRefreshKey(k => k + 1); }}
      />

      {/* v3.1.0: ورود انبوه از اکسل */}
      <ImportExcelDialog
        open={showImport}
        onClose={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
        onImportRow={handleImportRow}
        onImportBatch={handleImportBatch}
        getExistingRows={async () => data as any}
        defaultUniqueKey="dispatch_code"
        uniqueKeyOptions={[{ value: "dispatch_code", label: "کد دیسپاچینگ" }]}
        entityName="مدار"
        headerMap={headerMap}
        templateColumns={templateColumns}
      />

      {/* تأیید حذف انبوه با پروگرس بار — v3.2.0 */}
      <BulkDeleteDialog
        open={bulkDelete.pendingRows !== null}
        rowsCount={bulkDelete.pendingRows?.length ?? 0}
        entityName="مدار"
        description={(bulkDelete.pendingRows?.length ?? 0) === 1
          ? `مدار «${bulkDelete.pendingRows?.[0].dispatch_code}» به‌طور کامل حذف می‌شود. اگر خطی از این کد استفاده می‌کند، کد آن خالی نمی‌شود اما دیگر در کمبوباکس‌ها نمایش داده نخواهد شد.`
          : `${(bulkDelete.pendingRows?.length ?? 0).toLocaleString("fa-IR")} مدار انتخاب‌شده به‌طور کامل حذف می‌شوند. این عمل قابل بازگشت نیست.`}
        isDeleting={bulkDelete.isDeleting}
        progress={bulkDelete.deleteProgress}
        onCancel={bulkDelete.cancelDelete}
        onConfirm={bulkDelete.confirmDelete}
      />
    </div>
  );
}

/** نوار آمار مدارها — کل + تفکیک ولتاژ با چیپ‌های رنگی هماهنگ با بقیه صفحات */
function CircuitsStatsBar({ total, byVoltage }: { total: number; byVoltage: Record<string, number> }) {
  const cards = [
    {
      key: "total", label: "کل مدارها", value: total.toLocaleString("fa-IR"),
      icon: <Zap className="w-5 h-5 text-white" />,
      iconClass: "from-indigo-500 to-indigo-600",
      cardClass: "from-indigo-50 via-white to-indigo-100/60",
    },
    ...VOLTAGE_OPTIONS.map(v => ({
      key: `v${v}`,
      label: `${v.toLocaleString("fa-IR")} کیلوولت`,
      value: (byVoltage[String(v)] || 0).toLocaleString("fa-IR"),
      icon: <Zap className="w-5 h-5 text-white" />,
      iconClass:
        v === 400 ? "from-purple-500 to-purple-600" :
        v === 230 ? "from-red-500 to-red-600" :
        v === 132 ? "from-green-500 to-green-600" :
        "from-blue-500 to-blue-600",
      cardClass:
        v === 400 ? "from-purple-50 via-white to-purple-100/60" :
        v === 230 ? "from-red-50 via-white to-red-100/60" :
        v === 132 ? "from-green-50 via-white to-green-100/60" :
        "from-blue-50 via-white to-blue-100/60",
    })),
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
            <div className="text-xl font-bold text-slate-800 dark:text-slate-100 nums-fa">{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** دیالوگ ایجاد/ویرایش/کپی مدار */
function CircuitDialog({ open, editRow, duplicateFrom, existingCodes, onClose, onSaved }: {
  open: boolean;
  editRow: Circuit | null;
  duplicateFrom: Circuit | null;
  existingCodes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ dispatch_code: "", name: "", voltage: "", contract_id: "", district_id: "" });

  const sourceRow = editRow || duplicateFrom;
  const isDuplicate = !editRow && !!duplicateFrom;

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        // در حالت کپی، کد جدید لازم است — خالی
        dispatch_code: isDuplicate ? "" : (sourceRow?.dispatch_code || ""),
        name: sourceRow?.name || "",
        voltage: sourceRow?.voltage != null ? String(sourceRow.voltage) : "",
        contract_id: sourceRow?.contract_id != null ? String(sourceRow.contract_id) : "",
        // v4.3.78: امور بهره‌برداری — در ثبت جدید امور کاربر جاری پیش‌فرض است
        district_id: !isDuplicate && !editRow
          ? (currentUserDistrictId() !== null ? String(currentUserDistrictId()) : (sourceRow?.district_id != null ? String(sourceRow.district_id) : ""))
          : (sourceRow?.district_id != null ? String(sourceRow.district_id) : ""),
      });
    }
  }, [open, sourceRow, isDuplicate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dispatch_code.trim()) { setError("کد دیسپاچینگ الزامی است"); return; }
    if (!form.voltage) { setError("ولتاژ الزامی است"); return; }
    const code = form.dispatch_code.trim();
    if (existingCodes.includes(code) && code !== editRow?.dispatch_code) {
      setError("این کد دیسپاچینگ قبلاً ثبت شده است");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        dispatch_code: code,
        name: form.name.trim() || null,
        voltage: Number(form.voltage),
        contract_id: form.contract_id ? Number(form.contract_id) : null,
        // v4.3.78: امور بهره‌برداری
        district_id: form.district_id ? Number(form.district_id) : null,
      };
      if (editRow) {
        await apiClient.put(`${API_ENDPOINTS.circuits}/${editRow.id}`, payload);
      } else {
        await apiClient.post(API_ENDPOINTS.circuits, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">
            {editRow ? `ویرایش مدار: ${editRow.dispatch_code}` : isDuplicate ? `کپی مدار جدید (از: ${duplicateFrom?.dispatch_code})` : "ثبت مدار جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <FormSection title="مشخصات مدار">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">کد دیسپاچینگ (اجباری)</Label>
              <Input
                value={form.dispatch_code}
                onChange={e => setForm({ ...form, dispatch_code: e.target.value.toUpperCase() })}
                placeholder="مثلاً: CM607"
                className="text-right"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">ولتاژ (اجباری)</Label>
              <SearchableSelect
                value={form.voltage}
                onChange={v => setForm({ ...form, voltage: v })}
                options={VOLTAGE_OPTIONS.map(v => ({
                  value: String(v),
                  label: `${v.toLocaleString("fa-IR")} کیلوولت`,
                }))}
                placeholder="انتخاب ولتاژ..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-right block">قرارداد</Label>
            <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />
          </div>
          {/* v4.3.78: امور بهره‌برداری مدار */}
          <div className="space-y-2">
            <Label className="text-right block">امور بهره‌برداری</Label>
            <DistrictSelect value={form.district_id} onChange={v => setForm({ ...form, district_id: v })} />
          </div>
          <div className="space-y-2">
            <Label className="text-right block">نام مدار</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="مثلاً: ماهیدشت-اسلام آباد 1"
              className="text-right"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : editRow ? "اعمال ویرایش" : "ثبت مدار"}
            </Button>
          </DialogFooter>
          </FormSection>
        </form>
      </DialogContent>
    </Dialog>
  );
}
