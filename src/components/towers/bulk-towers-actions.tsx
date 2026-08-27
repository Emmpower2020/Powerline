"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { INSULATOR_TYPES } from "@/components/towers/create-tower-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ListChecks, Power, PowerOff, Building2, Radio, Layers, Cable, UserCog, Link2 as Link2Icon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { useTowerReferences } from "@/hooks/use-tower-references";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";

interface BulkTowersActionsProps {
  getSelection: () => any[];
  onApplied: () => void;
}

type FieldAction =
  | "tower_structure" | "tower_type" | "tower_type_code"
  | "insulator_all" | "line_supervisor" | "line_id";

const TOWER_TYPES = ["کششی", "آویزی"];

const actionMeta: Record<FieldAction, { title: string; label: string; placeholder?: string }> = {
  tower_structure:      { title: "تغییر گروهی ساختار دکل", label: "ساختار دکل", placeholder: "مثلاً: مشبک فلزی" },
  tower_type: { title: "تغییر گروهی نوع دکل", label: "نوع دکل (کششی/آویزی)" },
   tower_type_code: { title: "تغییر گروهی کد نوع دکل", label: "کد نوع دکل (NN، LT و...)", placeholder: "مثلاً: NN" },
    insulator_all:        { title: "تغییر گروهی نوع مقره (هر ۶ فاز)", label: "نوع مقره" },
  line_supervisor:      { title: "تغییر گروهی سرپرست خط", label: "نام سرپرست خط", placeholder: "مثلاً: یادگار میری" },
  line_id:              { title: "اتصال گروهی دکل‌ها به خط", label: "خط" },
};

/**
 * عملیات گروهی روی دکل‌های انتخاب‌شده — v2.1.0 بر اساس ساختار اکسل رسمی
 */
export function BulkTowersActions({ getSelection, onApplied }: BulkTowersActionsProps) {
  const [fieldAction, setFieldAction] = useState<FieldAction | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);
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

  const applyPatch = async (targetRows: any[], patch: Record<string, unknown>, successText: string) => {
    if (targetRows.length === 0) return;
    setApplying(true);
    let success = 0;
    const errors: string[] = [];
    for (const row of targetRows) {
      try {
        await apiClient.put(`${API_ENDPOINTS.towers}/${row.id}`, patch);
        success++;
      } catch (err: any) {
        errors.push(`${row.tower_code || row.id}: ${err?.message || "خطا"}`);
      }
    }
    setApplying(false);
    setFieldAction(null);

    onApplied();

    if (errors.length === 0) {
      toast({ title: "انجام شد", description: `${successText} — ${success.toLocaleString("fa-IR")} ردیف` });
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
    const isText = ["line_supervisor"].includes(fieldAction);
    const isSelect = ["tower_type", "insulator_all", "line_id"].includes(fieldAction);

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
      case "insulator_all":
        // یک نوع مقره روی هر ۶ فاز/مدار اعمال می‌شود
        patch = {
          insulator_r1: value, insulator_s1: value, insulator_t1: value,
          insulator_r2: value, insulator_s2: value, insulator_t2: value,
        };
        break;
      default: return;
    }
    const label = actionMeta[fieldAction].title
      .replace("تغییر گروهی ", "")
      .replace("اتصال گروهی دکل‌ها به ", "اتصال به ");
    await applyPatch(rows, patch, label + " تغییر کرد");
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
            applyPatch(getSelection(), { is_active: true }, "دکل‌ها فعال شدند");
          }} />
          <ItemRow icon={<PowerOff className="w-4 h-4 text-slate-500" />} label="غیرفعال کردن" onClick={() => {
            if (!requireSelection()) return;
            applyPatch(getSelection(), { is_active: false }, "دکل‌ها غیرفعال شدند");
          }} />
          <DropdownMenuSeparator />
          <ItemRow icon={<Building2 className="w-4 h-4 text-slate-600" />} label="ساختار دکل" onClick={() => startFieldAction("tower_structure")} />
          <ItemRow icon={<Radio className="w-4 h-4 text-indigo-600" />} label="کد نوع دکل" onClick={() => startFieldAction("tower_type_code")} />
          <ItemRow icon={<Layers className="w-4 h-4 text-indigo-600" />} label="نوع دکل" onClick={() => startFieldAction("tower_type")} />
          <ItemRow icon={<Cable className="w-4 h-4 text-blue-600" />} label="نوع مقره (هر ۶ فاز)" onClick={() => startFieldAction("insulator_all")} />
          <DropdownMenuSeparator />
          <ItemRow icon={<UserCog className="w-4 h-4 text-indigo-600" />} label="سرپرست خط" onClick={() => startFieldAction("line_supervisor")} />
          <ItemRow icon={<Link2Icon className="w-4 h-4 text-emerald-600" />} label="اتصال به خط" onClick={() => startFieldAction("line_id")} />
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
              این مقدار روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> دکل انتخاب‌شده اعمال می‌شود.
            </p>

            {fieldAction === "line_id" ? (
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
            ) : fieldAction ? (
              <div className="space-y-2">
                <Label className="text-right block">{actionMeta[fieldAction].label}</Label>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="bg-white text-right"
                  placeholder={actionMeta[fieldAction].placeholder || ""}
                  autoFocus
                />
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
