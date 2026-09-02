"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ContractSelect } from "@/components/contract-select";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { useToast } from "@/hooks/use-toast";
import { useStatsVisible } from "@/hooks/use-stats-visible";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { logError } from "@/lib/error-log";
import { Loader2, Plus, HardHat, UserCog, Cog, Users, Car, Wrench } from "lucide-react";

/**
 * صفحه پرسنل — v3.0.0
 *
 * به‌جای GenericModulePage سابق، همین تجربه جدول خطوط/دکل‌ها را دارد:
 * سورت/فیلتر/جستجو + چیدمان ستون per-user + خروجی/چاپ + نوار آمار
 * (کل پرسنل، سرپرست اکیپ، کارشناس خط، سیمبان، سایر)
 *
 * سمت در فرم‌های خطوط/دکل‌ها به‌عنوان منبع تشخیص سرپرست و کارشناس خط استفاده می‌شود.
 */

interface Person {
  id: number;
  personnel_code?: string;
  contract_id?: number | null;
  first_name: string;
  last_name: string;
  national_id?: string | null;
  father_name?: string | null;
  position?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  supervisor_name?: string | null;
  collaboration_start?: string | null;
  status?: string;
}

export function PersonnelPage() {
  const { toast } = useToast();
  const showStats = useStatsVisible();
  const [data, setData] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Person | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Person | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tableRef = useRef<DataTableHandle | null>(null);

  // v3.2.0: حذف انبوه با همان روش دکل‌ها/خطوط — دسته‌های ۵۰۰تایی + پروگرس بار + پاک شدن خودکار انتخاب‌ها
  const bulkDelete = useBulkDelete<Person>({
    endpoint: "personnel/bulk-delete",
    entityName: "پرسنل",
    tableRef,
    refresh: () => setRefreshKey(k => k + 1),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.personnel, { page: 1, page_size: 500 });
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
        title: "خطا در بارگذاری پرسنل",
        message: err?.message || "خطای نامشخص",
        source: "pages/personnel",
        statusCode: err?.statusCode ?? null,
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load, refreshKey]);

  const columns: DataTableColumn<Person>[] = [
    { key: "personnel_code", header: "کد پرسنلی", sortable: true, filterable: true, align: "right" },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true, align: "right" },
    { key: "first_name", header: "نام", sortable: true, filterable: true, align: "right" },
    { key: "last_name", header: "نام خانوادگی", sortable: true, filterable: true, align: "right" },
    { key: "national_id", header: "کد ملی", align: "right" },
    { key: "father_name", header: "نام پدر", filterable: true, align: "right" },
    { key: "position", header: "سمت", sortable: true, filterable: true, align: "right" },
    { key: "mobile", header: "موبایل", align: "right" },
    { key: "supervisor_name", header: "سرپرست", filterable: true, align: "right" },
    { key: "collaboration_start", header: "شروع همکاری", align: "right" },
    { key: "status", header: "وضعیت", type: "status", align: "right" },
  ];

  // v3.1.0: کپی TSV — فقط اعلان (کپی توسط خود جدول انجام می‌شود)
  const handleCopy = useCallback((rows: Person[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
      return;
    }
    toast({
      title: "کپی شد",
      description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`,
    });
  }, [toast]);

  // v3.1.0: کپی پرسنل به‌عنوان جدید
  const handleDuplicate = useCallback((row: Person) => {
    setEditRow(null);
    setDuplicateFrom(row);
    setShowCreate(true);
  }, []);

  // v3.1.0: import پرسنل از اکسل
  const handleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    const payload = {
      first_name: row.first_name,
      last_name: row.last_name || "",
      national_id: row.national_id || null,
      father_name: row.father_name || null,
      position: row.position || null,
      phone: row.phone || null,
      mobile: row.mobile || null,
      email: row.email || null,
      supervisor_name: row.supervisor_name || null,
      collaboration_start: row.collaboration_start || null,
    };
    if (mode === "update" && existingId) {
      await apiClient.put(`${API_ENDPOINTS.personnel}/${existingId}`, payload);
    } else {
      await apiClient.post(API_ENDPOINTS.personnel, payload);
    }
  };

  const handleImportBatch = async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const rows = items.map(it => it.row);
    const res = await apiClient.post<any>("personnel/bulk-import", { rows }, { timeoutMs: 60_000 });
    const statuses: string[] = res?.statuses || [];
    const errors: Array<string | null> = res?.errors || [];
    return items.map((_, idx) => {
      const st = statuses[idx];
      if (st === "failed") return { status: "failed" as const, error: errors[idx] || res?.first_error || "خطای نامشخص" };
      return { status: st === "updated" ? "updated" as const : "inserted" as const };
    });
  };

  const importHeaderMap: Record<string, string> = {
    "کد ملی": "national_id",
    "نام": "first_name",
    "نام خانوادگی": "last_name",
    "نام پدر": "father_name",
    "پست": "position",
    "سمت": "position",
    "تاریخ شروع همکاری": "collaboration_start",
    "شماره همراه": "mobile",
    "موبایل": "mobile",
    "تلفن": "phone",
    "سرپرست": "supervisor_name",
  };
  const importTemplateColumns = [
    { key: "first_name", header: "نام" },
    { key: "last_name", header: "نام خانوادگی" },
    { key: "national_id", header: "کد ملی" },
    { key: "father_name", header: "نام پدر" },
    { key: "position", header: "سمت" },
    { key: "mobile", header: "شماره همراه" },
    { key: "supervisor_name", header: "سرپرست" },
    { key: "collaboration_start", header: "تاریخ شروع همکاری" },
  ];


  const byType = data.reduce<Record<string, number>>((acc, person) => {
    const position = (person.position || "").trim();
    const key = position === "سرپرست اکیپ"
      ? "crew_supervisor"
      : position === "کارشناس خط"
        ? "line_expert"
        : position === "سیمبان"
          ? "lineman"
          : "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {/* نوار آمار */}
      {showStats && <PersonnelStatsBar total={data.length} byType={byType} />}

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchKeys={["personnel_code", "first_name", "last_name", "position", "national_id", "supervisor_name"]}
        title="پرسنل"
        layoutKey="personnel"
        tableRef={tableRef}
        onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onEdit={(row) => { setDuplicateFrom(null); setEditRow(row); }}
        onDuplicate={handleDuplicate}
        onCopy={handleCopy}
        onDelete={bulkDelete.requestDelete}
        onImport={() => setShowImport(true)}
        toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.personnel} entityName="پرسنل" onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus />}
      />

      <PersonnelDialog
        open={showCreate || editRow !== null}
        editRow={editRow}
        duplicateFrom={duplicateFrom}
        onClose={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); }}
        onSaved={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); setRefreshKey(k => k + 1); }}
      />

      {/* v3.1.0: ورود انبوه پرسنل از اکسل — هماهنگ با ساختار Persons.xlsx */}
      <ImportExcelDialog
        open={showImport}
        onClose={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
        onImportRow={handleImportRow}
        onImportBatch={handleImportBatch}
        getExistingRows={async () => data as any}
        defaultUniqueKey="national_id"
        uniqueKeyOptions={[
          { value: "national_id", label: "کد ملی" },
          { value: "personnel_code", label: "کد پرسنلی" },
        ]}
        entityName="پرسنل"
        headerMap={importHeaderMap}
        templateColumns={importTemplateColumns}
      />

      {/* تأیید حذف انبوه با پروگرس بار — v3.2.0 */}
      <BulkDeleteDialog
        open={bulkDelete.pendingRows !== null}
        rowsCount={bulkDelete.pendingRows?.length ?? 0}
        entityName="پرسنل"
        description={(bulkDelete.pendingRows?.length ?? 0) === 1
          ? `«${bulkDelete.pendingRows?.[0].first_name} ${bulkDelete.pendingRows?.[0].last_name}» حذف می‌شود. اگر نام این فرد به‌عنوان سرپرست/کارشناس در خطوط ثبت شده باشد، از این پس در بررسی سلامت داده به‌عنوان مغایرت نشان داده می‌شود.`
          : `${(bulkDelete.pendingRows?.length ?? 0).toLocaleString("fa-IR")} پرسنل انتخاب‌شده حذف می‌شوند. عیوب ثبت‌شده توسط آن‌ها به یک پرسنل جانشین منتقل می‌شود. این عمل قابل بازگشت نیست.`}
        isDeleting={bulkDelete.isDeleting}
        progress={bulkDelete.deleteProgress}
        onCancel={bulkDelete.cancelDelete}
        onConfirm={bulkDelete.confirmDelete}
      />
    </div>
  );
}

/** نوار آمار پرسنل — کل + تفکیک سمت‌های کلیدی */
const PERSONNEL_TYPE_META: Record<string, { label: string; icon: ReactNode; iconClass: string; cardClass: string }> = {
  crew_supervisor: { label: "سرپرست اکیپ", icon: <UserCog className="w-5 h-5 text-white" />, iconClass: "from-amber-500 to-amber-600", cardClass: "from-amber-50 via-white to-amber-100/60" },
  line_expert: { label: "کارشناس خط", icon: <Cog className="w-5 h-5 text-white" />, iconClass: "from-blue-500 to-blue-600", cardClass: "from-blue-50 via-white to-blue-100/60" },
  lineman: { label: "سیمبان", icon: <Wrench className="w-5 h-5 text-white" />, iconClass: "from-emerald-500 to-emerald-600", cardClass: "from-emerald-50 via-white to-emerald-100/60" },
};

function PersonnelStatsBar({ total, byType }: { total: number; byType: Record<string, number> }) {
  const keyTypes = Object.keys(PERSONNEL_TYPE_META);
  const otherCount = Math.max(0, total - keyTypes.reduce((s, k) => s + (byType[k] || 0), 0));

  const cards = [
    {
      key: "total", label: "کل پرسنل", value: total.toLocaleString("fa-IR"),
      icon: <HardHat className="w-5 h-5 text-white" />, iconClass: "from-indigo-500 to-indigo-600",
      cardClass: "from-indigo-50 via-white to-indigo-100/60",
    },
    ...keyTypes.map(t => {
      const meta = PERSONNEL_TYPE_META[t];
      return {
        key: t, label: meta.label, value: (byType[t] || 0).toLocaleString("fa-IR"),
        icon: meta.icon, iconClass: meta.iconClass, cardClass: meta.cardClass,
      };
    }),
    {
      key: "other", label: "سایر", value: otherCount.toLocaleString("fa-IR"),
      icon: <Users className="w-5 h-5 text-white" />, iconClass: "from-slate-500 to-slate-600",
      cardClass: "from-slate-50 via-white to-slate-100/60",
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
            <div className="text-xl font-bold text-slate-800 dark:text-slate-100 nums-fa">{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** دیالوگ ایجاد/ویرایش پرسنل */
function PersonnelDialog({ open, editRow, duplicateFrom, onClose, onSaved }: {
  open: boolean;
  editRow: Person | null;
  duplicateFrom: Person | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", national_id: "", father_name: "",
    position: "", mobile: "", phone: "",
    supervisor_name: "", collaboration_start: "", contract_id: "",
  });

  // v3.1.0: حالت کپی — از ردیف مبدأ پیش‌پر می‌شود ولی کد ملی خالی است (رکورد جدید)
  const sourceRow = editRow || duplicateFrom;

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        first_name: sourceRow?.first_name || "",
        last_name: sourceRow?.last_name || "",
        national_id: duplicateFrom ? "" : (sourceRow?.national_id || ""),
        father_name: sourceRow?.father_name || "",
        position: sourceRow?.position || "",
        mobile: sourceRow?.mobile || "",
        phone: sourceRow?.phone || "",
        supervisor_name: sourceRow?.supervisor_name || "",
        collaboration_start: sourceRow?.collaboration_start || "",
        contract_id: sourceRow?.contract_id != null ? String(sourceRow.contract_id) : "",
      });
    }
  }, [open, sourceRow, duplicateFrom]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) { setError("نام الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        national_id: form.national_id.trim() || null,
        father_name: form.father_name.trim() || null,
        position: form.position.trim() || null,
        mobile: form.mobile.trim() || null,
        phone: form.phone.trim() || null,
        supervisor_name: form.supervisor_name.trim() || null,
        collaboration_start: form.collaboration_start.trim() || null,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
      };
      if (editRow) {
        await apiClient.put(`${API_ENDPOINTS.personnel}/${editRow.id}`, payload);
      } else {
        await apiClient.post(API_ENDPOINTS.personnel, payload);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            {editRow
              ? `ویرایش پرسنل: ${editRow.first_name} ${editRow.last_name}`
              : duplicateFrom
                ? `ثبت پرسنل جدید (کپی از: ${duplicateFrom.first_name} ${duplicateFrom.last_name})`
                : "ثبت پرسنل جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">نام (اجباری)</Label>
              <Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="text-right" autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">نام خانوادگی</Label>
              <Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="text-right" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">کد ملی</Label>
              <Input value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value.replace(/[^0-9]/g, "") })} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">نام پدر</Label>
              <Input value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} className="text-right" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">تاریخ شروع همکاری</Label>
              <Input value={form.collaboration_start} onChange={e => setForm({ ...form, collaboration_start: e.target.value })} placeholder="1404/02/01" dir="ltr" className="text-left" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">قرارداد</Label>
              <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">سمت</Label>
              <Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="text-right" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">موبایل</Label>
              <Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">تلفن</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">سرپرست</Label>
              <Input value={form.supervisor_name} onChange={e => setForm({ ...form, supervisor_name: e.target.value })} className="text-right" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : editRow ? "اعمال ویرایش" : "ثبت پرسنل"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
