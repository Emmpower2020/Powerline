"use client";

import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ListChecks, Power, PowerOff, UserCog, Briefcase, FileText, MapPin } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/searchable-select";
import { ContractSelect } from "@/components/contract-select";
import { DistrictSelect } from "@/components/district-select";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { canChangeDistrict as userCanChangeDistrict } from "@/hooks/use-district-options";
import { useToast } from "@/hooks/use-toast";
import { BulkOperationPanel, type BulkOperationProgress } from "@/components/bulk-operation-dialog";

interface BulkPersonnelActionsProps {
  getSelection: () => any[];
  onApplied: () => void;
  /** سمت‌های موجود برای پیشنهاد در کمبوباکس سمت */
  positionOptions?: Array<{ value: string; label: string }>;
}

type FieldAction = "position" | "supervisor" | "contract" | "district";

const actionMeta: Record<FieldAction, { title: string; label: string }> = {
  // v4.3.81: لیبل‌ها بدون پیشوند «تغییر» — استاندارد واحد با سایر جدول‌ها
  position:   { title: "تغییر گروهی سمت", label: "سمت" },
  supervisor: { title: "تغییر گروهی سرپرست", label: "سرپرست" },
  contract:   { title: "تغییر گروهی قرارداد", label: "قرارداد" },
  district:   { title: "تغییر گروهی امور بهره‌برداری", label: "امور بهره‌برداری" },
};

/**
 * عملیات گروهی روی پرسنل — v4.3.72
 * سمت / سرپرست / قرارداد / فعال-غیرفعال
 * اجرای دسته‌ای موازی (۱۰تایی) با نوار پیشرفت در همان پنجره.
 */
