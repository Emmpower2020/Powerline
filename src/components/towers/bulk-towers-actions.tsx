"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { INSULATOR_TYPES } from "@/components/towers/create-tower-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, ListChecks, Power, PowerOff, Building2, Radio, Layers, Cable, UserCog, Link2 as Link2Icon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { ContractSelect } from "@/components/contract-select";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { useTowerReferences } from "@/hooks/use-tower-references";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";
import { BulkOperationPanel, type BulkOperationProgress } from "@/components/bulk-operation-dialog";

interface BulkTowersActionsProps {
  getSelection: () => any[];
  onApplied: () => void;
}

type FieldAction =
  | "tower_structure" | "tower_type" | "tower_type_code"
  | "insulator_all" | "line_supervisor" | "line_id" | "contract";

const TOWER_TYPES = ["کششی", "آویزی"];

const actionMeta: Record<FieldAction, { title: string; label: string; placeholder?: string }> = {
  tower_structure:      { title: "تغییر گروهی ساختار دکل", label: "ساختار دکل", placeholder: "مثلاً: مشبک فلزی" },
  tower_type: { title: "تغییر گروهی نوع دکل", label: "نوع دکل (کششی/آویزی)" },
   tower_type_code: { title: "تغییر گروهی کد نوع دکل", label: "کد نوع دکل (NN، LT و...)", placeholder: "مثلاً: NN" },
    insulator_all:        { title: "تغییر گروهی نوع مقره (هر ۶ فاز)", label: "نوع مقره" },
  line_supervisor:      { title: "تغییر گروهی سرپرست خط", label: "نام سرپرست خط", placeholder: "مثلاً: یادگار میری" },
  line_id:              { title: "اتصال گروهی دکل‌ها به خط", label: "خط" },
  contract:             { title: "تغییر گروهی قرارداد", label: "قرارداد" },
};

/**
 * عملیات گروهی روی دکل‌های انتخاب‌شده — v4.3.32 بر اساس ساختار اکسل رسمی
 */
