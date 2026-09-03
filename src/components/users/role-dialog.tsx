"use client";

import { useEffect, useState } from "react";
import { postRole, putRole, type RoleRow } from "@/lib/roles-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/form-section";
import { Loader2, Lock } from "lucide-react";

/**
 * فرم نقش — ثبت / ویرایش / کپی (همان الگوی فرم‌های برنامه) — v4.3.83
 * ماتریس دسترسی نقش از ستون «دسترسی‌ها» در تب «نقش‌ها و دسترسی‌ها» تنظیم می‌شود.
 * نقش‌های سیستمی: نام قفل است ولی توضیح/وضعیت قابل ویرایش است.
 */
export function RoleDialog({
  open, editRow, duplicateFrom, onClose, onSaved,
}: {
  open: boolean;
  editRow: RoleRow | null;
  duplicateFrom: RoleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ display_name: "", description: "", status: "active" });

  const sourceRow = editRow || duplicateFrom;
  const isSystem = !!(editRow && Number(editRow.is_system) === 1);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        display_name: duplicateFrom ? "" : (sourceRow?.display_name || ""),
        description: sourceRow?.description || "",
        status: sourceRow && String(sourceRow.status) === "inactive" ? "inactive" : "active",
      });
    }
  }, [open, sourceRow, duplicateFrom]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.display_name.trim();
    if (!name) { setError("نام نقش الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      if (editRow) {
        await putRole(editRow.id, {
          ...(isSystem ? {} : { display_name: name }),
          description: form.description.trim() || null,
          status: form.status,
        });
      } else {
        await postRole({
          display_name: name,
          description: form.description.trim() || null,
          status: form.status,
          // کپی نقش: ماتریس دسترسی مبدأ هم منتقل می‌شود
          ...(duplicateFrom?.module_permissions ? { module_permissions: duplicateFrom.module_permissions } : {}),
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
          <DialogTitle className="text-right flex items-center gap-2">
            {editRow
              ? <>ویرایش نقش: {editRow.display_name}{isSystem && <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-400">سیستمی</Badge>}</>
              : duplicateFrom
                ? `کپی نقش جدید (از: ${duplicateFrom.display_name})`
                : "ثبت نقش جدید"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <FormSection title="مشخصات نقش">
            <div className="space-y-2">
              <Label className="text-right block">نام نقش (اجباری)</Label>
              <Input
                value={form.display_name}
                onChange={e => setForm({ ...form, display_name: e.target.value })}
                placeholder={duplicateFrom ? `مثلاً کپی ${duplicateFrom.display_name}` : "مثلاً سیمبان، کارشناس بازدید، ناظر ایمنی"}
                className="text-right"
                disabled={isSystem}
                autoFocus={!isSystem}
              />
              {isSystem && (
                <p className="text-[10px] text-amber-600 text-right flex items-center gap-1 justify-end">
                  <Lock className="w-3 h-3" />نام نقش سیستمی قابل تغییر نیست
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-right block">توضیحات</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="شرح وظایف و محدودهٔ دسترسی دارندگان این نقش (اختیاری)"
                className="text-right min-h-[72px] resize-vertical"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-right block">وضعیت</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="inactive">غیرفعال</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400 text-right leading-5">نقش غیرفعال در انتخاب نقش کاربران نمایش داده نمی‌شود</p>
              </div>
            </div>
          </FormSection>

          {duplicateFrom?.module_permissions && (
            <p className="text-[10px] text-slate-400 text-right leading-5">
              دسترسی‌های نقش «{duplicateFrom.display_name}» کپی می‌شود — بعداً از ستون «دسترسی‌ها» در جدول نقش‌ها قابل تغییر است
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : editRow ? "اعمال ویرایش" : "ثبت نقش"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