export function BulkPersonnelActions({ getSelection, onApplied, positionOptions = [] }: BulkPersonnelActionsProps) {
  const [fieldAction, setFieldAction] = useState<FieldAction | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);
  const [pendingOperation, setPendingOperation] = useState<{ rows: any[]; patch: Record<string, unknown>; label: string } | null>(null);
  const [operationOpen, setOperationOpen] = useState(false);
  const { supervisorOptions } = usePersonnelOptions();
  const { toast } = useToast();
  // v4.3.81: تغییر امور فقط برای مدیران — آیتم برای کاربر اموردار نمایش داده نمی‌شود
  const districtAllowed = userCanChangeDistrict();

  const requireSelection = useCallback((): boolean => {
    const sel = getSelection();
    if (!sel || sel.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "ابتدا با چک‌باکس، پرسنل مورد نظر را انتخاب کنید" });
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

  const requestPatch = (targetRows: any[], patch: Record<string, unknown>, label: string) => {
    if (targetRows.length === 0) return;
    setPendingOperation({ rows: targetRows, patch, label });
    setProgress({ completed: 0, total: targetRows.length, success: 0, failed: 0 });
    setOperationOpen(true);
  };

  const applyPatch = async () => {
    if (!pendingOperation) return;
    const { rows: targetRows, patch, label: successText } = pendingOperation;
    // v4.3.73: بسته‌های ۱۰۰تایی با یک درخواست (personnel/bulk-update) —
    // درخواست‌های موازی زیاد روی هاست اشتراکی مسدود می‌شدند و خطا می‌دادند
    const BATCH = 100;
    setApplying(true);
    let success = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < targetRows.length; i += BATCH) {
        const batch = targetRows.slice(i, i + BATCH);
        try {
          const res = await apiClient.post<any>("personnel/bulk-update", {
            ids: batch.map((row: any) => row.id),
            patch,
          }, { timeoutMs: 60_000 });
          success += Number(res?.data?.updated ?? batch.length);
        } catch (err: any) {
          errors.push(`بسته ${Math.floor(i / BATCH) + 1}: ${err?.message || "خطای نامشخص"}`);
        }
        setProgress({ completed: Math.min(i + BATCH, targetRows.length), total: targetRows.length, success, failed: errors.length });
      }
      onApplied();
      setOperationOpen(false);
      setFieldAction(null);
      if (errors.length === 0) toast({ title: "انجام شد", description: `${successText} — ${success.toLocaleString("fa-IR")} ردیف` });
      else toast({ title: "اعمال ناقص", description: `${success.toLocaleString("fa-IR")} ردیف موفق، ${errors.length.toLocaleString("fa-IR")} ناموفق — اولین خطا: ${errors[0]}`, variant: "destructive" });
    } finally {
      setApplying(false);
      setPendingOperation(null);
    }
  };

  const confirmField = () => {
    if (!fieldAction) return;
    if (fieldAction !== "contract" && fieldAction !== "district" && !value.trim()) {
      toast({ title: "یک مقدار انتخاب/وارد کنید" });
      return;
    }
    let patch: Record<string, unknown>;
    let label: string;
    switch (fieldAction) {
      case "position":
        if (!value.trim()) { toast({ title: "سمت را وارد کنید" }); return; }
        patch = { position: value.trim() }; label = "تغییر سمت"; break;
      case "supervisor":
        if (!value.trim()) { toast({ title: "سرپرست را انتخاب کنید" }); return; }
        patch = { supervisor_name: value.trim() }; label = "تغییر سرپرست"; break;
      case "contract":
        patch = { contract_id: value === "__unknown__" ? null : (value ? Number(value) : null) };
        label = value === "__unknown__" ? "پاک کردن قرارداد" : "انتقال به قرارداد";
        break;
      // v4.3.79: ویرایش گروهی امور بهره‌برداری پرسنل — «نامشخص» یعنی پاک کردن امور
      case "district":
        patch = { district_id: value === "__unknown__" ? null : (value ? Number(value) : null) };
        label = value === "__unknown__" ? "پاک کردن امور بهره‌برداری" : "انتقال به امور بهره‌برداری";
        break;
      default: return;
    }
    requestPatch(rows, patch, label);
  };

  const dialogOpen = fieldAction !== null || operationOpen;

  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 w-9 p-0 text-indigo-600 hover:bg-indigo-50 border-indigo-200" title="عملیات گروهی روی ردیف‌های انتخاب‌شده">
            <ListChecks className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-right">عملیات گروهی روی ردیف‌های انتخاب‌شده</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ItemRow icon={<Power className="w-4 h-4 text-emerald-600" />} label="فعال کردن" onClick={() => { if (requireSelection()) requestPatch(getSelection(), { status: "active" }, "فعال کردن"); }} />
          <ItemRow icon={<PowerOff className="w-4 h-4 text-slate-500" />} label="غیرفعال کردن" onClick={() => { if (requireSelection()) requestPatch(getSelection(), { status: "inactive" }, "غیرفعال کردن"); }} />
          <DropdownMenuSeparator />
          <ItemRow icon={<Briefcase className="w-4 h-4 text-indigo-600" />} label="سمت" onClick={() => startFieldAction("position")} />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="سرپرست" onClick={() => startFieldAction("supervisor")} />
          <ItemRow icon={<FileText className="w-4 h-4 text-indigo-600" />} label="قرارداد" onClick={() => startFieldAction("contract")} />
          {districtAllowed && <ItemRow icon={<MapPin className="w-4 h-4 text-emerald-600" />} label="امور بهره‌برداری" onClick={() => startFieldAction("district")} />}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* دیالوگ یکپارچه: انتخاب مقدار → تأیید/اجرا در همان پنجره (بدون فلش نور) */}
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
              entityName="پرسنل"
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
                این مقدار روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> پرسنل انتخاب‌شده اعمال می‌شود.
              </p>

              {fieldAction === "position" ? (
                <div className="space-y-2">
                  <Label className="text-right block">سمت</Label>
                  <SearchableSelect
                    value={value}
                    onChange={setValue}
                    options={positionOptions}
                    placeholder="انتخاب یا تایپ سمت..."
                    searchPlaceholder="جستجوی سمت..."
                    emptyText="سمتی با این جستجو نیست — مقدار را در فیلد زیر بنویسید"
                  />
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="یا سمت دلخواه را تایپ کنید (مثلاً: کارشناس انبار)"
                    className="bg-white text-right"
                  />
                </div>
              ) : fieldAction === "supervisor" ? (
                <div className="space-y-2">
                  <Label className="text-right block">سرپرست</Label>
                  <SearchableSelect
                    value={value}
                    onChange={setValue}
                    options={supervisorOptions}
                    placeholder="انتخاب سرپرست..."
                    searchPlaceholder="نام سرپرست..."
                  />
                </div>
              ) : fieldAction === "contract" ? (
                <div className="space-y-2">
                  <Label className="text-right block">قرارداد</Label>
                  <ContractSelect value={value} onChange={setValue} preserveUnknownValue />
                  <p className="text-[11px] text-slate-400 text-right">برای پاک کردن قرارداد «نامشخص» را انتخاب کنید</p>
                </div>
              ) : fieldAction === "district" ? (
                // v4.3.79: ویرایش گروهی امور بهره‌برداری پرسنل
                <div className="space-y-2">
                  <Label className="text-right block">امور بهره‌برداری</Label>
                  <DistrictSelect value={value} onChange={setValue} />
                  <p className="text-[11px] text-slate-400 text-right">برای پاک کردن امور «نامشخص» را انتخاب کنید</p>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFieldAction(null)} disabled={applying}>انصراف</Button>
              <Button type="button" className="bg-indigo-600 hover:bg-indigo-700" onClick={confirmField} disabled={applying}>اعمال روی همه</Button>
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
