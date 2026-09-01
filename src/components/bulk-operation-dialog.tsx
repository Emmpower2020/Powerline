"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface BulkOperationProgress {
  completed: number;
  total: number;
  success?: number;
  failed?: number;
}

export function BulkOperationDialog({
  open,
  entityName,
  operationLabel,
  progress,
  running,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  entityName: string;
  operationLabel: string;
  progress: BulkOperationProgress | null;
  running: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = Math.max(progress?.total ?? 0, 1);
  const completed = Math.min(progress?.completed ?? 0, total);
  const percent = progress ? Math.round((completed / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !running) onCancel(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {running ? `در حال اجرای ${operationLabel}` : "تأیید عملیات گروهی"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-right">
          {!running ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              آیا می‌خواهید این عملیات را روی <span className="font-bold text-indigo-600 nums-fa">{progress?.total?.toLocaleString("fa-IR") ?? "۰"}</span> {entityName} انتخاب‌شده اجرا کنید؟
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm nums-fa">
                <span className="text-slate-500">پیشرفت عملیات</span>
                <span className="font-bold text-indigo-600">{percent.toLocaleString("fa-IR")}٪</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 nums-fa">
                <span>{completed.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")}</span>
                <span>{(progress?.success ?? 0).toLocaleString("fa-IR")} موفق{progress?.failed ? `، ${progress.failed.toLocaleString("fa-IR")} ناموفق` : ""}</span>
              </div>
              <p className="text-xs text-slate-400">لطفاً تا پایان عملیات این پنجره را نبندید.</p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={running}>
            انصراف
          </Button>
          <Button type="button" className="bg-indigo-600 hover:bg-indigo-700" onClick={onConfirm} disabled={running}>
            {running ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال اجرا...</> : "تأیید و اجرا"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