export function BulkTowersActions({ getSelection, onApplied }: BulkTowersActionsProps) {
  const [fieldAction, setFieldAction] = useState<FieldAction | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);
  const [pendingOperation, setPendingOperation] = useState<{ rows: any[]; patch: Record<string, unknown>; label: string } | null>(null);
  const [operationOpen, setOperationOpen] = useState(false);
  const [lines, setLines] = useState<any[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);
  // v3.0.0: سرپرست‌ها از پرسنل با کمبوباکس قابل جستجو
  const { supervisorOptions } = usePersonnelOptions();
  const { structures: towerStructures, typeCodes: towerTypeCodes, loading: towerReferencesLoading } = useTowerReferences(
    fieldAction === "tower_structure" || fieldAction === "tower_type_code"
  );
  const { toast } = useToast();

  // v3.4.0: خطای لود خطوط فقط یک‌بار Toast می‌دهد (نه پشت‌سرهم) و در لاگ خطاها ثبت می‌شود
  const linesErrorShownRef = useRef(false);
  useEffect(() => {
    if (fieldAction === "line_id" && !linesLoaded) {
      apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 1000 })
        .then((res: any) => {
          setLines(res?.data || []);
          setLinesLoaded(true);
          linesErrorShownRef.current = false;
        })
        .catch((err: any) => {
          logError({
            title: "خطا در دریافت لیست خطوط (عملیات گروهی دکل‌ها)",
            message: err?.message || "خطای نامشخص",
            source: "towers/bulk-towers-actions",
            statusCode: err?.statusCode ?? null,
          });
          if (!linesErrorShownRef.current) {
            linesErrorShownRef.current = true;
            toast({ title: "خطا در دریافت لیست خطوط", description: "سرور موقتاً در دسترس نیست — جزئیات در «لاگ خطاها»", variant: "destructive" });
          }
        });
    }
  }, [fieldAction, linesLoaded, toast]);

  const requireSelection = useCallback((): boolean => {
    const sel = getSelection();
    if (!sel || sel.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "ابتدا با چک‌باکس، دکل‌های مورد نظر را انتخاب کنید" });
      return false;
    }
    return true;
  }, [getSelection, toast]);

  const startFieldAction = (action: FieldAction) => {
    if (!requireSelection()) return;
    setRows(getSelection());
    setValue("");
    setFieldAction(action);
  };

  // ویرایش گروهی ابتدا تأیید می‌شود؛ همان پنجره در زمان اجرا نوار پیشرفت را نمایش می‌دهد.
  const requestPatch = (targetRows: any[], patch: Record<string, unknown>, successText: string) => {
    if (targetRows.length === 0) return;
    // دیالوگ بسته نمی‌شود؛ فقط محتوای همان پنجره به مرحلهٔ «تأیید عملیات» عوض می‌شود
    // تا پس‌زمینه (نور صفحه) بین دو مرحله فلش نزند.
    setPendingOperation({ rows: targetRows, patch, label: successText });
    setProgress({ completed: 0, total: targetRows.length, success: 0, failed: 0 });
    setOperationOpen(true);
  };

  const applyPatch = async () => {
    if (!pendingOperation) return;
    const { rows: targetRows, patch, label: successText } = pendingOperation;
    const BATCH_SIZE = 100;
    const batches = Array.from({ length: Math.ceil(targetRows.length / BATCH_SIZE) }, (_, i) =>
      targetRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    );
    setApplying(true);
    let success = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          const res = await apiClient.post<any>(API_ENDPOINTS.towerBulkUpdate, {
            ids: batch.map((row: any) => row.id),
            patch,
          }, { timeoutMs: 60_000 });
          success += Number(res?.data?.updated ?? batch.length);
        } catch (err: any) {
          errors.push(`بسته ${i + 1}: ${err?.message || "خطای نامشخص"}`);
        }
        const completed = Math.min((i + 1) * BATCH_SIZE, targetRows.length);
        setProgress({ completed, total: targetRows.length, success, failed: errors.length });
      }
      onApplied();
      setOperationOpen(false);
      setFieldAction(null);
      if (errors.length === 0) toast({ title: "انجام شد", description: `${successText} — ${success.toLocaleString("fa-IR")} ردیف` });
      else toast({ title: "اعمال ناقص", description: `${success.toLocaleString("fa-IR")} ردیف موفق، ${errors.length.toLocaleString("fa-IR")} بسته ناموفق — اولین خطا: ${errors[0]}`, variant: "destructive" });
    } finally {
      setApplying(false);
      setPendingOperation(null);
    }
  };

  const confirmField = async () => {
    if (!fieldAction) return;
    const isText = ["line_supervisor"].includes(fieldAction);
    const isSelect = ["tower_type", "insulator_all", "line_id", "contract"].includes(fieldAction);

    if (isText && !value.trim()) {
      toast({ title: "مقدار را وارد کنید" });
      return;
    }
    if (isSelect && !value) {
      toast({ title: "یک گزینه انتخاب کنید" });
      return;
    }

    let patch: Record<string, unknown>;
    switch (fieldAction) {
      case "tower_structure":      patch = { tower_structure: value.trim() }; break;
      case "tower_type_code": patch = { tower_type_code: value.trim() }; break;
      case "tower_type":           patch = { tower_type: value }; break;
      case "line_supervisor":      patch = { line_supervisor: value.trim() }; break;
      case "line_id":              patch = { line_id: Number(value) }; break;
      // «نامشخص» → پاک شدن قرارداد (NULL)؛ بک‌اند contract_id=null را می‌پذیرد
      case "contract":             patch = { contract_id: value === "__unknown__" ? null : Number(value) }; break;
      case "insulator_all":
        // یک نوع مقره روی هر ۶ فاز/مدار اعمال می‌شود
        patch = {
          insulator_r1: value, insulator_s1: value, insulator_t1: value,
          insulator_r2: value, insulator_s2: value, insulator_t2: value,
        };
        break;
      default: return;
    }
    // برچسب عملیات: «تغییر گروهی قرارداد» → «تغییر قرارداد» تا جملهٔ
    // «در حال اجرای تغییر قرارداد» درست و خوانا ساخته شود.
    const label = actionMeta[fieldAction].title
      .replace("تغییر گروهی ", "تغییر ")
      .replace("اتصال گروهی دکل‌ها به خط", "اتصال دکل‌ها به خط");
    requestPatch(rows, patch, label);
  };

  // یک پنجره برای هر دو مرحله: انتخاب مقدار و تأیید/اجرای عملیات گروهی
  const dialogOpen = fieldAction !== null || operationOpen;

  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-9 p-0 text-indigo-600 hover:bg-indigo-50 border-indigo-200"
            title="عملیات گروهی روی ردیف‌های انتخاب‌شده"
          >
            <ListChecks className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-right">
            عملیات گروهی روی ردیف‌های انتخاب‌شده
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ItemRow icon={<Power className="w-4 h-4 text-emerald-600" />} label="فعال کردن" onClick={() => {
            if (!requireSelection()) return;
            requestPatch(getSelection(), { status: "active" }, "دکل‌ها فعال شدند");
          }} />
          <ItemRow icon={<PowerOff className="w-4 h-4 text-slate-500" />} label="غیرفعال کردن" onClick={() => {
            if (!requireSelection()) return;
            requestPatch(getSelection(), { status: "inactive" }, "دکل‌ها غیرفعال شدند");
          }} />
          <DropdownMenuSeparator />
          <ItemRow icon={<Building2 className="w-4 h-4 text-slate-600" />} label="ساختار دکل" onClick={() => startFieldAction("tower_structure")} />
          <ItemRow icon={<Radio className="w-4 h-4 text-indigo-600" />} label="کد نوع دکل" onClick={() => startFieldAction("tower_type_code")} />
          <ItemRow icon={<Layers className="w-4 h-4 text-indigo-600" />} label="نوع دکل" onClick={() => startFieldAction("tower_type")} />
          <ItemRow icon={<Cable className="w-4 h-4 text-blue-600" />} label="نوع مقره (هر ۶ فاز)" onClick={() => startFieldAction("insulator_all")} />
          <DropdownMenuSeparator />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="سرپرست خط" onClick={() => startFieldAction("line_supervisor")} />
          <ItemRow icon={<Link2Icon className="w-4 h-4 text-emerald-600" />} label="اتصال به خط" onClick={() => startFieldAction("line_id")} />
          <ItemRow icon={<FileText className="w-4 h-4 text-indigo-600" />} label="قرارداد" onClick={() => startFieldAction("contract")} />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* دیالوگ یکپارچه: مرحلهٔ انتخاب مقدار → مرحلهٔ تأیید/اجرا (بدون بسته‌شدن پنجره) */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !applying) { setFieldAction(null); setOperationOpen(false); setPendingOperation(null); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {operationOpen
                ? (applying ? `در حال اجرای ${pendingOperation?.label ?? "عملیات گروهی"}` : "تأیید عملیات گروهی")
                : (fieldAction ? actionMeta[fieldAction].title : "")}
            </DialogTitle>
          </DialogHeader>
          {operationOpen ? (
            <BulkOperationPanel
              entityName="دکل"
              operationLabel={pendingOperation?.label ?? "عملیات گروهی"}
              progress={progress}
              running={applying}
              onCancel={() => { if (!applying) { setOperationOpen(false); setPendingOperation(null); } }}
              onConfirm={applyPatch}
            />
          ) : (
          <>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-right">
              این مقدار روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> دکل انتخاب‌شده اعمال می‌شود.
            </p>

            {fieldAction === "contract" ? (
              <div className="space-y-2">
                <Label className="text-right block">قرارداد</Label>
                <ContractSelect value={value} onChange={setValue} preserveUnknownValue />
              </div>
            ) : fieldAction === "line_id" ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.line_id.label}</Label>
                {linesLoaded ? (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب خط..." /></SelectTrigger>
                    <SelectContent>
                      {lines.map((l: any) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400 p-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت لیست خطوط...
                  </div>
                )}
              </div>
            ) : fieldAction === "line_supervisor" ? (
              // v3.0.0: سرپرست خط از پرسنل با کمبوباکس قابل جستجو
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.line_supervisor.label}</Label>
                <SearchableSelect
                  value={value}
                  onChange={setValue}
                  options={supervisorOptions}
                  placeholder="جستجوی نام سرپرست..."
                  searchPlaceholder="نام سرپرست اکیپ..."
                />
              </div>
            ) : fieldAction === "tower_structure" ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.tower_structure.label}</Label>
                {towerReferencesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 p-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت ساختارهای دکل...
                  </div>
                ) : (
                  <SearchableSelect
                    value={value}
                    onChange={setValue}
                    options={towerStructures.map(x => ({ value: x.name, label: x.name }))}
                    placeholder="انتخاب ساختار دکل..."
                    searchPlaceholder="جستجوی ساختار دکل..."
                    allowClear
                  />
                )}
              </div>
            ) : fieldAction === "tower_type_code" ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.tower_type_code.label}</Label>
                {towerReferencesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 p-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت کدهای نوع دکل...
                  </div>
                ) : (
                  <SearchableSelect
                    value={value}
                    onChange={setValue}
                    options={towerTypeCodes.map(x => ({ value: x.code, label: x.title ? `${x.code} — ${x.title}` : x.code }))}
                    placeholder="انتخاب کد نوع دکل..."
                    searchPlaceholder="جستجوی کد نوع دکل..."
                    allowClear
                  />
                )}
              </div>
            ) : fieldAction === "tower_type" ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.tower_type.label}</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب نوع دکل..." /></SelectTrigger>
                  <SelectContent>
                    {TOWER_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : fieldAction === "insulator_all" ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.insulator_all.label}</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب نوع مقره..." /></SelectTrigger>
                  <SelectContent>
                    {INSULATOR_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400 text-right">روی هر ۶ فاز (R/S/T دو مدار) اعمال می‌شود</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFieldAction(null)} disabled={applying}>انصراف</Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={applying || (fieldAction === "line_id" && !linesLoaded)}
              onClick={confirmField}
            >
              {applying ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال اعمال...</> : "اعمال روی همه"}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <DropdownMenuItem className="gap-2 cursor-pointer text-right" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </DropdownMenuItem>
  );
}
