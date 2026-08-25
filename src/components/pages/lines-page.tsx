"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { CreateLineDialog } from "@/components/create-line-dialog";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { IssuesBadge } from "@/components/issues-badge";
import { LinesStatsBar } from "@/components/lines/lines-stats-bar";
import { BulkLinesActions } from "@/components/lines/bulk-lines-actions";
import { getLineIssues } from "@/lib/lines-quality";
import { usePersonnelOptions } from "@/hooks/use-personnel-options";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_LOG_NAME = "خطوط انتقال";
const PAGE_LOG_KEY = "lines";

export function LinesPage() {
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
  // v3.0.0: پرسنل برای بررسی همخوانی سرپرست/کارشناس در سلامت داده
  const { supervisorOptions, expertOptions } = usePersonnelOptions();
  const supervisorNames = useMemo(() => new Set(supervisorOptions.map(o => o.value)), [supervisorOptions]);
  const expertNames = useMemo(() => new Set(expertOptions.map(o => o.value)), [expertOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 500, search: search || undefined });
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

  // ─── سلامت داده (مورد ۵): نقشه id → لیست خطاها ───
  // v3.0.0: همخوانی سرپرست/کارشناس با پرسنل هم بررسی می‌شود (فقط وقتی پرسنل لود شده باشد)
  const personnelLoaded = supervisorOptions.length > 0 || expertOptions.length > 0;
  const issuesMap = useMemo(() => {
    const map = new Map<number, string[]>();
    const ctx = personnelLoaded
      ? { validSupervisors: supervisorNames, validExperts: expertNames }
      : undefined;
    for (const row of data) {
      const issues = getLineIssues(row, ctx);
      if (issues.length > 0) map.set(row.id, issues);
    }
    return map;
  }, [data, personnelLoaded, supervisorNames, expertNames]);

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

  // کپی خط (مورد ۳): فرم ثبت خط جدید با پیش‌پر کردن از ردیف موجود — کد خط خالی
  const handleDuplicate = useCallback((row: any) => {
    setEditRow(null);
    setDuplicateFrom(row);
    setShowCreate(true);
  }, []);

  // ردیف‌های انتخاب‌شدهٔ فعلی جدول — برای عملیات گروهی (مورد ۴)
  const getSelection = useCallback((): any[] => {
    const ids = tableRef.current?.getSelectedRows() || [];
    return ids.map(id => filteredData.find(r => r.id === id)).filter(Boolean) as any[];
  }, [filteredData]);

  // بعد از عملیات گروهی: refresh + پاک کردن انتخاب‌ها
  const handleBulkApplied = useCallback(() => {
    setRefreshKey(k => k + 1);
    if (tableRef.current) tableRef.current.clearSelection();
  }, []);

  // Import handler — برای هر ردیف، یا POST (insert) یا PUT (update) صدا می‌زند
  const handleImportRow = useCallback(async (row: Record<string, unknown>, mode: "insert" | "update", existingId?: number) => {
    // حذف فیلدهای غیرمجاز
    const allowedFields = [
      "line_code", "dispatch_code", "name", "group_name",
      "voltage_kv", "voltage", "circuit_count", "bundle_count",
      "conductor_type", "tower_structure_type", "length_km", "circuit_length_km",
      "total_towers", "tension_towers", "suspension_towers",
      "plain_terrain", "semi_mountainous", "mountainous",
      "commission_year", "line_supervisor", "line_expert",
      "owner_org_id", "contractor_id", "is_active",
    ];
    const payload: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in row) {
        const v = row[key];
        if (v === null || v === undefined || v === "") {
          payload[key] = null;
        } else if (["circuit_count", "bundle_count", "total_towers", "tension_towers", "suspension_towers",
                    "plain_terrain", "semi_mountainous", "mountainous", "commission_year",
                    "voltage", "owner_org_id", "contractor_id"].includes(key)) {
          // تبدیل به عدد
          const n = Number(v);
          payload[key] = isNaN(n) ? null : n;
        } else if (["voltage_kv", "length_km", "circuit_length_km"].includes(key)) {
          // تبدیل به عدد اعشاری
          const n = Number(String(v).replace(",", "."));
          payload[key] = isNaN(n) ? null : n;
        } else if (key === "is_active") {
          // تبدیل به boolean
          const s = String(v).toLowerCase().trim();
          payload[key] = (s === "1" || s === "true" || s === "بله" || s === "yes");
        } else {
          payload[key] = v;
        }
      }
    }

    if (mode === "insert") {
      await apiClient.post(API_ENDPOINTS.lines, payload);
    } else {
      await apiClient.put(`${API_ENDPOINTS.lines}/${existingId}`, payload);
    }
  }, []);

  // v2.3.0: ورود انبوه — ۲۰۰ ردیف با یک درخواست
  const handleImportBatch = useCallback(async (
    items: Array<{ row: Record<string, unknown>; mode: "insert" | "update"; existingId?: number }>
  ): Promise<Array<{ status: "inserted" | "updated" | "skipped" | "failed"; error?: string }>> => {
    const rows = items.map(it => it.row);
    // v2.4.1: مهلت ۶۰ ثانیه — بچ‌های بزرگ روی هاست اشتراکی زمان‌برند
    const res = await apiClient.post<any>("lines/bulk-import", { rows }, { timeoutMs: 60_000 });
    const statuses: string[] = res?.statuses || [];
    // v2.4.1: خطای هر ردیف از آرایه errors (نه فقط اولین خطای بچ)
    const errors: Array<string | null> = res?.errors || [];
    return items.map((_, idx) => {
      const st = statuses[idx];
      if (st === "failed") return { status: "failed" as const, error: errors[idx] || res?.first_error || "خطای نامشخص" };
      return { status: "inserted" as const };
    });
  }, []);

  // v2.4.1: اعتبارسنجی ردیف import خط — پیام دقیق به‌جای خطای عمومی سرور
  const validateImportRow = useCallback((row: Record<string, unknown>): string | null => {
    const code = row.line_code != null ? String(row.line_code).trim() : "";
    if (!code) return "کد خط خالی است — ستون «کد خط» برای درج/ویرایش الزامی است";
    const name = row.name != null ? String(row.name).trim() : "";
    if (!name) return "نام خط خالی است — ستون «نام خط» الزامی است";
    return null;
  }, []);

  // گرفتن همه ردیف‌ها از سرور (برای خروجی "همه")
  const handleLoadAllRows = useCallback(async () => {
    const result = await apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 100000 });
    return result?.data || [];
  }, []);

  // وقتی import تمام شد، جدول را دوباره بارگذاری کن
  const handleImportClose = useCallback(() => {
    setShowImport(false);
    setRefreshKey(k => k + 1);
  }, []);

  const confirmDelete = useCallback(async () => {
    const rows = deletingRowsRef.current;
    if (rows.length === 0) return;

    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: rows.length });

    // v2.2.0: حذف انبوه — دسته‌های ۵۰۰تایی با یک درخواست (به‌جای حذف تک‌تک)
    const CHUNK = 500;
    let success = 0;
    let lastError = "";

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      try {
        const res = await apiClient.post<any>("lines/bulk-delete", { ids: chunk.map(r => r.id) });
        success += res?.deleted ?? chunk.length;
      } catch (err: any) {
        lastError = err?.message || "نامشخص";
        // فقط 404ِ «مسیر پیدا نشد» یعنی endpoint روی هاست ثبت نشده (PHP قدیمی) — ادامه نده
        if (err?.statusCode === 404 && /مسیر پیدا نشد|not found/i.test(lastError)) {
          setIsDeleting(false);
          setDeleteProgress(null);
          deletingRowsRef.current = [];
          setRowsToDelete([]);
          toast({
            title: "فایل‌های PHP جدید روی هاست آپلود نشده‌اند",
            description: "قابلیت حذف انبوه به بسته API نسخه v2.2.0 اضافه شده — ابتدا پوشه api_powerline را روی هاست آپلود کنید.",
            variant: "destructive",
          });
          return;
        }
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

  // Sync ref when rowsToDelete changes
  useEffect(() => {
    deletingRowsRef.current = rowsToDelete;
  }, [rowsToDelete]);

  // v2.5.0: رنگ‌بندی ولتاژ به‌صورت بکگراند (شبیه بج ستون «فعال» و چیپ‌های «تفکیک ولتاژ» در نوار آمار)
  // ۴۰۰ بنفش | ۲۳۰ قرمز | ۱۳۲ سبز | ۶۳ آبی | بقیه خاکستری
  const voltageBgClass = (voltageKv?: number | null) => {
    switch (Number(voltageKv)) {
      case 400: return "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400";
      case 230: return "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400";
      case 132: return "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400";
      case 63: return "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const columns: DataTableColumn<any>[] = [
    { key: "line_code", header: "کد خط", sortable: true, filterable: true, align: "right" },
    { key: "dispatch_code", header: "کد دیسپاچینگ", sortable: true, filterable: true, align: "right" },
    // v2.5.0: ستون «نام مجموعه خط» به‌صورت ستون مستقل و به‌طور پیش‌فرض قبل از «نام خط»
    { key: "group_name", header: "نام مجموعه خط", sortable: true, filterable: true, width: "340px", wrap: true, align: "right" },
    {
      key: "name",
      header: "نام خط",
      sortable: true,
      filterable: true,
      width: "380px",
      wrap: true,
      align: "right",
      // v2.5.0: بج بکگراندی بر اساس ولتاژ — هماهنگ با چیپ‌های «تفکیک ولتاژ» در نوار آمار و بج ستون «فعال»
      render: (row: any) => (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium break-all",
            voltageBgClass(row.voltage_kv)
          )}
        >
          {row.name}
        </span>
      ),
    },
    { key: "voltage_kv", header: "ولتاژ (kV)", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "circuit_count", header: "مدار", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "bundle_count", header: "باندل", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "conductor_type", header: "نوع سیم", sortable: true, filterable: true, align: "right" },
    { key: "tower_structure_type", header: "نوع سازه دکل", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "length_km", header: "طول خط (km)", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "circuit_length_km", header: "طول مدار (km)", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "total_towers", header: "تعداد کل دکل‌ها", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "tension_towers", header: "دکل‌های کششی", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "suspension_towers", header: "دکل‌های آویزی", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "plain_terrain", header: "دشت", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "semi_mountainous", header: "نیمه‌کوهستانی", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "mountainous", header: "صعب‌العبور", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "commission_year", header: "سال بهره‌برداری", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "line_supervisor", header: "سرپرست خط", sortable: true, filterable: true, align: "right" },
    { key: "line_expert", header: "کارشناس خط", sortable: true, filterable: true, align: "right" },
    { key: "owner_org_name", header: "مالک", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "is_active", header: "فعال", type: "boolean", filterable: true, align: "right" },
    // ستون سلامت داده (مورد ۵) — با نگه‌داشتن موس روی علامت، جزئیات خطاها نمایش داده می‌شود
    // فیلتر/سورت با چیپ اختصاصی «دارای خطا» بالای جدول انجام می‌شود
    {
      key: "data_quality",
      header: "سلامت داده",
      align: "center",
      width: "110px",
      render: (row: any) => <IssuesBadge issues={issuesMap.get(row.id) || []} entityLabel="خط" />,
    },
  ];

  // ساخت headerMap از columns برای تبدیل نام ستون‌های فارسی به انگلیسی
  const headerMap: Record<string, string> = {};
  columns.forEach(col => {
    if (col.header && col.key) {
      headerMap[col.header] = col.key;
    }
  });

  // لیست ستون‌های انگلیسی برای دانلود قالب
  const templateColumns = columns.map(c => ({ key: c.key, header: c.header }));

  return (
    <div className="space-y-2">
      {/* نوار آمار (مورد ۱) — بر اساس داده‌های فیلترشده */}
      <LinesStatsBar
        data={filteredData}
        issuesCount={issuesCount}
        issuesFilterActive={issuesOnly}
        onIssuesClick={() => setIssuesOnly(v => !v)}
      />

      <DataTable
        data={filteredData}
        columns={columns}
        loading={loading}
        searchKeys={["line_code", "name", "dispatch_code", "conductor_type", "line_supervisor", "line_expert"]}
        title="خطوط انتقال"
        onAdd={() => { setEditRow(null); setDuplicateFrom(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onCopy={handleCopy}
        onDelete={handleDeleteRequest}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onImport={() => setShowImport(true)}
        onLoadAllRows={handleLoadAllRows}
        toolbarExtra={<BulkLinesActions getSelection={getSelection} onApplied={handleBulkApplied} />}
        tableRef={tableRef}
        layoutKey="lines"
      />
      <CreateLineDialog
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
        validateRow={validateImportRow}
        getExistingRows={async () => data}
        defaultUniqueKey="line_code"
        uniqueKeyOptions={[
          { value: "line_code", label: "کد خط" },
          { value: "dispatch_code", label: "کد دیسپاچینگ" },
          { value: "name", label: "نام خط" },
        ]}
        entityName="خط"
        headerMap={headerMap}
        templateColumns={templateColumns}
      />

      <AlertDialog open={rowsToDelete.length > 0} onOpenChange={(o) => { if (!o && !isDeleting) setRowsToDelete([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید حذف</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف {rowsToDelete.length.toLocaleString("fa-IR")} ردیف انتخاب‌شده از دیتابیس مطمئن هستید؟
              <br />
              <span className="text-amber-600 dark:text-amber-400">هشدار: دکل‌های این خطوط حذف می‌شوند؛ اما عیوب و سوابق حفظ می‌شوند.</span>
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
