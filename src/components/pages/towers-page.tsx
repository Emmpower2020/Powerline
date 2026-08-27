"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { CreateTowerDialog } from "@/components/towers/create-tower-dialog";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { IssuesBadge } from "@/components/issues-badge";
import { TowersStatsBar } from "@/components/towers/towers-stats-bar";
import { BulkTowersActions } from "@/components/towers/bulk-towers-actions";
import { getTowerIssues } from "@/lib/towers-quality";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// v2.4.0: نرمال‌سازی نام خط برای تطبیق — نیم‌فاصله/ی عربی/فاصله اضافی
const normLineName = (s: unknown) => String(s ?? "")
  .replace(/[\u200c\u200f\u200e]/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک")
  .replace(/\s+/g, " ").trim().toLowerCase();

const PAGE_LOG_NAME = "دکل‌ها";
const PAGE_LOG_KEY = "towers";

export function TowersPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rowsToDelete, setRowsToDelete] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  // v2.2.0: پیشرفت حذف — {done, total}
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<any | null>(null);
  // فیلتر سلامت داده — از کارت «سلامت داده» در نوار آمار روشن/خاموش می‌شود
  const [issuesOnly, setIssuesOnly] = useState(false);
  const deletingRowsRef = useRef<any[]>([]);
  const tableRef = useRef<DataTableHandle | null>(null);
  const { toast } = useToast();
  // v3.0.0: پرسنل برای بررسی همخوانی سرپرست در سلامت داده
  const { supervisorOptions } = usePersonnelOptions();
  const supervisorNames = useMemo(() => new Set(supervisorOptions.map(o => o.value)), [supervisorOptions]);

  // بارگذاری همه دکل‌ها یکجا (MAX_PAGE_SIZE سرور از v2.0.0 بالا رفته)
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.towers, { page: 1, page_size: 5000, search: search || undefined });
      setData(result?.data || []);
    } catch (err: any) {
      console.error("خطا:", err);
      // v3.3.1: پیام واضح به کاربر — جدول خالی بی‌صدا یعنی «داده پاک شده» به نظر می‌رسد؛ اینطور نیست
      toast({
        title: "سرور دیتابیس موقتاً در دسترس نیست",
        description: err?.statusCode === 503
          ? "داده‌های شما در دیتابیس کاملاً سالم است — چند لحظه بعد دکمه بروزرسانی را بزنید"
          : (err?.message || "خطا در دریافت داده از سرور"),
        variant: "destructive",
      });
      logError({
        title: `خطا در بارگذاری ${PAGE_LOG_NAME}`,
        message: err?.message || "خطای نامشخص",
        source: `pages/${PAGE_LOG_KEY}`,
        statusCode: err?.statusCode ?? null,
      });
    }
    finally { setLoading(false); }
  }, [search, refreshKey]);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load]);

  // ─── سلامت داده: نقشه id → لیست خطاها ───
  // v3.0.0: همخوانی سرپرست خط با پرسنل هم بررسی می‌شود (فقط وقتی پرسنل لود شده باشد)
  const personnelLoaded = supervisorOptions.length > 0;
  const issuesMap = useMemo(() => {
    const map = new Map<number, string[]>();
    const ctx = personnelLoaded ? { validSupervisors: supervisorNames } : undefined;
    for (const row of data) {
      const issues = getTowerIssues(row, ctx);
      if (issues.length > 0) map.set(row.id, issues);
    }
    return map;
  }, [data, personnelLoaded, supervisorNames]);

  // ─── داده فیلترشده — فقط فیلتر سلامت داده روی آن اعمال می‌شود ───
  const filteredData = useMemo(() => {
    if (!issuesOnly) return data;
    return data.filter(row => issuesMap.has(row.id));
  }, [data, issuesOnly, issuesMap]);

  const issuesCount = useMemo(
    () => filteredData.reduce((n, row) => n + (issuesMap.has(row.id) ? 1 : 0), 0),
    [filteredData, issuesMap]
  );

  // Copy toast only — data-table itself writes TSV to clipboard
  const handleCopy = useCallback((rows: any[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
      return;
    }
    toast({
      title: "کپی شد",
      description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`
    });
  }, [toast]);

  const handleDeleteRequest = useCallback((rows: any[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای حذف، ابتدا ردیف(های) مورد نظر را انتخاب کنید", variant: "destructive" });
      return;
    }
    setRowsToDelete(rows);
  }, [toast]);

  const handleEdit = useCallback((row: any) => {
    setEditRow(row);
    setShowCreate(true);
  }, []);

  // کپی دکل: فرم ثبت دکل جدید با پیش‌پر کردن از ردیف موجود — کد دکل خالی
  const handleDuplicate = useCallback((row: any) => {
    setEditRow(null);
    setDuplicateFrom(row);
    setShowCreate(true);
  }, []);

  // ردیف‌های انتخاب‌شدهٔ فعلی جدول — برای عملیات گروهی
  const getSelection = useCallback((): any[] => {
    const ids = tableRef.current?.getSelectedRows() || [];
    return ids.map(id => filteredData.find(r => r.id === id)).filter(Boolean) as any[];
  }, [filteredData]);

  // v2.4.1: کش خطوط برای import — فقط تطابق دقیق (نرمال‌شده) با نام/کد خط دیتابیس
  const linesCacheRef = useRef<Map<string, { id: number; line_code: string; name: string }> | null>(null);
  const getLinesCache = useCallback(async () => {
    if (linesCacheRef.current) return linesCacheRef.current;
    const result = await apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 100000 });
    const map = new Map<string, { id: number; line_code: string; name: string }>();
    for (const l of result?.data || []) {
      const entry = { id: Number(l.id), line_code: String(l.line_code ?? "").trim(), name: String(l.name ?? "").trim() };
      const n = normLineName(entry.name);
      if (n) map.set(n, entry);
      if (entry.line_code) map.set(entry.line_code.toLowerCase(), entry);
    }
    linesCacheRef.current = map;
    return map;
  }, []);

  // v2.4.1: اعتبارسنجی ردیف import دکل — خطاهای دقیق و قابل‌فهم به‌جای خطای عمومی سرور
  const validateImportRow = useCallback((row: Record<string, unknown>): string | null => {
    const cache = linesCacheRef.current;
    if (!cache) return null; // کش آماده نیست — به سرور واگذار می‌شود
    const name = row.line_name != null ? String(row.line_name).trim() : "";
    const code = row.line_code != null ? String(row.line_code).trim() : "";
    const hasLine = row.line_id != null && row.line_id !== "";
    if (!hasLine) {
      const key = normLineName(name) || code.toLowerCase();
      if (!key || !cache.has(key)) {
        return name
          ? `نام خط «${name}» با هیچ خط ثبت‌شده‌ای مطابقت ندارد — ابتدا این خط را در بخش «خطوط انتقال» ثبت یا نام آن را در فایل اکسل اصلاح کنید`
          : "نام خط یا کد خط مشخص نشده است — ستون «نام خط» در فایل اکسل الزامی است";
      }
    }
    const num = Number(row.tower_number);
    if (!Number.isFinite(num) || num <= 0) {
      return "شماره دکل نامعتبر یا خالی است — ستون «شماره دکل» الزامی است";
    }
    return null;
  }, []);

  // v2.3.1: تکمیل ردیف import دکل — resolve خط + تولید خودکار کد دکل خالی
  // کد دکل = کد خط + شماره سه‌رقمی (مثل 61404-001) — همان قاعده سرور
  const transformImportRow = useCallback((row: Record<string, unknown>) => {
    const cache = linesCacheRef.current;
    if (!cache) return; // کش هنوز آماده نیست — ردیف دست‌نخورده
    const findLine = () => {
      const n = normLineName(row.line_name);
      if (n && cache.has(n)) return cache.get(n);
      const c = row.line_code != null ? String(row.line_code).trim().toLowerCase() : "";
      return c ? cache.get(c) : undefined;
    };
    if (row.line_id == null || row.line_id === "") {
      const line = findLine();
      if (line) row.line_id = line.id;
    }
    const code = String(row.tower_code ?? "").trim();
    if (!code) {
      const line = findLine();
      const num = Number(row.tower_number);
      if (line && Number.isFinite(num) && num > 0) {
        row.tower_code = `${line.line_code}-${String(num).padStart(3, "0")}`;
      }
    }
    return row;
  }, []);


  const handleBulkApplied = useCallback(() => {
    setRefreshKey(k => k + 1);
    if (tableRef.current) tableRef.current.clearSelection();
  }, []);

  // v2.3.1: با باز شدن دیالوگ import، کش خطوط از قبل بارگذاری شود تا transformRow سریع جواب دهد
  useEffect(() => {
    if (showImport) getLinesCache().catch(() => {});
  }, [showImport, getLinesCache]);

  // Import handler — برای هر ردیف، یا POST (insert) یا PUT (update)
  const handleImportRow = useCallback(async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    const allowedFields = [
      "line_id", "tower_code", "tower_number", "tower_structure",
      "tower_type", "tower_type_code",
      "base_height_a", "base_height_b", "base_height_c", "base_height_d",
      "insulator_r1", "insulator_s1", "insulator_t1", "insulator_r2", "insulator_s2", "insulator_t2",
      "insulator_count_r1", "insulator_count_s1", "insulator_count_t1",
      "insulator_count_r2", "insulator_count_s2", "insulator_count_t2",
      "gps_lat", "gps_lng", "line_supervisor", "is_active",
    ];
    const payload: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in row) {
        const v = row[key];
        if (v === null || v === undefined || v === "") {
          payload[key] = null;
        } else if (["tower_number", "insulator_count_r1", "insulator_count_s1", "insulator_count_t1",
                    "insulator_count_r2", "insulator_count_s2", "insulator_count_t2", "line_id"].includes(key)) {
          const n = Number(v);
          payload[key] = isNaN(n) ? null : n;
        } else if (["base_height_a", "base_height_b", "base_height_c", "base_height_d",
                    "gps_lat", "gps_lng"].includes(key)) {
          const n = Number(String(v).replace(",", "."));
          payload[key] = isNaN(n) ? null : n;
        } else if (key === "is_active") {
          const s = String(v).toLowerCase().trim();
          payload[key] = (s === "1" || s === "true" || s === "بله" || s === "yes");
        } else {
          payload[key] = v;
        }
      }
    }

    if (mode === "insert") {
      await apiClient.post(API_ENDPOINTS.towers, payload);
    } else {
      await apiClient.put(`${API_ENDPOINTS.towers}/${existingId}`, payload);
    }
  }, []);

  // v2.3.0: ورود انبوه — ۲۰۰ ردیف با یک درخواست (ده‌ها برابر سریع‌تر)
  const handleImportBatch = useCallback(async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const rows = items.map(it => ({ ...it.row, ...(it.mode === "update" && it.existingId ? { id: it.existingId } : {}) }));
    // v2.4.1: مهلت ۶۰ ثانیه — بچ‌های بزرگ روی هاست اشتراکی زمان‌برند
    const res = await apiClient.post<any>("towers/bulk-import", { rows }, { timeoutMs: 60_000 });
    const statuses: string[] = res?.statuses || [];
    // v2.4.1: خطای هر ردیف از آرایه errors (نه فقط اولین خطای بچ)
    const errors: Array<string | null> = res?.errors || [];
    return items.map((_, idx) => {
      const st = statuses[idx];
      if (st === "failed") return { status: "failed" as const, error: errors[idx] || res?.first_error || "خطای نامشخص" };
      return { status: (st === "updated" ? "updated" : "inserted") as "inserted" | "updated" };
    });
  }, []);

  // گرفتن همه ردیف‌ها از سرور (برای خروجی "همه")
  const handleLoadAllRows = useCallback(async () => {
    const result = await apiClient.get<any>(API_ENDPOINTS.towers, { page: 1, page_size: 100000 });
    return result?.data || [];
  }, []);

  const handleImportClose = useCallback(() => {
    setShowImport(false);
    setRefreshKey(k => k + 1);
  }, []);

  const confirmDelete = useCallback(async () => {
    const rows = deletingRowsRef.current;
    if (rows.length === 0) return;

    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: rows.length });

    // v2.2.0: حذف انبوه — دسته‌های ۵۰۰تایی با یک درخواست
    const CHUNK = 500;
    let success = 0;
    let lastError = "";

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      try {
        const res = await apiClient.post<any>("towers/bulk-delete", { ids: chunk.map(r => r.id) });
        success += res?.deleted ?? chunk.length;
      } catch (err: any) {
        lastError = err?.message || "نامشخص";
        console.error("خطا در حذف گروهی:", err);
      }
      setDeleteProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
    }

    deletingRowsRef.current = [];
    setRowsToDelete([]);
    setIsDeleting(false);
    setDeleteProgress(null);
    setRefreshKey(k => k + 1);
    if (tableRef.current) tableRef.current.clearSelection();

    const failed = rows.length - success;
    if (failed === 0) {
      toast({
        title: "حذف شد",
        description: `${success.toLocaleString("fa-IR")} ردیف با موفقیت از دیتابیس حذف شد`
      });
    } else {
      toast({
        title: "حذف ناقص",
        description: `${success.toLocaleString("fa-IR")} حذف شد، ${failed.toLocaleString("fa-IR")} ناموفق (${lastError})`,
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    deletingRowsRef.current = rowsToDelete;
  }, [rowsToDelete]);

  // v2.7.0: ساختار دکل بدون رنگ‌بندی (رنگ‌بندی فقط برای نام خط بر اساس ولتاژ باقی می‌ماند)
  const structureBadge = (structure: string | null) => {
    if (!structure) return <span className="text-slate-300">—</span>;
    return <span className="text-slate-700 dark:text-slate-200">{structure}</span>;
  };

  // v2.6.0: بج رنگ‌بندی نام خط بر اساس ولتاژ (نه ساختار دکل)
  // همان رنگ‌بندی lines-page — هماهنگ با چیپ‌های «تفکیک ولتاژ»
  const voltageBgClass = (voltageKv?: number | null) => {
    switch (Number(voltageKv)) {
      case 400: return "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400";
      case 230: return "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400";
      case 132: return "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400";
      case 63: return "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const lineNameBadge = (row: any) => {
    if (!row.line_name) return <span className="text-slate-300">—</span>;
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium break-all",
          voltageBgClass(row.voltage_kv)
        )}
      >
        {row.line_name}
      </span>
    );
  };

  // ستون‌ها بر اساس ساختار اکسل رسمی (v2.1.0) — نام‌ها همان واژگان خود شماست
  const columns: DataTableColumn<any>[] = [
    { key: "tower_code", header: "کد دکل", sortable: true, filterable: true, align: "right" },
    { key: "tower_number", header: "شماره دکل", sortable: true, filterable: true, type: "number", align: "right" },
    // v2.8.0: ستون «ولتاژ» اضافه شد — از JOIN با lines و پیش‌فرض قبل از نام خط
    {
      key: "voltage_kv", header: "ولتاژ", sortable: true, filterable: true, type: "number", align: "right",
      render: (row: any) => row.voltage_kv != null ? (
        <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold nums-fa", voltageBgClass(row.voltage_kv))}>
          {Number(row.voltage_kv).toLocaleString("fa-IR")}
        </span>
      ) : <span className="text-slate-300">—</span>,
    },
    // v2.6.0: نام خط با بج رنگی بر اساس ولتاژ — نه ساختار دکل
    {
      key: "line_name", header: "نام خط", sortable: true, filterable: true, wrap: true, width: "260px", align: "right",
      render: (row: any) => lineNameBadge(row),
    },
    {
      key: "tower_structure", header: "ساختار دکل", sortable: true, filterable: true, align: "right",
      render: (row: any) => structureBadge(row.tower_structure),
    },
    { key: "tower_type_code", header: "کد نوع دکل", sortable: true, filterable: true, align: "right" },
    { key: "tower_type", header: "نوع دکل", sortable: true, filterable: true, align: "right" },
    { key: "base_height_a", header: "ارتفاع پایه A", sortable: true, type: "number", hidden: true, align: "right" },
    { key: "base_height_b", header: "ارتفاع پایه B", sortable: true, type: "number", hidden: true, align: "right" },
    { key: "base_height_c", header: "ارتفاع پایه C", sortable: true, type: "number", hidden: true, align: "right" },
    { key: "base_height_d", header: "ارتفاع پایه D", sortable: true, type: "number", hidden: true, align: "right" },
    { key: "insulator_r1", header: "نوع مقره R مدار اول", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "insulator_s1", header: "نوع مقره S مدار اول", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "insulator_t1", header: "نوع مقره T مدار اول", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "insulator_r2", header: "نوع مقره R مدار دوم", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "insulator_s2", header: "نوع مقره S مدار دوم", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "insulator_t2", header: "نوع مقره T مدار دوم", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "insulator_count_r1", header: "تعداد R مدار اول", type: "number", hidden: true, align: "right" },
    { key: "insulator_count_s1", header: "تعداد S مدار اول", type: "number", hidden: true, align: "right" },
    { key: "insulator_count_t1", header: "تعداد T مدار اول", type: "number", hidden: true, align: "right" },
    { key: "insulator_count_r2", header: "تعداد R مدار دوم", type: "number", hidden: true, align: "right" },
    { key: "insulator_count_s2", header: "تعداد S مدار دوم", type: "number", hidden: true, align: "right" },
    { key: "insulator_count_t2", header: "تعداد T مدار دوم", type: "number", hidden: true, align: "right" },
    { key: "gps_lat", header: "عرض جغرافیایی", sortable: true, type: "number", hidden: true, align: "right" },
    { key: "gps_lng", header: "طول جغرافیایی", sortable: true, type: "number", hidden: true, align: "right" },
    { key: "line_supervisor", header: "سرپرست خط", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "is_active", header: "فعال", type: "boolean", filterable: true, align: "right" },
    // ستون سلامت داده — با نگه‌داشتن موس روی علامت، جزئیات خطاها نمایش داده می‌شود
    {
      key: "data_quality", header: "سلامت داده", align: "center", width: "110px",
      render: (row: any) => <IssuesBadge issues={issuesMap.get(row.id) || []} entityLabel="دکل" />,
    },
  ];

  const headerMap: Record<string, string> = {};
  columns.forEach(col => {
    if (col.header && col.key) headerMap[col.header] = col.key;
  });

  const templateColumns = columns.map(c => ({ key: c.key, header: c.header }));

  return (
    <div className="space-y-2">
      {/* نوار آمار — بر اساس داده‌های فیلترشده */}
      <TowersStatsBar
        data={filteredData}
        issuesCount={issuesCount}
        issuesFilterActive={issuesOnly}
        onIssuesClick={() => setIssuesOnly(v => !v)}
      />

      <DataTable
        data={filteredData}
        columns={columns}
        loading={loading}
        searchKeys={["tower_code", "line_code", "line_name", "tower_structure", "tower_type", "tower_type_code", "line_supervisor", "voltage_kv"]}
        title="دکل‌ها"
        onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onCopy={handleCopy}
        onDelete={handleDeleteRequest}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onImport={() => setShowImport(true)}
        onLoadAllRows={handleLoadAllRows}
        toolbarExtra={<BulkTowersActions getSelection={getSelection} onApplied={handleBulkApplied} />}
        tableRef={tableRef}
        layoutKey="towers"
        defaultSort={[{ key: "voltage_kv", direction: "asc", order: [400, 230, 132, 63] }, { key: "tower_number", direction: "asc" }]}
      />
      <CreateTowerDialog
        open={showCreate}
        editRow={editRow}
        duplicateFrom={duplicateFrom}
        onClose={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); }}
        onCreated={() => { setShowCreate(false); setEditRow(null); setDuplicateFrom(null); setRefreshKey(k => k + 1); }}
      />
      <ImportExcelDialog
        open={showImport}
        onClose={handleImportClose}
        onImportRow={handleImportRow}
        onImportBatch={handleImportBatch}
        transformRow={transformImportRow}
        validateRow={validateImportRow}
        getExistingRows={async () => data}
        defaultUniqueKey="tower_code"
        uniqueKeyOptions={[
          { value: "tower_code", label: "کد دکل" },
        ]}
        entityName="دکل"
        headerMap={headerMap}
        templateColumns={templateColumns}
      />

      <AlertDialog open={rowsToDelete.length > 0} onOpenChange={(o) => { if (!o && !isDeleting) setRowsToDelete([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید حذف</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف {rowsToDelete.length.toLocaleString("fa-IR")} ردیف انتخاب‌شده از دیتابیس مطمئن هستید؟
              این عملیات ردیف‌ها را به‌صورت کامل از دیتابیس حذف می‌کند و قابل بازگشت نیست.
              (عیوب و سوابق ثبت‌شدهٔ این دکل‌ها حذف نمی‌شوند — فقط اتصال‌شان برداشته می‌شود)
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* v2.2.0: نوار پیشرفت حذف */}
          {isDeleting && deleteProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 nums-fa">
                <span>در حال حذف...</span>
                <span>{deleteProgress.done.toLocaleString("fa-IR")} از {deleteProgress.total.toLocaleString("fa-IR")}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-500 transition-all duration-300"
                  style={{ width: `${Math.round((deleteProgress.done / deleteProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "در حال حذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
