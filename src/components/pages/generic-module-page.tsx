"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { ContractSelect } from "@/components/contract-select";
import { SearchableSelect } from "@/components/searchable-select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { CreateContractDialog, CreateSafetyDialog, CreatePersonnelDialog, CreateContractorDialog, CreateEquipmentDialog } from "@/components/create-dialogs";
import type { PaginatedResponse } from "@/lib/types";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog";
import { useToast } from "@/hooks/use-toast";
import { fromJalali, fromPersianNumber, looksLikeLegacyJalaliStoredAsGregorian, toJalali } from "@/lib/jalali";

interface GenericItem { id: number; [key: string]: unknown }

type GenericConfig = {
  title: string;
  columns: DataTableColumn<GenericItem>[];
  create?: "contract" | "safety" | "personnel" | "contractor" | "equipment";
  editKeys?: string[];
  importKeys?: string[];
  activityStatus?: boolean;
};

/**
 * v4.3.53: برچسب فارسی همهٔ فیلدهای ویرایش — دیگر نام انگلیسی فیلد دیتابیس
 * در فرم ویرایش ماژول‌های عمومی نمایش داده نمی‌شود.
 */
const FIELD_LABELS: Record<string, string> = {
  contract_id: "قرارداد", contractor_id: "پیمانکار", contract_type: "نوع قرارداد",
  contract_code: "کد قرارداد", title: "عنوان", start_date: "تاریخ شروع", end_date: "تاریخ پایان",
  amount: "مبلغ (ریال)", status: "وضعیت", notes: "یادداشت",
  first_name: "نام", last_name: "نام خانوادگی", personnel_type: "نوع پرسنل", position: "سمت",
  phone: "تلفن", mobile: "موبایل", email: "ایمیل", hire_date: "تاریخ استخدام",
  incident_type: "نوع حادثه", severity: "شدت", description: "توضیحات",
  location_desc: "محل وقوع", occurred_at: "تاریخ وقوع", line_id: "خط", tower_id: "دکل",
  period_start: "شروع دوره", period_end: "پایان دوره", total_amount: "مبلغ کل",
  serial_number: "شماره سریال", manufacturer: "سازنده", model: "مدل",
  install_date: "تاریخ نصب", warranty_expiry: "پایان گارانتی",
  contractor_code: "کد پیمانکار", contractor_name: "نام پیمانکار", ceo_name: "مدیرعامل",
  contractor_phone: "تلفن دفتر", address: "آدرس", father_name: "نام پدر",
  supervisor_name: "سرپرست", collaboration_start: "شروع همکاری",
};

/** فیلدهای تاریخ — ورودی به‌صورت متن شمسی با فرمت 1405/05/30 */
const DATE_FIELDS = new Set([
  "start_date", "end_date", "period_start", "period_end", "hire_date",
  "install_date", "warranty_expiry", "occurred_at", "collaboration_start",
]);

const JALALI_DATE_RE = /^\d{4}\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])$/;

/** تبدیل مقدار تاریخ DB (ISO) به متن شمسی برای نمایش در فرم */
const isoToJalaliText = (v: string): string => {
  if (!v) return "";
  // رکوردهای قدیمی که شمسی را مستقیم داخل DATE ذخیره کرده‌اند، همان مقدار شمسی را نشان بده.
  if (looksLikeLegacyJalaliStoredAsGregorian(v)) {
    const m = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  }
  return toJalali(v);
};
/** تبدیل متن شمسی کاربر به ISO برای ذخیره — در صورت فرمت نامعتبر null برمی‌گرداند */
const jalaliTextToIso = (v: string): string | null => {
  const norm = fromPersianNumber(v.trim()).replace(/-/g, "/");
  if (!JALALI_DATE_RE.test(norm)) return null;
  const iso = fromJalali(norm);
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso : null;
};

