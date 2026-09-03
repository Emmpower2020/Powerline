"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { normalizeConductorName, conductorDisplayName } from "@/hooks/use-conductors";
import { logError } from "@/lib/error-log";
import { useToast } from "@/hooks/use-toast";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { Loader2, Cable, Layers, Gauge } from "lucide-react";

/**
 * انواع سیم‌ها — v3.5.0 (ماژول جدید)
 *
 * منبع: Conductors Standard.xlsx — ۱۵ سیم ACSR
 * ستون‌های دیتابیس انگلیسی (مطابق اکسل) ولی نمایش فارسی.
 * همان امکانات خطوط: افزودن/ویرایش/کپی جدید/کپی TSV/حذف انبوه با پروگرس/
 * import اکسل/خروجی/چاپ + نوار آمار.
 */

interface Conductor {
  id: number;
  name: string;
  /** v3.5.3: نام نمایشی «لینکس (Lynx)» — فقط سمت کلاینت، برای جستجو و نمایش */
  name_display?: string;
  type: string | null;
  type_code: string | null;
  standard: string | null;      // BS / ASTM (انگلیسی در DB)
  core_type: string | null;     // GS
  material_outer: string | null; // Alum.
  material_inner: string | null; // Steel
  stranding_outer: string | null;
  stranding_inner: string | null;
  sectional_area_outer: number | null;
  sectional_area_all: number | null;
  overall_diameter_all: number | null;
  overall_diameter_inner: number | null;
  diameter_code_all: string | null;
  diameter_code_inner: string | null;
  weight_all: number | null;
  weight_inner: number | null;
  weight_outer: number | null;
  ultimate_strength: number | null;
  resistance: number | null;
  status: number;
}

/** معادل فارسی مقادیر ثابت — نمایش */
const standardFa: Record<string, string> = {
  BS: "BS (انگلیس)", Bs: "BS (انگلیس)", ASTM: "ASTM (آمریکا)",
};
const materialFa: Record<string, string> = {
  "Alum.": "آلومینیوم", Steel: "فولاد",
};
const coreFa: Record<string, string> = { GS: "فولاد-آلومینیوم" };

const STD_OPTIONS = [
  { value: "BS", label: "BS (انگلیس)" },
  { value: "ASTM", label: "ASTM (آمریکا)" },
];
const MAT_OPTIONS = [
  { value: "Alum.", label: "آلومینیوم" },
  { value: "Steel", label: "فولاد" },
];

const fa = (map: Record<string, string>, v: string | null | undefined): string =>
  (v && map[v]) || v || "—";

const num = (v: number | null | undefined, digits = 1): string =>
  v == null ? "—" : Number(v).toLocaleString("fa-IR", { maximumFractionDigits: digits });

