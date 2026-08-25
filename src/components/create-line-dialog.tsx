"use client";

import { useState, useEffect, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, SearchableMultiSelect } from "@/components/searchable-select";
import { useCircuits } from "@/hooks/use-circuits";
import { useConductors } from "@/hooks/use-conductors";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { Loader2 } from "lucide-react";

interface FormData {
  line_code: string; dispatch_code: string; name: string; group_name: string;
  voltage: string; circuit_count: string; bundle_count: string;
  conductor_type: string; tower_structure_type: string; length_km: string; circuit_length_km: string;
  total_towers: string; tension_towers: string; suspension_towers: string;
  plain_terrain: string; semi_mountainous: string; mountainous: string;
  commission_year: string;
  line_supervisor: string; line_expert: string; notes: string;
}

const empty: FormData = {
  line_code: "", dispatch_code: "", name: "", group_name: "",
  voltage: "", circuit_count: "1", bundle_count: "1",
  conductor_type: "", tower_structure_type: "", length_km: "", circuit_length_km: "",
  total_towers: "", tension_towers: "", suspension_towers: "",
  plain_terrain: "", semi_mountainous: "", mountainous: "",
  commission_year: "", line_supervisor: "", line_expert: "", notes: "",
};


/**
 * v3.4.1: مقادیر رایج هادی (ACSR) در شبکه انتقال ایران — نام‌گذاری پرندگان
 * فرمت «فارسی (انگلیسی)» هماهنگ با داده موجود دیتابیس (لینکس (Lynx))
 * اگر مقدار رکورد موجود در فهرست نباشد، خودکار به گزینه‌ها اضافه می‌شود
 */
export const CONDUCTOR_OPTIONS = [
  { value: "لینکس (Lynx)", label: "لینکس (Lynx)" },
  { value: "کاناری (Canary)", label: "کاناری (Canary)" },
  { value: "کرلو (Curlew)", label: "کرلو (Curlew)" },
  { value: "فینچ (Finch)", label: "فینچ (Finch)" },
  { value: "پارتریج (Partridge)", label: "پارتریج (Partridge)" },
  { value: "رابین (Robin)", label: "رابین (Robin)" },
  { value: "کلاغ (Raven)", label: "کلاغ (Raven)" },
  { value: "بلدرچین (Quail)", label: "بلدرچین (Quail)" },
  { value: "قرقاول (Pheasant)", label: "قرقاول (Pheasant)" },
  { value: "شاهین (Hawk)", label: "شاهین (Hawk)" },
  { value: "ماهی‌خورک (Osprey)", label: "ماهی‌خورک (Osprey)" },
  { value: "کورمورنت (Cormorant)", label: "کورمورنت (Cormorant)" },
  { value: "پلیکان (Pelican)", label: "پلیکان (Pelican)" },
  { value: "فلامینگو (Flamingo)", label: "فلامینگو (Flamingo)" },
  { value: "سایر", label: "سایر" },
];

/**
 * v3.4.1: انواع سازه دکل — دقیقاً مطابق مقادیر معتبر دیتابیس
 * (PHP از این نام‌ها tower_type را مشتق می‌کند — تغییر نام‌ها ممنوع)
 */
