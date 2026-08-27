"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ListChecks, Power, PowerOff, UserCog, Layers, Zap, Cable, Building2 } from "lucide-react";
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

interface BulkLinesActionsProps {
  /** ردیف‌های انتخاب‌شده — در لحظهٔ کلیک از جدول خوانده می‌شود */
  getSelection: () => any[];
  /** بعد از اعمال موفق — والد داده را refresh و انتخاب‌ها را پاک می‌کند */
  onApplied: () => void;
}

/** اعمالی که با دیالوگ مقدار انجام می‌شوند */
type FieldAction =
  | "supervisor" | "expert" | "contractor"
  | "voltage" | "conductor_type" | "tower_structure";

const VOLTAGE_OPTIONS = [63, 132, 230, 400];

const actionMeta: Record<FieldAction, { title: string; label: string; placeholder?: string }> = {
  supervisor:          { title: "تغییر گروهی سرپرست خط", label: "نام سرپرست خط", placeholder: "مثلاً: یادگار میری" },
  expert:              { title: "تغییر گروهی کارشناس خط", label: "نام کارشناس خط", placeholder: "مثلاً: وحید سلیمانی" },
  contractor:          { title: "تغییر گروهی پیمانکار", label: "پیمانکار" },
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
      apiClient.get<any>(API_ENDPOINTS.contractors, { page: 1, page_size: 100, is_active: 1 })
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

  const applyPatch = async (targetRows: any[], patch: Record<string, unknown>, successText: string) => {
    if (targetRows.length === 0) return;
    setApplying(true);
    let success = 0;
    const errors: string[] = [];
    for (const row of targetRows) {
      try {
        await apiClient.put(`${API_ENDPOINTS.lines}/${row.id}`, patch);
        success++;
      } catch (err: any) {
        errors.push(`${row.line_code || row.id}: ${err?.message || "خطا"}`);
      }
    }
    setApplying(false);
    setFieldAction(null);

    onApplied();

    if (errors.length === 0) {
      toast({
        title: "انجام شد",
        description: `${successText} — ${success.toLocaleString("fa-IR")} ردیف`
      });
    } else {
      toast({
        title: "اعمال ناقص",
        description: `${success.toLocaleString("fa-IR")} ردیف موفق، ${errors.length.toLocaleString("fa-IR")} ناموفق — اولین خطا: ${errors[0]}`,
        variant: "destructive",
      });
    }
  };

  const confirmField = async () => {
    if (!fieldAction) return;
    const isText = ["supervisor", "expert"].includes(fieldAction); // v3.4.1+: نوع سیم/سازه کمبوباکس شدند (سیم از جدول conductors — v3.5.0)
    const isSelect = ["contractor", "voltage"].includes(fieldAction);

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
      case "voltage": {
        const v = Number(value);
        // فقط ستون واقعی دیتابیس lines استفاده می‌شود: voltage_kv
        patch = { voltage_kv: v };
        break;
      }
      default: return;
    }
    await applyPatch(rows, patch, actionMeta[fieldAction].title.replace("تغییر گروهی ", "") + " تغییر کرد");
  };

  const dialogOpen = fieldAction !== null;

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
            applyPatch(getSelection(), { is_active: true }, "خطوط فعال شدند");
          }} />
          <ItemRow icon={<PowerOff className="w-4 h-4 text-slate-500" />} label="غیرفعال کردن" onClick={() => {
            if (!requireSelection()) return;
            applyPatch(getSelection(), { is_active: false }, "خطوط غیرفعال شدند");
          }} />
          <DropdownMenuSeparator />
          <ItemRow icon={<Zap className="w-4 h-4 text-amber-500" />} label="ولتاژ" onClick={() => startFieldAction("voltage")} />
          <ItemRow icon={<Cable className="w-4 h-4 text-blue-600" />} label="نوع سیم" onClick={() => startFieldAction("conductor_type")} />
          <ItemRow icon={<Building2 className="w-4 h-4 text-slate-600" />} label="نوع سازه دکل" onClick={() => startFieldAction("tower_structure")} />
          <DropdownMenuSeparator />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="سرپرست خط" onClick={() => startFieldAction("supervisor")} />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="کارشناس خط" onClick={() => startFieldAction("expert")} />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="پیمانکار" onClick={() => startFieldAction("contractor")} />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* دیالوگ مقدار برای تغییرات گروهی */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !applying) setFieldAction(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {fieldAction ? actionMeta[fieldAction].title : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-right">
              این مقدار روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> خط انتخاب‌شده اعمال می‌شود.
            </p>

            {fieldAction === "contractor" ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta.contractor.label}</Label>
                {contractorsLoaded ? (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="w-full bg-white"><SelectValue placeholder="انتخاب پیمانکار..." /></SelectTrigger>
                    <SelectContent>
                      {contractors.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
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
                <Label className="text-right block">{actionMeta.voltage.label}</Label>
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
                <Label className="text-right block">{actionMeta.supervisor.label}</Label>
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
                <Label className="text-right block">{actionMeta.expert.label}</Label>
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
                <Label className="text-right block">{actionMeta.conductor_type.label}</Label>
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
                <Label className="text-right block">{actionMeta.tower_structure.label}</Label>
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
