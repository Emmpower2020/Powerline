"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ListChecks, Power, PowerOff, UserCog, Layers, Zap, Cable, Building2, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { useConductors } from "@/hooks/use-conductors";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { useToast } from "@/hooks/use-toast";
import { useTowerReferences } from "@/hooks/use-tower-references";
import { ContractSelect } from "@/components/contract-select";
import { BulkOperationPanel, type BulkOperationProgress } from "@/components/bulk-operation-dialog";

interface BulkLinesActionsProps {
  /** ردیف‌های انتخاب‌شده — در لحظهٔ کلیک از جدول خوانده می‌شود */
  getSelection: () => any[];
  /** بعد از اعمال موفق — والد داده را refresh و انتخاب‌ها را پاک می‌کند */
  onApplied: () => void;
}

/** اعمالی که با دیالوگ مقدار انجام می‌شوند */
type FieldAction =
  | "supervisor" | "expert" | "contractor" | "contract"
  | "voltage" | "conductor_type" | "tower_structure";

const VOLTAGE_OPTIONS = [63, 132, 230, 400];

const actionMeta: Record<FieldAction, { title: string; label: string; placeholder?: string }> = {
  supervisor:          { title: "تغییر گروهی سرپرست خط", label: "نام سرپرست خط", placeholder: "مثلاً: یادگار میری" },
  expert:              { title: "تغییر گروهی کارشناس خط", label: "نام کارشناس خط", placeholder: "مثلاً: وحید سلیمانی" },
  contractor:          { title: "تغییر گروهی پیمانکار", label: "پیمانکار" },
  contract:            { title: "تغییر گروهی قرارداد", label: "قرارداد" },
  voltage:             { title: "تغییر گروهی ولتاژ", label: "ولتاژ (kV)" },
  conductor_type:      { title: "تغییر گروهی نوع سیم", label: "نوع سیم", placeholder: "مثلاً: لینکس (Lynx)" },
  tower_structure:{ title: "تغییر گروهی نوع سازه دکل", label: "نوع سازه دکل", placeholder: "مثلاً: مشبک فلزی" },
};

/**
 * عملیات گروهی روی خطوط انتخاب‌شده:
 * فعال/غیرفعال، نوع خط، نوع سیم، ولتاژ، نوع سازه دکل، سرپرست، کارشناس و پیمانکار
 */