export const TOWER_STRUCTURE_OPTIONS = [
  { value: "مشبک فلزی", label: "مشبک فلزی" },
  { value: "تیر چوبی", label: "تیر چوبی" },
  { value: "تیر بتنی", label: "تیر بتنی" },
  { value: "تلسکوپی بتنی", label: "تلسکوپی بتنی" },
  { value: "تلسکوپی فلزی", label: "تلسکوپی فلزی" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** اگر ارسال شود، حالت ویرایش فعال می‌شود */
  editRow?: any | null;
  /** اگر ارسال شود (بدون editRow)، فرم با مقادیر این ردیف پیش‌پر می‌شود ولی رکورد جدید ثبت می‌گردد — کد خط خالی است */
  duplicateFrom?: any | null;
}

export function CreateLineDialog({ open, onClose, onCreated, editRow, duplicateFrom }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  // v3.0.0: کد دیسپاچینگ به‌صورت آرایه از مدارها — ترکیب با «-» ذخیره می‌شود (مثل CM607-MN609)
  const [dispatchCodes, setDispatchCodes] = useState<string[]>([]);

  const isEdit = !!editRow;
  const isDuplicate = !isEdit && !!duplicateFrom;
  // ردیف مبدأ پیش‌پر کردن فرم: ویرایش → خود ردیف | کپی → ردیف مبدأ (کد خط خالی می‌ماند)
  const sourceRow = editRow || duplicateFrom;

  // v3.0.0: مدارها (کدهای دیسپاچینگ) و پرسنل (سرپرست/کارشناس) برای کمبوباکس‌های قابل جستجو
  const { optionsForVoltage, circuits } = useCircuits();
  // v3.5.0: گزینه‌های سیم از جدول conductors (با fallback به فهرست ثابت)
  const { options: conductorOptions } = useConductors();
  const { supervisorOptions, expertOptions } = usePersonnelOptions();

  // گزینه‌های کد دیسپاچینگ فیلترشده بر اساس ولتاژ انتخاب‌شده — طبق درخواست کاربر:
  // «خطی که ۲۳۰ انتخاب میشه فقط کدهای ۲۳۰ رو نشون بده»
  const dispatchOptions = useMemo(() => optionsForVoltage(form.voltage), [optionsForVoltage, form.voltage]);

  // Reset error + form whenever the dialog opens (whether add, edit or duplicate mode)
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      // تجزیه کد دیسپاچینگ ترکیبی به آرایه (مثل AR632-AP634-AR631-AP636)
      const parseDispatch = (raw: any): string[] => {
        const s = String(raw || "").trim();
        if (!s) return [];
        return s.split("-").map(x => x.trim()).filter(Boolean);
      };
      if (sourceRow) {
        setForm({
          // در حالت کپی، کد خط باید جدید باشد — خالی ارسال می‌شود تا کاربر وارد کند
          line_code: isEdit ? (sourceRow.line_code || "") : "",
          dispatch_code: sourceRow.dispatch_code || "",
          name: sourceRow.name || "",
          group_name: sourceRow.group_name || "",
          voltage: sourceRow.voltage_kv ? String(sourceRow.voltage_kv) : (sourceRow.voltage ? String(sourceRow.voltage) : ""),
          circuit_count: sourceRow.circuit_count != null ? String(sourceRow.circuit_count) : "1",
          bundle_count: sourceRow.bundle_count != null ? String(sourceRow.bundle_count) : "",
          conductor_type: sourceRow.conductor_type || "",
          tower_structure_type: sourceRow.tower_structure_type || "",
          length_km: sourceRow.length_km != null ? String(sourceRow.length_km) : "",
          circuit_length_km: sourceRow.circuit_length_km != null ? String(sourceRow.circuit_length_km) : "",
          total_towers: sourceRow.total_towers != null ? String(sourceRow.total_towers) : "",
          tension_towers: sourceRow.tension_towers != null ? String(sourceRow.tension_towers) : "",
          suspension_towers: sourceRow.suspension_towers != null ? String(sourceRow.suspension_towers) : "",
          plain_terrain: sourceRow.plain_terrain != null ? String(sourceRow.plain_terrain) : "",
          semi_mountainous: sourceRow.semi_mountainous != null ? String(sourceRow.semi_mountainous) : "",
          mountainous: sourceRow.mountainous != null ? String(sourceRow.mountainous) : "",
          commission_year: sourceRow.commission_year != null ? String(sourceRow.commission_year) : "",
          line_supervisor: sourceRow.line_supervisor || "",
          line_expert: sourceRow.line_expert || "",
          // v3.5.1: قبلاً همیشه "" بود و ویرایش خط توضیحات ذخیره‌شده را بی‌صدا پاک می‌کرد
          notes: sourceRow.notes || "",
        });
        setDispatchCodes(parseDispatch(sourceRow.dispatch_code));
      } else {
        setForm(empty);
        setDispatchCodes([]);
      }
    }
  }, [open, sourceRow, isEdit]);

  // v3.0.0: با تغییر ولتاژ، کدهای دیسپاچینگ نامرتبط با ولتاژ جدید حذف می‌شوند
  useEffect(() => {
    if (!form.voltage || circuits.length === 0) return;
    const validCodes = new Set(circuits.filter(c => String(c.voltage) === form.voltage).map(c => c.dispatch_code));
    setDispatchCodes(prev => prev.filter(c => validCodes.has(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.voltage, circuits]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.line_code || !form.name) { setError("کد خط و نام الزامی است"); return; }
    // v3.0.0: کدهای دیسپاچینگ انتخاب‌شده با «-» به هم متصل می‌شوند (مثل CM607-MN609)
    const dispatchCode = dispatchCodes.join("-");
    setSubmitting(true); setError(null);
    try {
      const payload = {
        line_code: form.line_code,
        dispatch_code: dispatchCode || null,
        name: form.name,
        group_name: form.group_name || null,
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
      setDispatchCodes([]);
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
            {isEdit
              ? `ویرایش خط: ${editRow?.name || ""}`
              : isDuplicate
                ? `افزودن خط جدید (کپی از: ${duplicateFrom?.name || ""})`
                : "افزودن خط انتقال جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}

          {/* سکشن ۱: اطلاعات پایه */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-indigo-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">اطلاعات پایه</h3>
            </div>
            {/* v3.0.0: ولتاژ بالای کد دیسپاچینگ قرار گرفت — با انتخاب ولتاژ، کدهای دیسپاچینگ همان ولتاژ بارگذاری می‌شوند */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="کد خط (اجباری)">
                <Input value={form.line_code} onChange={e => set("line_code", e.target.value)} dir="ltr" className="text-left" disabled={isEdit} />
              </Field>
              <Field label="ولتاژ (kV) — ابتدا انتخاب کنید">
                <SearchableSelect
                  value={form.voltage}
                  onChange={v => set("voltage", v)}
                  options={[
                    { value: "63", label: "۶۳ کیلوولت" },
                    { value: "132", label: "۱۳۲ کیلوولت" },
                    { value: "230", label: "۲۳۰ کیلوولت" },
                    { value: "400", label: "۴۰۰ کیلوولت" },
                  ]}
                  placeholder="انتخاب ولتاژ..."
                />
              </Field>
            </div>
            <Field label="کد دیسپاچینگ">
              {form.voltage ? (
                <SearchableMultiSelect
                  values={dispatchCodes}
                  onChange={setDispatchCodes}
                  options={dispatchOptions}
                  placeholder="انتخاب مدار(ها)..."
                  searchPlaceholder="جستجوی کد دیسپاچینگ یا نام مدار..."
                />
              ) : (
                <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-2.5 text-right">
                  ابتدا ولتاژ خط را انتخاب کنید تا کدهای دیسپاچینگ همان ولتاژ نمایش داده شود
                </div>
              )}
            </Field>
            <Field label="نام مجموعه خط"><Input value={form.group_name} onChange={e => set("group_name", e.target.value)} className="text-right" /></Field>
            <Field label="نام خط (اجباری)"><Input value={form.name} onChange={e => set("name", e.target.value)} className="text-right" /></Field>
          </div>

          {/* سکشن ۲: مشخصات فنی — v3.4.0: گرید منظم ۳ ستونه و ردیف‌های هم‌عرض */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-blue-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">مشخصات فنی</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* v3.4.1: ولتاژ از این بخش حذف شد — فقط در «اطلاعات پایه» بالای کد دیسپاچینگ است (رفع تکرار) */}
              <Field label="تعداد مدار"><Input type="number" value={form.circuit_count} onChange={e => set("circuit_count", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="تعداد باندل"><Input type="number" value={form.bundle_count} onChange={e => set("bundle_count", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="سال بهره‌برداری"><Input value={form.commission_year} onChange={e => set("commission_year", e.target.value)} dir="ltr" className="text-left" /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="طول خط (km)"><Input type="number" step="0.001" value={form.length_km} onChange={e => set("length_km", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="طول مدار (km)"><Input type="number" step="0.001" value={form.circuit_length_km} onChange={e => set("circuit_length_km", e.target.value)} dir="ltr" className="text-left" /></Field>
            </div>
            {/* v3.4.1: نوع سیم و نوع سازه دکل → کمبوباکس با مقادیر رایج شبکه انتقال ایران + عرض کامل دو ستونه */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نوع سیم">
                <SearchableSelect
                  value={form.conductor_type}
                  onChange={v => set("conductor_type", v)}
                  options={form.conductor_type && !conductorOptions.some(o => o.value === form.conductor_type)
                    ? [...conductorOptions, { value: form.conductor_type, label: form.conductor_type }]
                    : conductorOptions}
                  placeholder="انتخاب نوع سیم..."
                  searchPlaceholder="جستجوی نام سیم..."
                  allowClear
                />
              </Field>
              <Field label="نوع سازه دکل">
                <SearchableSelect
                  value={form.tower_structure_type}
                  onChange={v => set("tower_structure_type", v)}
                  options={TOWER_STRUCTURE_OPTIONS.some(o => o.value === form.tower_structure_type)
                    ? TOWER_STRUCTURE_OPTIONS
                    : [...TOWER_STRUCTURE_OPTIONS, { value: form.tower_structure_type, label: form.tower_structure_type }]}
                  placeholder="انتخاب نوع سازه..."
                  searchPlaceholder="جستجو..."
                  allowClear
                />
              </Field>
            </div>
          </div>

          {/* سکشن ۳: تعداد دکل‌ها به تفکیک نوع */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-green-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">تعداد دکل‌ها به تفکیک نوع</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="تعداد کل دکل‌ها"><Input type="number" value={form.total_towers} onChange={e => set("total_towers", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="دکل‌های کششی"><Input type="number" value={form.tension_towers} onChange={e => set("tension_towers", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="دکل‌های آویزی"><Input type="number" value={form.suspension_towers} onChange={e => set("suspension_towers", e.target.value)} dir="ltr" className="text-left" /></Field>
            </div>
          </div>

          {/* سکشن ۴: تعداد دکل‌ها به تفکیک منطقه */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-amber-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">تعداد دکل‌ها به تفکیک منطقه</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="دشت"><Input type="number" value={form.plain_terrain} onChange={e => set("plain_terrain", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="نیمه کوهستانی"><Input type="number" value={form.semi_mountainous} onChange={e => set("semi_mountainous", e.target.value)} dir="ltr" className="text-left" /></Field>
              <Field label="صعب‌العبور"><Input type="number" value={form.mountainous} onChange={e => set("mountainous", e.target.value)} dir="ltr" className="text-left" /></Field>
            </div>
          </div>

          {/* سکشن ۵: مسئولین خط */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-purple-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">مسئولین خط</h3>
            </div>
            {/* v3.0.0: سرپرست و کارشناس خط از جدول پرسنل با کمبوباکس قابل جستجو انتخاب می‌شوند */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="سرپرست خط">
                <SearchableSelect
                  value={form.line_supervisor}
                  onChange={v => set("line_supervisor", v)}
                  options={supervisorOptions}
                  placeholder="انتخاب سرپرست..."
                  searchPlaceholder="جستجوی نام..."
                  allowClear
                />
              </Field>
              <Field label="کارشناس خط">
                <SearchableSelect
                  value={form.line_expert}
                  onChange={v => set("line_expert", v)}
                  options={expertOptions}
                  placeholder="انتخاب کارشناس..."
                  searchPlaceholder="جستجوی نام..."
                  allowClear
                />
              </Field>
            </div>
            <Field label="توضیحات"><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className="text-right" /></Field>
          </div>

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
