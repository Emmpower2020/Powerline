"use client";

import { useEffect, useMemo, useState } from "react";
import { putRole, type RoleRow } from "@/lib/roles-api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Lock } from "lucide-react";
import {
  MODULE_ACCESS, MODULE_GROUPS, TOOL_KEYS, TOOL_LABELS,
  compactPermissions, presetRows, toEditableRows,
  type EditablePermRow, type ToolKey, type ModulePermValue,
} from "@/lib/module-access";
import { useToast } from "@/hooks/use-toast";

/** کاربر فهرست‌شده در صفحهٔ کاربران */
export interface UserRow {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  status: string;
  roles: string | null;
  /** v4.3.83: نقش اختصاص‌یافته (تک‌نقشی) */
  role_id?: number | null;
  role_name?: string | null;
  district_id?: number | null;
  district_name?: string | null;
  module_permissions?: Record<string, ModulePermValue> | null;
  last_login_at: string | null;
}

/** در حال اعمال دسترسی به N نقش — پروگرس مشابه حذف انبوه */
export interface ApplyProgress {
  done: number;
  total: number;
  failed: number;
}

/** تبدیل نقش به «کاربرمانند» برای تفکیک ماتریس دسترسی (نقش غیرمدیر فرض می‌شود) */
export function roleToPermSource(role: Pick<RoleRow, "module_permissions">): {
  district_id: number;
  module_permissions: Record<string, ModulePermValue> | null;
} {
  return { district_id: 1, module_permissions: role.module_permissions ?? null };
}

/**
 * ماتریس دسترسی — v4.3.83 (RBAC)
 * ردیف = بخش (۲۳ بخش گروه‌بندی‌شده)، ستون = ابزار (مشاهده/ایجاد/ویرایش/حذف/ایمپورت/اکسپورت).
 * تیک سلولی + «همه» در سرستون هر ابزار + پیش‌تنظیم‌ها.
 */
