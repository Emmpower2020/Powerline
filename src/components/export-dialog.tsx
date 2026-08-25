"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Download, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { cn } from "@/lib/utils";

export type ExportScope = "current" | "filtered" | "all";
export type ColumnScope = "visible" | "all";

export interface ExportOptions {
  scope: ExportScope;
  format: "xlsx" | "csv";
  fileName: string;
  columnScope: ColumnScope;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onGetData: (scope: ExportScope) => Promise<Array<Record<string, unknown>>>;
  /** همه ستون‌ها (شامل مخفی) */
  columns: Array<{ key: string; header: string }>;
  /** ستون‌های قابل مشاهده فعلی (غیر مخفی) */
  visibleColumns: Array<{ key: string; header: string }>;
  defaultFileName?: string;
  currentCount?: number;
  filteredCount?: number;
  totalCount?: number;
}

// تولید فایل Excel با استایل‌بندی کامل (هدر رنگی، RTL، حاشیه، جدول‌بندی)
async function generateStyledExcel(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ key: string; header: string }>,
  fileName: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Powerline EAM";
  wb.created = new Date();

  const ws = wb.addWorksheet("Sheet1", {
    views: [{ rightToLeft: true }], // RTL برای فارسی
  });

  // هدر با رنگ سفید سبز #EBF1DE و متن مشکی غیر بولد
  const headerRow = ws.addRow(columns.map(c => c.header));
  headerRow.height = 28;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: false, color: { argb: "FF000000" }, size: 12, name: "Tahoma" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEBF1DE" }, // #EBF1DE
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  // ردیف‌های داده
  for (const row of rows) {
    const rowData = columns.map(col => {
      const v = row[col.key];
      if (v === null || v === undefined) return "";
      if (typeof v === "boolean") return v ? "بله" : "خیر";
      return v;
    });
    const excelRow = ws.addRow(rowData);
    excelRow.height = 22;
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { size: 11, name: "Tahoma" };
      // اعداد وسط‌چین، متن راست‌چین
      const col = columns[colNumber - 1];
      if (typeof rowData[colNumber - 1] === "number") {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "right", vertical: "middle", wrapText: false };
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }

  // تنظیم عرض ستون‌ها
  columns.forEach((col, idx) => {
    const maxLen = Math.max(
      col.header.length,
      ...rows.map(r => String(r[col.key] ?? "").length),
    );
    ws.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 4, 12), 40);
  });

  // فیلتر خودکار روی هدر
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // تثبیت هدر
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];

  // تولید فایل
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const date = new Date().toISOString().slice(0, 10);
  saveAs(blob, `${fileName}-${date}.xlsx`);
}

