"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { putUser, postUser, deleteUser } from "@/lib/users-api";
import { getRoles, postRole, putRole, deleteRole, type RoleRow } from "@/lib/roles-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DistrictSelect } from "@/components/district-select";
import { SearchableSelect } from "@/components/searchable-select";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog";
import { FormSection } from "@/components/form-section";
import { useDistrictOptions } from "@/hooks/use-district-options";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { toJalali } from "@/lib/jalali";
import { Loader2, Users as UsersIcon, ShieldCheck, IdCard } from "lucide-react";
import { PermissionsDialog, type UserRow } from "@/components/users/permissions-dialog";
import { RoleDialog } from "@/components/users/role-dialog";
import { UsersStatusActions, RolePermissionsBulkActions, PermSummaryCell } from "@/components/users/users-bulk-actions";

/**
 * صفحه کاربران — v4.3.83 (RBAC): سه تب
 *
 * تب «اطلاعات کاربران»: جدول هم‌شکل خطوط/پرسنل + نوار ابزار کامل + کمبوباکس نقش
 * در فرم + عملیات گروهی وضعیت/نقش/ریست رمز.
 *
 * تب «نقش‌ها»: تعریف نقش‌ها (جدول استاندارد: افزودن/ویرایش/کپی/حذف/ایمپورت اکسل/
 * اکسپورت/چاپ) — دسترسی‌ها به‌جای هر نفر روی نقش تعریف می‌شود؛ مثلاً ۴۰ سیمبان
 * فقط نقش «سیمبان» می‌گیرند.
 *
 * تب «دسترسی‌ها»: ماتریس ریز بخش×ابزار برای هر نقش (تکی/گروهی/کپی از نقش دیگر).
 * مدیر سیستم (بدون امور) همیشه دسترسی کامل دارد.
 */
