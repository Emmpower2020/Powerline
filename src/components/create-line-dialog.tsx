"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface FormData {
  line_code: string; dispatch_code: string; name: string; group_name: string;
  line_type: string; voltage: string; circuit_count: string; bundle_count: string;
  conductor_type: string; tower_structure_type: string; length_km: string; circuit_length_km: string;
  total_towers: string; tension_towers: string; suspension_towers: string;
  plain_terrain: string; semi_mountainous: string; mountainous: string;
  commission_year: string;
  line_supervisor: string; line_expert: string; notes: string;
}

const empty: FormData = {
  line_code: "", dispatch_code: "", name: "", group_name: "",
  line_type: "transmission", voltage: "", circuit_count: "1", bundle_count: "1",
  conductor_type: "", tower_structure_type: "", length_km: "", circuit_length_km: "",
  total_towers: "", tension_towers: "", suspension_towers: "",
  plain_terrain: "", semi_mountainous: "", mountainous: "",
  commission_year: "", line_supervisor: "", line_expert: "", notes: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** اگر ارسال شود، حالت ویرایش فعال می‌شود */
  editRow?: any | null;
}

export function CreateLineDialog({ open, onClose, onCreated, editRow }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  const isEdit = !!editRow;

  // Reset error + form whenever the dialog opens (whether add or edit mode)
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      if (editRow) {
        setForm({
          line_code: editRow.line_code || "",
          dispatch_code: editRow.dispatch_code || "",
          name: editRow.name || "",
          group_name: editRow.group_name || "",
          line_type: editRow.line_type || "transmission",
          voltage: editRow.voltage_kv ? String(editRow.voltage_kv) : (editRow.voltage ? String(editRow.voltage) : ""),
          circuit_count: editRow.circuit_count != null ? String(editRow.circuit_count) : "1",
          bundle_count: editRow.bundle_count != null ? String(editRow.bundle_count) : "",
          conductor_type: editRow.conductor_type || "",
          tower_structure_type: editRow.tower_structure_type || "",
          length_km: editRow.length_km != null ? String(editRow.length_km) : "",
          circuit_length_km: editRow.circuit_length_km != null ? String(editRow.circuit_length_km) : "",
          total_towers: editRow.total_towers != null ? String(editRow.total_towers) : "",
          tension_towers: editRow.tension_towers != null ? String(editRow.tension_towers) : "",
          suspension_towers: editRow.suspension_towers != null ? String(editRow.suspension_towers) : "",
          plain_terrain: editRow.plain_terrain != null ? String(editRow.plain_terrain) : "",
          semi_mountainous: editRow.semi_mountainous != null ? String(editRow.semi_mountainous) : "",
          mountainous: editRow.mountainous != null ? String(editRow.mountainous) : "",
          commission_year: editRow.commission_year != null ? String(editRow.commission_year) : "",
          line_supervisor: editRow.line_supervisor || "",
          line_expert: editRow.line_expert || "",
          notes: "",
        });
      } else {
        setForm(empty);
      }
    }
  }, [open, editRow]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.line_code || !form.name) { setError("کد خط و نام الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        line_code: form.line_code,
        dispatch_code: form.dispatch_code || null,
        name: form.name,
        group_name: form.group_name || null,
        line_type: form.line_type,
        voltage: form.voltage ? Number(form.voltage) : null,
        voltage_kv: form.voltage ? Number(form.voltage) : null,
        circuit_count: Number(form.circuit_count) || 1,
        bundle_count: form.bundle_count ? Number(form.bundle_count) : null,
        conductor_type: form.conductor_type || null,
        tower_structure_type: form.tower_structure_type || null,
        length_km: form.length_km ? Number(form.length_km) : null,
        circuit_length_km: form.circuit_length_km ? Number(form.circuit_length_km) : null,
        total_towers: form.total_towers ? Number(form.total_towers) : null,
        tension_towers: form.tension_towers ? Number(form.tension_towers) : null,
        suspension_towers: form.suspension_towers ? Number(form.suspension_towers) : null,
        plain_terrain: form.plain_terrain ? Number(form.plain_terrain) : null,
        semi_mountainous: form.semi_mountainous ? Number(form.semi_mountainous) : null,
        mountainous: form.mountainous ? Number(form.mountainous) : null,
        commission_year: form.commission_year ? Number(form.commission_year) : null,
        line_supervisor: form.line_supervisor || null,
        line_expert: form.line_expert || null,
        notes: form.notes || null,
      };

      if (isEdit && editRow?.id) {
        await apiClient.put(`${API_ENDPOINTS.lines}/${editRow.id}`, payload);
      } else {
        await apiClient.post(API_ENDPOINTS.lines, payload);
      }
      setForm(empty);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش خط: ${editRow?.name || ""}` : "افزودن خط انتقال جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          {/* ردیف اول: کد خط و کد دیسپاچینگ (کوتاه) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="کد خط (اجباری)">
              <Input value={form.line_code} onChange={e => set("line_code", e.target.value)} dir="ltr" className="text-left" disabled={isEdit} />
            </Field>
            <Field label="کد دیسپاچینگ"><Input value={form.dispatch_code} onChange={e => set("dispatch_code", e.target.value)} dir="ltr" className="text-left" /></Field>
          </div>
          {/* نام مجموعه خط: تمام عرض (طولانی است) */}
          <Field label="نام مجموعه خط"><Input value={form.group_name} onChange={e => set("group_name", e.target.value)} className="text-right" /></Field>
          {/* نام خط: تمام عرض (طولانی است) */}
          <Field label="نام خط (اجباری)"><Input value={form.name} onChange={e => set("name", e.target.value)} className="text-right" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="نوع خط">
              <Select value={form.line_type} onValueChange={v => set("line_type", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transmission">انتقال</SelectItem>
                  <SelectItem value="sub_distribution">فوق توزیع</SelectItem>
                  <SelectItem value="distribution">توزیع</SelectItem>
                  <SelectItem value="sub_transmission">نیمه انتقال</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="ولتاژ (kV)">
              <Select value={form.voltage} onValueChange={v => set("voltage", v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="63">63</SelectItem>
                  <SelectItem value="132">132</SelectItem>
                  <SelectItem value="230">230</SelectItem>
                  <SelectItem value="400">400</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="سال بهره‌برداری"><Input value={form.commission_year} onChange={e => set("commission_year", e.target.value)} dir="ltr" className="text-left" /></Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="تعداد مدار"><Input type="number" value={form.circuit_count} onChange={e => set("circuit_count", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="تعداد باندل"><Input type="number" value={form.bundle_count} onChange={e => set("bundle_count", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="طول خط (km)"><Input type="number" step="0.001" value={form.length_km} onChange={e => set("length_km", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="طول مدار (km)"><Input type="number" step="0.001" value={form.circuit_length_km} onChange={e => set("circuit_length_km", e.target.value)} dir="ltr" className="text-left" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="نوع سیم"><Input value={form.conductor_type} onChange={e => set("conductor_type", e.target.value)} className="text-right" /></Field>
            <Field label="نوع سازه دکل"><Input value={form.tower_structure_type} onChange={e => set("tower_structure_type", e.target.value)} className="text-right" /></Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="تعداد کل دکل‌ها"><Input type="number" value={form.total_towers} onChange={e => set("total_towers", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="دکل‌های کششی"><Input type="number" value={form.tension_towers} onChange={e => set("tension_towers", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="دکل‌های آویزی"><Input type="number" value={form.suspension_towers} onChange={e => set("suspension_towers", e.target.value)} dir="ltr" className="text-left" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="دشت"><Input type="number" value={form.plain_terrain} onChange={e => set("plain_terrain", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="نیمه کوهستانی"><Input type="number" value={form.semi_mountainous} onChange={e => set("semi_mountainous", e.target.value)} dir="ltr" className="text-left" /></Field>
            <Field label="صعب‌العبور"><Input type="number" value={form.mountainous} onChange={e => set("mountainous", e.target.value)} dir="ltr" className="text-left" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="سرپرست خط"><Input value={form.line_supervisor} onChange={e => set("line_supervisor", e.target.value)} className="text-right" /></Field>
            <Field label="کارشناس خط"><Input value={form.line_expert} onChange={e => set("line_expert", e.target.value)} className="text-right" /></Field>
          </div>
          <Field label="توضیحات"><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className="text-right" /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال {isEdit ? "ویرایش" : "ثبت"}...</>
                : isEdit ? "اعمال ویرایش" : "ثبت خط"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-right block">{label}</Label>{children}</div>;
}