export function ConductorsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Conductor | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Conductor | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tableRef = useRef<DataTableHandle | null>(null);

  const bulkDelete = useBulkDelete<Conductor>({
    endpoint: "conductors/bulk-delete",
    entityName: "سیم",
    tableRef,
    refresh: () => setRefreshKey(k => k + 1),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.conductors);
      const raw: Conductor[] = Array.isArray(result) ? result : (result?.data || []);
      // v3.5.1: نرمال‌سازی نام‌ها (حذف کوتیشن دور نام — باگ import اولیه)
      // v3.5.3: + نام نمایشی فارسی «لینکس (Lynx)» برای نمایش و جستجو
      setData(raw.map(c => {
        const name = normalizeConductorName(c.name);
        return { ...c, name, name_display: conductorDisplayName(name) };
      }));
    } catch (err: any) {
      logError({ title: "خطا در بارگذاری انواع سیم‌ها", message: err?.message || "خطای نامشخص", source: "pages/conductors", statusCode: err?.statusCode ?? null });
      toast({
        title: "سرور دیتابیس موقتاً در دسترس نیست",
        description: err?.statusCode === 503 ? "داده‌های شما در دیتابیس کاملاً سالم است — چند لحظه بعد دکمه بروزرسانی را بزنید" : (err?.message || "خطا"),
        variant: "destructive",
      });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load, refreshKey]);

  // آمار
  const stats = useMemo(() => {
    const acsr = data.filter(c => (c.type || "ACSR") === "ACSR").length;
    const bs = data.filter(c => standardFa[c.standard || ""]?.includes("انگلیس")).length;
    const astm = data.filter(c => c.standard === "ASTM").length;
    return { total: data.length, acsr, bs, astm };
  }, [data]);

  const columns: DataTableColumn<Conductor>[] = [
    {
      key: "name", header: "نام سیم", sortable: true, filterable: true, align: "right",
      // v3.5.5: عرض بیشتر — نام ترکیبی «پارتریج (Partridge)» جا داشته باشد
      width: "240px",
      // v3.5.3: نمایش «لینکس (Lynx)» — جستجو روی name_display (هر دو نام) انجام می‌شود
      render: (r) => <span className="font-bold text-indigo-700">{r.name_display || conductorDisplayName(r.name)}</span>,
    },
    {
      key: "type", header: "نوع هادی", sortable: true, filterable: true, align: "right",
      badgeLabels: { ACSR: "ACSR" },
      badgeColors: { ACSR: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100" },
      type: "badge",
    },
    {
      key: "standard", header: "استاندارد", sortable: true, filterable: true, align: "right",
      render: (r) => <span className="text-slate-600">{fa(standardFa, r.standard)}</span>,
    },
    {
      key: "sectional_area_all", header: "سطح مقطع کل (mm²)", sortable: true, type: "number", align: "right",
      render: (r) => <span className="nums-fa">{num(r.sectional_area_all)}</span>,
    },
    {
      key: "overall_diameter_all", header: "قطر کل (mm)", sortable: true, type: "number", align: "right",
      render: (r) => <span className="nums-fa">{num(r.overall_diameter_all, 2)}</span>,
    },
    {
      key: "stranding", header: "رشته‌بندی (رو/داخل)", align: "right",
      render: (r) => <span className="nums-fa text-xs" dir="ltr">{r.stranding_outer || "—"} / {r.stranding_inner || "—"}</span>,
    },
    {
      key: "weight_all", header: "وزن کل (kg/km)", sortable: true, type: "number", align: "right",
      render: (r) => <span className="nums-fa">{num(r.weight_all)}</span>,
    },
    {
      key: "ultimate_strength", header: "تنش نهایی (kg)", sortable: true, type: "number", align: "right",
      render: (r) => <span className="nums-fa">{num(r.ultimate_strength)}</span>,
    },
    {
      key: "resistance", header: "مقاومت (Ω/km)", sortable: true, type: "number", align: "right",
      render: (r) => <span className="nums-fa" dir="ltr">{r.resistance == null ? "—" : Number(r.resistance).toFixed(4)}</span>,
    },
    {
      key: "materials", header: "ماده (رو/داخل)", align: "right",
      render: (r) => <span className="text-xs">{fa(materialFa, r.material_outer)} / {fa(materialFa, r.material_inner)}</span>,
    },
  ];

  // headerMap فارسی→انگلیسی برای import — سرستون‌های انگلیسی اکسل مستقیم map می‌شوند
  const importHeaderMap: Record<string, string> = {
    "نام سیم": "name",
    "نوع هادی": "type",
    "استاندارد": "standard",
    // v3.5.1: سرستون قالب خود برنامه «استاندارد (BS/ASTM)» است — قبلاً map نمی‌شد
    // و ستون استاندارد هنگام import قالب خودی بی‌صدا حذف می‌شد
    "استاندارد (BS/ASTM)": "standard",
    "استاندارد (BS / ASTM)": "standard",
    "نوع هسته": "core_type",
    "ماده رو": "material_outer",
    "ماده داخل": "material_inner",
    // v3.5.3: «رشته‌بندی» به‌جای «تاوده» — کلیدهای قدیمی برای فایل‌های قبلی حفظ شدند
    "رشته‌بندی رو": "stranding_outer",
    "رشته‌بندی داخل": "stranding_inner",
    "تاوده رو": "stranding_outer",
    "تاوده داخل": "stranding_inner",
    "سطح مقطع رو": "sectional_area_outer",
    "سطح مقطع کل": "sectional_area_all",
    "قطر کل": "overall_diameter_all",
    "قطر داخل": "overall_diameter_inner",
    "کد قطر کل": "diameter_code_all",
    "کد قطر داخل": "diameter_code_inner",
    "وزن کل": "weight_all",
    "وزن داخل": "weight_inner",
    "وزن رو": "weight_outer",
    "تنش نهایی": "ultimate_strength",
    "مقاومت": "resistance",
    // سرستون‌های انگلیسی خود فایل استاندارد
    ID: "id", Standard: "standard", Type: "type", "Type Code": "type_code", "Core Type": "core_type",
    "Conductor Name": "name", "Material Outer": "material_outer", "Material Inner": "material_inner",
    "Stranding Area Outer": "stranding_outer", "Stranding Area Inner": "stranding_inner",
    "Sectional Area Outer": "sectional_area_outer", "Sectional Area All": "sectional_area_all",
    "Overal Diameter All": "overall_diameter_all", "Overal Diameter Inner": "overall_diameter_inner",
    "Diameter Code All": "diameter_code_all", "Diameter Code Inner": "diameter_code_inner",
    "Weight All": "weight_all", "Weight Inner": "weight_inner", "Weight Outer": "weight_outer",
    "Ultimate Strength": "ultimate_strength", "Resistance": "resistance",
  };
  const templateColumns = [
    { key: "name", header: "نام سیم" },
    { key: "standard", header: "استاندارد (BS/ASTM)" },
    { key: "sectional_area_all", header: "سطح مقطع کل" },
    { key: "overall_diameter_all", header: "قطر کل" },
    { key: "ultimate_strength", header: "تنش نهایی" },
    { key: "resistance", header: "مقاومت" },
  ];

  const handleCopy = useCallback((rows: Conductor[]) => {
    if (rows.length === 0) { toast({ title: "هیچ ردیفی انتخاب نشده" }); return; }
    toast({ title: "کپی شد", description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV کپی شد` });
  }, [toast]);

  const handleDuplicate = useCallback((row: Conductor) => {
    setEditRow(null);
    setDuplicateFrom(row);
    setShowCreate(true);
  }, []);

  const handleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    if (mode === "update" && existingId) {
      await apiClient.put(`${API_ENDPOINTS.conductors}/${existingId}`, row);
    } else {
      await apiClient.post(API_ENDPOINTS.conductors, row);
    }
  };

  const handleImportBatch = async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const rows = items.map(it => it.row);
    const res = await apiClient.post<any>("conductors/bulk-import", { rows }, { timeoutMs: 60_000 });
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
      {/* نوار آمار */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hover">
        {[
          { label: "کل سیم‌ها", value: stats.total, icon: <Cable className="w-5 h-5 text-white" />, ic: "from-indigo-500 to-indigo-600", cc: "from-indigo-50 via-white to-indigo-100/60" },
          { label: "ACSR", value: stats.acsr, icon: <Layers className="w-5 h-5 text-white" />, ic: "from-purple-500 to-purple-600", cc: "from-purple-50 via-white to-purple-100/60" },
          { label: "استاندارد BS", value: stats.bs, icon: <Gauge className="w-5 h-5 text-white" />, ic: "from-blue-500 to-blue-600", cc: "from-blue-50 via-white to-blue-100/60" },
          { label: "استاندارد ASTM", value: stats.astm, icon: <Gauge className="w-5 h-5 text-white" />, ic: "from-green-500 to-green-600", cc: "from-green-50 via-white to-green-100/60" },
        ].map(c => (
          <div key={c.label} className={`flex items-center gap-3 shrink-0 w-[200px] h-[96px] rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-l ${c.cc} p-3 shadow-sm hover:shadow-md transition-shadow`}>
            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${c.ic} flex items-center justify-center shadow-md shrink-0`}>{c.icon}</div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 truncate">{c.label}</div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100 nums-fa">{c.value.toLocaleString("fa-IR")}</div>
            </div>
          </div>
        ))}
      </div>

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchKeys={["name", "name_display", "standard", "type"]}
        title="انواع سیم‌ها"
        layoutKey="conductors"
        tableRef={tableRef}
        onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onEdit={(row) => { setDuplicateFrom(null); setEditRow(row); }}
        onDuplicate={handleDuplicate}
        onCopy={handleCopy}
        onDelete={bulkDelete.requestDelete}
        onImport={() => setShowImport(true)}
        toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.conductors} entityName="سیم" onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus />}
      />

      <ConductorDialog
        open={showCreate || editRow !== null}
        editRow={editRow}
        duplicateFrom={duplicateFrom}
        onClose={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); }}
        onSaved={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); setRefreshKey(k => k + 1); }}
      />

      <ImportExcelDialog
        open={showImport}
        onClose={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
        onImportRow={handleImportRow}
        onImportBatch={handleImportBatch}
        getExistingRows={async () => data as any}
        defaultUniqueKey="name"
        uniqueKeyOptions={[{ value: "name", label: "نام سیم" }]}
        entityName="سیم"
        headerMap={importHeaderMap}
        templateColumns={templateColumns}
      />

      <BulkDeleteDialog
        open={bulkDelete.pendingRows !== null}
        rowsCount={bulkDelete.pendingRows?.length ?? 0}
        entityName="سیم"
        description={(bulkDelete.pendingRows?.length ?? 0) === 1
          ? `سیم «${bulkDelete.pendingRows?.[0].name}» به‌طور کامل حذف می‌شود. خطوطی که از آن استفاده می‌کنند فقط متن سیم را نگه می‌دارند.`
          : `${(bulkDelete.pendingRows?.length ?? 0).toLocaleString("fa-IR")} سیم انتخاب‌شده حذف می‌شوند. این عمل قابل بازگشت نیست.`}
        isDeleting={bulkDelete.isDeleting}
        progress={bulkDelete.deleteProgress}
        onCancel={bulkDelete.cancelDelete}
        onConfirm={bulkDelete.confirmDelete}
      />
    </div>
  );
}