export function BulkLinesActions({ getSelection, onApplied }: BulkLinesActionsProps) {
  const [fieldAction, setFieldAction] = useState<FieldAction | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<{ rows: any[]; patch: Record<string, unknown>; label: string } | null>(null);
  const [operationOpen, setOperationOpen] = useState(false);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);
  const [contractors, setContractors] = useState<any[]>([]);
  const [contractorsLoaded, setContractorsLoaded] = useState(false);
  // v3.0.0: سرپرست‌ها و کارشناس‌ها از پرسنل با کمبوباکس قابل جستجو
  const { supervisorOptions, expertOptions } = usePersonnelOptions();
  // v3.5.0: سیم‌ها از جدول conductors
  const { options: conductorOptions } = useConductors();
  const { structures: towerStructures } = useTowerReferences(fieldAction === "tower_structure");
  const { toast } = useToast();

  // لیست پیمانکارها فقط وقتی لازم شد بارگذاری می‌شود
  useEffect(() => {
    if (fieldAction === "contractor" && !contractorsLoaded) {
      apiClient.get<any>(API_ENDPOINTS.contractors, { page: 1, page_size: 100, status: "active" })
        .then((res: any) => {
          setContractors(res?.data || []);
          setContractorsLoaded(true);
        })
        .catch(() => {
          toast({ title: "خطا در دریافت لیست پیمانکاران", variant: "destructive" });
        });
    }
  }, [fieldAction, contractorsLoaded, toast]);

  const requireSelection = useCallback((): boolean => {
    const sel = getSelection();
    if (!sel || sel.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "ابتدا با چک‌باکس، خطوط مورد نظر را انتخاب کنید" });
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

  const requestPatch = (targetRows: any[], patch: Record<string, unknown>, successText: string) => {
    if (targetRows.length === 0) return;
    // دیالوگ بسته نمی‌شود؛ محتوای همان پنجره به مرحلهٔ «تأیید عملیات» عوض می‌شود
    // تا نور پس‌زمینه بین دو مرحله فلش نزند و حس پرش پنجره نداشته باشیم.
    setPendingOperation({ rows: targetRows, patch, label: successText });
    setProgress({ completed: 0, total: targetRows.length, success: 0, failed: 0 });
    setOperationOpen(true);
  };

  const applyPatch = async () => {
    if (!pendingOperation) return;
    const { rows: targetRows, patch, label: successText } = pendingOperation;
    // v4.3.53: مانند دکل‌ها، بسته‌های ۱۰۰تایی با یک درخواست (lines/bulk-update)
    // به‌جای ویرایش یکی‌یکی — چند برابر سریع‌تر و با تعداد درخواست کمتر.
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
          const res = await apiClient.post<any>(API_ENDPOINTS.linesBulkUpdate, {
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
    const isText = ["supervisor", "expert"].includes(fieldAction); // v3.4.1+: نوع سیم/سازه کمبوباکس شدند (سیم از جدول conductors — v3.5.0)
    const isSelect = ["contractor", "contract", "voltage"].includes(fieldAction);

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
      case "supervisor":           patch = { line_supervisor: value.trim() }; break;
      case "expert":               patch = { line_expert: value.trim() }; break;
      case "conductor_type":       patch = { conductor_type: value.trim() }; break;
      case "tower_structure": patch = { tower_structure: value.trim() }; break;
      case "contractor":           patch = { contractor_id: Number(value) }; break;
      case "contract":             patch = { contract_id: value === "__unknown__" ? null : Number(value) }; break;
      case "voltage": {
        const v = Number(value);
        // فقط ستون واقعی دیتابیس lines استفاده می‌شود: voltage_kv
        patch = { voltage_kv: v };
        break;
      }
      default: return;
    }
    // «تغییر گروهی ولتاژ» → «تغییر ولتاژ» تا «در حال اجرای تغییر ولتاژ» درست ساخته شود
    requestPatch(rows, patch, actionMeta[fieldAction].title.replace("تغییر گروهی ", "تغییر "));
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
            requestPatch(getSelection(), { status: "active" }, "خطوط فعال شدند");
          }} />
          <ItemRow icon={<PowerOff className="w-4 h-4 text-slate-500" />} label="غیرفعال کردن" onClick={() => {
            if (!requireSelection()) return;
            requestPatch(getSelection(), { status: "inactive" }, "خطوط غیرفعال شدند");
          }} />
          <DropdownMenuSeparator />
          <ItemRow icon={<Zap className="w-4 h-4 text-amber-500" />} label="ولتاژ" onClick={() => startFieldAction("voltage")} />
          <ItemRow icon={<Cable className="w-4 h-4 text-blue-600" />} label="نوع سیم" onClick={() => startFieldAction("conductor_type")} />
          <ItemRow icon={<Building2 className="w-4 h-4 text-slate-600" />} label="نوع سازه دکل" onClick={() => startFieldAction("tower_structure")} />
          <DropdownMenuSeparator />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="سرپرست خط" onClick={() => startFieldAction("supervisor")} />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="کارشناس خط" onClick={() => startFieldAction("expert")} />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="پیمانکار" onClick={() => startFieldAction("contractor")} />
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
              entityName="خط"
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
              این مقدار روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> خط انتخاب‌شده اعمال می‌شود.
            </p>

            {fieldAction === "contract" ? (
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">قرارداد</Label>
                <ContractSelect value={value} onChange={setValue} preserveUnknownValue />
              </div>
            ) : fieldAction === "contractor" ? (
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">{actionMeta.contractor.label}</Label>
                {contractorsLoaded ? (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب پیمانکار..." /></SelectTrigger>
                    <SelectContent>
                      {contractors.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.contractor_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400 p-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت لیست پیمانکاران...
                  </div>
                )}
              </div>
            ) : fieldAction === "voltage" ? (
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">{actionMeta.voltage.label}</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب ولتاژ..." /></SelectTrigger>
                  <SelectContent>
                    {VOLTAGE_OPTIONS.map(v => (
                      <SelectItem key={v} value={String(v)}>
                        <span className="nums-fa">{v.toLocaleString("fa-IR")}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : fieldAction === "supervisor" ? (
              // v3.0.0: سرپرست خط از پرسنل با کمبوباکس قابل جستجو
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">{actionMeta.supervisor.label}</Label>
                <SearchableSelect
                  value={value}
                  onChange={setValue}
                  options={supervisorOptions}
                  placeholder="جستجوی نام سرپرست..."
                  searchPlaceholder="نام سرپرست اکیپ..."
                />
              </div>
            ) : fieldAction === "expert" ? (
              // v3.0.0: کارشناس خط از پرسنل با کمبوباکس قابل جستجو
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">{actionMeta.expert.label}</Label>
                <SearchableSelect
                  value={value}
                  onChange={setValue}
                  options={expertOptions}
                  placeholder="جستجوی نام کارشناس..."
                  searchPlaceholder="نام کارشناس خط..."
                />
              </div>
            ) : fieldAction === "conductor_type" ? (
              // v3.4.1: نوع سیم از فهرست استاندارد هادی‌ها
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">{actionMeta.conductor_type.label}</Label>
                <SearchableSelect
                  value={value}
                  onChange={setValue}
                  options={conductorOptions}
                  placeholder="انتخاب نوع سیم..."
                  searchPlaceholder="جستجو (لینکس، کاناری...)"
                />
              </div>
            ) : fieldAction === "tower_structure" ? (
              // v3.4.1: نوع سازه دکل از مقادیر معتبر دیتابیس
              <div className="space-y-2">
                <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">{actionMeta.tower_structure.label}</Label>
                <SearchableSelect
                  value={value}
                  onChange={setValue}
                  options={towerStructures.map(s => ({ value: s.name, label: s.name }))}
                  placeholder="انتخاب نوع سازه..."
                  searchPlaceholder="جستجو..."
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFieldAction(null)} disabled={applying}>انصراف</Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={applying || (fieldAction === "contractor" && !contractorsLoaded)}
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

/** آیتم منو — با dir=rtl آیکون سمت راست و متن راست‌چین می‌شود */
function ItemRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <DropdownMenuItem className="gap-2 cursor-pointer text-right" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </DropdownMenuItem>
  );
}
