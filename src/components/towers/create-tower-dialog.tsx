"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";
import { useTowerReferences } from "@/hooks/use-tower-references";

/** سه نوع مقره — v2.1.0 */
export const INSULATOR_TYPES = ["سرامیکی", "شیشه‌ای", "سیلیکونی"] as const;
const TOWER_TYPES = ["کششی", "آویزی"] as const;

interface FormData {
  line_id: string; contract_id: string; tower_number: string; line_supervisor: string;
  tower_structure: string; tower_type: string; tower_type_code: string;
  base_height_a: string; base_height_b: string; base_height_c: string; base_height_d: string;
  insulator_r1: string; insulator_s1: string; insulator_t1: string;
  insulator_r2: string; insulator_s2: string; insulator_t2: string;
  insulator_count_r1: string; insulator_count_s1: string; insulator_count_t1: string;
  insulator_count_r2: string; insulator_count_s2: string; insulator_count_t2: string;
  gps_lat: string; gps_lng: string;
}

const empty: FormData = {
  line_id: "", contract_id: "", tower_number: "", line_supervisor: "",
  tower_structure: "", tower_type: "", tower_type_code: "",
  base_height_a: "", base_height_b: "", base_height_c: "", base_height_d: "",
  insulator_r1: "", insulator_s1: "", insulator_t1: "",
  insulator_r2: "", insulator_s2: "", insulator_t2: "",
  insulator_count_r1: "", insulator_count_s1: "", insulator_count_t1: "",
  insulator_count_r2: "", insulator_count_s2: "", insulator_count_t2: "",
  gps_lat: "", gps_lng: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  editRow?: any | null;
  duplicateFrom?: any | null;
}

