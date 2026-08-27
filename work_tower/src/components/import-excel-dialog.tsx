"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { cn } from "@/lib/utils";

export interface ImportOptions {
  /** "skip" = نادیده گرفتن رکوردهای تکراری، "update" = آپدیت رکوردهای تکراری */
  duplicateMode: "skip" | "update";
  /** کلیدی که برای تشخیص تکراری بودن استفاده می‌شود (مثلاً line_code) */
  uniqueKey: string;
}

export interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Callback برای وارد کردن یک ردیف به API.
   * باید Promise برگرداند: insert (new row) → should resolve with created row
   * برای update هم به آن id ردیف موجود پاس می‌شود.
   */
  onImportRow: (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => Promise<void>;
  /**
   * v2.3.0: ورود انبوه — اگر پاس شود، ردیف‌ها به‌صورت دسته‌ای (پیش‌فرض ۲۰۰تایی) با یک درخواست
   * ارسال می‌شوند و ده‌ها برابر سریع‌تر است. خروجی: وضعیت هر ردیف به همان ترتیب ورودی.
   */
  onImportBatch?: (items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>) => Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>>;
  /**
   * تابعی که داده‌های فعلی جدول را برمی‌گرداند تا برای تشخیص تکراری بودن استفاده شود.
   * باید آرایه‌ای از اشیاء با کلیدهای شامل uniqueKey برگرداند.
   */
  getExistingRows: () => Promise<Array<Record<string, unknown> & { id: number }>>;
  /** کلید پیش‌فرض برای تشخیص تکراری (مثلاً line_code) */
  defaultUniqueKey?: string;
  /** لیست ستون‌های قابل انتخاب به عنوان کلید یکتا */
  uniqueKeyOptions?: Array<{ value: string; label: string }>;
  /** نام موجودیت برای نمایش در پیام‌ها (مثلاً "خط") */
  entityName?: string;
  /**
   * مپ تبدیل نام ستون‌های فارسی به انگلیسی.
   * کلید: نام فارسی در فایل اکسل، مقدار: نام انگلیسی فیلد دیتابیس.
   * مثلاً: { "کد خط": "line_code", "نام خط": "name" }
   * اگر فایل اکسل سرستون انگلیسی داشته باشد، تبدیل لازم نیست.
   */
  headerMap?: Record<string, string>;
  /**
   * لیست ستون‌های انگلیسی برای دانلود قالب.
   * اگر پاس شود، دکمه "دانلود قالب" نمایش داده می‌شود.
   */
  templateColumns?: Array<{ key: string; header: string }>;
  /**
   * v2.3.1: تبدیل/تکمیل ردیف قبل از تشخیص تکراری و ارسال.
   * مثال: تولید خودکار کد دکل خالی از روی کد خط + شماره دکل.
   * اگر شیء برگرداند، جایگزین ردیف می‌شود؛ اگر void برگرداند، همان ردیف دست‌نخورده می‌ماند.
   */
  transformRow?: (row: Record<string, unknown>) => Record<string, unknown> | void;
  /**
   * v2.4.1: اعتبارسنجی ردیف قبل از ارسال — اگر متن خطا برگرداند، همان ردیف
   * بدون ارسال به سرور با همین پیام مشخص رد می‌شود (خطای دقیق و فارسی).
   */
  validateRow?: (row: Record<string, unknown>) => string | null;
}

