"use client";

import { useMemo, useState } from "react";
import { putUser } from "@/lib/users-api";
import { putRole, type RoleRow } from "@/lib/roles-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/searchable-select";
import { ListChecks, Power, PowerOff, KeyRound, ShieldCheck, Copy, CheckSquare, Eye, Ban, UserCog, Loader2 } from "lucide-react";
import { compactPermissions, presetRows, toEditableRows, summarizePermissions, type EditablePermRow, type ModulePermValue } from "@/lib/module-access";
import { roleToPermSource } from "./permissions-dialog";
import { useToast } from "@/hooks/use-toast";
import type { UserRow } from "./permissions-dialog";

/** نوار «در حال اعمال» مشترک هر دو منو */
function ApplyingBar({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg px-3 py-1.5">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>{label} — {done.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")}</span>
    </div>
  );
}

/**
 * منوی «عملیات گروهی» تب کاربران — v4.3.83
 * فعال/غیرفعال گروهی + ریست رمز 123456 + تغییر نقش (RBAC).
 */
export function UsersStatusActions({
  selectedUsers, onApplied, selfUserId, roles,
}: {
  selectedUsers: UserRow[];
  onApplied: () => void;
  selfUserId?: number | null;
  roles: RoleRow[];
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleId, setRoleId] = useState("");

  const requiresSelection = () => {
    if (!selectedUsers.length) {
      toast({ title: "هیچ کاربری انتخاب نشده", description: "ابتدا ردیف(های) مورد نظر را در جدول انتخاب کنید" });
      return true;
    }
    return false;
  };

  const applyStatus = async (status: "active" | "inactive") => {
    if (requiresSelection()) return;
    // خودمان را غیرفعال نکنیم
    const targets = selectedUsers.filter(u => !(status === "inactive" && u.id === selfUserId));
    if (!targets.length) {
      toast({ title: "غيرمجاز", description: "نمی‌توانید حساب کاربری خودتان را غیرفعال کنید", variant: "destructive" });
      return;
    }
    setBusy(true);
    const prog = { done: 0, total: targets.length };
    setProgress({ ...prog });
    let failed = 0;
    for (const user of targets) {
      try {
        await putUser(user.id, { status });
      } catch { failed++; }
      prog.done++;
      setProgress({ ...prog });
    }
    setBusy(false);
    setProgress(null);
    toast({
      title: failed ? "تغییر وضعیت ناقص ماند" : status === "active" ? "کاربران فعال شدند" : "کاربران غیرفعال شدند",
      description: failed
        ? `${failed.toLocaleString("fa-IR")} کاربر به‌دلیل خطا تغییر نکرد`
        : `${targets.length.toLocaleString("fa-IR")} کاربر به‌روزرسانی شد`,
      variant: failed ? "destructive" : undefined,
    });
    onApplied();
  };

  const resetPasswords = async () => {
    if (requiresSelection()) return;
    setBusy(true);
    const prog = { done: 0, total: selectedUsers.length };
    setProgress({ ...prog });
    let failed = 0;
    for (const user of selectedUsers) {
      try {
        await putUser(user.id, { password: "123456" });
      } catch { failed++; }
      prog.done++;
      setProgress({ ...prog });
    }
    setBusy(false);
    setProgress(null);
    toast({
      title: failed ? "ریست رمز ناقص ماند" : "رمز عبور ریست شد",
      description: failed
        ? `${failed.toLocaleString("fa-IR")} کاربر به‌دلیل خطا ریست نشد`
        : `رمز همهٔ ${selectedUsers.length.toLocaleString("fa-IR")} کاربر به 123456 برگردانده شد`,
      variant: failed ? "destructive" : undefined,
    });
    onApplied();
  };

  /** v4.3.83: تغییر گروهی نقش — «نامشخص» یعنی حذف نقش کاربران */
  const applyRole = async () => {
    // خودمان را از تغییر نقش مستثنی می‌کنیم (بک‌اند هم بلاک می‌کند)
    const targets = selectedUsers.filter(u => u.id !== selfUserId);
    const isClear = !roleId || roleId === "__unknown__";
    const role = roles.find(r => String(r.id) === roleId);
    setRoleOpen(false);
    if (!targets.length) {
      toast({ title: "غيرمجاز", description: "نقش حساب کاربری خودتان قابل تغییر نیست", variant: "destructive" });
      return;
    }
    setBusy(true);
    const prog = { done: 0, total: targets.length };
    setProgress({ ...prog });
    let failed = 0;
    for (const user of targets) {
      try {
        await putUser(user.id, { role_id: isClear ? null : Number(roleId) });
      } catch { failed++; }
      prog.done++;
      setProgress({ ...prog });
    }
    setBusy(false);
    setProgress(null);
    setRoleId("");
    toast({
      title: failed ? "تغییر نقش ناقص ماند" : "نقش کاربران تغییر کرد",
      description: failed
        ? `${failed.toLocaleString("fa-IR")} کاربر به‌دلیل خطا تغییر نکرد`
        : isClear
          ? `نقش ${targets.length.toLocaleString("fa-IR")} کاربر حذف شد — دسترسی‌شان فقط‌مشاهده می‌شود`
          : `نقش «${role?.display_name ?? ""}» به ${targets.length.toLocaleString("fa-IR")} کاربر اختصاص یافت`,
      variant: failed ? "destructive" : undefined,
    });
    onApplied();
  };

  return (
    <div className="flex items-center gap-2">
      {busy && progress && <ApplyingBar label="در حال اعمال" {...progress} />}
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={busy} className="h-9 w-9 text-indigo-600 hover:bg-indigo-50 border-indigo-200" title="عملیات گروهی کاربران">
            <ListChecks className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-right">عملیات گروهی — {selectedUsers.length ? `${selectedUsers.length.toLocaleString("fa-IR")} کاربر` : "کاربران"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => applyStatus("active")}>
            <Power className="w-4 h-4 text-emerald-600" />فعال کردن
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => applyStatus("inactive")}>
            <PowerOff className="w-4 h-4 text-slate-500" />غیرفعال کردن
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { if (requiresSelection()) return; setRoleOpen(true); }}>
            <UserCog className="w-4 h-4 text-indigo-600" />تغییر نقش
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={resetPasswords}>
            <KeyRound className="w-4 h-4 text-amber-600" />ریست رمز به 123456
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* دیالوگ انتخاب نقش برای تغییر گروهی */}
      <Dialog open={roleOpen} onOpenChange={(o) => { if (!busy) setRoleOpen(o); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <UserCog className="w-5 h-5 text-indigo-600" />
              تغییر گروهی نقش کاربران
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-right leading-6">
              نقش انتخاب‌شده به
              <span className="font-bold text-indigo-600 nums-fa"> {selectedUsers.length.toLocaleString("fa-IR")} </span>
              کاربر اختصاص می‌یابد و دسترسی‌های همان نقش برایشان اعمال می‌شود.
            </p>
            <div className="space-y-2">
              <SearchableSelect
                value={roleId}
                onChange={setRoleId}
                placeholder="انتخاب نقش..."
                options={roles
                  .filter(r => isActiveRole(r))
                  .map(r => {
                    const sum = summarizePermissions(toEditableRows(roleToPermSource(r)));
                    return {
                      value: String(r.id),
                      label: r.display_name,
                      description: `${Number(r.users_count ?? 0).toLocaleString("fa-IR")} کاربر · ${sum.modules.toLocaleString("fa-IR")} بخش · ${sum.tools.toLocaleString("fa-IR")} ابزار`,
                    };
                  })}
              />
              <p className="text-[10px] text-slate-400 text-right leading-5">
                «نامشخص» = حذف نقش — کاربر بدون نقش همهٔ بخش‌ها را فقط مشاهده می‌کند
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRoleOpen(false)}>انصراف</Button>
            <Button type="button" className="bg-indigo-600 hover:bg-indigo-700" onClick={applyRole}>
              <UserCog className="w-4 h-4" />اعمال نقش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isActiveRole(r: RoleRow): boolean {
  const s = String(r.status ?? "active");
  return !(s === "inactive" || s === "0" || s === "false");
}

/**
 * منوی «عملیات گروهی» تب دسترسی‌ها — v4.3.83 (RBAC)
 * ویرایش گروهی ماتریس نقش‌ها + کپی دسترسی از نقش دیگر + پیش‌تنظیم‌های سریع.
 */
export function RolePermissionsBulkActions({
  selectedRoles, allRoles, onOpenMatrix, onApplied,
}: {
  selectedRoles: RoleRow[];
  allRoles: RoleRow[];
  onOpenMatrix: (targets: RoleRow[], source: RoleRow | null) => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");

  const copyCandidates = useMemo(
    () => allRoles.filter(r => !selectedRoles.some(t => t.id === r.id)),
    [allRoles, selectedRoles]
  );

  const requiresSelection = () => {
    if (!selectedRoles.length) {
      toast({ title: "هیچ نقشی انتخاب نشده", description: "ابتدا نقش(های) مورد نظر را در جدول انتخاب کنید" });
      return true;
    }
    return false;
  };

  const applyMap = async (rows: Record<string, EditablePermRow>, label: string) => {
    setBusy(true);
    const map = compactPermissions(rows);
    const prog = { done: 0, total: selectedRoles.length };
    setProgress({ ...prog });
    let failed = 0;
    for (const role of selectedRoles) {
      try {
        await putRole(role.id, { module_permissions: map });
      } catch { failed++; }
      prog.done++;
      setProgress({ ...prog });
    }
    setBusy(false);
    setProgress(null);
    toast({
      title: failed ? `${label} ناقص ماند` : `${label} اعمال شد`,
      description: failed
        ? `${failed.toLocaleString("fa-IR")} نقش به‌دلیل خطا ذخیره نشد`
        : `برای ${selectedRoles.length.toLocaleString("fa-IR")} نقش ذخیره شد — کاربران همان نقش بلافاصله شامل می‌شوند`,
      variant: failed ? "destructive" : undefined,
    });
    onApplied();
  };

  const applyPreset = (preset: "full" | "view-only" | "none") => {
    if (requiresSelection()) return;
    const labels = { full: "دسترسی کامل", "view-only": "فقط مشاهده", none: "حذف دسترسی‌ها" };
    applyMap(presetRows(preset), labels[preset]);
  };

  const confirmCopy = async () => {
    const source = allRoles.find(r => String(r.id) === sourceId);
    if (!source) {
      toast({ title: "نقش مبدأ را انتخاب کنید" });
      return;
    }
    setCopyOpen(false);
    setSourceId("");
    await applyMap(toEditableRows(roleToPermSource(source)), `کپی دسترسی از ${source.display_name}`);
  };

  return (
    <div className="flex items-center gap-2">
      {busy && progress && <ApplyingBar label="در حال اعمال دسترسی" {...progress} />}
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" disabled={busy} className="h-9 w-9 text-indigo-600 hover:bg-indigo-50 border-indigo-200" title="عملیات گروهی دسترسی">
            <ListChecks className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-right">
            عملیات گروهی دسترسی — {selectedRoles.length ? `${selectedRoles.length.toLocaleString("fa-IR")} نقش` : "نقش‌ها"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { if (requiresSelection()) return; onOpenMatrix(selectedRoles, selectedRoles[0] ?? null); }}>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />ویرایش گروهی دسترسی‌ها...
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { if (requiresSelection()) return; setCopyOpen(true); }}>
            <Copy className="w-4 h-4 text-emerald-600" />کپی دسترسی از نقش...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => applyPreset("full")}>
            <CheckSquare className="w-4 h-4 text-green-600" />دسترسی کامل همهٔ بخش‌ها
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => applyPreset("view-only")}>
            <Eye className="w-4 h-4 text-blue-600" />فقط مشاهدهٔ همهٔ بخش‌ها
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => applyPreset("none")}>
            <Ban className="w-4 h-4 text-red-600" />حذف همهٔ دسترسی‌ها
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* دیالوگ انتخاب نقش مبدأ برای کپی دسترسی */}
      <Dialog open={copyOpen} onOpenChange={(o) => { if (!busy) setCopyOpen(o); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <Copy className="w-5 h-5 text-emerald-600" />
              کپی دسترسی از نقش دیگر
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-right leading-6">
              دسترسی‌های دقیق نقش مبدأ (بخش‌ها + ابزارها) روی
              <span className="font-bold text-indigo-600 nums-fa"> {selectedRoles.length.toLocaleString("fa-IR")} </span>
              نقش انتخاب‌شده کپی می‌شود.
            </p>
            <div className="space-y-2">
              <SearchableSelect
                value={sourceId}
                onChange={setSourceId}
                placeholder="انتخاب نقش مبدأ..."
                options={copyCandidates.map(r => {
                  const sum = summarizePermissions(toEditableRows(roleToPermSource(r)));
                  return {
                    value: String(r.id),
                    label: r.display_name,
                    description: `${Number(r.users_count ?? 0).toLocaleString("fa-IR")} کاربر · ${sum.modules.toLocaleString("fa-IR")} بخش · ${sum.tools.toLocaleString("fa-IR")} ابزار`,
                  };
                })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCopyOpen(false)}>انصراف</Button>
            <Button type="button" className="bg-indigo-600 hover:bg-indigo-700" onClick={confirmCopy} disabled={!sourceId}>
              <Copy className="w-4 h-4" />کپی و اعمال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** خلاصهٔ دسترسی یک ماتریس (نقش یا کاربر) — «x از ۲۳ بخش · y ابزار» */
export function PermSummaryCell({ map }: { map: Record<string, ModulePermValue> | null | undefined }) {
  if (map == null) {
    return <Badge variant="outline" className="text-[11px] border-amber-200 text-amber-700 dark:text-amber-300">تعریف‌نشده — فقط مشاهده</Badge>;
  }
  const sum = summarizePermissions(toEditableRows({ district_id: 1, module_permissions: map }));
  const total = 23;
  return (
    <div className="flex flex-col gap-1 items-start">
      <span className="text-xs text-slate-600 dark:text-slate-300 nums-fa">
        {sum.modules.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")} بخش
      </span>
      <div className="w-28 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${sum.modules === 0 ? "bg-red-400" : sum.modules < total / 2 ? "bg-amber-400" : "bg-emerald-500"}`}
          style={{ width: `${Math.round((sum.modules / total) * 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-400 nums-fa">{sum.tools.toLocaleString("fa-IR")} ابزار فعال</span>
    </div>
  );
}