export function ExportDialog({
  open, onClose, onGetData, columns, visibleColumns,
  defaultFileName = "export",
  currentCount = 0,
  filteredCount = 0,
  totalCount = 0,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    scope: "filtered",
    format: "xlsx",
    fileName: defaultFileName,
    columnScope: "visible",
  });
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (exporting) return;
    setError(null);
    setOptions({ scope: "filtered", format: "xlsx", fileName: defaultFileName, columnScope: "visible" });
    onClose();
  };

  // ستون‌های انتخاب‌شده برای خروجی
  const selectedColumns = options.columnScope === "all" ? columns : visibleColumns;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const rows = await onGetData(options.scope);
      if (rows.length === 0) {
        setError("هیچ داده‌ای برای خروجی وجود ندارد");
        return;
      }

      if (selectedColumns.length === 0) {
        setError("هیچ ستونی برای خروجی انتخاب نشده است");
        return;
      }

      const fileName = options.fileName.trim() || defaultFileName;
      const date = new Date().toISOString().slice(0, 10);

      if (options.format === "xlsx") {
        await generateStyledExcel(rows, selectedColumns, fileName);
      } else {
        // CSV با SheetJS
        const exportData = rows.map(row => {
          const newRow: Record<string, unknown> = {};
          for (const col of selectedColumns) {
            const val = row[col.key];
            if (val === null || val === undefined) {
              newRow[col.header] = "";
            } else if (typeof val === "boolean") {
              newRow[col.header] = val ? "بله" : "خیر";
            } else {
              newRow[col.header] = val;
            }
          }
          return newRow;
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        saveAs(blob, `${fileName}-${date}.csv`);
      }
      handleClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "خطا در تولید فایل خروجی");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            خروجی گرفتن
          </DialogTitle>
          <DialogDescription className="text-right">
            تنظیمات خروجی را انتخاب کنید
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* نام فایل */}
          <div className="space-y-2">
            <Label className="text-right block">نام فایل خروجی</Label>
            <Input
              value={options.fileName}
              onChange={e => setOptions(o => ({ ...o, fileName: e.target.value }))}
              disabled={exporting}
              className="text-right"
              placeholder="نام فایل را وارد کنید..."
            />
            <p className="text-xs text-slate-400">می‌توانید نام را ویرایش کنید یا همان پیش‌فرض را استفاده کنید</p>
          </div>

          {/* فرمت */}
          <div className="space-y-2">
            <Label className="text-right block">فرمت فایل</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, format: "xlsx" }))}
                disabled={exporting}
                className={cn(
                  "p-2 rounded border text-sm text-right cursor-pointer transition-colors flex items-center gap-2",
                  options.format === "xlsx"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, format: "csv" }))}
                disabled={exporting}
                className={cn(
                  "p-2 rounded border text-sm text-right cursor-pointer transition-colors flex items-center gap-2",
                  options.format === "csv"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
            </div>
            {options.format === "xlsx" && (
              <p className="text-xs text-slate-400">فایل Excel با هدر رنگی، راست‌چین و جدول‌بندی تولید می‌شود</p>
            )}
          </div>

          {/* محدوده */}
          <div className="space-y-2">
            <Label className="text-right block">محدوده خروجی</Label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, scope: "current" }))}
                disabled={exporting || currentCount === 0}
                className={cn(
                  "w-full p-3 rounded border text-right cursor-pointer transition-colors",
                  options.scope === "current"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">صفحه فعلی</p>
                    <p className="text-xs text-slate-500 mt-1">فقط ردیف‌های نمایش داده شده در صفحه فعلی</p>
                  </div>
                  <span className="nums-fa text-sm text-slate-600 dark:text-slate-400">
                    {currentCount.toLocaleString("fa-IR")} ردیف
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, scope: "filtered" }))}
                disabled={exporting || filteredCount === 0}
                className={cn(
                  "w-full p-3 rounded border text-right cursor-pointer transition-colors",
                  options.scope === "filtered"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">ردیف‌های فیلتر شده</p>
                    <p className="text-xs text-slate-500 mt-1">شامل همه ردیف‌های منطبق با فیلترهای فعلی</p>
                  </div>
                  <span className="nums-fa text-sm text-slate-600 dark:text-slate-400">
                    {filteredCount.toLocaleString("fa-IR")} ردیف
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, scope: "all" }))}
                disabled={exporting || totalCount === 0}
                className={cn(
                  "w-full p-3 rounded border text-right cursor-pointer transition-colors",
                  options.scope === "all"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">همه ردیف‌ها</p>
                    <p className="text-xs text-slate-500 mt-1">تمام ردیف‌های دیتابیس بدون اعمال فیلتر</p>
                  </div>
                  <span className="nums-fa text-sm text-slate-600 dark:text-slate-400">
                    {totalCount < 0 ? "همه ردیف‌های دیتابیس" : `${totalCount.toLocaleString("fa-IR")} ردیف`}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* ستون‌ها */}
          <div className="space-y-2">
            <Label className="text-right block">ستون‌های خروجی</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, columnScope: "visible" }))}
                disabled={exporting}
                className={cn(
                  "p-3 rounded border text-right cursor-pointer transition-colors",
                  options.columnScope === "visible"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <p className="font-medium text-sm">ستون‌های انتخابی</p>
                <p className="text-xs text-slate-500 mt-1 nums-fa">{visibleColumns.length.toLocaleString("fa-IR")} ستون</p>
              </button>
              <button
                type="button"
                onClick={() => setOptions(o => ({ ...o, columnScope: "all" }))}
                disabled={exporting}
                className={cn(
                  "p-3 rounded border text-right cursor-pointer transition-colors",
                  options.columnScope === "all"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <p className="font-medium text-sm">کل ستون‌ها</p>
                <p className="text-xs text-slate-500 mt-1 nums-fa">{columns.length.toLocaleString("fa-IR")} ستون</p>
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {options.columnScope === "visible"
                ? "فقط ستون‌های نمایش داده شده در جدول"
                : "تمام ستون‌ها شامل ستون‌های مخفی"}
            </p>
          </div>

          {/* خطا */}
          {error && (
            <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={exporting}>
            انصراف
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {exporting
              ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال تولید...</>
              : <><Upload className="w-4 h-4 ml-2" />دانلود فایل</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