export function CreateTowerDialog({ open, onClose, onCreated, editRow, duplicateFrom }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const [lines, setLines] = useState<any[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  // v3.0.0: سرپرست خط از پرسنل (سرپرست اکیپ) با کمبوباکس قابل جستجو
  const { supervisorOptions } = usePersonnelOptions();
  const { structures, typeCodes } = useTowerReferences(open);
  const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));
  const { toast } = useToast();

  const isEdit = !!editRow;
  const isDuplicate = !isEdit && !!duplicateFrom;
  const sourceRow = editRow || duplicateFrom;

  // لیست خطوط برای انتخاب «نام خط» — v3.4.0: بدون Toast تکراری
  // اگر سرور قطع باشد فقط یک پیام در همان لحظه ثبت می‌شود (به «لاگ خطاها» می‌رود) و دیگر پشت‌سرهم تکرار نمی‌شود
  const linesErrorShownRef = useRef(false);
  useEffect(() => {
    if (open && lines.length === 0 && !linesLoading) {
      setLinesLoading(true);
      apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 1000 })
        .then((res: any) => {
          setLines(res?.data || []);
          setLinesLoading(false);
          linesErrorShownRef.current = false; // موفق شد — برای خطای بعدی دوباره مجاز
        })
        .catch((err) => {
          setLinesLoading(false);
          // v3.4.0: ثبت در لاگ خطاها (همیشه) + Toast فقط بار اول این نشست فرم
          logError({
            title: "خطا در دریافت لیست خطوط (فرم دکل)",
            message: err instanceof Error ? err.message : "خطای نامشخص",
            source: "towers/create-tower-dialog",
          });
          if (!linesErrorShownRef.current) {
            linesErrorShownRef.current = true;
            toast({ title: "خطا در دریافت لیست خطوط", description: "سرور موقتاً در دسترس نیست — جزئیات در «لاگ خطاها»", variant: "destructive" });
          }
        });
    }
  }, [open, lines.length, linesLoading, toast]);

  const selectedLine = useMemo(
    () => lines.find(l => String(l.id) === form.line_id) || null,
    [lines, form.line_id]
  );

  // v2.1.0: کد دکل خودکار = کد خط + شماره سه‌رقمی (مثال: 61404-001)
  const autoCode = useMemo(() => {
    if (!selectedLine || !form.tower_number) return "";
    const n = parseInt(form.tower_number, 10);
    if (isNaN(n) || n <= 0) return "";
    return `${selectedLine.line_code}-${String(n).padStart(3, "0")}`;
  }, [selectedLine, form.tower_number]);

  // با انتخاب خط، سرپرست خط از خط متناظر پر می‌شود (قابل ویرایش)
  // v2.4.0: در ویرایش، خط دکل قابل تغییر نیست — نام/خط فقط از بخش خطوط انتقال مدیریت می‌شود
  const onLineChange = (v: string) => {
    if (isEdit && v !== form.line_id) {
      toast({
        title: "تغییر خط دکل از اینجا ممکن نیست",
        description: "خطِ هر دکل هنگام ثبت تعیین می‌شود. برای تغییر نام خط، به بخش «خطوط انتقال» بروید — نام جدید به‌صورت خودکار روی همه دکل‌های همان خط اعمال می‌شود.",
        variant: "destructive",
      });
      return;
    }
    const line = lines.find(l => String(l.id) === v);
    setForm(p => ({ ...p, line_id: v, line_supervisor: line?.line_supervisor || p.line_supervisor }));
  };

  // Reset error + form whenever the dialog opens (add / edit / duplicate)
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      if (sourceRow) {
        const s = (v: any) => (v === null || v === undefined ? "" : String(v));
        setForm({
          line_id: s(sourceRow.line_id),
          contract_id: sourceRow?.contract_id != null ? String(sourceRow.contract_id) : "",
          // در حالت کپی، شماره دخل خالی تا کد جدید تولید شود
          tower_number: isEdit ? s(sourceRow.tower_number) : "",
          line_supervisor: s(sourceRow.line_supervisor),
          tower_structure: s(sourceRow.tower_structure),
          tower_type: s(sourceRow.tower_type),
          tower_type_code: s(sourceRow.tower_type_code),
          base_height_a: s(sourceRow.base_height_a),
          base_height_b: s(sourceRow.base_height_b),
          base_height_c: s(sourceRow.base_height_c),
          base_height_d: s(sourceRow.base_height_d),
          insulator_r1: s(sourceRow.insulator_r1),
          insulator_s1: s(sourceRow.insulator_s1),
          insulator_t1: s(sourceRow.insulator_t1),
          insulator_r2: s(sourceRow.insulator_r2),
          insulator_s2: s(sourceRow.insulator_s2),
          insulator_t2: s(sourceRow.insulator_t2),
          insulator_count_r1: s(sourceRow.insulator_count_r1),
          insulator_count_s1: s(sourceRow.insulator_count_s1),
          insulator_count_t1: s(sourceRow.insulator_count_t1),
          insulator_count_r2: s(sourceRow.insulator_count_r2),
          insulator_count_s2: s(sourceRow.insulator_count_s2),
          insulator_count_t2: s(sourceRow.insulator_count_t2),
          gps_lat: s(sourceRow.gps_lat),
          gps_lng: s(sourceRow.gps_lng),
        });
      } else {
        setForm(empty);
      }
    }
  }, [open, sourceRow, isEdit]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tower_number) { setError("شماره دکل الزامی است"); return; }
    if (!form.tower_type) { setError("نوع دکل (کششی/آویزی) الزامی است"); return; }
    if (!autoCode) { setError("برای تولید کد دکل، خط و شماره دکل را مشخص کنید"); return; }
    if (form.gps_lat && !form.gps_lng) { setError("عرض و طول جغرافیایی هر دو باید وارد شوند"); return; }
    if (form.gps_lng && !form.gps_lat) { setError("عرض و طول جغرافیایی هر دو باید وارد شوند"); return; }

    setSubmitting(true); setError(null);
    try {
      const num = (v: string) => (v === "" ? null : Number(v));
      const str = (v: string) => (v === "" ? null : v);
      const payload: Record<string, unknown> = {
        line_id: form.line_id ? Number(form.line_id) : null,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
        tower_code: autoCode,
        tower_number: num(form.tower_number),
        tower_structure: form.tower_structure,
        tower_type: form.tower_type,
        tower_type_code: str(form.tower_type_code),
        base_height_a: num(form.base_height_a),
        base_height_b: num(form.base_height_b),
        base_height_c: num(form.base_height_c),
        base_height_d: num(form.base_height_d),
        insulator_r1: str(form.insulator_r1),
        insulator_s1: str(form.insulator_s1),
        insulator_t1: str(form.insulator_t1),
        insulator_r2: str(form.insulator_r2),
        insulator_s2: str(form.insulator_s2),
        insulator_t2: str(form.insulator_t2),
        insulator_count_r1: num(form.insulator_count_r1),
        insulator_count_s1: num(form.insulator_count_s1),
        insulator_count_t1: num(form.insulator_count_t1),
        insulator_count_r2: num(form.insulator_count_r2),
        insulator_count_s2: num(form.insulator_count_s2),
        insulator_count_t2: num(form.insulator_count_t2),
        gps_lat: form.gps_lat ? Number(form.gps_lat) : null,
        gps_lng: form.gps_lng ? Number(form.gps_lng) : null,
        line_supervisor: str(form.line_supervisor),
      };

      if (isEdit && editRow?.id) {
        await apiClient.put(`${API_ENDPOINTS.towers}/${editRow.id}`, payload);
      } else {
        await apiClient.post(API_ENDPOINTS.towers, payload);
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
            {isEdit
              ? `ویرایش دکل: ${editRow?.tower_code || ""}`
              : isDuplicate
                ? `افزودن دکل جدید (کپی از: ${duplicateFrom?.tower_code || ""})`
                : "افزودن دکل جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}

          {/* سکشن ۱: اطلاعات پایه — دو ستونه، لیبل بالای فیلد */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-indigo-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">اطلاعات پایه</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Field label="نام خط">
                {linesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 h-9 px-3 rounded-md border border-slate-200 bg-white">
                    <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت خطوط...
                  </div>
                ) : (
                  <>
                    <select
                      value={form.line_id}
                      onChange={(e) => onLineChange(e.target.value)}
                      title={isEdit ? "خط دکل در ویرایش قابل تغییر نیست — نام خط از بخش «خطوط انتقال» مدیریت می‌شود" : undefined}
                      className={isEdit
                        ? "w-full h-9 rounded-md border border-input bg-slate-50 px-3 text-sm text-right cursor-not-allowed dark:bg-slate-800 dark:text-slate-400"
                        : "w-full h-9 rounded-md border border-input bg-white px-3 text-sm text-right cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-800 dark:text-slate-100"}
                    >
                      <option value="">بدون اتصال به خط</option>
                      {lines.map((l: any) => (
                        <option key={l.id} value={String(l.id)}>{l.name}</option>
                      ))}
                    </select>
                    {isEdit && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        تغییر خط فقط هنگام ثبت؛ تغییر نام خط از بخش «خطوط انتقال» انجام می‌شود و روی همه دکل‌ها اعمال می‌گردد.
                      </p>
                    )}
                  </>
                )}
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="شماره دکل">
                  <Input type="number" min={1} value={form.tower_number} onChange={e => set("tower_number", e.target.value)} dir="ltr" className="text-left bg-white" placeholder="مثلاً 1" />
                </Field>
              {/* v2.8.0: فیلد «کد دکل خودکار» حذف شد — کد دکل به‌طور خودکار در سرور از کد خط + شماره دکل تولید می‌شود */}
              {/* v3.0.0: سرپرست خط از جدول پرسنل با کمبوباکس قابل جستجو (سرپرست‌های اکیپ) */}
              <Field label="سرپرست خط">
                <SearchableSelect
                  value={form.line_supervisor}
                  onChange={v => set("line_supervisor", v)}
                  options={supervisorOptions}
                  placeholder="جستجوی نام سرپرست..."
                  searchPlaceholder="نام سرپرست اکیپ..."
                  allowClear
                />
              </Field>
              </div>
            </div>
          </div>

          {/* سکشن ۲: مشخصات سازه — دو ستونه */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-blue-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">مشخصات سازه</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="ساختار دکل">
                <SearchableSelect value={form.tower_structure} onChange={v=>set("tower_structure",v)} options={structures.map(x=>({value:x.name,label:x.name}))} placeholder="انتخاب ساختار دکل..." searchPlaceholder="جستجو..." allowClear />
              </Field>
              <Field label="کد نوع دکل">
                <SearchableSelect value={form.tower_type_code} onChange={v=>set("tower_type_code",v)} options={typeCodes.map(x=>({value:x.code,label:x.code}))} placeholder="انتخاب کد..." searchPlaceholder="جستجوی کد..." allowClear />
              </Field>
              <Field label="نوع دکل">
                <Select value={form.tower_type || "__none__"} onValueChange={v => set("tower_type", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب نوع دکل..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">نامشخص</SelectItem>
                    {TOWER_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* سکشن ۳: ارتفاع پایه‌ها — چهار ستونه عددی */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-green-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">ارتفاع پایه‌ها (متر)</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="پایه A"><Input type="number" step="0.01" value={form.base_height_a} onChange={e => set("base_height_a", e.target.value)} dir="ltr" className="text-left bg-white" /></Field>
              <Field label="پایه B"><Input type="number" step="0.01" value={form.base_height_b} onChange={e => set("base_height_b", e.target.value)} dir="ltr" className="text-left bg-white" /></Field>
              <Field label="پایه C"><Input type="number" step="0.01" value={form.base_height_c} onChange={e => set("base_height_c", e.target.value)} dir="ltr" className="text-left bg-white" /></Field>
              <Field label="پایه D"><Input type="number" step="0.01" value={form.base_height_d} onChange={e => set("base_height_d", e.target.value)} dir="ltr" className="text-left bg-white" /></Field>
            </div>
          </div>

          {/* سکشن ۴: مقره‌ها — هر مدار جداگانه؛ نوع و تعداد هر فاز */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-amber-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">مقره‌ها به تفکیک مدار و فاز</h3>
            </div>

            {([["مدار اول", 1], ["مدار دوم", 2]] as const).map(([title, c]) => (
              <div key={c} className="rounded-md border border-slate-100 dark:border-slate-700 p-2.5">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">{title}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["r", "s", "t"] as const).map(ph => {
                    const typeKey = `insulator_${ph}${c}` as keyof FormData;
                    const countKey = `insulator_count_${ph}${c}` as keyof FormData;
                    const phaseLabel = ph === "r" ? "R" : ph === "s" ? "S" : "T";
                    return (
                      <div key={ph} className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2 space-y-2">
                        <p className="text-[11px] font-bold text-slate-500">فاز {phaseLabel}</p>
                        <Select value={form[typeKey] || "__none__"} onValueChange={v => set(typeKey, v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-full bg-white h-8 text-xs"><SelectValue placeholder="نوع مقره" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {INSULATOR_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" min={0}
                          value={form[countKey]}
                          onChange={e => set(countKey, e.target.value)}
                          dir="ltr" className="text-left bg-white h-8 text-xs"
                          placeholder="تعداد"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* سکشن ۵: موقعیت جغرافیایی */}
          <div className="space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-1 h-5 bg-purple-600 rounded"></div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">موقعیت جغرافیایی (GPS)</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="عرض جغرافیایی (Lat)"><Input type="number" step="0.0000001" value={form.gps_lat} onChange={e => set("gps_lat", e.target.value)} dir="ltr" className="text-left bg-white" placeholder="34.1234567" /></Field>
              <Field label="طول جغرافیایی (Lng)"><Input type="number" step="0.0000001" value={form.gps_lng} onChange={e => set("gps_lng", e.target.value)} dir="ltr" className="text-left bg-white" placeholder="46.1234567" /></Field>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال {isEdit ? "ویرایش" : "ثبت"}...</>
                : isEdit ? "اعمال ویرایش" : "ثبت دکل"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** لیبل در ردیف بالا، ورودی در ردیف پایین — همیشه تک‌خطی و مرتب */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-right block text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{label}</Label>
      {children}
    </div>
  );
}
