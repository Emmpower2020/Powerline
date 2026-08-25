"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Save, KeyRound, User as UserIcon } from "lucide-react";

export function SettingsPage() {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage(null);
    if (!oldPassword || !newPassword) { setMessage({ type: "error", text: "رمز قدیمی و جدید را وارد کنید" }); return; }
    if (newPassword.length < 8) { setMessage({ type: "error", text: "رمز جدید باید حداقل ۸ کاراکتر باشد" }); return; }
    if (newPassword !== confirmPassword) { setMessage({ type: "error", text: "تکرار رمز مطابقت ندارد" }); return; }
    setSaving(true);
    try { await apiClient.post(API_ENDPOINTS.changePassword, { old_password: oldPassword, new_password: newPassword }); setMessage({ type: "success", text: "رمز عبور تغییر کرد" }); setOldPassword(""); setNewPassword(""); setConfirmPassword(""); }
    catch (err) { setMessage({ type: "error", text: err instanceof Error ? err.message : "خطا" }); }
    finally { setSaving(false); }
  };

  const getInitials = (name: string) => name.split(" ").slice(0, 2).map(p => p[0]).join("");

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserIcon className="w-5 h-5" />پروفایل کاربر</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20"><AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xl">{getInitials(user?.full_name || "U")}</AvatarFallback></Avatar>
            <div className="text-right">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{user?.full_name}</h3>
              <p className="text-sm text-slate-500">@{user?.username}</p>
              {user?.email && <p className="text-sm text-slate-400">{user.email}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" />تغییر رمز عبور</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            {message && <div className={`p-3 rounded-lg text-sm text-right ${message.type === "success" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>{message.text}</div>}
            <div className="space-y-2"><Label className="text-right block">رمز فعلی</Label><Input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="text-right" /></div>
            <div className="space-y-2"><Label className="text-right block">رمز جدید</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="text-right" /></div>
            <div className="space-y-2"><Label className="text-right block">تکرار رمز جدید</Label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="text-right" /></div>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ذخیره...</> : <><Save className="w-4 h-4 ml-2" />ذخیره</>}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
