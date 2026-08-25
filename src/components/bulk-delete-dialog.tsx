"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import type { BulkDeleteState } from "@/hooks/use-bulk-delete";

/**
 * دیالوگ تأیید حذف انبوه با نوار پیشرفت — v3.2.0
 * همان ظاهر خطوط/دکل‌ها (v2.2.0): نوار قرمز + شمارنده «X از Y»
 */
export function BulkDeleteDialog({
  open, rowsCount, entityName, description, isDeleting, progress, onCancel, onConfirm,
}: {
  open: boolean;
  rowsCount: number;
  /** نام موجودیت — مثل «مدار» */
  entityName: string;
  /** توضیح اختصاصی (اختیاری) — در غیر این صورت متن پیش‌فرض بر اساس entityName */
  description?: string;
  isDeleting: boolean;
  progress: BulkDeleteState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">حذف {entityName}(های) انتخاب‌شده</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            {description ?? `${rowsCount.toLocaleString("fa-IR")} ${entityName} انتخاب‌شده به‌طور کامل حذف می‌شوند. این عمل قابل بازگشت نیست.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* نوار پیشرفت حذف — همان خطوط/دکل‌ها */}
        {isDeleting && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 nums-fa">
              <span>در حال حذف...</span>
              <span>{progress.done.toLocaleString("fa-IR")} از {progress.total.toLocaleString("fa-IR")}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500 transition-all duration-300"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse">
          <AlertDialogCancel disabled={isDeleting}>انصراف</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting
              ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال حذف...</>
              : "حذف"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
