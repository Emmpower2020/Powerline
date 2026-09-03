"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DistrictSelect } from "@/components/district-select";
import { Loader2, Search, Pencil, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_ACCESS } from "@/lib/module-access";
import { useToast } from "@/hooks/use-toast";
import type { PaginatedResponse } from "@/lib/types";

interface UserList {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  status: string;
  roles: string | null;
  district_id?: number | null;
  district_name?: string | null;
  // v4.3.81: نقشهٔ دسترسی ماژول‌ها — null یعنی همه مجاز
  module_permissions?: Record<string, boolean> | null;
  last_login_at: string | null;
}

/**
 * صفحه کاربران — v4.3.78: نمایش/ویرایش امور و وضعیت کاربران.
 * v4.3.81: تب جدید «دسترسی‌های بخش‌ها» — ماتریس کاربر × ماژول با تیک:
 *   • مدیر سیستم (بدون امور) همیشه دسترسی کامل دارد (ردیف قفل)
 *   • تیک خاموش = آن بخش از منوی کاربر حذف می‌شود
 *   • کاربران تازه (بدون نقشه) پیش‌فرض همهٔ بخش‌ها را می‌بینند
 * کاربران آزمایشی پرسنل پیمانکار با نام کاربری «کد ملی» از SQL نسخه ساخته می‌شوند.
 */