export function UsersPage() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ─── تب کاربران: فرم/حذف/ایمپورت ───
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<UserRow | null>(null);
  const [showImport, setShowImport] = useState(false);

  // حذف انبوه کاربران — DELETE زنجیره‌ای با پروگرس
  const [pendingDelete, setPendingDelete] = useState<UserRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);

  // ─── تب نقش‌ها: فرم/حذف/ایمپورت ───
  const [showRoleCreate, setShowRoleCreate] = useState(false);
  const [editRoleRow, setEditRoleRow] = useState<RoleRow | null>(null);
  const [duplicateRoleFrom, setDuplicateRoleFrom] = useState<RoleRow | null>(null);
  const [showRoleImport, setShowRoleImport] = useState(false);
  const [pendingRoleDelete, setPendingRoleDelete] = useState<RoleRow[] | null>(null);
  const [deletingRoles, setDeletingRoles] = useState(false);
  const [roleDeleteProgress, setRoleDeleteProgress] = useState<{ done: number; total: number } | null>(null);

  // ─── تب دسترسی‌ها: ماتریس نقش‌ها ───
  const [permRoleTargets, setPermRoleTargets] = useState<RoleRow[] | null>(null);
  const [permRoleSource, setPermRoleSource] = useState<RoleRow | null>(null);

  const tableRef = useRef<DataTableHandle | null>(null);
  const rolesTableRef = useRef<DataTableHandle | null>(null);
  const accessTableRef = useRef<DataTableHandle | null>(null);

  const { rows: districtRows } = useDistrictOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setRolesError(null);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.users, { page: 1, page_size: 500 });
      setUsers(Array.isArray(result) ? result : (result?.data || []));
    } catch (err: any) {
      toast({
        title: "خطا در دریافت کاربران",
        description: err?.message || "خطای نامشخص",
        variant: "destructive",
      });
    } finally { setLoading(false); }
    // نقش‌ها مستقل بارگذاری می‌شوند — خطای بک‌اند قدیمی نباید تب کاربران را خراب کند
    try {
      setRoles(await getRoles());
    } catch (err: any) {
      setRoles([]);
      setRolesError(err?.message || "خطا در دریافت نقش‌ها");
    }
  }, [toast]);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load, refreshKey]);

  // ─── ستون‌های تب کاربران ───
  const columns: DataTableColumn<UserRow>[] = [
    {
      key: "username", header: "نام کاربری", sortable: true, filterable: true, align: "right",
      render: (u) => <span dir="ltr" className="font-medium text-slate-700 dark:text-slate-200">{u.username}</span>,
    },
    { key: "full_name", header: "نام و نام خانوادگی", sortable: true, filterable: true, align: "right" },
    {
      key: "role_name", header: "نقش", sortable: true, filterable: true, align: "right",
      render: (u) => {
        const name = u.role_name || u.roles;
        return name
          ? <Badge variant="outline" className="text-[11px] border-violet-200 text-violet-700 dark:text-violet-300">{name}</Badge>
          : <Badge variant="outline" className="text-[11px] border-amber-200 text-amber-700 dark:text-amber-300">بدون نقش (فقط مشاهده)</Badge>;
      },
    },
    {
      key: "district_name", header: "امور بهره‌برداری", sortable: true, filterable: true, align: "right",
      render: (u) => u.district_id != null
        ? <Badge variant="outline" className="text-[11px] border-indigo-200 text-indigo-700 dark:text-indigo-300">{u.district_name || `امور ${u.district_id}`}</Badge>
        : <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-400">همهٔ امور (مدیر)</Badge>,
    },
    { key: "email", header: "ایمیل", align: "right", render: (u) => u.email ? <span dir="ltr" className="text-xs text-slate-500">{u.email}</span> : <span className="text-slate-300">—</span> },
    { key: "status", header: "وضعیت", type: "status", align: "right" },
    {
      key: "last_login_at", header: "آخرین ورود", align: "right",
      render: (u) => u.last_login_at
        ? <span className="text-xs text-slate-500 nums-fa" title={u.last_login_at}>{toJalali(String(u.last_login_at))}</span>
        : <span className="text-slate-300">—</span>,
    },
  ];

  // ─── ستون‌های تب نقش‌ها ───
  const roleColumns: DataTableColumn<RoleRow>[] = [
    {
      key: "display_name", header: "نام نقش", sortable: true, filterable: true, align: "right",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">{r.display_name}</span>
          {Number(r.is_system) === 1 && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-200 text-slate-400">سیستمی</Badge>}
        </div>
      ),
    },
    {
      key: "description", header: "توضیحات", align: "right",
      render: (r) => r.description
        ? <span className="text-xs text-slate-500 dark:text-slate-400">{r.description}</span>
        : <span className="text-slate-300">—</span>,
    },
    { key: "users_count", header: "تعداد کاربران", type: "number", sortable: true, align: "right" },
    { key: "status", header: "وضعیت", type: "status", align: "right" },
    {
      key: "created_at", header: "تاریخ ایجاد", align: "right",
      render: (r) => r.created_at ? <span className="text-xs text-slate-500 nums-fa">{toJalali(String(r.created_at))}</span> : <span className="text-slate-300">—</span>,
    },
  ];

  // ─── ستون‌های تب دسترسی‌ها (نقش × دسترسی) ───
  const accessColumns: DataTableColumn<RoleRow>[] = [
    {
      key: "display_name", header: "نقش", sortable: true, filterable: true, align: "right",
      render: (r) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-700 dark:text-slate-100 text-right">{r.display_name}</span>
            {Number(r.is_system) === 1 && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-200 text-slate-400">سیستمی</Badge>}
          </div>
          {r.name && r.name !== r.display_name && (
            <span className="text-[10px] text-slate-400 text-right" dir="ltr">{r.name}</span>
          )}
        </div>
      ),
    },
    {
      key: "description", header: "توضیحات", align: "right",
      render: (r) => r.description
        ? <span className="text-xs text-slate-500 dark:text-slate-400">{r.description}</span>
        : <span className="text-slate-300">—</span>,
    },
    { key: "users_count", header: "کاربران", type: "number", sortable: true, align: "right" },
    { key: "status", header: "وضعیت", type: "status", align: "right" },
    { key: "access", header: "دسترسی‌ها", align: "right", render: (r) => <PermSummaryCell map={r.module_permissions} /> },
  ];

  // ─── حذف زنجیره‌ای کاربران ───
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const prog = { done: 0, total: pendingDelete.length };
    setDeleteProgress({ ...prog });
    let failed = 0;
    let firstError: string | null = null;
    for (const user of pendingDelete) {
      try {
        await deleteUser(user.id);
      } catch (err) {
        failed++;
        firstError ??= err instanceof Error ? err.message : "خطای نامشخص";
      }
      prog.done++;
      setDeleteProgress({ ...prog });
    }
    setDeleting(false);
    setDeleteProgress(null);
    setPendingDelete(null);
    toast({
      title: failed ? "حذف ناقص ماند" : "کاربران حذف شدند",
      description: failed
        ? `${failed.toLocaleString("fa-IR")} کاربر حذف نشد — ${firstError ?? ""}`
        : `${prog.total.toLocaleString("fa-IR")} کاربر حذف شد`,
      variant: failed ? "destructive" : undefined,
    });
    setRefreshKey(k => k + 1);
  };

  // ─── حذف زنجیره‌ای نقش‌ها ───
  const confirmRoleDelete = async () => {
    if (!pendingRoleDelete) return;
    setDeletingRoles(true);
    const prog = { done: 0, total: pendingRoleDelete.length };
    setRoleDeleteProgress({ ...prog });
    let failed = 0;
    let firstError: string | null = null;
    for (const role of pendingRoleDelete) {
      try {
        await deleteRole(role.id);
      } catch (err) {
        failed++;
        firstError ??= err instanceof Error ? err.message : "خطای نامشخص";
      }
      prog.done++;
      setRoleDeleteProgress({ ...prog });
    }
    setDeletingRoles(false);
    setRoleDeleteProgress(null);
    setPendingRoleDelete(null);
    toast({
      title: failed ? "حذف نقش‌ها ناقص ماند" : "نقش‌ها حذف شدند",
      description: failed
        ? `${failed.toLocaleString("fa-IR")} نقش حذف نشد — ${firstError ?? ""}`
        : `${prog.total.toLocaleString("fa-IR")} نقش حذف شد`,
      variant: failed ? "destructive" : undefined,
    });
    setRefreshKey(k => k + 1);
  };

  // ─── ایمپورت کاربران از اکسل ───
  const resolveDistrictIdByName = (name: unknown): number | null => {
    const n = String(name ?? "").trim();
    if (!n) return null;
    const hit = districtRows.find(d => d.name === n || d.name.includes(n) || n.includes(d.name));
    return hit ? hit.id : null;
  };

  const resolveRoleIdByName = (name: unknown): number | null => {
    const n = String(name ?? "").trim();
    if (!n || n === "نامشخص") return null;
    const hit = roles.find(r => r.display_name === n || r.name === n);
    return hit ? hit.id : null;
  };

  const importUserPayload = (row: Record<string, unknown>, isCreate: boolean) => {
    const districtId = resolveDistrictIdByName(row.district_name);
    if (districtId == null) {
      throw new Error(`امور بهره‌برداری «${String(row.district_name ?? "")}» پیدا نشود — نام امور در فایل الزامی است`);
    }
    const payload: Record<string, unknown> = {
      full_name: String(row.full_name ?? "").trim(),
      email: row.email ? String(row.email).trim() : null,
      district_id: districtId,
      status: "active",
    };
    if (row.role_name) {
      const roleId = resolveRoleIdByName(row.role_name);
      if (roleId == null) {
        throw new Error(`نقش «${String(row.role_name)}» پیدا نشد — ابتدا از تب «نقش‌ها» بسازید یا ستون نقش را خالی بگذارید`);
      }
      payload.role_id = roleId;
    }
    if (isCreate) {
      payload.username = String(row.username ?? "").trim();
      payload.password = row.password ? String(row.password) : "123456";
    } else if (row.password) {
      payload.password = String(row.password);
    }
    return payload;
  };

  const handleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    const payload = importUserPayload(row, mode !== "update" || !existingId);
    if (mode === "update" && existingId) {
      await putUser(existingId, payload);
    } else {
      await postUser(payload);
    }
  };

  const handleImportBatch = async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    // هاست اشتراکی — درخواست‌ها زنجیره‌ای (نه هم‌زمان) ارسال می‌شوند
    const results: Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }> = [];
    for (const it of items) {
      try {
        await handleImportRow(it.row, it.mode, it.existingId);
        results.push({ status: it.mode === "update" && it.existingId ? "updated" : "inserted" });
      } catch (err) {
        results.push({ status: "failed", error: err instanceof Error ? err.message : "خطای نامشخص" });
      }
    }
    return results;
  };

  const importHeaderMap: Record<string, string> = {
    "نام کاربری": "username",
    "کد ملی": "username",
    "نام و نام خانوادگی": "full_name",
    "نام کامل": "full_name",
    "رمز عبور": "password",
    "رمز": "password",
    "ایمیل": "email",
    "امور بهره‌برداری": "district_name",
    "امور": "district_name",
    "نقش": "role_name",
  };
  const importTemplateColumns = [
    { key: "username", header: "نام کاربری (کد ملی)" },
    { key: "full_name", header: "نام و نام خانوادگی" },
    { key: "district_name", header: "امور بهره‌برداری" },
    { key: "role_name", header: "نقش (خالی = بدون نقش)" },
    { key: "email", header: "ایمیل (اختیاری)" },
    { key: "password", header: "رمز عبور (خالی = 123456)" },
  ];

  // ─── ایمپورت نقش‌ها از اکسل ───
  const roleImportPayload = (row: Record<string, unknown>) => {
    const displayName = String(row.display_name ?? "").trim();
    if (!displayName) throw new Error("نام نقش الزامی است");
    return {
      display_name: displayName,
      description: row.description ? String(row.description).trim() : null,
      status: "active",
    };
  };

  const handleRoleImportRow = async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    const payload = roleImportPayload(row);
    if (mode === "update" && existingId) {
      await putRole(existingId, { description: payload.description });
    } else {
      await postRole(payload);
    }
  };

  const handleRoleImportBatch = async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const results: Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }> = [];
    for (const it of items) {
      try {
        await handleRoleImportRow(it.row, it.mode, it.existingId);
        results.push({ status: it.mode === "update" && it.existingId ? "updated" : "inserted" });
      } catch (err) {
        results.push({ status: "failed", error: err instanceof Error ? err.message : "خطای نامشخص" });
      }
    }
    return results;
  };

  const roleImportHeaderMap: Record<string, string> = {
    "نام نقش": "display_name",
    "عنوان نقش": "display_name",
    "توضیحات": "description",
    "شرح": "description",
    "توضیح": "description",
  };
  const roleImportTemplateColumns = [
    { key: "display_name", header: "نام نقش" },
    { key: "description", header: "توضیحات (اختیاری)" },
  ];

  return (
    <div className="space-y-4">
      <Tabs defaultValue="info" dir="rtl" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="info" className="text-xs gap-1.5"><UsersIcon className="w-3.5 h-3.5" />اطلاعات کاربران</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs gap-1.5"><IdCard className="w-3.5 h-3.5" />نقش‌ها</TabsTrigger>
          <TabsTrigger value="access" className="text-xs gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />دسترسی‌ها</TabsTrigger>
        </TabsList>

        {/* ─── تب ۱: اطلاعات کاربران — جدول هم‌شکل بقیه بخش‌ها ─── */}
        <TabsContent value="info" className="mt-4">
          <DataTable
            data={users}
            columns={columns}
            loading={loading}
            searchKeys={["username", "full_name", "email", "role_name", "roles", "district_name"]}
            title="کاربران"
            layoutKey="users"
            accessKey="users"
            tableRef={tableRef}
            onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
            onRefresh={() => setRefreshKey(k => k + 1)}
            onEdit={(row) => { setDuplicateFrom(null); setEditRow(row); }}
            onDuplicate={(row) => { setEditRow(null); setDuplicateFrom(row); setShowCreate(true); }}
            onCopy={(rows) => {
              if (!rows.length) {
                toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
                return;
              }
              toast({
                title: "کپی شد",
                description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`,
              });
            }}
            onDelete={(rows) => setPendingDelete(rows)}
            onImport={() => setShowImport(true)}
            toolbarExtra={(selected) => (
              <UsersStatusActions
                selectedUsers={selected}
                roles={roles}
                onApplied={() => setRefreshKey(k => k + 1)}
                selfUserId={me?.id}
              />
            )}
          />
        </TabsContent>

        {/* ─── تب ۲: نقش‌ها — تعریف نقش‌های سازمان (جدول استاندارد) ─── */}
        <TabsContent value="roles" className="mt-4">
          {rolesError && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg p-3 text-xs text-red-700 dark:text-red-300 leading-6 mb-3">
              {rolesError}
            </div>
          )}
          <DataTable
            data={roles}
            columns={roleColumns}
            loading={loading}
            searchKeys={["display_name", "name", "description"]}
            title="نقش‌ها"
            layoutKey="roles"
            accessKey="users"
            tableRef={rolesTableRef}
            onAdd={() => { setEditRoleRow(null); setDuplicateRoleFrom(null); setShowRoleCreate(true); }}
            onRefresh={() => setRefreshKey(k => k + 1)}
            onRowClick={(row) => { setDuplicateRoleFrom(null); setEditRoleRow(row); }}
            onEdit={(row) => { setDuplicateRoleFrom(null); setEditRoleRow(row); }}
            onDuplicate={(row) => { setEditRoleRow(null); setDuplicateRoleFrom(row); setShowRoleCreate(true); }}
            onCopy={(rows) => {
              if (!rows.length) {
                toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
                return;
              }
              toast({
                title: "کپی شد",
                description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`,
              });
            }}
            onDelete={(rows) => setPendingRoleDelete(rows)}
            onImport={() => setShowRoleImport(true)}
          />
        </TabsContent>

        {/* ─── تب ۳: دسترسی‌ها — ماتریس نقش × ابزار ─── */}
        <TabsContent value="access" className="mt-4">
          {rolesError && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg p-3 text-xs text-red-700 dark:text-red-300 leading-6 mb-3">
              {rolesError}
            </div>
          )}
          <DataTable
            data={roles}
            columns={accessColumns}
            loading={loading}
            searchKeys={["display_name", "name", "description"]}
            title="دسترسی نقش‌ها"
            layoutKey="roles-access"
            accessKey="users"
            tableRef={accessTableRef}
            onRefresh={() => setRefreshKey(k => k + 1)}
            onRowClick={(row) => { setPermRoleSource(null); setPermRoleTargets([row]); }}
            onEdit={(row) => { setPermRoleSource(null); setPermRoleTargets([row]); }}
            toolbarExtra={(selected) => (
              <RolePermissionsBulkActions
                selectedRoles={selected}
                allRoles={roles}
                onOpenMatrix={(targets, source) => { setPermRoleSource(source); setPermRoleTargets(targets); }}
                onApplied={() => setRefreshKey(k => k + 1)}
              />
            )}
          />
        </TabsContent>
      </Tabs>

      {/* فرم ایجاد/ویرایش/کپی کاربر */}
      <UserDialog
        open={showCreate || editRow !== null}
        editRow={editRow}
        duplicateFrom={duplicateFrom}
        roles={roles}
        selfUserId={me?.id}
        onClose={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); }}
        onSaved={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); setRefreshKey(k => k + 1); }}
      />

      {/* فرم ایجاد/ویرایش/کپی نقش */}
      <RoleDialog
        open={showRoleCreate || editRoleRow !== null}
        editRow={editRoleRow}
        duplicateFrom={duplicateRoleFrom}
        onClose={() => { setShowRoleCreate(false); setEditRoleRow(null); setDuplicateRoleFrom(null); }}
        onSaved={() => { setShowRoleCreate(false); setEditRoleRow(null); setDuplicateRoleFrom(null); setRefreshKey(k => k + 1); }}
      />

      {/* ایمپورت کاربران از اکسل */}
      <ImportExcelDialog
        open={showImport}
        onClose={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
        onImportRow={handleImportRow}
        onImportBatch={handleImportBatch}
        getExistingRows={async () => users as any}
        defaultUniqueKey="username"
        uniqueKeyOptions={[{ value: "username", label: "نام کاربری" }]}
        entityName="کاربر"
        headerMap={importHeaderMap}
        templateColumns={importTemplateColumns}
      />

      {/* ایمپورت نقش‌ها از اکسل */}
      <ImportExcelDialog
        open={showRoleImport}
        onClose={() => { setShowRoleImport(false); setRefreshKey(k => k + 1); }}
        onImportRow={handleRoleImportRow}
        onImportBatch={handleRoleImportBatch}
        getExistingRows={async () => roles as any}
        defaultUniqueKey="display_name"
        uniqueKeyOptions={[{ value: "display_name", label: "نام نقش" }]}
        entityName="نقش"
        headerMap={roleImportHeaderMap}
        templateColumns={roleImportTemplateColumns}
      />

      {/* تأیید حذف کاربران با پروگرس — همان ظاهر بقیه جدول‌ها */}
      <BulkDeleteDialog
        open={pendingDelete !== null}
        rowsCount={pendingDelete?.length ?? 0}
        entityName="کاربر"
        description={(pendingDelete?.length ?? 0) === 1
          ? `حساب «${pendingDelete?.[0].full_name}» (@${pendingDelete?.[0].username}) حذف می‌شود. اتصال پرسنل به این حساب قطع می‌شود ولی رکورد پرسنل باقی می‌ماند.`
          : `${(pendingDelete?.length ?? 0).toLocaleString("fa-IR")} کاربر انتخاب‌شده حذف می‌شوند. اتصال پرسنل به این حساب‌ها قطع می‌شود ولی رکوردهای پرسنل باقی می‌مانند. این عمل قابل بازگشت نیست.`}
        isDeleting={deleting}
        progress={deleteProgress}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={confirmDelete}
      />

      {/* تأیید حذف نقش‌ها با پروگرس */}
      <BulkDeleteDialog
        open={pendingRoleDelete !== null}
        rowsCount={pendingRoleDelete?.length ?? 0}
        entityName="نقش"
        description={(pendingRoleDelete?.length ?? 0) === 1
          ? `نقش «${pendingRoleDelete?.[0].display_name}» حذف می‌شود. نقش‌هایی که کاربر دارند حذف نمی‌شوند — ابتدا نقش کاربران را تغییر دهید.`
          : `${(pendingRoleDelete?.length ?? 0).toLocaleString("fa-IR")} نقش انتخاب‌شده حذف می‌شوند. نقش‌هایی که کاربر دارند حذف نمی‌شوند — ابتدا نقش کاربران را تغییر دهید.`}
        isDeleting={deletingRoles}
        progress={roleDeleteProgress}
        onCancel={() => { if (!deletingRoles) setPendingRoleDelete(null); }}
        onConfirm={confirmRoleDelete}
      />

      {/* ماتریس دسترسی نقش — تکی یا گروهی */}
      <PermissionsDialog
        open={permRoleTargets !== null}
        targets={permRoleTargets ?? []}
        sourceRole={permRoleSource}
        onClose={() => { setPermRoleTargets(null); setPermRoleSource(null); }}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
    </div>
  );
}

