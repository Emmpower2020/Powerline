"use client";

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/searchable-select";
import { ContractSelect } from "@/components/contract-select";
import { FormSection } from "@/components/form-section";
import { Loader2, Sparkles } from "lucide-react";

/**
 * ثبت/ویرایش عیب — v2.9.0 ایجاد، v3.0.0 ارتقا (ویرایش + کمبوباکس جستجودار)
 * v3.1.0:
 *  - حالت کپی (duplicateFrom): فرم از عیب مبدأ پیش‌پر می‌شود
 *  - انتخاب «عیب استاندارد» از ۴۰۱ تعریف جدول defect_definitions
 *    (منبع: عیوب_استاندارد.xlsx — ۲۴ دسته که قبلاً در دیتابیس درج شده‌اند)
 *    با انتخاب، عنوان، دسته و defect_definition_id خودکار پر می‌شوند
 */
export function CreateDefectDialog({ open, onClose, onCreated, editRow, duplicateFrom }: {
  open: boolean; onClose: () => void; onCreated: () => void; editRow?: any | null; duplicateFrom?: any | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  // v3.1.0: عیوب استاندارد (defect_definitions)
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [definitionsLoading, setDefinitionsLoading] = useState(false);
  // v3.3.0: انتخاب زنجیره‌ای — اول دسته کلی، بعد عیب همان دسته
  const [standardCategory, setStandardCategory] = useState("");
  const [standardId, setStandardId] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "minor",
    priority: "medium",
    safety_risk: "none",
    line_id: "",
    location_desc: "",
    defect_type: "",
    contract_id: "",
  });

  const isEdit = !!editRow;
  const isDuplicate = !isEdit && !!duplicateFrom;
  const sourceRow = editRow || duplicateFrom;

  useEffect(() => {
    if (open) {
      setLinesLoading(true);
      apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 500 })
        .then(r => setLines(r?.data || []))
        .catch(() => {})
        .finally(() => setLinesLoading(false));
      // v3.1.0: عیوب استاندارد برای انتخاب
      setDefinitionsLoading(true);
      apiClient.get<any>(API_ENDPOINTS.defectDefinitions)
        .then(r => setDefinitions(Array.isArray(r) ? r : (r?.data || [])))
        .catch(() => {})
        .finally(() => setDefinitionsLoading(false));
    }
  }, [open]);

  // پیش‌پر کردن فرم در حالت ویرایش/کپی
  useEffect(() => {
    if (open) {
      setError(null);
      if (sourceRow) {
        setForm({
          title: sourceRow.title || "",
          description: sourceRow.description || "",
          severity: sourceRow.severity || "minor",
          priority: sourceRow.priority || "medium",
          safety_risk: sourceRow.safety_risk || "none",
          line_id: sourceRow.line_id != null ? String(sourceRow.line_id) : "",
          location_desc: sourceRow.location_desc || "",
          defect_type: sourceRow.defect_type || (sourceRow as any).category_name || "",
          contract_id: sourceRow.contract_id != null ? String(sourceRow.contract_id) : "",
        });
        setStandardId(sourceRow.defect_definition_id != null ? String(sourceRow.defect_definition_id) : "");
        // v3.3.0: دسته از ردیف مبدأ پر می‌شود (ویرایش/کپی)
        const srcDef = sourceRow.defect_definition_id != null
          ? (definitions.find(d => String(d.id) === String(sourceRow.defect_definition_id)) as any)
          : null;
        setStandardCategory((sourceRow as any).category_name || srcDef?.category_name || "");
      } else {
        setForm({ title: "", description: "", severity: "minor", priority: "medium", safety_risk: "none", line_id: "", location_desc: "", defect_type: "" });
        setStandardId("");
        setStandardCategory("");
      }
    }
  }, [open, sourceRow]);

  // v3.3.0: فهرست دسته‌های یکتا (۲۴ دسته) — گزینه اول برای محدود کردن ۴۰۱ عیب
  const categoryOptions = useMemo(() => {
    const names = Array.from(new Set(definitions.map(d => d.category_name).filter(Boolean))) as string[];
    names.sort((a, b) => a.localeCompare(b, "fa"));
    return names.map(n => ({ value: n, label: n }));
  }, [definitions]);

  // v3.3.0: عیوب فقط از دسته انتخاب‌شده — به‌جای جستجو بین ۴۰۱ مورد
  const filteredDefinitions = useMemo(() => {
    if (!standardCategory) return [];
    return definitions.filter(d => d.category_name === standardCategory);
  }, [definitions, standardCategory]);

  // v3.1.0: گزینه‌های عیب استاندارد — از دسته انتخاب‌شده
  const standardOptions = useMemo(() => {
    return filteredDefinitions.map(d => ({
      value: String(d.id),
      label: d.title,
      group: d.category_name || undefined,
    }));
  }, [filteredDefinitions]);

  // v3.3.0: با تغییر دسته، انتخاب عیب قبلی پاک می‌شود
  const onCategoryChange = (v: string) => {
    setStandardCategory(v);
    setStandardId("");
  };

  // با انتخاب عیب استاندارد: عنوان + دسته پر می‌شوند
  const onStandardSelect = (v: string) => {
    setStandardId(v);
    if (!v) return;
    const def = definitions.find(d => String(d.id) === v);
    if (def) {
      setForm(p => ({
        ...p,
        title: def.title || p.title,
        defect_type: def.category_name || p.defect_type,
        // اولویت پیش‌فرض تعریف استاندارد
        priority: (def as any).default_priority || p.priority,
        severity: (def as any).default_severity || p.severity,
      }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("عنوان عیب الزامی است (یا از فهرست عیوب استاندارد انتخاب کنید)"); return; }
    setSubmitting(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        defect_type: form.defect_type.trim() || null,
        severity: form.severity,
        priority: form.priority,
        safety_risk: form.safety_risk,
        line_id: form.line_id ? Number(form.line_id) : null,
        location_desc: form.location_desc.trim() || null,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
      };
      // v3.1.0: شناسه عیب استاندارد در صورت انتخاب
      if (standardId) payload.defect_definition_id = Number(standardId);

      if (isEdit && editRow?.id) {
        await apiClient.put(`${API_ENDPOINTS.defects}/${editRow.id}`, payload);
      } else {
        await apiClient.post(API_ENDPOINTS.defects, payload);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت عیب");
    } finally {
      setSubmitting(false);
    }
  };

  const lineOptions = lines.map(l => ({
    value: String(l.id),
    label: `${l.line_code || ""} — ${(l.name || "").slice(0, 50)}`,
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit
              ? `ویرایش عیب: ${editRow?.defect_code || ""}`
              : isDuplicate
                ? `ثبت عیب جدید (کپی از: ${duplicateFrom?.defect_code || ""})`
                : "ثبت عیب جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <FormSection title="مشخصات عیب">

          {/* v3.3.0: انتخاب زنجیره‌ای — اول دسته کلی (۲۴ دسته)، بعد عیب همان دسته */}
          <div className="space-y-2 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900">
            <Label className="text-right flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              انتخاب از عیوب استاندارد (اختیاری)
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SearchableSelect
                value={standardCategory}
                onChange={onCategoryChange}
                options={categoryOptions}
                placeholder={definitionsLoading ? "در حال بارگذاری دسته‌ها..." : "۱) انتخاب دسته..."}
                searchPlaceholder="جستجوی دسته..."
                allowClear
              />
              <SearchableSelect
                value={standardId}
                onChange={onStandardSelect}
                options={standardOptions}
                placeholder={standardCategory ? "۲) انتخاب عیب..." : "ابتدا دسته را انتخاب کنید"}
                searchPlaceholder="جستجوی عیب..."
                disabled={!standardCategory}
                allowClear
              />
            </div>
            <p className="text-xs text-slate-400 text-right">
              {standardCategory
                ? `${filteredDefinitions.length.toLocaleString("fa-IR")} عیب در دسته «${standardCategory}» — با انتخاب، عنوان، شدت و اولویت خودکار پر می‌شوند`
                : `اول دسته کلی را انتخاب کنید (${categoryOptions.length.toLocaleString("fa-IR")} دسته / ${definitions.length.toLocaleString("fa-IR")} عیب استاندارد)`}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-right block">قرارداد</Label>
            <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />
          </div>

          <div className="space-y-2">
            <Label className="text-right block">عنوان عیب (اجباری)</Label>
            <Input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="مثلاً: خرابی مقره فاز R دکل ۴۵"
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">شدت</Label>
              <SearchableSelect
                value={form.severity}
                onChange={v => setForm({ ...form, severity: v || "minor" })}
                options={[
                  { value: "minor", label: "جزئی" },
                  { value: "major", label: "عمده" },
                  { value: "critical", label: "بحرانی" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">اولویت</Label>
              <SearchableSelect
                value={form.priority}
                onChange={v => setForm({ ...form, priority: v || "medium" })}
                options={[
                  { value: "low", label: "پایین" },
                  { value: "medium", label: "متوسط" },
                  { value: "high", label: "بالا" },
                  { value: "critical", label: "بحرانی" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">ریسک ایمنی</Label>
              <SearchableSelect
                value={form.safety_risk}
                onChange={v => setForm({ ...form, safety_risk: v || "none" })}
                options={[
                  { value: "none", label: "ندارد" },
                  { value: "low", label: "کم" },
                  { value: "medium", label: "متوسط" },
                  { value: "high", label: "زیاد" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">خط انتقال (اختیاری)</Label>
              <SearchableSelect
                value={form.line_id}
                onChange={v => setForm({ ...form, line_id: v })}
                options={lineOptions}
                placeholder={linesLoading ? "در حال بارگذاری خطوط..." : "جستجوی خط (کد یا نام)..."}
                searchPlaceholder="کد خط یا نام خط..."
                allowClear
              />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">نوع / دسته عیب (اختیاری)</Label>
              <Input
                value={form.defect_type}
                onChange={e => setForm({ ...form, defect_type: e.target.value })}
                placeholder="مثلاً: عیوب زنجیر مقره ها"
                className="text-right"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-right block">محل / موقعیت (اختیاری)</Label>
            <Input
              value={form.location_desc}
              onChange={e => setForm({ ...form, location_desc: e.target.value })}
              placeholder="مثلاً: ۲۰۰ متر بعد از پل، سمت راست جاده"
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-right block">توضیحات</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="text-right"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال {isEdit ? "ویرایش" : "ثبت"}...</>
                : isEdit ? "اعمال ویرایش" : "ثبت عیب"}
            </Button>
          </DialogFooter>
          </FormSection>
        </form>
      </DialogContent>
    </Dialog>
  );
}
