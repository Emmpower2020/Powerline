"use client";

import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Printer, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PrintScope = "current" | "filtered" | "all";
export type Orientation = "portrait" | "landscape";

interface Props {
  open: boolean;
  onClose: () => void;
  onGetData: (scope: PrintScope) => Promise<Array<Record<string, unknown>>>;
  columns: Array<{ key: string; header: string }>;
  visibleColumns: Array<{ key: string; header: string }>;
  defaultTitle?: string;
  currentCount?: number;
  filteredCount?: number;
  totalCount?: number;
}

export function PrintDialog({
  open, onClose, onGetData, columns, visibleColumns,
  defaultTitle = "گزارش",
  currentCount = 0,
  filteredCount = 0,
  totalCount = 0,
}: Props) {
  const [printing, setPrinting] = useState(false);
  const [title, setTitle] = useState(defaultTitle || "لیست خطوط انتقال");
  const [subtitle, setSubtitle] = useState("");
  const [scope, setScope] = useState<PrintScope>("filtered");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [error, setError] = useState<string | null>(null);
  // ستون‌های انتخاب‌شده — پیش‌فرض: ستون‌های visible
  // استفاده از Set< string> ساده بدون useEffect sync — فقط init یکباره
  const [selectedColKeys, setSelectedColKeys] = useState<Set<string>>(
    () => new Set(visibleColumns.map(c => c.key))
  );

  // ستون‌های انتخاب‌شده — محاسبه ساده
  const selectedColumns = useMemo(
    () => columns.filter(c => selectedColKeys.has(c.key)),
    [columns, selectedColKeys]
  );

  // وقتی دیالوگ باز/بسته می‌شود، state را reset کن — اما فقط با open
  // این کار را با useEffect انجام نمی‌دهیم چون باعث re-render می‌شود
  // به جای آن، handleClose همه چیز را reset می‌کند

  const toggleColumn = useCallback((key: string) => {
    setSelectedColKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllColumns = useCallback(() => {
    setSelectedColKeys(new Set(columns.map(c => c.key)));
  }, [columns]);

  const selectVisibleColumns = useCallback(() => {
    setSelectedColKeys(new Set(visibleColumns.map(c => c.key)));
  }, [visibleColumns]);

  const deselectAllColumns = useCallback(() => {
    setSelectedColKeys(new Set());
  }, []);

  const handleClose = () => {
    if (printing) return;
    setError(null);
    setTitle(defaultTitle || "لیست خطوط انتقال");
    setSubtitle("");
    setScope("filtered");
    setOrientation("landscape");
    setSelectedColKeys(new Set(visibleColumns.map(c => c.key)));
    onClose();
  };

  // چاپ با Blob URL — iframe مخفی
  const handlePrint = async () => {
    setPrinting(true);
    setError(null);
    try {
      if (selectedColumns.length === 0) {
        setError("حداقل یک ستون باید انتخاب شود");
        return;
      }

      const rows = await onGetData(scope);
      if (rows.length === 0) {
        setError("هیچ داده‌ای برای چاپ وجود ندارد");
        return;
      }

      const html = generatePrintHTML(rows, selectedColumns, title, subtitle, orientation);

      // ساخت Blob از HTML
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);

      // ساخت iframe مخفی
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      let printed = false;

      const cleanup = () => {
        URL.revokeObjectURL(blobUrl);
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      };

      iframe.onload = () => {
        if (printed) return;
        printed = true;
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error("Print error:", err);
            const w = window.open(blobUrl, "_blank");
            if (w) {
              setTimeout(() => w.print(), 1000);
            }
          }
          setTimeout(cleanup, 2000);
        }, 500);
      };

      iframe.src = blobUrl;

      // fallback timeout
      setTimeout(() => {
        if (!printed) {
          printed = true;
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error("Print fallback error:", err);
          }
          setTimeout(cleanup, 2000);
        }
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در چاپ");
    } finally {
      setPrinting(false);
    }
  };

  function generatePrintHTML(
    rows: Array<Record<string, unknown>>,
    cols: Array<{ key: string; header: string }>,
    reportTitle: string,
    reportSubtitle: string,
    orient: Orientation,
  ): string {
    const now = new Date().toLocaleString("fa-IR");
    const headerCells = cols.map(c => `<th>${escapeHtml(c.header)}</th>`).join("");
    const bodyRows = rows.map((row, idx) => {
      const cells = cols.map(col => {
        const v = row[col.key];
        let display = "";
        if (v === null || v === undefined) display = "—";
        else if (typeof v === "boolean") display = v ? "بله" : "خیر";
        else if (typeof v === "number") display = v.toLocaleString("fa-IR");
        else display = String(v);
        return `<td>${escapeHtml(display)}</td>`;
      }).join("");
      return `<tr class="${idx % 2 === 1 ? "alt" : ""}">${cells}</tr>`;
    }).join("");

    const pageSize = orient === "landscape" ? "A4 landscape" : "A4 portrait";
    const pageMargin = orient === "landscape" ? "10mm 15mm" : "15mm 15mm";

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Tahoma, Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 20px; }
    .report-header { text-align: center; margin-bottom: 20px; padding: 20px 15px; border: 2px solid #333; border-radius: 8px; background: #f8f9fa; }
    .report-header h1 { font-size: 24px; margin-bottom: 8px; color: #1a1a1a; }
    .report-header .subtitle { font-size: 14px; color: #444; margin-bottom: 12px; white-space: pre-wrap; }
    .report-header .info-bar { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 10px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
    .report-header .info-item { display: flex; align-items: center; gap: 5px; }
    .report-header .info-label { font-weight: bold; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #EBF1DE; color: #000; font-weight: normal; padding: 10px 6px; border: 1px solid #888; text-align: center; font-size: 11px; }
    td { padding: 6px; border: 1px solid #bbb; text-align: right; font-size: 10px; }
    tr.alt { background: #f5f5f5; }
    .footer { margin-top: 25px; padding-top: 10px; border-top: 2px solid #333; text-align: center; font-size: 10px; color: #666; }
    @page { size: ${pageSize}; margin: ${pageMargin}; }
    @media print {
      body { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      .report-header { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${escapeHtml(reportTitle)}</h1>
    ${reportSubtitle ? `<div class="subtitle">${escapeHtml(reportSubtitle)}</div>` : ""}
    <div class="info-bar">
      <div class="info-item"><span class="info-label">تاریخ:</span> ${now}</div>
      <div class="info-item"><span class="info-label">ردیف‌ها:</span> ${rows.length.toLocaleString("fa-IR")}</div>
      <div class="info-item"><span class="info-label">ستون‌ها:</span> ${cols.length.toLocaleString("fa-IR")}</div>
      <div class="info-item"><span class="info-label">جهت:</span> ${orient === "landscape" ? "افقی" : "عمودی"}</div>
    </div>
  </div>
  <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
  <div class="footer">این گزارش توسط سامانه مدیریت خطوط انتقال برق تولید شده است</div>
</body>
</html>`;
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* هدر ثابت */}
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <DialogTitle className="text-right flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600" />
            چاپ گزارش
          </DialogTitle>
          <DialogDescription className="text-right">
            تنظیمات چاپ را انتخاب کنید و سپس روی «چاپ» کلیک کنید
          </DialogDescription>
        </DialogHeader>

        {/* محتوای وسط — قابل اسکرول */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-4">
          <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            {/* عنوان */}
            <div className="space-y-2">
              <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">عنوان گزارش</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} disabled={printing} className="text-right" placeholder="عنوان گزارش..." />
            </div>

            {/* زیرعنوان */}
            <div className="space-y-2">
              <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">زیرعنوان (اختیاری)</Label>
              <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} disabled={printing} className="text-right" placeholder="مثلاً: بازه زمانی ۱۴۰۰ تا ۱۴۰۳، منطقه کرمانشاه..." />
            </div>

            {/* جهت صفحه */}
            <div className="space-y-2">
              <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">جهت صفحه</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setOrientation("landscape")} disabled={printing}
                  className={cn("px-3 py-2 rounded border text-sm cursor-pointer transition-colors flex items-center gap-2",
                    orientation === "landscape" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700" : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700")}>
                  <FileText className="w-4 h-4 rotate-90 shrink-0" />
                  <span className="font-medium">افقی <span className="text-xs text-slate-500 font-normal">(Landscape)</span></span>
                </button>
                <button type="button" onClick={() => setOrientation("portrait")} disabled={printing}
                  className={cn("px-3 py-2 rounded border text-sm cursor-pointer transition-colors flex items-center gap-2",
                    orientation === "portrait" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700" : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700")}>
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="font-medium">عمودی <span className="text-xs text-slate-500 font-normal">(Portrait)</span></span>
                </button>
              </div>
            </div>

            {/* محدوده صفحه — ردیف جداگانه */}
            <div className="space-y-2">
              <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">محدوده صفحه</Label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setScope("current")} disabled={printing || currentCount === 0}
                  className={cn("px-3 py-2 rounded border text-sm cursor-pointer transition-colors text-center",
                    scope === "current" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700")}>
                  <p className="font-medium">صفحه فعلی</p>
                  <p className="text-xs text-slate-500 mt-0.5 nums-fa">{currentCount.toLocaleString("fa-IR")} ردیف</p>
                </button>
                <button type="button" onClick={() => setScope("filtered")} disabled={printing || filteredCount === 0}
                  className={cn("px-3 py-2 rounded border text-sm cursor-pointer transition-colors text-center",
                    scope === "filtered" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700")}>
                  <p className="font-medium">فیلتر شده</p>
                  <p className="text-xs text-slate-500 mt-0.5 nums-fa">{filteredCount.toLocaleString("fa-IR")} ردیف</p>
                </button>
                <button type="button" onClick={() => setScope("all")} disabled={printing || totalCount === 0}
                  className={cn("px-3 py-2 rounded border text-sm cursor-pointer transition-colors text-center",
                    scope === "all" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700")}>
                  <p className="font-medium">همه ردیف‌ها</p>
                  <p className="text-xs text-slate-500 mt-0.5">{totalCount < 0 ? "همه" : `${totalCount.toLocaleString("fa-IR")} ردیف`}</p>
                </button>
              </div>
            </div>
          </div>
          {/* پایان سکشن تنظیمات */}

          {/* انتخاب ستون‌ها با checkbox */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-right block text-xs text-slate-600 dark:text-slate-300">ستون‌های چاپ</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectVisibleColumns} disabled={printing}
                  className="text-indigo-600 hover:text-indigo-700 cursor-pointer">ستون‌های نمایش</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={selectAllColumns} disabled={printing}
                  className="text-indigo-600 hover:text-indigo-700 cursor-pointer">انتخاب همه</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={deselectAllColumns} disabled={printing}
                  className="text-red-500 hover:text-red-700 cursor-pointer">حذف همه</button>
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-48 overflow-y-auto bg-white dark:bg-slate-800/50">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {columns.map(col => {
                  const checked = selectedColKeys.has(col.key);
                  const isVisible = visibleColumns.some(c => c.key === col.key);
                  return (
                    <div key={col.key}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors select-none",
                        checked ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-700"
                      )}
                      onClick={() => toggleColumn(col.key)}>
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300 dark:border-slate-600"
                      )}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className={cn("truncate", !isVisible && "text-slate-400")}>{col.header}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-slate-400 nums-fa">{selectedColumns.length.toLocaleString("fa-IR")} ستون انتخاب شده</p>
          </div>

          {error && (
            <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* فوتر ثابت */}
        <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <Button type="button" variant="outline" onClick={handleClose} disabled={printing}>انصراف</Button>
          <Button type="button" onClick={handlePrint} disabled={printing} className="bg-green-600 hover:bg-green-700">
            {printing
              ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال آماده‌سازی...</>
              : <><Printer className="w-4 h-4 ml-2" />چاپ</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
