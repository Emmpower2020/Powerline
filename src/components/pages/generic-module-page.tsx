"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Upload as UploadIcon } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { CreateContractDialog, CreateSafetyDialog, CreatePersonnelDialog, CreateContractorDialog, CreateEquipmentDialog } from "@/components/create-dialogs";
import type { PaginatedResponse } from "@/lib/types";

interface GenericItem { id: number; [key: string]: unknown }

type GenericConfig = {
  title: string;
  columns: DataTableColumn<GenericItem>[];
  create?: "contract" | "safety" | "personnel" | "contractor" | "equipment";
  editKeys?: string[];
  importKeys?: string[];
};

const configs: Record<string, GenericConfig> = {
  contracts: { title: "قراردادها", create: "contract", editKeys: ["title","contractor_id","contract_type","start_date","end_date","amount","status","notes"], importKeys: ["contract_code","title","contractor_id","contract_type","start_date","end_date","amount","status","notes"], columns: [
    { key: "contract_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },
    { key: "amount", header: "مبلغ (ریال)", sortable: true, type: "number" },
    { key: "start_date", header: "شروع", type: "date" }, { key: "end_date", header: "پایان", type: "date" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { draft: "پیش‌نویس", active: "فعال", expired: "منقضی", completed: "تکمیل" }, badgeColors: { draft: "bg-slate-100 text-slate-700", active: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700", completed: "bg-blue-100 text-blue-700" } },
  ]},
  invoices: { title: "صورت‌وضعیت‌ها", editKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], importKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], columns: [
    { key: "invoice_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },
    { key: "period_start", header: "از", type: "date" }, { key: "period_end", header: "تا", type: "date" },
    { key: "final_amount", header: "مبلغ نهایی", sortable: true, type: "number" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { draft: "پیش‌نویس", submitted: "ارسال", approved: "تأیید", paid: "پرداخت", rejected: "رد" }, badgeColors: { draft: "bg-slate-100 text-slate-700", submitted: "bg-blue-100 text-blue-700", approved: "bg-indigo-100 text-indigo-700", paid: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" } },
  ]},
  "safety-incidents": { title: "حوادث ایمنی", create: "safety", editKeys: ["title","incident_type","severity","description","location_desc","occurred_at","status"], importKeys: ["title","incident_type","severity","description","location_desc","occurred_at"], columns: [
    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "incident_type", header: "نوع", type: "badge", badgeLabels: { accident: "حادثه", near_miss: "Near Miss", unsafe_act: "ناایمن", unsafe_condition: "شرایط ناایمن", environmental: "محیط زیست" }, badgeColors: { accident: "bg-red-100 text-red-700", near_miss: "bg-amber-100 text-amber-700", unsafe_act: "bg-orange-100 text-orange-700" } },
    { key: "severity", header: "شدت", type: "badge", badgeLabels: { none: "بدون آسیب", minor: "جزئی", moderate: "متوسط", serious: "جدی", fatal: "مرگبار" }, badgeColors: { none: "bg-slate-100 text-slate-500", minor: "bg-yellow-100 text-yellow-700", moderate: "bg-orange-100 text-orange-700", serious: "bg-red-100 text-red-700" } },
    { key: "occurred_at", header: "تاریخ", type: "date" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { reported: "گزارش شده", under_investigation: "در حال بررسی", resolved: "حل شده", closed: "بسته شده" }, badgeColors: { reported: "bg-blue-100 text-blue-700", resolved: "bg-green-100 text-green-700", closed: "bg-slate-100 text-slate-500" } },
  ]},
  "line-incidents": { title: "حوادث خطوط", create: "safety", editKeys: ["title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id","status"], importKeys: ["title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id"], columns: [
    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "line_code", header: "خط", sortable: true, filterable: true },
    { key: "tower_code", header: "دکل", sortable: true, filterable: true },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "incident_type", header: "نوع", type: "badge", badgeLabels: { accident: "حادثه", near_miss: "Near Miss", unsafe_act: "ناایمن", unsafe_condition: "شرایط ناایمن", environmental: "محیط زیست" }, badgeColors: { accident: "bg-red-100 text-red-700", near_miss: "bg-amber-100 text-amber-700", unsafe_act: "bg-orange-100 text-orange-700" } },
    { key: "severity", header: "شدت", type: "badge", badgeLabels: { none: "بدون آسیب", minor: "جزئی", moderate: "متوسط", serious: "جدی", fatal: "مرگبار" }, badgeColors: { none: "bg-slate-100 text-slate-500", minor: "bg-yellow-100 text-yellow-700", moderate: "bg-orange-100 text-orange-700", serious: "bg-red-100 text-red-700" } },
    { key: "occurred_at", header: "تاریخ", type: "date", sortable: true },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { reported: "گزارش شده", under_investigation: "در حال بررسی", resolved: "حل شده", closed: "بسته شده" }, badgeColors: { reported: "bg-blue-100 text-blue-700", resolved: "bg-green-100 text-green-700", closed: "bg-slate-100 text-slate-500" } },
  ]},
  personnel: { title: "پرسنل", create: "personnel", editKeys: ["first_name","last_name","personnel_type","position","phone","mobile","email"], importKeys: ["first_name","last_name","personnel_type","position","phone","mobile","email"], columns: [
    { key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "first_name", header: "نام", sortable: true, filterable: true },
    { key: "last_name", header: "نام خانوادگی", sortable: true, filterable: true },
    { key: "personnel_type", header: "نوع", type: "badge", badgeLabels: { employee: "کارمند", contractor: "پیمانکار", operator: "اپراتور", guard: "نگهبان", manager: "مدیر", line_expert: "کارشناس خط", safety_expert: "کارشناس ایمنی", crew_supervisor: "سرپرست", lineman: "سیمبان", driver: "راننده" }, badgeColors: { employee: "bg-blue-100 text-blue-700", contractor: "bg-amber-100 text-amber-700", operator: "bg-purple-100 text-purple-700" } },
    { key: "position", header: "سمت", sortable: true, filterable: true },
    { key: "mobile", header: "موبایل", align: "left" },
  ]},
  contractors: { title: "پیمانکاران", create: "contractor", editKeys: ["name","contact_person","phone","mobile","email","address","bank_account","is_active"], importKeys: ["name","contact_person","phone","mobile","email","address","bank_account"], columns: [
    { key: "contractor_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "name", header: "نام", sortable: true, filterable: true },
    { key: "contact_person", header: "مسئول", sortable: true, filterable: true },
    { key: "phone", header: "تلفن", align: "left" }, { key: "mobile", header: "موبایل", align: "left" },
    { key: "is_active", header: "وضعیت", type: "boolean" },
  ]},
  equipment: { title: "تجهیزات", create: "equipment", editKeys: ["serial_number","manufacturer","model","install_date","warranty_expiry","is_active"], importKeys: ["serial_number","manufacturer","model","install_date","warranty_expiry"], columns: [
    { key: "serial_number", header: "سریال", sortable: true, filterable: true, align: "left" },
    { key: "manufacturer", header: "سازنده", sortable: true, filterable: true },
    { key: "model", header: "مدل" }, { key: "class_name", header: "گروه" },
    { key: "tower_code", header: "دکل" }, { key: "is_active", header: "وضعیت", type: "boolean" },
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
    { key: "code", header: "کد", align: "left" }, { key: "name", header: "نام", sortable: true, filterable: true },
    { key: "org_type", header: "نوع", type: "badge", badgeLabels: { company: "شرکت", region: "منطقه", management: "مدیریت", unit: "واحد" }, badgeColors: { company: "bg-indigo-100 text-indigo-700", region: "bg-blue-100 text-blue-700", management: "bg-purple-100 text-purple-700", unit: "bg-slate-100 text-slate-700" } },
    { key: "phone", header: "تلفن", align: "left" },
  ]},
};

function EditorDialog({
  open, row, keys, title, mode, endpoint, onClose, onSaved,
}: { open: boolean; row: GenericItem | null; keys: string[]; title: string; mode: "edit" | "create"; endpoint: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    keys.forEach(k => { init[k] = row?.[k] == null ? "" : String(row[k]); });
    setForm(init); setError(null);
  }, [open, row, keys]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const payload: Record<string, unknown> = {};
      keys.forEach(k => {
        const v = form[k] ?? "";
        if (["amount","total_amount","contract_id","contractor_id","line_id","tower_id"].includes(k)) payload[k] = v === "" ? null : Number(v);
        else if (k === "is_active" || k === "outage_required") payload[k] = v === "1" || v === "true" || v === "بله";
        else payload[k] = v === "" ? null : v;
      });
      if (mode === "edit" && row) await apiClient.put(`${endpoint}/${row.id}`, payload);
      else await apiClient.post(endpoint, payload);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "خطا در ذخیره اطلاعات"); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={v => !v && onClose()}>
    <DialogContent className="max-w-2xl" dir="rtl">
      <DialogHeader><DialogTitle className="text-right">{mode === "edit" ? `ویرایش ${title}` : `ثبت ${title} جدید`}</DialogTitle></DialogHeader>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
          {keys.map(k => <div key={k} className="space-y-1">
            <label className="text-sm text-slate-600">{k}</label>
            {k === "notes" || k === "description" || k === "address" ? <Textarea value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} /> : <Input value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} dir={/(_id|amount|phone|mobile)/.test(k) ? "ltr" : "rtl"} />}
          </div>)}
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [editor, setEditor] = useState<{open: boolean; mode: "edit"|"create"; row: GenericItem|null}>({open:false,mode:"edit",row:null});
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const importRows = async (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const payload: Record<string, unknown> = {};
      for (const [rawKey, value] of Object.entries(row)) {
        const key = config.importKeys?.includes(rawKey) ? rawKey : headers[rawKey] || rawKey;
        if (config.importKeys?.includes(key) || (!config.importKeys && selectedKeys.includes(key))) payload[key] = value;
      }
      try { await apiClient.post(endpoint, payload); } catch (e) { console.error("خطای import", e, payload); }
    }
    setRefreshKey(k => k + 1);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      await importRows(rows);
    } catch (err) { console.error("خطا در import اکسل", err); }
    finally { e.target.value = ""; }
  };

  const deleteRows = async (rows: GenericItem[]) => {
    if (!rows.length) return;
    const ok = typeof window !== "undefined" && window.confirm(`آیا ${rows.length.toLocaleString("fa-IR")} ردیف حذف شود؟`);
    if (!ok) return;
    for (const row of rows) { try { await apiClient.delete(`${endpoint}/${row.id}`); } catch (e) { console.error(e); } }
    setRefreshKey(k => k + 1);
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
    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileImport} />
    <DataTable data={data} columns={config.columns} loading={loading}
      searchKeys={config.columns.map(c => c.key)} title={config.title}
      layoutKey={moduleKey}
      onAdd={config.create ? () => setShowCreate(true) : (moduleKey === "invoices" ? () => setEditor({open:true,mode:"create",row:null}) : undefined)}
      onRefresh={() => setRefreshKey(k => k + 1)}
      onEdit={selectedKeys.length ? (row) => setEditor({open:true,mode:"edit",row}) : undefined}
      onDuplicate={selectedKeys.length ? makeDuplicate : undefined}
      onCopy={() => {}}
      onDelete={deleteRows}
      onImport={() => inputRef.current?.click()}
      onLoadAllRows={async () => data}
    />
    {renderCreate()}
    <EditorDialog open={editor.open} row={editor.row} keys={selectedKeys} title={config.title} mode={editor.mode} endpoint={endpoint} onClose={() => setEditor({open:false,mode:editor.mode,row:null})} onSaved={() => { setEditor({open:false,mode:editor.mode,row:null}); setRefreshKey(k => k + 1); }} />
  </div>;
}