/** فرم کاربر — ایجاد / ویرایش / کپی (مثل فرم پرسنل) — v4.3.83: کمبوباکس نقش */
function UserDialog({ open, editRow, duplicateFrom, roles, selfUserId, onClose, onSaved }: {
  open: boolean;
  editRow: UserRow | null;
  duplicateFrom: UserRow | null;
  roles: RoleRow[];
  selfUserId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "", full_name: "", password: "", email: "",
    district_id: "", status: "active", role_id: "",
  });

  const sourceRow = editRow || duplicateFrom;
  const editingSelf = editRow != null && editRow.id === selfUserId;

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        // کپی: نام کاربری جدید لازم است (مثل کد ملی در پرسنل)
        username: duplicateFrom ? "" : (sourceRow?.username || ""),
        full_name: sourceRow?.full_name || "",
        password: "",
        email: sourceRow?.email || "",
        district_id: sourceRow?.district_id != null ? String(sourceRow.district_id) : "",
        status: sourceRow?.status === "inactive" ? "inactive" : "active",
        // v4.3.83: نقش کاربر — کپی از روی کاربر مبدأ
        role_id: (duplicateFrom?.role_id ?? sourceRow?.role_id) != null ? String(duplicateFrom?.role_id ?? sourceRow?.role_id) : "",
      });
    }
  }, [open, sourceRow, duplicateFrom]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { setError("نام و نام خانوادگی الزامی است"); return; }
    if (!editRow && !form.username.trim()) { setError("نام کاربری الزامی است (پیشنهاد: کد ملی)"); return; }
    setSubmitting(true); setError(null);
    try {
      const roleId = form.role_id && form.role_id !== "__unknown__" ? Number(form.role_id) : null;
      if (editRow) {
        const payload: Record<string, unknown> = {
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          status: form.status,
        };
        // مدیر سیستم نمی‌تواند امور/وضعیت/نقش خودش را محدود کند
        if (!editingSelf) {
          payload.district_id = form.district_id ? Number(form.district_id) : null;
          payload.role_id = roleId;
        }
        if (form.password.trim()) payload.password = form.password.trim();
        await putUser(editRow.id, payload);
      } else {
        await postUser({
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          password: form.password.trim() || "123456",
          email: form.email.trim() || null,
          district_id: form.district_id ? Number(form.district_id) : null,
          status: form.status,
          role_id: roleId,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {editRow
              ? `ویرایش کاربر: ${editRow.full_name}`
              : duplicateFrom
                ? `کپی کاربر جدید (از: ${duplicateFrom.full_name})`
                : "ثبت کاربر جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <FormSection title="مشخصات حساب">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-right block">نام کاربری (اجباری)</Label>
                <Input
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })}
                  placeholder={editRow ? "" : "مثلاً کد ملی — 0069876543"}
                  disabled={!!editRow}
                  dir="ltr"
                  className="text-left disabled:opacity-60"
                />
                {editRow && <p className="text-[10px] text-slate-400 text-right">نام کاربری قابل تغییر نیست</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-right block">نام و نام خانوادگی (اجباری)</Label>
                <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="text-right" autoFocus={!editRow} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-right block">رمز عبور</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder={editRow ? "خالی = بدون تغییر" : "خالی = 123456"}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-right block">ایمیل</Label>
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-left" placeholder="example@mail.com" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-right block">امور بهره‌برداری</Label>
                <DistrictSelect
                  autoLock={false}
                  value={form.district_id}
                  onChange={v => setForm({ ...form, district_id: v })}
                  placeholder="نامشخص — مدیر سیستم (همهٔ امور)"
                />
                {editingSelf && <p className="text-[10px] text-amber-600 text-right">امور و وضعیت حساب خودتان قابل تغییر نیست</p>}
                {!editingSelf && !form.district_id && (
                  <p className="text-[10px] text-amber-600 text-right">بدون امور = مدیر سیستم با دسترسی کامل</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-right block">وضعیت</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })} disabled={editingSelf}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="inactive">غیرفعال</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection title="نقش و دسترسی">
            <div className="space-y-2">
              <Label className="text-right block">نقش کاربر</Label>
              <SearchableSelect
                value={form.role_id}
                onChange={v => setForm({ ...form, role_id: v })}
                placeholder="انتخاب نقش..."
                disabled={editingSelf}
                options={roles.map(r => {
                  const inactive = String(r.status ?? "active") === "inactive";
                  return {
                    value: String(r.id),
                    label: r.display_name,
                    description: inactive
                      ? `${Number(r.users_count ?? 0).toLocaleString("fa-IR")} کاربر · غیرفعال`
                      : `${Number(r.users_count ?? 0).toLocaleString("fa-IR")} کاربر`,
                  };
                })}
              />
              {editingSelf && <p className="text-[10px] text-amber-600 text-right">نقش حساب خودتان قابل تغییر نیست</p>}
              {!editingSelf && !form.role_id && (
                <p className="text-[10px] text-slate-400 text-right leading-5">
                  بدون نقش = همهٔ بخش‌ها فقط مشاهده — با انتخاب نقش، دسترسی‌های همان نقش اعمال می‌شود (تنظیم از تب «دسترسی‌ها»)
                </p>
              )}
            </div>
          </FormSection>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : editRow ? "اعمال ویرایش" : "ثبت کاربر"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
