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
import { Loader2, Search, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  last_login_at: string | null;
}

/**
 * صفحه کاربران — v4.3.78:
 *  • نمایش امور بهره‌برداری هر کاربر روی کارت
 *  • ویرایش امور و وضعیت (فعال/غیرفعال) کاربر
 *  کاربرِ بدون امور (نامشخص) = مدیر برنامه و همهٔ داده‌ها را می‌بیند؛
 *  برای محدود کردن کاربر به امور خودش، از دکمهٔ ویرایش امور اختصاص دهید.
 */
export function UsersPage() {
  const [users, setUsers] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserList | null>(null);
  const [saving, setSaving] = useState(false);
  const [editDistrict, setEditDistrict] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await apiClient.get<PaginatedResponse<UserList>>(API_ENDPOINTS.users, { page: 1, page_size: 100, search: search || undefined });
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

  if (loading && !users.length) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;

  const getInitials = (name: string) => name.split(" ").slice(0, 2).map(p => p[0]).join("");

  return (
    <div className="space-y-4">
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
                  <p className="text-xs text-slate-500 text-right">@{user.username}</p>
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
