"use client";

import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import type { DataTableHandle } from "@/components/data-table";

/**
 * حذف انبوه با پروگرس بار — v3.2.0
 *
 * همان روش خطوط/دکل‌ها (v2.2.0): دسته‌های ۵۰۰تایی با یک درخواست
 * به‌جای حذف تک‌تک — برای هر جدولی که bulk-delete دارد.
 *
 * شامل:
 *  - نوار پیشرفت (done/total)
 *  - تشخیص «PHP جدید آپلود نشده» (404 مسیر پیدا نشد)
 *  - پاک شدن خودکار انتخاب‌ها بعد از اتمام (tableRef.clearSelection)
 *  - refresh با refreshKey
 */

export interface BulkDeleteState {
  done: number;
  total: number;
}

export function useBulkDelete<T extends { id: number }>(options: {
  /** مسیر endpoint حذف انبوه — مثل "circuits/bulk-delete" */
  endpoint: string;
  /** نام موجودیت برای پیام‌ها — مثل "مدار" */
  entityName: string;
  /** ref جدول برای پاک کردن انتخاب‌ها */
  tableRef: React.MutableRefObject<DataTableHandle | null>;
  /** افزایش کلید refresh برای بارگذاری مجدد */
  refresh: () => void;
}) {
  const { endpoint, entityName, tableRef, refresh } = options;
  const { toast } = useToast();

  const [pendingRows, setPendingRows] = useState<T[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<BulkDeleteState | null>(null);
  const deletingRowsRef = useRef<T[]>([]);

  // sync ref
  const requestDelete = useCallback((rows: T[]) => {
    if (rows.length === 0) {
      toast({
        title: `هیچ ردیفی انتخاب نشده`,
        description: `برای حذف، ابتدا ردیف(های) مورد نظر را انتخاب کنید`,
        variant: "destructive",
      });
      return;
    }
    deletingRowsRef.current = rows;
    setPendingRows(rows);
  }, [toast]);

  const cancelDelete = useCallback(() => {
    if (!isDeleting) {
      setPendingRows(null);
      setDeleteProgress(null);
      deletingRowsRef.current = [];
    }
  }, [isDeleting]);

  const confirmDelete = useCallback(async () => {
    const rows = deletingRowsRef.current;
    if (rows.length === 0) return;

    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: rows.length });

    // همان روش خطوط/دکل‌ها — دسته‌های ۵۰۰تایی
    const CHUNK = 500;
    let success = 0;
    let skipped = 0;
    let lastError = "";

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      try {
        const res = await apiClient.post<any>(endpoint, { ids: chunk.map(r => r.id) });
        success += res?.deleted ?? chunk.length;
        if (typeof res?.skipped === "number") skipped += res.skipped;
      } catch (err: any) {
        lastError = err?.message || "نامشخص";
        // فقط 404ِ «مسیر پیدا نشد» یعنی endpoint روی هاست ثبت نشده (PHP قدیمی) — ادامه نده
        if (err?.statusCode === 404 && /مسیر پیدا نشد|not found/i.test(lastError)) {
          setIsDeleting(false);
          setDeleteProgress(null);
          deletingRowsRef.current = [];
          setPendingRows(null);
          toast({
            title: "فایل‌های PHP جدید روی هاست آپلود نشده‌اند",
            description: `قابلیت حذف انبوه ${entityName}‌ها به endpoint «${endpoint}» نیاز دارد — ابتدا پوشه api_powerline را روی هاست آپلود کنید.`,
            variant: "destructive",
          });
          return;
        }
        console.error("خطا در حذف گروهی:", err);
      }
      setDeleteProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
    }

    deletingRowsRef.current = [];
    setPendingRows(null);
    setIsDeleting(false);
    setDeleteProgress(null);
    refresh();
    // پاک شدن خودکار انتخاب‌ها بعد از اتمام
    if (tableRef.current) tableRef.current.clearSelection();

    const failed = rows.length - success - skipped;
    if (failed === 0 && skipped === 0) {
      toast({
        title: "حذف شد",
        description: `${success.toLocaleString("fa-IR")} ${entityName} با موفقیت از دیتابیس حذف شد`,
      });
    } else if (skipped > 0) {
      toast({
        title: "حذف انجام شد (با رد موارد)",
        description: `${success.toLocaleString("fa-IR")} حذف شد، ${skipped.toLocaleString("fa-IR")} مورد رد شد` + (failed > 0 ? `، ${failed.toLocaleString("fa-IR")} خطا (${lastError})` : ""),
        variant: "destructive",
      });
    } else {
      toast({
        title: "حذف ناقص",
        description: `${success.toLocaleString("fa-IR")} حذف شد، ${failed.toLocaleString("fa-IR")} ناموفق (${lastError})`,
        variant: "destructive",
      });
    }
  }, [endpoint, entityName, refresh, tableRef, toast]);

  return {
    /** ردیف‌های در انتظار تأیید حذف — برای باز نگه داشتن دیالوگ */
    pendingRows,
    isDeleting,
    deleteProgress,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