/** گزینه‌های Select برای فیلدهای شمارشی — بر اساس ماژول */
const STATUS_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  contracts: [
    { value: "draft", label: "پیش‌نویس" }, { value: "active", label: "فعال" },
    { value: "expired", label: "منقضی" }, { value: "completed", label: "تکمیل" },
  ],
  invoices: [
    { value: "draft", label: "پیش‌نویس" }, { value: "submitted", label: "ارسال" },
    { value: "approved", label: "تأیید" }, { value: "paid", label: "پرداخت" },
    { value: "rejected", label: "رد" },
  ],
  "safety-incidents": [
    { value: "reported", label: "گزارش شده" }, { value: "under_investigation", label: "در حال بررسی" },
    { value: "resolved", label: "حل شده" }, { value: "closed", label: "بسته شده" },
  ],
  "line-incidents": [
    { value: "reported", label: "گزارش شده" }, { value: "under_investigation", label: "در حال بررسی" },
    { value: "resolved", label: "حل شده" }, { value: "closed", label: "بسته شده" },
  ],
};

const CONTRACTOR_ID_SELECT_MODULES = new Set(["contracts", "invoices"]);

const configs: Record<string, GenericConfig> = {
  contracts: { title: "قراردادها", create: "contract", editKeys: ["title","contractor_id","contract_type","start_date","end_date","amount","status","notes"], importKeys: ["contract_code","title","contractor_id","contract_type","start_date","end_date","amount","status","notes"], columns: [
    { key: "contract_code", header: "کد قرارداد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "عنوان قرارداد", sortable: true, filterable: true },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },
    { key: "amount", header: "مبلغ (ریال)", sortable: true, type: "number" },
    { key: "start_date", header: "شروع قرارداد", type: "date" }, { key: "end_date", header: "پایان قرارداد", type: "date" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { draft: "پیش‌نویس", active: "فعال", expired: "منقضی", completed: "تکمیل" }, badgeColors: { draft: "bg-slate-100 text-slate-700", active: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700", completed: "bg-blue-100 text-blue-700" } },
  ]},
  invoices: { title: "صورت‌وضعیت‌ها", editKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], importKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], columns: [
    { key: "invoice_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },
    { key: "period_start", header: "از", type: "date" }, { key: "period_end", header: "تا", type: "date" },
    { key: "final_amount", header: "مبلغ نهایی", sortable: true, type: "number" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { draft: "پیش‌نویس", submitted: "ارسال", approved: "تأیید", paid: "پرداخت", rejected: "رد" }, badgeColors: { draft: "bg-slate-100 text-slate-700", submitted: "bg-blue-100 text-blue-700", approved: "bg-indigo-100 text-indigo-700", paid: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" } },
  ]},
  "safety-incidents": { title: "حوادث ایمنی", create: "safety", editKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at","status"], importKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at"], columns: [
    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "incident_type", header: "نوع", type: "badge", badgeLabels: { accident: "حادثه", near_miss: "Near Miss", unsafe_act: "ناایمن", unsafe_condition: "شرایط ناایمن", environmental: "محیط زیست" }, badgeColors: { accident: "bg-red-100 text-red-700", near_miss: "bg-amber-100 text-amber-700", unsafe_act: "bg-orange-100 text-orange-700" } },
    { key: "severity", header: "شدت", type: "badge", badgeLabels: { none: "بدون آسیب", minor: "جزئی", moderate: "متوسط", serious: "جدی", fatal: "مرگبار" }, badgeColors: { none: "bg-slate-100 text-slate-500", minor: "bg-yellow-100 text-yellow-700", moderate: "bg-orange-100 text-orange-700", serious: "bg-red-100 text-red-700" } },
    { key: "occurred_at", header: "تاریخ", type: "date" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { reported: "گزارش شده", under_investigation: "در حال بررسی", resolved: "حل شده", closed: "بسته شده" }, badgeColors: { reported: "bg-blue-100 text-blue-700", resolved: "bg-green-100 text-green-700", closed: "bg-slate-100 text-slate-500" } },
  ]},
  "line-incidents": { title: "حوادث خطوط", create: "safety", editKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id","status"], importKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id"], columns: [
    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "line_code", header: "خط", sortable: true, filterable: true },
    { key: "tower_code", header: "دکل", sortable: true, filterable: true },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "incident_type", header: "نوع", type: "badge", badgeLabels: { accident: "حادثه", near_miss: "Near Miss", unsafe_act: "ناایمن", unsafe_condition: "شرایط ناایمن", environmental: "محیط زیست" }, badgeColors: { accident: "bg-red-100 text-red-700", near_miss: "bg-amber-100 text-amber-700", unsafe_act: "bg-orange-100 text-orange-700" } },
    { key: "severity", header: "شدت", type: "badge", badgeLabels: { none: "بدون آسیب", minor: "جزئی", moderate: "متوسط", serious: "جدی", fatal: "مرگبار" }, badgeColors: { none: "bg-slate-100 text-slate-500", minor: "bg-yellow-100 text-yellow-700", moderate: "bg-orange-100 text-orange-700", serious: "bg-red-100 text-red-700" } },
    { key: "occurred_at", header: "تاریخ", type: "date", sortable: true },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { reported: "گزارش شده", under_investigation: "در حال بررسی", resolved: "حل شده", closed: "بسته شده" }, badgeColors: { reported: "bg-blue-100 text-blue-700", resolved: "bg-green-100 text-green-700", closed: "bg-slate-100 text-slate-500" } },
  ]},
  personnel: { title: "پرسنل", create: "personnel", activityStatus: true, editKeys: ["contract_id","first_name","last_name","personnel_type","position","phone","mobile","email","status"], importKeys: ["contract_id","first_name","last_name","personnel_type","position","phone","mobile","email","status"], columns: [
    { key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "first_name", header: "نام", sortable: true, filterable: true },
    { key: "last_name", header: "نام خانوادگی", sortable: true, filterable: true },
    { key: "personnel_type", header: "نوع", type: "badge", badgeLabels: { employee: "کارمند", contractor: "پیمانکار", operator: "اپراتور", guard: "نگهبان", manager: "مدیر", line_expert: "کارشناس خط", safety_expert: "کارشناس ایمنی", crew_supervisor: "سرپرست", lineman: "سیمبان", driver: "راننده" }, badgeColors: { employee: "bg-blue-100 text-blue-700", contractor: "bg-amber-100 text-amber-700", operator: "bg-purple-100 text-purple-700" } },
    { key: "position", header: "سمت", sortable: true, filterable: true },
    { key: "mobile", header: "موبایل", align: "left" },
  ]},
  contractors: { title: "پیمانکاران", create: "contractor", activityStatus: true, editKeys: ["contractor_code","contractor_name","ceo_name","contractor_phone","mobile","address","status"], importKeys: ["contractor_code","contractor_name","ceo_name","contractor_phone","mobile","address","status"], columns: [
    { key: "id", header: "ID", sortable: true, filterable: true, align: "left" },
    { key: "contractor_code", header: "کد پیمانکار", sortable: true, filterable: true, align: "left" },
    { key: "contractor_name", header: "نام پیمانکار", sortable: true, filterable: true, wrap: true },
    { key: "ceo_name", header: "مدیرعامل", sortable: true, filterable: true },
    { key: "contractor_phone", header: "تلفن", align: "left" },
    { key: "mobile", header: "موبایل", align: "left" },
    { key: "address", header: "آدرس", wrap: true },
    { key: "status", header: "وضعیت", type: "status" },
    { key: "created_at", header: "ایجاد", type: "date" },
    { key: "updated_at", header: "آخرین ویرایش", type: "date" },
  ]},
  equipment: { title: "تجهیزات", create: "equipment", activityStatus: true, editKeys: ["contract_id","serial_number","manufacturer","model","install_date","warranty_expiry","status"], importKeys: ["contract_id","serial_number","manufacturer","model","install_date","warranty_expiry"], columns: [
    { key: "serial_number", header: "سریال", sortable: true, filterable: true, align: "left" },
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "manufacturer", header: "سازنده", sortable: true, filterable: true },
    { key: "model", header: "مدل" }, { key: "class_name", header: "گروه" },
    { key: "tower_code", header: "دکل" }, { key: "status", header: "وضعیت", type: "status" },
  ]},
  "audit-log": { title: "لاگ ممیزی", columns: [
    { key: "username", header: "کاربر", sortable: true, filterable: true },
    { key: "action", header: "عملیات", sortable: true, filterable: true },
    { key: "entity_type", header: "موجودیت", sortable: true, filterable: true },
    { key: "entity_id", header: "شناسه", align: "left" },
    { key: "ip_address", header: "IP", align: "left" },
    { key: "created_at", header: "زمان", type: "date" },
  ]},
  organization: { title: "سازمان", columns: [
    { key: "id", header: "ID", sortable: true, filterable: true, align: "left" },
    { key: "code", header: "کد", align: "left" }, { key: "name", header: "نام", sortable: true, filterable: true },
    { key: "org_type", header: "نوع", type: "badge", badgeLabels: { company: "شرکت", region: "منطقه", management: "مدیریت", unit: "واحد" }, badgeColors: { company: "bg-indigo-100 text-indigo-700", region: "bg-blue-100 text-blue-700", management: "bg-purple-100 text-purple-700", unit: "bg-slate-100 text-slate-700" } },
    { key: "contractor_phone", header: "تلفن", align: "left" }, { key: "status", header: "وضعیت", type: "status" },
  ]},
};