export function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserList | null>(null);
  const [saving, setSaving] = useState(false);
  const [editDistrict, setEditDistrict] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  // v4.3.81: ذخیرهٔ ماتریس — کاربری که در حال ذخیره است (تیک‌های همان ردیف قفل می‌شوند)
  const [savingUserId, setSavingUserId] = useState<number | null>(null);

  const load = async () => {
    try {
      const result = await apiClient.get<PaginatedResponse<UserList>>(API_ENDPOINTS.users, { page: 1, page_size: 200, search: search || undefined });
      setUsers(result?.data || []);
    } catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
  };

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [search]);

  // v4.3.78: باز کردن فرم ویرایش امور/وضعیت کاربر
  const openEdit = (user: UserList) => {
    setEditing(user);
    setEditDistrict(user.district_id != null ? String(user.district_id) : "");
    setEditStatus(user.status === "inactive" ? "inactive" : "active");
    setError(null);
  };

  // ذخیره ویرایش — PUT /users/{id} (فقط مدیر ارشد)
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      await apiClient.put(`${API_ENDPOINTS.users}/${editing.id}`, {
        district_id: editDistrict ? Number(editDistrict) : null,
        status: editStatus,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره اطلاعات");
    } finally {
      setSaving(false);
    }
  };

  // ── v4.3.81: ماتریس دسترسی — تغییر تیک یک ماژول برای یک کاربر ──
  const toggleModule = async (user: UserList, moduleKey: string, allowed: boolean) => {
    if (user.district_id == null) return; // مدیر — قفل
    // نقشهٔ فعلی را کامل بساز (کلیدهای غایب = true) تا ذخیرهٔ دقیق و قابل‌مقایسه باشد
    const current: Record<string, boolean> = {};
    for (const m of MODULE_ACCESS) {
      current[m.key] = user.module_permissions ? user.module_permissions[m.key] !== false : true;
    }
    current[moduleKey] = allowed;

    // به‌روزرسانی خوش‌بینانه + بازگردانی در صورت خطا
    const prev = user.module_permissions ?? null;
    setUsers(list => list.map(u => u.id === user.id ? { ...u, module_permissions: current } : u));
    setSavingUserId(user.id);
    try {
      await apiClient.put(`${API_ENDPOINTS.users}/${user.id}`, { module_permissions: current });
      toast({
        title: allowed ? "دسترسی فعال شد" : "دسترسی حذف شد",
        description: `${user.full_name} — ${moduleLabel(moduleKey)}`,
      });
    } catch (err) {
      setUsers(list => list.map(u => u.id === user.id ? { ...u, module_permissions: prev } : u));
      toast({
        title: "خطا در ذخیره دسترسی",
        description: err instanceof Error ? err.message : "خطای نامشخص",
        variant: "destructive",
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const moduleLabel = (key: string) => MODULE_ACCESS.find(m => m.key === key)?.label || key;

  if (loading && !users.length) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;

  const getInitials = (name: string) => name.split(" ").slice(0, 2).map(p => p[0]).join("");

  return (
    <div className="space-y-4">
      <Tabs defaultValue="info" dir="rtl" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="info" className="text-xs">اطلاعات کاربران</TabsTrigger>
          {/* v4.3.81: ماتریس دسترسی بخش‌ها */}
          <TabsTrigger value="access" className="text-xs gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />دسترسی‌های بخش‌ها</TabsTrigger>
        </TabsList>

        {/* ─── تب ۱: اطلاعات کاربران (کارت‌ها + ویرایش امور/وضعیت) ─── */}
        <TabsContent value="info" className="space-y-4 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="جستجوی کاربر..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(user => (
              <Card key={user.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-12 h-12"><AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">{getInitials(user.full_name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate text-right">{user.full_name}</h3>
                        {user.status === "active"
                          ? <Badge className="bg-green-100 text-green-700" variant="secondary">فعال</Badge>
                          : <Badge variant="secondary" className="bg-slate-100 text-slate-500">غیرفعال</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 text-right" dir="ltr">@{user.username}</p>
                      {user.email && <p className="text-xs text-slate-400 truncate text-right">{user.email}</p>}
                      {/* v4.3.78: امور بهره‌برداری کاربر — نامشخص یعنی همهٔ امور (مدیر) */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {user.district_name
                          ? <Badge variant="outline" className="text-xs border-indigo-200 text-indigo-700 dark:text-indigo-300">{user.district_name}</Badge>
                          : <Badge variant="outline" className="text-xs border-slate-200 text-slate-400">همهٔ امور (مدیر)</Badge>}
                      </div>
                      {user.roles && <div className="mt-2"><Badge variant="outline" className="text-xs">{user.roles}</Badge></div>}
                    </div>
                    {/* v4.3.78: ویرایش امور/وضعیت کاربر */}
                    <Button
                      variant="outline" size="icon" onClick={() => openEdit(user)}
                      className="h-8 w-8 shrink-0 text-indigo-600 hover:bg-indigo-50 border-indigo-200"
                      title="ویرایش امور بهره‌برداری و وضعیت"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── تب ۲: v4.3.81 ماتریس دسترسی‌ها — کاربر × بخش با تیک ─── */}
        <TabsContent value="access" className="mt-4 space-y-3">
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 leading-6">
            تیک = کاربر آن بخش را در منو می‌بیند. برداشتن تیک، بخش از منوی کاربر حذف می‌شود.
            مدیر سیستم (بدون امور) دسترسی کامل و تغییرناپذیر دارد. کاربر جدید بدون محدودیت، همهٔ بخش‌ها را می‌بیند.
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70">
                  <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800/70 border-l border-slate-200 dark:border-slate-700 px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap min-w-[190px]">
                    کاربر
                  </th>
                  {MODULE_ACCESS.map(m => (
                    <th key={m.key} className="px-2 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap min-w-[70px] border-l border-slate-100 dark:border-slate-800 last:border-l-0">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isAdmin = user.district_id == null;
                  const rowSaving = savingUserId === user.id;
                  return (
                    <tr key={user.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="sticky right-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{user.full_name}</span>
                          <span className="text-[10px] text-slate-400 text-right" dir="ltr">@{user.username}</span>
                          {isAdmin
                            ? <Badge variant="outline" className="text-[10px] mt-0.5 border-slate-200 text-slate-400 w-fit">مدیر — دسترسی کامل</Badge>
                            : user.district_name
                              ? <Badge variant="outline" className="text-[10px] mt-0.5 border-indigo-200 text-indigo-700 dark:text-indigo-300 w-fit">{user.district_name}</Badge>
                              : null}
                        </div>
                      </td>
                      {MODULE_ACCESS.map(m => {
                        const allowed = isAdmin
                          ? true
                          : user.module_permissions
                            ? user.module_permissions[m.key] !== false
                            : true;
                        return (
                          <td key={m.key} className="px-2 py-2 text-center border-l border-slate-100 dark:border-slate-800 last:border-l-0">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={allowed}
                                disabled={isAdmin || rowSaving || user.status === "inactive"}
                                onCheckedChange={(v) => toggleModule(user, m.key, v === true)}
                                className={isAdmin ? "opacity-50" : "data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"}
                                aria-label={`${m.label} — ${user.full_name}`}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {!users.length && (
                  <tr><td colSpan={MODULE_ACCESS.length + 1} className="px-3 py-8 text-center text-slate-400">کاربری یافت نشد</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* v4.3.78: دیالوگ ویرایش کاربر — امور بهره‌برداری + وضعیت */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o && !saving) setEditing(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">ویرایش کاربر: {editing?.full_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-500 text-right leading-6">
              کاربرِ بدون امور (نامشخص) همهٔ داده‌های همهٔ امور را می‌بیند — مناسب مدیر برنامه.
              با انتخاب امور، کاربر فقط جدول‌های همان امور را خواهد دید.
            </div>
            <div className="space-y-2">
              <Label className="text-right block">امور بهره‌برداری</Label>
              <DistrictSelect value={editDistrict} onChange={setEditDistrict} placeholder="نامشخص — همهٔ امور (مدیر)" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">وضعیت</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">فعال</SelectItem>
                  <SelectItem value="inactive">غیرفعال</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-600 whitespace-pre-line text-right">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>انصراف</Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "اعمال ویرایش"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
