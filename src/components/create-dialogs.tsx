"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { ContractSelect } from "@/components/contract-select";

// قرارداد
export function CreateContractDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractors, setContractors] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", contractor_id: "", contract_type: "maintenance", start_date: "", end_date: "", amount: "", notes: "" });

  // v2.8.1: fetch با useEffect انجام می‌شود — قبلاً به‌اشتباه useState بود که فقط یک‌بار در mount اجرا می‌شد
  // contractors پاسخ صفحه‌بندی‌شده ({data, pagination}) برمی‌گرداند
  useEffect(() => {
    if (open) {
      apiClient.get<any>(API_ENDPOINTS.contractors, { page: 1, page_size: 100 })
        .then(r => setContractors(Array.isArray(r) ? r : (r?.data || [])))
        .catch(() => {});
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("عنوان قرارداد الزامی است"); return; }
    if (!form.contractor_id) { setError("انتخاب پیمانکار الزامی است"); return; }
    setSubmitting(true); setError(null);
    try { await apiClient.post(API_ENDPOINTS.contracts, { title: form.title, contractor_id: form.contractor_id ? Number(form.contractor_id) : null, contract_type: form.contract_type, start_date: form.start_date || null, end_date: form.end_date || null, amount: form.amount ? Number(form.amount) : 0, notes: form.notes || null }); setForm({ title: "", contractor_id: "", contract_type: "maintenance", start_date: "", end_date: "", amount: "", notes: "" }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };

  return (
    <Shell open={open} onClose={onClose} title="قرارداد جدید" submitting={submitting} error={error} onSubmit={submit}>
      <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="پیمانکار (اجباری)"><Select value={form.contractor_id} onValueChange={v => setForm({ ...form, contractor_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="انتخاب..." /></SelectTrigger><SelectContent className="max-h-60">{contractors.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.contractor_name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="نوع قرارداد"><Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">نگهداری</SelectItem><SelectItem value="construction">ساخت</SelectItem><SelectItem value="inspection">بازدید</SelectItem></SelectContent></Select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="تاریخ شروع"><JalaliDatePicker value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} /></Field>
        <Field label="تاریخ پایان"><JalaliDatePicker value={form.end_date} onChange={v => setForm({ ...form, end_date: v })} /></Field>
        <Field label="مبلغ (ریال)"><Input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })} dir="ltr" className="text-left" /></Field>
      </div>
      <Field label="توضیحات"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-right" /></Field>
    </Shell>
  );
}

// حادثه ایمنی
export function CreateSafetyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", incident_type: "near_miss", severity: "none", description: "", location_desc: "", occurred_at: "", contract_id: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { setError("عنوان الزامی است"); return; }
    setSubmitting(true); setError(null);
    try { await apiClient.post(API_ENDPOINTS.safetyIncidents, { title: form.title, incident_type: form.incident_type, severity: form.severity, description: form.description || null, location_desc: form.location_desc || null, occurred_at: form.occurred_at || null, contract_id: form.contract_id ? Number(form.contract_id) : null }); setForm({ title: "", incident_type: "near_miss", severity: "none", description: "", location_desc: "", occurred_at: "", contract_id: "" }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };

  return (
    <Shell open={open} onClose={onClose} title="ثبت حادثه ایمنی" submitting={submitting} error={error} onSubmit={submit}>
      <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نوع حادثه"><Select value={form.incident_type} onValueChange={v => setForm({ ...form, incident_type: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accident">حادثه</SelectItem><SelectItem value="near_miss">Near Miss</SelectItem><SelectItem value="unsafe_act">عمل ناایمن</SelectItem></SelectContent></Select></Field>
        <Field label="شدت"><Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بدون آسیب</SelectItem><SelectItem value="minor">جزئی</SelectItem><SelectItem value="serious">جدی</SelectItem></SelectContent></Select></Field>
      </div>
      <Field label="قرارداد"><ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} /></Field>
      <Field label="تاریخ و زمان"><JalaliDatePicker value={form.occurred_at} onChange={v => setForm({ ...form, occurred_at: v })} type="datetime" /></Field>
      <Field label="محل"><Input value={form.location_desc} onChange={e => setForm({ ...form, location_desc: e.target.value })} className="text-right" /></Field>
      <Field label="توضیحات"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="text-right" /></Field>
    </Shell>
  );
}

// پرسنل
export function CreatePersonnelDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", personnel_type: "employee", position: "", phone: "", mobile: "", email: "", hire_date: "", contract_id: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name) { setError("نام الزامی است"); return; }
    setSubmitting(true); setError(null);
    try { await apiClient.post(API_ENDPOINTS.personnel, { first_name: form.first_name, last_name: form.last_name, personnel_type: form.personnel_type, position: form.position || null, phone: form.phone || null, mobile: form.mobile || null, email: form.email || null, hire_date: form.hire_date || null, contract_id: form.contract_id ? Number(form.contract_id) : null }); setForm({ first_name: "", last_name: "", personnel_type: "employee", position: "", phone: "", mobile: "", email: "", hire_date: "", contract_id: "" }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };

  return (
    <Shell open={open} onClose={onClose} title="ثبت پرسنل جدید" submitting={submitting} error={error} onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نام (اجباری)"><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="text-right" /></Field>
        <Field label="نام خانوادگی"><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="text-right" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نوع پرسنل"><Select value={form.personnel_type} onValueChange={v => setForm({ ...form, personnel_type: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="employee">کارمند</SelectItem><SelectItem value="contractor">پیمانکار</SelectItem><SelectItem value="operator">اپراتور</SelectItem>
          <SelectItem value="guard">نگهبان</SelectItem><SelectItem value="manager">مدیر عامل شرکت</SelectItem><SelectItem value="line_expert">کارشناس خط</SelectItem>
          <SelectItem value="safety_expert">کارشناس ایمنی</SelectItem><SelectItem value="crew_supervisor">سرپرست اکیپ</SelectItem><SelectItem value="lineman">سیمبان</SelectItem><SelectItem value="driver">راننده</SelectItem>
        </SelectContent></Select></Field>
        <Field label="سمت"><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="text-right" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="تلفن"><Input value={form.contractor_phone} onChange={e => setForm({ ...form, contractor_phone: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="موبایل"><Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="تاریخ استخدام"><JalaliDatePicker value={form.hire_date} onChange={v => setForm({ ...form, hire_date: v })} /></Field>
      </div>
      <Field label="ایمیل"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-left" /></Field>
    </Shell>
  );
}

// پیمانکار
export function CreateContractorDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ contractor_code: "", contractor_name: "", ceo_name: "", contractor_phone: "", mobile: "", address: "", status: "active" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractor_name.trim()) { setError("نام پیمانکار الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.post(API_ENDPOINTS.contractors, { contractor_code: form.contractor_code.trim() || null, contractor_name: form.contractor_name.trim(), ceo_name: form.ceo_name.trim() || null, contractor_phone: form.contractor_phone.trim() || null, mobile: form.mobile.trim() || null, address: form.address.trim() || null, status: form.status });
      setForm({ contractor_code: "", contractor_name: "", ceo_name: "", contractor_phone: "", mobile: "", address: "", status: "active" }); onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="ثبت پیمانکار جدید" submitting={submitting} error={error} onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="کد پیمانکار"><Input value={form.contractor_code} onChange={e => setForm({ ...form, contractor_code: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="نام پیمانکار (اجباری)"><Input value={form.contractor_name} onChange={e => setForm({ ...form, contractor_name: e.target.value })} className="text-right" /></Field>
      </div>
      <Field label="مدیرعامل"><Input value={form.ceo_name} onChange={e => setForm({ ...form, ceo_name: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="تلفن"><Input value={form.contractor_phone} onChange={e => setForm({ ...form, contractor_phone: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="موبایل"><Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} dir="ltr" className="text-left" /></Field>
      </div>
      <Field label="آدرس"><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} className="text-right" /></Field>
      <Field label="وضعیت"><Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">فعال</SelectItem><SelectItem value="inactive">غیرفعال</SelectItem></SelectContent></Select></Field>
    </Shell>
  );
}

// تجهیز
export function CreateEquipmentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [form, setForm] = useState({ equipment_class_id: "", serial_number: "", manufacturer: "", model: "", install_date: "", contract_id: "" });

  // v2.8.1: fetch با useEffect انجام می‌شود — قبلاً به‌اشتباه useState بود که فقط یک‌بار در mount اجرا می‌شد
  // equipment-classes پاسخ آرایه ساده برمی‌گرداند
  useEffect(() => {
    if (open) {
      apiClient.get<any>(API_ENDPOINTS.equipmentClasses)
        .then(r => setClasses(Array.isArray(r) ? r : (r?.data || [])))
        .catch(() => {});
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipment_class_id) { setError("گروه تجهیز الزامی است"); return; }
    setSubmitting(true); setError(null);
    try { await apiClient.post(API_ENDPOINTS.equipment, { equipment_class_id: Number(form.equipment_class_id), serial_number: form.serial_number || null, manufacturer: form.manufacturer || null, model: form.model || null, install_date: form.install_date || null, contract_id: form.contract_id ? Number(form.contract_id) : null }); setForm({ equipment_class_id: "", serial_number: "", manufacturer: "", model: "", install_date: "", contract_id: "" }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };

  return (
    <Shell open={open} onClose={onClose} title="ثبت تجهیز جدید" submitting={submitting} error={error} onSubmit={submit}>
      <Field label="قرارداد"><ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} /></Field>
      <Field label="گروه تجهیز (اجباری)"><Select value={form.equipment_class_id} onValueChange={v => setForm({ ...form, equipment_class_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="انتخاب..." /></SelectTrigger><SelectContent className="max-h-60">{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="شماره سریال"><Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="سازنده"><Input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className="text-right" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="مدل"><Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="text-right" /></Field>
        <Field label="تاریخ نصب"><JalaliDatePicker value={form.install_date} onChange={v => setForm({ ...form, install_date: v })} /></Field>
      </div>
    </Shell>
  );
}

// بازدید
export function CreateInspectionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ inspection_date: "", priority: "routine", weather: "", notes: "", contract_id: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.inspection_date) { setError("تاریخ بازدید الزامی است"); return; }
    setSubmitting(true); setError(null);
    try { await apiClient.post(API_ENDPOINTS.inspections, { inspection_date: form.inspection_date, priority: form.priority, weather: form.weather || null, notes: form.notes || null, contract_id: form.contract_id ? Number(form.contract_id) : null }); setForm({ inspection_date: "", priority: "routine", weather: "", notes: "", contract_id: "" }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };

  return (
    <Shell open={open} onClose={onClose} title="ثبت بازدید جدید" submitting={submitting} error={error} onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="تاریخ بازدید (اجباری)"><JalaliDatePicker value={form.inspection_date} onChange={v => setForm({ ...form, inspection_date: v })} /></Field>
        <Field label="اولویت"><Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="routine">معمول</SelectItem><SelectItem value="emergency">اضطراری</SelectItem></SelectContent></Select></Field>
      </div>
      <Field label="قرارداد"><ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} /></Field>
      <Field label="وضعیت هوا"><Input value={form.weather} onChange={e => setForm({ ...form, weather: e.target.value })} className="text-right" /></Field>
      <Field label="یادداشت"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="text-right" /></Field>
    </Shell>
  );
}

// دستورکار
export function CreateWorkOrderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crews, setCrews] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", planned_start: "", planned_end: "", crew_id: "", outage_required: false, contract_id: "" });

  // v2.8.1: fetch با useEffect انجام می‌شود — قبلاً به‌اشتباه useState بود که فقط یک‌بار در mount اجرا می‌شد
  // crews پاسخ آرایه ساده برمی‌گرداند
  useEffect(() => {
    if (open) {
      apiClient.get<any>(API_ENDPOINTS.crews)
        .then(r => setCrews(Array.isArray(r) ? r : (r?.data || [])))
        .catch(() => {});
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { setError("عنوان الزامی است"); return; }
    setSubmitting(true); setError(null);
    try { await apiClient.post(API_ENDPOINTS.workOrders, { title: form.title, description: form.description || null, priority: form.priority, planned_start: form.planned_start || null, planned_end: form.planned_end || null, crew_id: form.crew_id ? Number(form.crew_id) : null, outage_required: form.outage_required, contract_id: form.contract_id ? Number(form.contract_id) : null }); setForm({ title: "", description: "", priority: "medium", planned_start: "", planned_end: "", crew_id: "", outage_required: false, contract_id: "" }); onCreated(); } catch (err) { setError(err instanceof Error ? err.message : "خطا"); } finally { setSubmitting(false); }
  };

  return (
    <Shell open={open} onClose={onClose} title="دستورکار جدید" submitting={submitting} error={error} onSubmit={submit}>
      <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="اولویت"><Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="critical">بحرانی</SelectItem><SelectItem value="high">بالا</SelectItem><SelectItem value="medium">متوسط</SelectItem><SelectItem value="low">پایین</SelectItem></SelectContent></Select></Field>
        <Field label="اکیپ"><Select value={form.crew_id} onValueChange={v => setForm({ ...form, crew_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="انتخاب..." /></SelectTrigger><SelectContent className="max-h-60">{crews.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="قرارداد"><ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} /></Field>
      <Field label="شروع پلن"><JalaliDatePicker value={form.planned_start} onChange={v => setForm({ ...form, planned_start: v })} type="datetime" /></Field>
        <Field label="پایان پلن"><JalaliDatePicker value={form.planned_end} onChange={v => setForm({ ...form, planned_end: v })} type="datetime" /></Field>
      </div>
      <Field label="توضیحات"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="text-right" /></Field>
      <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.outage_required} onChange={e => setForm({ ...form, outage_required: e.target.checked })} className="w-4 h-4" />نیاز به قطع برق دارد</label>
    </Shell>
  );
}

// Shared
function Shell({ open, onClose, title, submitting, error, onSubmit, children }: { open: boolean; onClose: () => void; title: string; submitting: boolean; error: string | null; onSubmit: (e: React.FormEvent) => void; children: React.ReactNode }) {
  return (<Dialog open={open} onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-right">{title}</DialogTitle></DialogHeader>
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
      {children}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
        <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">{submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : "ثبت"}</Button>
      </DialogFooter>
    </form></DialogContent></Dialog>);
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-2"><Label className="text-right block">{label}</Label>{children}</div>);
}