function EditorDialog({
  open, row, keys, title, moduleKey, mode, endpoint, onClose, onSaved, activityStatus,
}: { open: boolean; row: GenericItem | null; keys: string[]; title: string; moduleKey: string; mode: "edit" | "create"; endpoint: string; onClose: () => void; onSaved: () => void; activityStatus?: boolean }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractors, setContractors] = useState<Array<{ id: number; contractor_name: string }>>([]);

  const needContractors = keys.includes("contractor_id") && CONTRACTOR_ID_SELECT_MODULES.has(moduleKey);
  useEffect(() => {
    if (open && needContractors) {
      apiClient.get<any>(API_ENDPOINTS.contractors, { page: 1, page_size: 1000 })
        .then((r) => setContractors((Array.isArray(r) ? r : (r?.data || [])).map((c: any) => ({ id: Number(c.id), contractor_name: c.contractor_name }))))
        .catch(() => setContractors([]));
    }
  }, [open, needContractors]);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    keys.forEach(k => {
      const raw = row?.[k];
      // تاریخ‌ها برای نمایش به شمسی تبدیل می‌شوند؛ کاربر متن شمسی وارد می‌کند
      init[k] = raw == null ? "" : (DATE_FIELDS.has(k) ? isoToJalaliText(String(raw)) : String(raw));
    });
    setForm(init); setError(null);
  }, [open, row, keys]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      // اعتبارسنجی فرمت تاریخ شمسی: 1405/05/30
      for (const k of keys) {
        if (DATE_FIELDS.has(k) && (form[k] ?? "").trim() !== "") {
          if (!jalaliTextToIso(form[k] ?? "")) {
            setError(`فرمت «${FIELD_LABELS[k] || k}» درست نیست — تاریخ می‌بایست با فرمت 1405/05/30 نوشته شود`);
            setSaving(false);
            return;
          }
        }
      }
      const payload: Record<string, unknown> = {};
      keys.forEach(k => {
        const v = form[k] ?? "";
        if (DATE_FIELDS.has(k)) { payload[k] = v.trim() === "" ? null : jalaliTextToIso(v); return; }
        if (["amount","total_amount","contract_id","contractor_id","line_id","tower_id"].includes(k)) payload[k] = v === "" ? null : Number(v);
        else if (k === "status") payload[k] = activityStatus ? (v || "active") : (v === "" ? null : v);
        else if (k === "outage_required") payload[k] = v === "1" || v === "true" || v === "بله";
        else payload[k] = v === "" ? null : v;
      });
      if (mode === "edit" && row) await apiClient.put(`${endpoint}/${row.id}`, payload);
      else await apiClient.post(endpoint, payload);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "خطا در ذخیره اطلاعات"); }
    finally { setSaving(false); }
  };

  const statusOptions = activityStatus
    ? [{ value: "active", label: "فعال" }, { value: "inactive", label: "غیرفعال" }]
    : (STATUS_OPTIONS[moduleKey] || null);

  const visibleKeys = moduleKey === "contracts"
    ? ["title", "contractor_id", "contract_type", "amount", "start_date", "end_date", "status", "notes"].filter(k => keys.includes(k))
    : keys;

  return <Dialog open={open} onOpenChange={v => !v && onClose()}>
    <DialogContent className="max-w-2xl" dir="rtl">
      <DialogHeader><DialogTitle className="text-right">{mode === "edit" ? `ویرایش ${title}` : `ثبت ${title} جدید`}</DialogTitle></DialogHeader>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
          {visibleKeys.map(k => {
            const label = FIELD_LABELS[k] || k;
            const isJalaliDate = DATE_FIELDS.has(k);
            return <div key={k} className="space-y-1">
              <label className="text-sm text-slate-600">{label}</label>
              {k === "contract_id" ? <ContractSelect value={form[k] || ""} onChange={v => setForm({...form, [k]: v})} />
              : k === "contractor_id" && needContractors ? (
                <SearchableSelect
                  value={form[k] || ""}
                  onChange={v => setForm({...form, [k]: v})}
                  options={contractors.map(c => ({ value: String(c.id), label: c.contractor_name }))}
                  placeholder="انتخاب پیمانکار..."
                  searchPlaceholder="جستجوی نام پیمانکار..."
                />
              )
              : k === "status" && statusOptions ? <Select value={form[k] || statusOptions[0].value} onValueChange={v => setForm({...form, [k]: v})}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
              : k === "contract_type" ? <Select value={form[k] || "maintenance"} onValueChange={v => setForm({...form, [k]: v})}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">نگهداری</SelectItem><SelectItem value="construction">ساخت</SelectItem><SelectItem value="inspection">بازدید</SelectItem></SelectContent></Select>
              : k === "incident_type" ? <Select value={form[k] || "near_miss"} onValueChange={v => setForm({...form, [k]: v})}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accident">حادثه</SelectItem><SelectItem value="near_miss">Near Miss</SelectItem><SelectItem value="unsafe_act">عمل ناایمن</SelectItem><SelectItem value="unsafe_condition">شرایط ناایمن</SelectItem><SelectItem value="environmental">محیط زیست</SelectItem></SelectContent></Select>
              : k === "severity" ? <Select value={form[k] || "none"} onValueChange={v => setForm({...form, [k]: v})}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بدون آسیب</SelectItem><SelectItem value="minor">جزئی</SelectItem><SelectItem value="moderate">متوسط</SelectItem><SelectItem value="serious">جدی</SelectItem><SelectItem value="fatal">مرگبار</SelectItem></SelectContent></Select>
              : k === "personnel_type" ? <Select value={form[k] || "employee"} onValueChange={v => setForm({...form, [k]: v})}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">کارمند</SelectItem><SelectItem value="contractor">پیمانکار</SelectItem><SelectItem value="operator">اپراتور</SelectItem><SelectItem value="guard">نگهبان</SelectItem><SelectItem value="manager">مدیر</SelectItem><SelectItem value="line_expert">کارشناس خط</SelectItem><SelectItem value="safety_expert">کارشناس ایمنی</SelectItem><SelectItem value="crew_supervisor">سرپرست</SelectItem><SelectItem value="lineman">سیمبان</SelectItem><SelectItem value="driver">راننده</SelectItem></SelectContent></Select>
              : k === "notes" || k === "description" || k === "address" ? <Textarea rows={1} value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} className="h-9 min-h-9 resize-none py-1.5" />
              : isJalaliDate ? (
                <div className="space-y-1">
                  <Input value={form[k] || ""} onChange={e => setForm({...form, [k]: e.target.value})} placeholder="1405/05/30" dir="ltr" className="text-left bg-white" />
                  <p className="text-[11px] text-slate-400">تاریخ می‌بایست با فرمت 1405/05/30 نوشته شود</p>
                </div>
              )
              : <Input value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} dir={/(_id|amount|phone|mobile|email)/.test(k) ? "ltr" : "rtl"} />}
            </div>;
          })}
        </div>
        {error && <p className="mt-3 text-sm text-red-600 whitespace-pre-line">{error}</p>}
        <DialogFooter className="mt-4 gap-2"><Button type="button" variant="outline" onClick={onClose}>انصراف</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "ذخیره"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function GenericModulePage({ moduleKey, endpoint }: { moduleKey: string; endpoint: string }) {
  const config = configs[moduleKey];
  const [data, setData] = useState<GenericItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editor, setEditor] = useState<{open: boolean; mode: "edit"|"create"; row: GenericItem|null}>({open:false,mode:"edit",row:null});
  // v4.3.53: حذف استاندارد با دیالوگ تأیید و نوار پیشرفت (به‌جای window.confirm)
  const [pendingDelete, setPendingDelete] = useState<GenericItem[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await apiClient.get<PaginatedResponse<GenericItem>>(endpoint, { page: 1, page_size: 500, search: search || undefined });
        setData(result?.data || []);
      } catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
    };
    const d = setTimeout(load, 250);
    return () => clearTimeout(d);
  }, [search, endpoint, refreshKey]);

  if (!config) return <div>ماژول پیدا نشد</div>;

  const selectedKeys = config.editKeys || config.columns.map(c => c.key).filter(k => k !== "id");
  const headers = Object.fromEntries(config.columns.map(c => [c.header, c.key]));
  const importKeys = config.importKeys || selectedKeys;

  // ── ورود استاندارد از اکسل (همان دیالوگ مدارها/خطوط) — v4.3.53 ──
  const headerMap = useMemo(() => Object.fromEntries(config.columns.map(c => [c.header, c.key])), [config]);
  const uniqueKeyOptions = useMemo(
    () => importKeys.filter(k => k !== "status" && k !== "notes").map(k => ({ value: k, label: FIELD_LABELS[k] || k })),
    [importKeys],
  );
  const defaultUniqueKey = config.importKeys?.[0] || uniqueKeyOptions[0]?.value || "id";
  const templateColumns = useMemo(
    () => importKeys.map(k => ({ key: k, header: FIELD_LABELS[k] || k })),
    [importKeys],
  );

  const handleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    const payload: Record<string, unknown> = {};
    for (const key of importKeys) {
      if (!(key in row)) continue;
      let v = row[key];
      // تاریخ شمسی اکسل به ISO تبدیل می‌شود
      if (DATE_FIELDS.has(key) && v != null && String(v).trim() !== "") {
        const iso = jalaliTextToIso(String(v));
        v = iso ?? v;
      }
      if (["amount","total_amount","contract_id","contractor_id","line_id","tower_id"].includes(key)) {
        payload[key] = (v === "" || v == null) ? null : Number(fromPersianNumber(String(v)));
      } else {
        payload[key] = (v === "" || v == null) ? null : v;
      }
    }
    if (mode === "update" && existingId) await apiClient.put(`${endpoint}/${existingId}`, payload);
    else await apiClient.post(endpoint, payload);
  };

  // ── حذف استاندارد: دیالوگ تأیید + حذف دسته‌ای موازی با نوار پیشرفت ──
  const confirmDelete = async () => {
    const rows = pendingDelete || [];
    if (!rows.length) return;
    setDeleting(true);
    setDeleteProgress({ done: 0, total: rows.length });
    const CHUNK = 10;
    let failed = 0;
    let firstError = "";
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const results = await Promise.allSettled(chunk.map(r => apiClient.delete(`${endpoint}/${r.id}`)));
      for (const r of results) {
        if (r.status === "rejected") {
          failed++;
          if (!firstError) firstError = (r.reason as any)?.message || "";
        }
      }
      setDeleteProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
    }
    setDeleting(false);
    setPendingDelete(null);
    setDeleteProgress(null);
    setRefreshKey(k => k + 1);
    toast({
      title: failed ? "حذف ناقص" : "حذف انجام شد",
      description: failed
        ? `${(rows.length - failed).toLocaleString("fa-IR")} ردیف حذف شد، ${failed.toLocaleString("fa-IR")} مورد ناموفق بود${firstError ? ` — دلیل: ${firstError}` : ""}`
        : `${rows.length.toLocaleString("fa-IR")} ردیف حذف شد`,
      variant: failed ? "destructive" : undefined,
    });
  };

  const makeDuplicate = (row: GenericItem) => {
    const copy: GenericItem = { ...row, id: -1 };
    setEditor({ open: true, mode: "create", row: copy });
  };

  const renderCreate = () => {
    const props = { open: showCreate, onClose: () => setShowCreate(false), onCreated: () => { setShowCreate(false); setRefreshKey(k => k + 1); } };
    switch (config.create) {
      case "contract": return <CreateContractDialog {...props} />;
      case "safety": return <CreateSafetyDialog {...props} />;
      case "personnel": return <CreatePersonnelDialog {...props} />;
      case "contractor": return <CreateContractorDialog {...props} />;
      case "equipment": return <CreateEquipmentDialog {...props} />;
      default: return null;
    }
  };

  return <div className="space-y-4">
    <DataTable data={data} columns={config.columns} loading={loading}
      searchKeys={config.columns.map(c => c.key)} title={config.title}
      layoutKey={moduleKey}
      onAdd={config.create ? () => setShowCreate(true) : (moduleKey === "invoices" ? () => setEditor({open:true,mode:"create",row:null}) : undefined)}
      onRefresh={() => setRefreshKey(k => k + 1)}
      onEdit={selectedKeys.length ? (row) => setEditor({open:true,mode:"edit",row}) : undefined}
      onDuplicate={selectedKeys.length ? makeDuplicate : undefined}
      onCopy={() => {}}
      onDelete={setPendingDelete}
      onImport={() => setShowImport(true)}
      onLoadAllRows={async () => {
        const result = await apiClient.get<PaginatedResponse<GenericItem>>(endpoint, { page: 1, page_size: 100000 });
        return result?.data || [];
      }}
      toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={endpoint} entityName={config.title.replace("ها","")} onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus={!!config.activityStatus} canChangeContract={!!config.editKeys?.includes("contract_id")} />}
    />
    {renderCreate()}
    <EditorDialog open={editor.open} row={editor.row} keys={selectedKeys} title={config.title} moduleKey={moduleKey} mode={editor.mode} endpoint={endpoint} activityStatus={!!config.activityStatus} onClose={() => setEditor({open:false,mode:editor.mode,row:null})} onSaved={() => { setEditor({open:false,mode:editor.mode,row:null}); setRefreshKey(k => k + 1); }} />

    {/* ورود انبوه استاندارد از اکسل — همان تجربه مدارها/خطوط */}
    <ImportExcelDialog
      open={showImport}
      onClose={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
      onImportRow={handleImportRow}
      getExistingRows={async () => {
        const result = await apiClient.get<PaginatedResponse<GenericItem>>(endpoint, { page: 1, page_size: 100000 });
        return (result?.data || []) as any;
      }}
      defaultUniqueKey={defaultUniqueKey}
      uniqueKeyOptions={uniqueKeyOptions}
      entityName={config.title.replace("ها","")}
      headerMap={headerMap}
      templateColumns={templateColumns}
    />

    {/* تأیید حذف استاندارد — وسط صفحه با نوار پیشرفت */}
    <BulkDeleteDialog
      open={pendingDelete !== null}
      rowsCount={pendingDelete?.length ?? 0}
      entityName={config.title.replace("ها","")}
      description={`${(pendingDelete?.length ?? 0).toLocaleString("fa-IR")} ${config.title.replace("ها","")} انتخاب‌شده به‌طور کامل حذف می‌شوند. این عمل قابل بازگشت نیست.`}
      isDeleting={deleting}
      progress={deleteProgress}
      onCancel={() => { if (!deleting) setPendingDelete(null); }}
      onConfirm={confirmDelete}
    />
  </div>;
}