export function PermissionsMatrix({
  rows, onChange, lockAdminOnly,
}: {
  rows: Record<string, EditablePermRow>;
  onChange: (rows: Record<string, EditablePermRow>) => void;
  /** ستون‌های ماژول‌های مدیر-فقط قفل باشند */
  lockAdminOnly?: boolean;
}) {
  const setCell = (key: string, tool: ToolKey, value: boolean) => {
    const row = rows[key] ?? { view: false, tools: {} };
    if (tool === "view") {
      // خاموش‌کردن مشاهده، همهٔ ابزارهای همان ردیف را هم خاموش می‌کند
      const next: EditablePermRow = value ? { ...row, view: true } : { view: false, tools: {} };
      onChange({ ...rows, [key]: next });
      return;
    }
    const tools = { ...row.tools };
    if (value) tools[tool] = true; else delete tools[tool];
    onChange({ ...rows, [key]: { view: row.view, tools } });
  };

  /** تیک سرستون یک ابزار — همهٔ بخش‌هایی که آن ابزار را دارند */
  const toggleToolColumn = (tool: ToolKey, value: boolean) => {
    const next: Record<string, EditablePermRow> = { ...rows };
    for (const def of MODULE_ACCESS) {
      if (def.adminOnly && lockAdminOnly) continue;
      if (tool !== "view" && !def.tools.includes(tool)) continue;
      const row = next[def.key] ?? { view: false, tools: {} };
      if (tool === "view") next[def.key] = value ? { ...row, view: true } : { view: false, tools: {} };
      else {
        const t = { ...row.tools };
        if (value && row.view) t[tool] = true; else delete t[tool];
        next[def.key] = { view: row.view, tools: t };
      }
    }
    onChange(next);
  };

  const toolColumnState = (tool: ToolKey): boolean | "indeterminate" => {
    const defs = MODULE_ACCESS.filter(d => tool === "view" || d.tools.includes(tool));
    const on = defs.filter(d => tool === "view" ? rows[d.key]?.view : (rows[d.key]?.view && rows[d.key]?.tools?.[tool]));
    if (on.length === 0) return false;
    if (on.length === defs.length) return true;
    return "indeterminate";
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="w-full text-xs border-collapse table-fixed">
        <colgroup>
          <col style={{ width: "30%" }} />
          {TOOL_KEYS.map(tool => (
            <col key={tool} style={{ width: `${70 / TOOL_KEYS.length}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/70">
            <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800/70 border-l border-slate-200 dark:border-slate-700 px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
              بخش
            </th>
            {TOOL_KEYS.map(tool => (
              <th key={tool} className="px-1 py-2 text-center font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-l border-slate-100 dark:border-slate-800 last:border-l-0">
                <div className="flex flex-col items-center gap-1">
                  <span>{TOOL_LABELS[tool]}</span>
                  <Checkbox
                    checked={toolColumnState(tool)}
                    onCheckedChange={(v) => toggleToolColumn(tool, v === true)}
                    aria-label={`همهٔ بخش‌ها — ${TOOL_LABELS[tool]}`}
                    className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULE_GROUPS.map(group => {
            const defs = MODULE_ACCESS.filter(m => m.group === group);
            if (!defs.length) return null;
            return (
              <PermissionGroupRows
                key={group} group={group} defs={defs} rows={rows}
                setCell={setCell} lockAdminOnly={lockAdminOnly}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const GROUP_DOT: Record<string, string> = {
  "اصلی": "bg-sky-500",
  "خطوط و مدارها": "bg-violet-500",
  "بهره‌برداری و تعمیرات": "bg-amber-500",
  "پیمانکاری و مالی": "bg-emerald-500",
  "ایمنی": "bg-red-500",
  "داده‌های پایه": "bg-cyan-500",
  "سیستمی": "bg-slate-400",
};

function PermissionGroupRows({
  group, defs, rows, setCell, lockAdminOnly,
}: {
  group: string;
  defs: typeof MODULE_ACCESS;
  rows: Record<string, EditablePermRow>;
  setCell: (key: string, tool: ToolKey, value: boolean) => void;
  lockAdminOnly?: boolean;
}) {
  return (
    <>
      <tr className="bg-slate-50/80 dark:bg-slate-800/40">
        <td colSpan={7} className="px-3 py-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${GROUP_DOT[group] ?? "bg-slate-400"}`} />
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{group}</span>
          </div>
        </td>
      </tr>
      {defs.map(def => {
        const row = rows[def.key] ?? { view: false, tools: {} };
        const locked = def.adminOnly && lockAdminOnly;
        const viewOn = locked ? true : row.view;
        return (
          <tr
            key={def.key}
            className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${locked ? "opacity-60 bg-slate-50/50" : ""}`}
          >
            <td className="sticky right-0 z-10 bg-white dark:bg-slate-900 px-3 py-1.5 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
              <div className="flex items-center gap-1.5">
                {locked && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                <span className="font-medium text-slate-700 dark:text-slate-200 text-right">{def.label}</span>
                {def.adminOnly && !locked && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-200 text-slate-400 shrink-0">مدیر سیستم</Badge>
                )}
              </div>
            </td>
            {TOOL_KEYS.map(tool => {
              if (tool !== "view" && !def.tools.includes(tool)) {
                return <td key={tool} className="px-1 py-1.5 text-center border-l border-slate-100 dark:border-slate-800 last:border-l-0 text-slate-300 dark:text-slate-600">—</td>;
              }
              const checked = tool === "view" ? viewOn : (viewOn && row.tools?.[tool] === true);
              const disabled = locked || (tool !== "view" && !viewOn);
              return (
                <td key={tool} className="px-1 py-1.5 text-center border-l border-slate-100 dark:border-slate-800 last:border-l-0">
                  <div className="flex justify-center">
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => setCell(def.key, tool, v === true)}
                      className={locked ? "opacity-50" : "data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"}
                      aria-label={`${def.label} — ${TOOL_LABELS[tool]}`}
                    />
                  </div>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/**
 * دیالوگ ویرایش دسترسی نقش — v4.3.83 (RBAC)
 * یک نقش (کلیک ردیف / ویرایش) یا چند نقش (ویرایش گروهی).
 * عرض دیالوگ تا ۹۵٪ صفحه — بدون اسکرول افقی؛ فقط ارتفاع اسکرول دارد.
 * ذخیره: PUT /roles/{id} برای هر نقش به‌صورت زنجیره‌ای با نوار پیشرفت.
 */
export function PermissionsDialog({
  open, targets, sourceRole, onClose, onSaved,
}: {
  open: boolean;
  targets: RoleRow[];
  sourceRole: RoleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, EditablePermRow>>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<ApplyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setProgress(null);
      setRows(toEditableRows(roleToPermSource(sourceRole ?? targets[0] ?? null)));
    }
  }, [open, sourceRole, targets]);

  const targetNames = useMemo(() => {
    const names = targets.slice(0, 3).map(t => t.display_name);
    const rest = targets.length - names.length;
    return rest > 0 ? `${names.join("، ")} و ${rest.toLocaleString("fa-IR")} نقش دیگر` : names.join("، ");
  }, [targets]);

  const applyPreset = (preset: "full" | "view-only" | "none") => setRows(presetRows(preset));

  const save = async () => {
    if (!targets.length) return;
    setSaving(true); setError(null);
    const map = compactPermissions(rows);
    const prog: ApplyProgress = { done: 0, total: targets.length, failed: 0 };
    setProgress({ ...prog });
    let firstError: string | null = null;
    for (const role of targets) {
      try {
        await putRole(role.id, { module_permissions: map });
      } catch (err) {
        prog.failed++;
        firstError ??= err instanceof Error ? err.message : "خطای نامشخص";
      }
      prog.done++;
      setProgress({ ...prog });
    }
    setSaving(false);
    if (prog.failed > 0) {
      setError(`${prog.failed.toLocaleString("fa-IR")} نقش ذخیره نشد — ${firstError ?? ""}`);
      setProgress(null);
      return;
    }
    toast({
      title: "دسترسی‌های نقش ذخیره شد",
      description: `${prog.total.toLocaleString("fa-IR")} نقش به‌روزرسانی شد${targets.length === 1 ? ` (${targets[0].display_name})` : ""} — برای همهٔ کاربران همین نقش اعمال می‌شود`,
    });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-[1400px] max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            {targets.length === 1 ? `دسترسی‌های نقش: ${targets[0].display_name}` : `ویرایش گروهی دسترسی نقش‌ها — ${targets.length.toLocaleString("fa-IR")} نقش`}
          </DialogTitle>
        </DialogHeader>

        {targets.length > 1 && (
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg p-2.5 text-xs text-slate-600 dark:text-slate-300 leading-6">
            اعمال برای: <span className="font-medium">{targetNames}</span>
            {sourceRole && <> — پیش‌پرشده از دسترسی‌های نقش «{sourceRole.display_name}»</>}
          </div>
        )}

        {/* پیش‌تنظیم‌های سریع */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">پیش‌تنظیم:</span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50" onClick={() => applyPreset("full")}>دسترسی کامل</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => applyPreset("view-only")}>فقط مشاهده</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => applyPreset("none")}>هیچ</Button>
        </div>

        <PermissionsMatrix rows={rows} onChange={setRows} />

        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 nums-fa">
              <span>در حال ذخیرهٔ دسترسی‌ها...</span>
              <span>{progress.done.toLocaleString("fa-IR")} از {progress.total.toLocaleString("fa-IR")}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600 whitespace-pre-line text-right">{error}</p>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button type="button" onClick={save} disabled={saving || !targets.length} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `ذخیره برای ${targets.length.toLocaleString("fa-IR")} نقش`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
