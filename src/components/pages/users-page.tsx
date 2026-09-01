"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PaginatedResponse } from "@/lib/types";

interface UserList { id: number; username: string; full_name: string; email: string | null; status: boolean; roles: string | null; last_login_at: string | null; }

export function UsersPage() {
  const [users, setUsers] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try { const result = await apiClient.get<PaginatedResponse<UserList>>(API_ENDPOINTS.users, { page: 1, page_size: 100, search: search || undefined }); setUsers(result?.data || []); }
      catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
    };
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [search]);

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;

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
                    {user.status === "active" ? <Badge className="bg-green-100 text-green-700" variant="secondary">فعال</Badge> : <Badge variant="secondary" className="bg-slate-100 text-slate-500">غیرفعال</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 text-right">@{user.username}</p>
                  {user.email && <p className="text-xs text-slate-400 truncate text-right">{user.email}</p>}
                  {user.roles && <div className="mt-2"><Badge variant="outline" className="text-xs">{user.roles}</Badge></div>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