/** دیالوگ ایجاد/ویرایش/کپی سیم — فیلدهای اصلی با برچسب فارسی */
function ConductorDialog({ open, editRow, duplicateFrom, onClose, onSaved }: {
  open: boolean;
  editRow: Conductor | null;
  duplicateFrom: Conductor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRow = editRow || duplicateFrom;
  const isDup = !editRow && !!duplicateFrom;

  const [form, setForm] = useState({
    name: "", type: "ACSR", type_code: "ACSR", standard: "", core_type: "GS",
    material_outer: "Alum.", material_inner: "Steel",
    stranding_outer: "", stranding_inner: "",
    sectional_area_outer: "", sectional_area_all: "",
    overall_diameter_all: "", overall_diameter_inner: "",
    diameter_code_all: "", diameter_code_inner: "",
    weight_all: "", weight_inner: "", weight_outer: "",
    ultimate_strength: "", resistance: "",
  });

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        name: isDup ? "" : (sourceRow?.name || ""),
        type: sourceRow?.type || "ACSR",
        type_code: sourceRow?.type_code || "ACSR",
        standard: sourceRow?.standard || "",
        core_type: sourceRow?.core_type || "GS",
        material_outer: sourceRow?.material_outer || "Alum.",
        material_inner: sourceRow?.material_inner || "Steel",
        stranding_outer: sourceRow?.stranding_outer || "",
        stranding_inner: sourceRow?.stranding_inner || "",
        sectional_area_outer: sourceRow?.sectional_area_outer != null ? String(sourceRow.sectional_area_outer) : "",
        sectional_area_all: sourceRow?.sectional_area_all != null ? String(sourceRow.sectional_area_all) : "",
        overall_diameter_all: sourceRow?.overall_diameter_all != null ? String(sourceRow.overall_diameter_all) : "",
        overall_diameter_inner: sourceRow?.overall_diameter_inner != null ? String(sourceRow.overall_diameter_inner) : "",
        diameter_code_all: sourceRow?.diameter_code_all || "",
        diameter_code_inner: sourceRow?.diameter_code_inner || "",
        weight_all: sourceRow?.weight_all != null ? String(sourceRow.weight_all) : "",
        weight_inner: sourceRow?.weight_inner != null ? String(sourceRow.weight_inner) : "",
        weight_outer: sourceRow?.weight_outer != null ? String(sourceRow.weight_outer) : "",
        ultimate_strength: sourceRow?.ultimate_strength != null ? String(sourceRow.ultimate_strength) : "",
        resistance: sourceRow?.resistance != null ? String(sourceRow.resistance) : "",
      });
    }
  }, [open, sourceRow, isDup]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const strOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("نام سیم الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type, type_code: form.type_code,
        standard: strOrNull(form.standard), core_type: form.core_type,
        material_outer: form.material_outer, material_inner: form.material_inner,
        stranding_outer: strOrNull(form.stranding_outer), stranding_inner: strOrNull(form.stranding_inner),
        sectional_area_outer: numOrNull(form.sectional_area_outer),
        sectional_area_all: numOrNull(form.sectional_area_all),
        overall_diameter_all: numOrNull(form.overall_diameter_all),
        overall_diameter_inner: numOrNull(form.overall_diameter_inner),
        diameter_code_all: strOrNull(form.diameter_code_all),
        diameter_code_inner: strOrNull(form.diameter_code_inner),
        weight_all: numOrNull(form.weight_all), weight_inner: numOrNull(form.weight_inner),
        weight_outer: numOrNull(form.weight_outer),
        ultimate_strength: numOrNull(form.ultimate_strength),
        resistance: numOrNull(form.resistance),
      };
      if (editRow) await apiClient.put(`${API_ENDPOINTS.conductors}/${editRow.id}`, payload);
      else await apiClient.post(API_ENDPOINTS.conductors, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            {editRow ? `ویرایش سیم: ${conductorDisplayName(editRow.name)}` : isDup ? `کپی سیم جدید (از: ${conductorDisplayName(duplicateFrom?.name)})` : "ثبت سیم جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <FormSection title="مشخصات سیم">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">نام سیم (اجباری)</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="مثلاً Lynx" dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">استاندارد</Label>
              <SearchableSelect value={form.standard} onChange={v => set("standard", v)} options={STD_OPTIONS} placeholder="انتخاب..." allowClear />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">نوع هادی</Label>
              <Input value={form.type} onChange={e => set("type", e.target.value)} dir="ltr" className="text-left" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">سطح مقطع کل (mm²)</Label>
              <Input type="number" step="0.01" value={form.sectional_area_all} onChange={e => set("sectional_area_all", e.target.value)} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">قطر کل (mm)</Label>
              <Input type="number" step="0.01" value={form.overall_diameter_all} onChange={e => set("overall_diameter_all", e.target.value)} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">تنش نهایی (kg)</Label>
              <Input type="number" step="0.1" value={form.ultimate_strength} onChange={e => set("ultimate_strength", e.target.value)} dir="ltr" className="text-left" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">وزن کل (kg/km)</Label>
              <Input type="number" step="0.1" value={form.weight_all} onChange={e => set("weight_all", e.target.value)} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">مقاومت (Ω/km)</Label>
              <Input type="number" step="0.0001" value={form.resistance} onChange={e => set("resistance", e.target.value)} dir="ltr" className="text-left" />
            </div>
          </div>

          {/* v3.5.4: رشته‌بندی به خط جدید تمام‌عرض منتقل شد — قبلاً دو فیلد کوچک در یک‌سوم عرض بود */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">رشته‌بندی رو — لایه بیرونی (آلومینیوم)</Label>
              <Input value={form.stranding_outer} onChange={e => set("stranding_outer", e.target.value)} placeholder="مثلاً 30/2.79 (تعداد رشته/قطر هر رشته به mm)" title="تعداد رشته/قطر هر رشته (mm)" dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">رشته‌بندی داخل — هسته (فولاد)</Label>
              <Input value={form.stranding_inner} onChange={e => set("stranding_inner", e.target.value)} placeholder="مثلاً 7/2.79 (تعداد رشته/قطر هر رشته به mm)" title="تعداد رشته/قطر هر رشته (mm)" dir="ltr" className="text-left" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">ماده رو</Label>
              <SearchableSelect value={form.material_outer} onChange={v => set("material_outer", v || "Alum.")} options={MAT_OPTIONS} />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">ماده داخل</Label>
              <SearchableSelect value={form.material_inner} onChange={v => set("material_inner", v || "Steel")} options={MAT_OPTIONS} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : editRow ? "اعمال ویرایش" : "ثبت سیم"}
            </Button>
          </DialogFooter>
          </FormSection>
        </form>
      </DialogContent>
    </Dialog>
  );
}