export function ImportExcelDialog({
  open, onClose, onImportRow, onImportBatch, getExistingRows,
  defaultUniqueKey = "line_code",
  uniqueKeyOptions,
  entityName = "رکورد",
  headerMap,
  templateColumns,
  transformRow,
  validateRow,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  // v2.3.0: پرچم لغو — دکمه «توقف» بین بچ‌ها بررسی می‌شود
  const cancelImportRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressCurrent, setProgressCurrent] = useState(0);
  // v2.4.0: نوار پیشرفت نرم + اطلاعات «در حال پردازش» تا کاربر فکر نکند متوقف شده
  const progressTargetRef = useRef(0);
  const [batchInfo, setBatchInfo] = useState<{ current: number; total: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // v2.4.0: جزئیات خطاها برای نمایش در خود دیالوگ (نه فقط کنسول)
  // v2.5.1: rowData اضافه شد تا بتوان خطاها را به‌صورت اکسل برای اصلاح ذخیره کرد
  const [failedDetailsUi, setFailedDetailsUi] = useState<Array<{ row: number; error: string; rowData?: Record<string, unknown> }>>([]);
  const [options, setOptions] = useState<ImportOptions>({
    duplicateMode: "skip",
    uniqueKey: defaultUniqueKey,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  const handleClose = () => {
    if (importing) return;
    setFile(null);
    setProgress(0);
    setProgressTotal(0);
    setProgressCurrent(0);
    setResult(null);
    setError(null);
    setFailedDetailsUi([]);
    setBatchInfo(null);
    setElapsed(0);
    setOptions({ duplicateMode: "skip", uniqueKey: defaultUniqueKey });
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setFile(f);
  };

  // v2.4.0: نوار پیشرفت نرم — مقدار نمایشی پیوسته به هدف نزدیک می‌شود + شمارنده زمان
  useEffect(() => {
    if (!importing) return;
    const id = setInterval(() => {
      setProgress(p => {
        const t = progressTargetRef.current;
        if (p >= t) return p;
        return Math.min(t, p + Math.max(0.4, (t - p) * 0.1));
      });
      setElapsed(e => e + 0.1);
    }, 100);
    return () => clearInterval(id);
  }, [importing]);

  // دانلود قالب اکسل با نام ستون‌های فارسی و استایل‌بندی
  // هنگام import، headerMap این نام‌های فارسی را به انگلیسی تبدیل می‌کند
  const handleDownloadTemplate = async () => {
    if (!templateColumns || templateColumns.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Powerline EAM";
    wb.created = new Date();

    const ws = wb.addWorksheet("Template", {
      views: [{ rightToLeft: true }],
    });

    // هدر با رنگ #EBF1DE و متن مشکی غیر بولد
    const headerRow = ws.addRow(templateColumns.map(c => c.header));
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: false, color: { argb: "FF000000" }, size: 12, name: "Tahoma" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEBF1DE" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    // یک ردیف خالی نمونه با همان حاشیه
    const sampleRow = ws.addRow(templateColumns.map(() => ""));
    sampleRow.height = 22;
    sampleRow.eachCell((cell) => {
      cell.font = { size: 11, name: "Tahoma" };
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    // تنظیم عرض ستون‌ها
    templateColumns.forEach((col, idx) => {
      ws.getColumn(idx + 1).width = Math.max(col.header.length + 4, 15);
    });

    // تثبیت هدر
    ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `template-${entityName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const startImport = async () => {
    if (!file) {
      setError("لطفاً یک فایل اکسل انتخاب کنید");
      return;
    }
    setImporting(true);
    setError(null);
    setResult(null);
    setFailedDetailsUi([]);
    setBatchInfo(null);
    setElapsed(0);
    setProgress(0);
    progressTargetRef.current = 0;

    try {
      // 1) خواندن فایل اکسل
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        throw new Error("فایل اکسل خالی است یا شیت ندارد");
      }
      const sheet = wb.Sheets[sheetName];
      const rawRows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: null });

      if (rawRows.length === 0) {
        throw new Error("هیچ داده‌ای در فایل اکسل پیدا نشد");
      }

      // 1.5) تبدیل نام ستون‌های فارسی به انگلیسی اگر headerMap وجود دارد
      const rows: Array<Record<string, unknown>> = rawRows.map(row => {
        const newRow: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          // اگر کلید در headerMap هست، نام انگلیسی را استفاده کن
          const englishKey = headerMap?.[k.trim()] ?? k.trim();
          newRow[englishKey] = v;
        }
        return newRow;
      });

      setProgressTotal(rows.length);
      setProgressCurrent(0);

      // 2) گرفتن ردیف‌های موجود برای تشخیص تکراری
      const existingRows = await getExistingRows();
      const existingMap = new Map<string, number>();
      existingRows.forEach(r => {
        const key = String(r[options.uniqueKey] ?? "").trim();
        if (key) existingMap.set(key, r.id);
      });

      // 3) آمار
      let inserted = 0, updated = 0, skipped = 0, failed = 0;
      // v2.5.1: rowData برای دانلود اکسل خطاها — ردیف اصلی به‌همراه علت خطا
      const failedDetails: Array<{ row: number; error: string; rowData?: Record<string, unknown> }> = [];

      // 4) پیمایش و وارد کردن — v2.4.2: بچ‌های ۲۰۰تایی؛ اگر سرور در بچِ سنگین جواب نداد،
      //    همان بچ در لایه ارسال به‌صورت خودکار نصف و دوباره تلاش می‌شود (تا ۲۵ ردیف)
      // v3.3.0: بچ از ۲۰۰ به ۱۰۰ کاهش یافت (درخواست کاربر — تست اثر روی پایداری هاست اشتراکی)
      const BATCH_SIZE = onImportBatch ? 100 : 10;
      let processed = 0;
      cancelImportRef.current = false;

      const cleanValue = (v: unknown): unknown => {
        if (v === "" || v === undefined || v === null) return null;
        if (typeof v === "string") {
          return v.trim()
            .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
            .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
        }
        return v;
      };

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        // v2.3.0: امکان لغو بین بچ‌ها — دکمه «توقف»
        if (cancelImportRef.current) break;
        // v2.4.0: نمایش دستهٔ در حال پردازش تا کاربر بداند عملیات زنده است
        setBatchInfo({ current: Math.floor(i / BATCH_SIZE) + 1, total: Math.ceil(rows.length / BATCH_SIZE) });

        const batch = rows.slice(i, i + BATCH_SIZE);
        // v2.4.2: هدف خوش‌بینانه — نوار از همان شروع بچ به سمت انتهای آن نرم حرکت می‌کند
        progressTargetRef.current = Math.min(100, Math.round(((i + batch.length) / rows.length) * 100));

        // آماده‌سازی مشترک ردیف‌ها (پاکسازی + اعتبارسنجی + تشخیص درج/ویرایش/رد)
        const prepared: Array<{ realIdx: number; skip: boolean; row?: Record<string, unknown>; mode?: "insert" | "update"; existingId?: number; failMsg?: string }> = [];
        for (let b = 0; b < batch.length; b++) {
          const raw = batch[b];
          let cleanRow: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(raw)) cleanRow[k] = cleanValue(v);
          // v2.3.1: تکمیل ردیف (مثل تولید خودکار کد دکل) قبل از تشخیص تکراری
          if (transformRow) {
            const t = transformRow({ ...cleanRow });
            if (t) cleanRow = t;
          }
          // v2.4.1: اعتبارسنجی محلی — خطای دقیق بدون رفت‌وبرگشت به سرور
          const verr = validateRow ? validateRow(cleanRow) : null;
          if (verr) {
            prepared.push({ realIdx: i + b, skip: false, row: cleanRow, failMsg: verr });
            continue;
          }

          const keyValue = String(cleanRow[options.uniqueKey] ?? "").trim();
          const existingId = keyValue ? existingMap.get(keyValue) : undefined;

          if (existingId && options.duplicateMode === "skip") {
            prepared.push({ realIdx: i + b, skip: true });
          } else if (existingId) {
            prepared.push({ realIdx: i + b, skip: false, row: cleanRow, mode: "update", existingId });
          } else {
            if (keyValue) existingMap.set(keyValue, -1);
            prepared.push({ realIdx: i + b, skip: false, row: cleanRow, mode: "insert" });
          }
        }

        // v2.5.1: rowData برای ذخیره در اکسل خطاها — پاس ردیف اصلی به‌همراه علت
        const tally = (status: string, err?: string, realIdx?: number, rowData?: Record<string, unknown>) => {
          if (status === "inserted") inserted++;
          else if (status === "updated") updated++;
          else if (status === "skipped") skipped++;
          else {
            failed++;
            failedDetails.push({ row: (realIdx ?? 0) + 1, error: err || "نامشخص", rowData: rowData ?? (realIdx != null ? rows[realIdx] : undefined) });
          }
          processed++;
          setProgressCurrent(processed);
          // v2.4.0: هدف پیشرفت — مقدار نمایشی به‌صورت نرم به آن می‌رسد (interpolation)
          progressTargetRef.current = Math.round((processed / rows.length) * 100);
        };

        if (onImportBatch) {
          // ─── حالت انبوه: یک درخواست برای کل دسته ───
          // v2.4.1: ردیف‌های نامعتبر (خطای اعتبارسنجی محلی) بدون ارسال به سرور رد می‌شوند
          prepared.filter(p => p.failMsg).forEach(p => tally("failed", p.failMsg, p.realIdx, p.row));
          const items = prepared.filter(p => !p.skip && !p.failMsg);
          // v2.4.2: ارسال تطبیقی — اگر بچ با خطای شبکه/تایم‌اوت شکست خورد، به‌صورت بازگشتی
          // نصف می‌شود و دوباره تلاش می‌شود (حداقل ۲۵ ردیف) تا سرورِ شلوغ هم جا بیفتد
          const sendAdaptive = async (
            its: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
          ): Promise<Array<{ status: string; error?: string }>> => {
            try {
              return await onImportBatch(its);
            } catch (err: any) {
              if (cancelImportRef.current) {
                return its.map(() => ({ status: "failed", error: "متوقف شد" }));
              }
              if (its.length > 25) {
                const mid = Math.ceil(its.length / 2);
                const left = await sendAdaptive(its.slice(0, mid));
                const right = await sendAdaptive(its.slice(mid));
                return [...left, ...right];
              }
              return its.map(() => ({ status: "failed", error: err?.message || "خطای شبکه" }));
            }
          };
          let results: Array<{ status: string; error?: string }> = [];
          if (items.length > 0) {
            results = await sendAdaptive(items.map(p => ({ row: p.row!, mode: p.mode!, existingId: p.existingId })));
          }
          prepared.filter(p => p.skip).forEach(p => tally("skipped"));
          items.forEach((p, idx) => tally(results[idx]?.status || "failed", results[idx]?.error, p.realIdx, p.row));
        } else {
          // ─── حالت تک‌به‌تک (قدیمی) ───
          for (const p of prepared) {
            if (p.skip) { tally("skipped"); continue; }
            if (p.failMsg) { tally("failed", p.failMsg, p.realIdx); continue; }
            try {
              await onImportRow(p.row!, p.mode!, p.existingId);
              tally(p.mode === "update" ? "updated" : "inserted");
            } catch (err: any) {
              tally("failed", err instanceof Error ? err.message : "نامشخص", p.realIdx, p.row);
            }
          }
        }

        // وقفه کوتاه بین بچ‌ها — فشار روی سرور کم شود (v2.4.0: از ۳۰۰ به ۱۰۰ms)
        await new Promise(r => setTimeout(r, onImportBatch ? 100 : 200));
      }

      setResult({ total: rows.length, inserted, updated, skipped, failed });
      // v2.4.2: در پایان، نوار به درصدِ واقعیِ پردازش‌شده برسد (اگر لغو شده باشد، ۱۰۰ نیست)
      const finalPct = rows.length > 0 ? Math.round((processed / rows.length) * 100) : 100;
      progressTargetRef.current = finalPct;
      setProgress(finalPct);
      setBatchInfo(null);
      if (failedDetails.length > 0) setFailedDetailsUi(failedDetails.slice(0, 500));

      // اگر خطاها زیاد بود، جزئیات را در کنسول چاپ کن
      if (failed > 0) {
        console.error("جزئیات خطاها در import:", failedDetails.slice(0, 10));
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "خطای ناشناخته در حین import");
    } finally {
      setImporting(false);
    }
  };

  // v2.5.1: دانلود خطاهای import به‌صورت اکسل — ردیف اصلی + علت خطا برای اصلاح و بارگذاری مجدد
  const handleDownloadErrors = async () => {
    if (failedDetailsUi.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Powerline EAM";
    wb.created = new Date();
    const ws = wb.addWorksheet("خطاها", { views: [{ rightToLeft: true }] });

    // جمع‌آوری همه کلیدهای موجود در ردیف‌های ناموفق برای ساخت ستون‌های پویا
    const rowKeys: string[] = [];
    const seenKeys = new Set<string>();
    for (const item of failedDetailsUi) {
      if (item.rowData) {
        for (const k of Object.keys(item.rowData)) {
          if (!seenKeys.has(k)) { seenKeys.add(k); rowKeys.push(k); }
        }
      }
    }

    // هدر: ردیف | علت خطا | کلیدهای ردیف اصلی
    const headers = ["ردیف در فایل اکسل", "علت خطا", ...rowKeys];
    const headerRow = ws.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Tahoma" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDC2626" }, // red-600
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
    for (const item of failedDetailsUi) {
      const cells = [
        item.row,
        item.error,
        ...rowKeys.map(k => {
          const v = item.rowData?.[k];
          return v == null ? "" : String(v);
        }),
      ];
      const dataRow = ws.addRow(cells);
      dataRow.height = 22;
      dataRow.eachCell((cell, colNumber) => {
        cell.font = { size: 11, name: "Tahoma" };
        cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        // ستون «علت خطا» قرمز روشن
        if (colNumber === 2) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; // red-100
          cell.font = { size: 11, name: "Tahoma", color: { argb: "FFB91C1C" } }; // red-700
        }
      });
    }

    // عرض ستون‌ها
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 50;
    rowKeys.forEach((k, idx) => {
      ws.getColumn(idx + 3).width = Math.max(15, Math.min(40, k.length + 6));
    });

    // تثبیت هدر
    ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `import-errors-${entityName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            وارد کردن اطلاعات از اکسل
          </DialogTitle>
          <DialogDescription className="text-right">
            فایل اکسل (.xlsx, .xls, .csv) را انتخاب کنید. برای راحتی، می‌توانید قالب استاندارد را دانلود کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* انتخاب فایل + دانلود قالب */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-right block">فایل اکسل</Label>
              {templateColumns && templateColumns.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  disabled={importing}
                  className="text-xs h-8 gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  دانلود قالب
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                disabled={importing}
                className="text-right"
              />
            </div>
            {file && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <FileSpreadsheet className="w-3 h-3" />
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* تنظیمات */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">تنظیمات وارد کردن</p>

            {/* کلید یکتا */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600 dark:text-slate-400">کلید تشخیص رکورد تکراری</Label>
              {uniqueKeyOptions ? (
                <select
                  value={options.uniqueKey}
                  onChange={e => setOptions(o => ({ ...o, uniqueKey: e.target.value }))}
                  disabled={importing}
                  className="w-full text-sm p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                >
                  {uniqueKeyOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <Input
                  value={options.uniqueKey}
                  onChange={e => setOptions(o => ({ ...o, uniqueKey: e.target.value }))}
                  disabled={importing}
                  className="text-sm"
                />
              )}
              <p className="text-xs text-slate-400">این فیلد برای تشخیص رکوردهای تکراری استفاده می‌شود</p>
            </div>

            {/* رفتار با تکراری‌ها */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-600 dark:text-slate-400">رفتار با رکوردهای تکراری</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, duplicateMode: "skip" }))}
                  disabled={importing}
                  className={cn(
                    "p-2 rounded border text-sm text-right cursor-pointer transition-colors",
                    options.duplicateMode === "skip"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  نادیده بگیر
                </button>
                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, duplicateMode: "update" }))}
                  disabled={importing}
                  className={cn(
                    "p-2 rounded border text-sm text-right cursor-pointer transition-colors",
                    options.duplicateMode === "update"
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  آپدیت کن
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {options.duplicateMode === "skip"
                  ? "اگر رکوردی با همین کلید در دیتابیس وجود داشته باشد، نادیده گرفته می‌شود"
                  : "اگر رکوردی با همین کلید در دیتابیس وجود داشته باشد، آپدیت می‌شود"}
              </p>
            </div>
          </div>

          {/* پروگرس بار */}
          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">
                  در حال وارد کردن...
                  {batchInfo && (
                    <span className="text-xs text-slate-400 mr-2 nums-fa">
                      (دستهٔ {batchInfo.current.toLocaleString("fa-IR")} از {batchInfo.total.toLocaleString("fa-IR")})
                    </span>
                  )}
                </span>
                <span className="nums-fa text-slate-500">
                  {progressCurrent.toLocaleString("fa-IR")} / {progressTotal.toLocaleString("fa-IR")} ({Math.round(progress).toLocaleString("fa-IR")}٪)
                </span>
              </div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                  style={{ width: `${progress}%`, transition: "width 120ms linear" }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  در حال پردازش رکوردها... لطفاً صبر کنید
                </span>
                <span className="nums-fa">{elapsed.toFixed(0).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[+d])} ثانیه</span>
              </div>
            </div>
          )}

          {/* نتیجه */}
          {result && (
            <div className="border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <p className="font-medium">وارد کردن با موفقیت کامل شد</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">کل رکوردها:</span>
                  <span className="font-medium nums-fa">{result.total.toLocaleString("fa-IR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700 dark:text-green-400">درج شده:</span>
                  <span className="font-medium nums-fa text-green-700 dark:text-green-400">{result.inserted.toLocaleString("fa-IR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700 dark:text-blue-400">آپدیت شده:</span>
                  <span className="font-medium nums-fa text-blue-700 dark:text-blue-400">{result.updated.toLocaleString("fa-IR")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700 dark:text-amber-400">نادیده گرفته شده:</span>
                  <span className="font-medium nums-fa text-amber-700 dark:text-amber-400">{result.skipped.toLocaleString("fa-IR")}</span>
                </div>
                {result.failed > 0 && (
                  <div className="flex justify-between col-span-2">
                    <span className="text-red-700 dark:text-red-400">خطا خورده:</span>
                    <span className="font-medium nums-fa text-red-700 dark:text-red-400">{result.failed.toLocaleString("fa-IR")}</span>
                  </div>
                )}
              </div>
              {result.failed > 0 && (
                <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-900 space-y-1.5">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {result.failed.toLocaleString("fa-IR")} ردیف وارد نشد — علت هر ردیف (شماره = ردیف در فایل اکسل):
                  </p>
                  <ul className="text-xs text-red-700 dark:text-red-400 bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/60 rounded-md max-h-56 overflow-y-auto p-2 space-y-1">
                    {failedDetailsUi.map((d, i) => (
                      <li key={i} className="flex gap-2 items-start leading-5">
                        <span className="shrink-0 mt-0.5 inline-flex items-center justify-center min-w-10 h-5 px-1 rounded bg-red-100 dark:bg-red-900/50 text-[10px] font-bold nums-fa">
                          ردیف {d.row.toLocaleString("fa-IR")}
                        </span>
                        <span className="break-words">{d.error}</span>
                      </li>
                    ))}
                  </ul>
                  {/* v2.5.1: دانلود خطاها به‌صورت اکسل برای اصلاح و بارگذاری مجدد */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadErrors}
                    disabled={importing}
                    className="text-xs h-8 gap-1 cursor-pointer border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Download className="w-3.5 h-3.5" />
                    دانلود خطاها به‌صورت اکسل
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* خطا */}
          {error && (
            <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {importing ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => { cancelImportRef.current = true; }}
              className="bg-red-600 hover:bg-red-700"
              title="پس از اتمام دستهٔ جاری متوقف می‌شود"
            >
              توقف
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={handleClose}>
              {result ? "بستن" : "انصراف"}
            </Button>
          )}
          {!result && (
            <Button
              type="button"
              onClick={startImport}
              disabled={importing || !file}
              className="bg-green-600 hover:bg-green-700"
            >
              {importing
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال وارد کردن...</>
                : <><Upload className="w-4 h-4 ml-2" />شروع وارد کردن</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
