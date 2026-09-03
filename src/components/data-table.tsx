"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { JSX } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, ChevronLeft, Search, RefreshCw,
  Plus, Eye, EyeOff, Filter, X, Check, Copy, CopyPlus, Trash2, ArrowUp, ArrowDown, Pencil,
  Settings as SettingsIcon, Upload, Download, Printer, RotateCcw, GripVertical,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isActiveStatus, statusLabel, STATUS_ACTIVE_LABEL, STATUS_INACTIVE_LABEL } from "@/lib/status";
import { toJalali } from "@/lib/jalali";
import { ExportDialog, type ExportOptions, type ExportScope } from "@/components/export-dialog";
import { PrintDialog, type PrintScope as PrintScopeType } from "@/components/print-dialog";
import { IssuesBadge } from "@/components/issues-badge";

export interface DataTableColumn<T> {
  key: string; header: string; width?: string;
  sortable?: boolean; filterable?: boolean; hidden?: boolean;
  type?: "text" | "number" | "badge" | "date" | "boolean" | "status";
  badgeLabels?: Record<string, string>; badgeColors?: Record<string, string>;
  render?: (row: T) => ReactNode; align?: "right" | "left" | "center";
  /** اگه true باشه، متن داخل سلول شکسته می‌شه و در چند خط نمایش داده می‌شه (برای متن‌های طولانی مثل نام خط) */
  wrap?: boolean;
}

export interface DataTableHandle {
  clearSelection: () => void;
  getSelectedRows: () => number[];
  getSelectedRowObjects: () => any[];
}

type SortState = "none" | "asc" | "desc";
interface PendingFilter { search: string; selectedValues: Set<string>; }

interface DataTableProps<T extends { id: number }> {
  data: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;
  searchKeys?: string[];
  title?: string;
  onAdd?: () => void;
  onRefresh?: () => void;
  onRowClick?: (row: T) => void;
  onCopy?: (rows: T[]) => void;
  onDelete?: (rows: T[]) => void;
  onEdit?: (row: T) => void;
  /** کپی ردیف به‌عنوان پایه رکورد جدید — مثل ویرایش، دقیقاً یک ردیف باید انتخاب شده باشد */
  onDuplicate?: (row: T) => void;
  /** نمایش دکمه import از اکسل — وقتی این تابع پاس بشه، دکمه نمایش داده می‌شه */
  onImport?: () => void;
  /** گرفتن همه ردیف‌ها از سرور برای خروجی "همه" — اگر پاس نشه، فقط گزینه current/filtered قابل انتخاب است */
  onLoadAllRows?: () => Promise<T[]>;
  /** عنصر اضافه در ردیف دکمه‌های نوار ابزار (مثلاً دکمه عملیات گروهی ماژول) — بعد از دکمه‌های اصلی رندر می‌شود */
  toolbarExtra?: ReactNode | ((selectedRows: T[]) => ReactNode);
  pageSize?: number;
  searchable?: boolean;
  tableRef?: React.MutableRefObject<DataTableHandle | null>;
  /**
   * v2.4.3: شناسه چیدمان ستون‌ها برای ذخیره‌سازی per-user —
   * ترتیب/مخفی‌سازی ستون‌ها برای هر کاربر در localStorage نگهداری و در ورود بعدی بازیابی می‌شود
   */
  layoutKey?: string;
  /** مرتب‌سازی اولیهٔ جدول؛ فقط در بارگذاری اولیه اعمال می‌شود و مرتب‌سازی دستی کاربر را تحت تأثیر قرار نمی‌دهد */
  defaultSort?: Array<{ key: string; direction?: "asc" | "desc"; order?: Array<string | number> }>;
}

function SortableColumnRow({ id, header, hidden, onToggle, onUp, onDown, first, last }: { id: string; header: string; hidden: boolean; onToggle: () => void; onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} {...attributes} className={cn("flex items-center gap-1 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded", isDragging && "opacity-60 bg-indigo-50 shadow-sm")}>
    <button type="button" {...listeners} className="p-1 text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing touch-none shrink-0" title="کشیدن برای جابه‌جایی" aria-label={`جابه‌جایی ستون ${header}`}>
      <GripVertical className="w-4 h-4" />
    </button>
    <label className="flex items-center gap-2 flex-1 cursor-pointer text-right min-w-0">
      <input type="checkbox" checked={!hidden} onChange={onToggle} className="w-4 h-4 cursor-pointer shrink-0" />
      <span className="text-sm truncate">{header}</span>
    </label>
    <button type="button" onClick={onUp} disabled={first} className="p-1 hover:text-indigo-600 disabled:opacity-30 cursor-pointer shrink-0" title="بالا"><ArrowUp className="w-3.5 h-3.5" /></button>
    <button type="button" onClick={onDown} disabled={last} className="p-1 hover:text-indigo-600 disabled:opacity-30 cursor-pointer shrink-0" title="پایین"><ArrowDown className="w-3.5 h-3.5" /></button>
  </div>;
}

function DefaultHealthCell({ row }: { row: any }) {
  const issues = Array.isArray(row?.data_quality) ? row.data_quality : (Array.isArray(row?.quality_issues) ? row.quality_issues : []);
  return <IssuesBadge issues={issues} />;
}

function DataTableInner<T extends { id: number }>({
  data, columns, loading, searchKeys, title,
  onAdd, onRefresh, onRowClick, onCopy, onDelete, onEdit, onDuplicate,
  onImport, onLoadAllRows, toolbarExtra,
  pageSize = 15, searchable = true, tableRef, layoutKey, defaultSort,
}: DataTableProps<T>) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortState>("none");
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [page, setPage] = useState(1);
  // اندازه صفحه قابل تنظیم برای همه جدول‌ها و ذخیره‌شده به تفکیک کاربر/جدول
  const [pageSizeState, setPageSizeState] = useState<number>(() => {
    if (typeof window === "undefined") return pageSize;
    try {
      const userRaw = localStorage.getItem("powerline_user");
      const userId = userRaw ? (JSON.parse(userRaw)?.id ?? "guest") : "guest";
      const raw = layoutKey ? localStorage.getItem(`powerline_dt_page_size_${userId}_${layoutKey}`) : null;
      const n = raw ? Number(raw) : NaN;
      return [10, 15, 25, 50, 100, 200].includes(n) ? n : pageSize;
    } catch { return pageSize; }
  });
  const activePageSize = pageSizeState;
  // v2.4.3: چیدمان ستون‌ها (ترتیب + مخفی) از حافظهٔ اختصاصی همین کاربر بازیابی می‌شود
  const savedLayout = useMemo(() => {
    if (!layoutKey || typeof window === "undefined") return null;
    try {
      const userRaw = localStorage.getItem("powerline_user");
      const userId = userRaw ? (JSON.parse(userRaw)?.id ?? "guest") : "guest";
      const raw = localStorage.getItem(`powerline_dt_layout_${userId}_${layoutKey}`);
      return raw ? JSON.parse(raw) as { hidden?: string[]; order?: string[] } : null;
    } catch { return null; }
  }, [layoutKey]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => savedLayout?.hidden ? new Set(savedLayout.hidden) : new Set(columns.filter(c => c.hidden).map(c => c.key))
  );
  const hasSavedLayout = !!savedLayout;
  const userCustomizedLayoutRef = useRef(hasSavedLayout);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, { search: string; selectedValues: Set<string> }>>({});
  const [pendingFilters, setPendingFilters] = useState<Record<string, PendingFilter>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedRowCache, setSelectedRowCache] = useState<Map<number, T>>(new Map());
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectionAllActive, setSelectionAllActive] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => {
      const def = columns.map(c => c.key);
      if (savedLayout?.order) {
        const existing = savedLayout.order.filter(k => def.includes(k));
        const added = def.filter(k => !existing.includes(k));
        return [...existing, ...added];
      }
      return def;
    }
  );
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // فقط بعد از اقدام صریح کاربر چیدمان را ذخیره می‌کنیم؛ ترتیب پیش‌فرض از دیتابیس می‌آید.
  const persistUserLayout = useCallback((nextHidden: Set<string>, nextOrder: string[]) => {
    if (!layoutKey || typeof window === "undefined") return;
    userCustomizedLayoutRef.current = true;
    try {
      const userRaw = localStorage.getItem("powerline_user");
      const userId = userRaw ? (JSON.parse(userRaw)?.id ?? "guest") : "guest";
      localStorage.setItem(
        `powerline_dt_layout_${userId}_${layoutKey}`,
        JSON.stringify({ hidden: Array.from(nextHidden), order: nextOrder })
      );
    } catch { /* حافظه در دسترس نیست — بی‌صدا رد شود */ }
  }, [layoutKey]);

  // close column menu on outside click
  useEffect(() => {
    if (!showColumnMenu) return;
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColumnMenu]);

  // Expose imperative API to parent: clearSelection, getSelectedRows
  useEffect(() => {
    if (tableRef) {
      tableRef.current = {
        clearSelection: () => { setSelectedRows(new Set()); setSelectedRowCache(new Map()); setSelectionAllActive(false); },
        getSelectedRows: () => Array.from(selectedRows),
        getSelectedRowObjects: () => Array.from(selectedRowCache.values()),
      };
    }
  }, [selectedRows, selectedRowCache, tableRef]);

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
    setSelectedRowCache(new Map());
    setSelectionAllActive(false);
  }, []);

  // هر بار دادهٔ جدول تازه از والد دریافت می‌شود (مثلاً بعد از حذف، ویرایش یا رفرش)،
  // انتخاب‌های قبلی نباید به رکوردهای جدید منتقل شوند و شمارندهٔ انتخاب نباید باقی بماند.
  const previousDataSignatureRef = useRef<string | null>(null);
  const dataSelectionSignature = useMemo(() => data.map(r => String(r.id)).join(","), [data]);
  useEffect(() => {
    if (previousDataSignatureRef.current !== dataSelectionSignature || data.length === 0) {
      previousDataSignatureRef.current = dataSelectionSignature;
      clearSelection();
    } else {
      // حتی اگر شناسه‌ها عوض نشده باشند، دریافت تازه داده به معنی Refresh است؛
      // انتخاب قبلی نباید به دادهٔ تازه منتقل شود.
      clearSelection();
    }
  }, [data, dataSelectionSignature, clearSelection]);

  // سلامت داده به‌صورت پیش‌فرض در همه جدول‌ها نمایش داده می‌شود.
  const effectiveColumns = useMemo<DataTableColumn<T>[]>(() => {
    if (columns.some(c => c.key === "data_quality")) return columns;
    return [...columns, { key: "data_quality", header: "سلامت داده", align: "center", width: "110px", render: (row: T) => <DefaultHealthCell row={row} /> }];
  }, [columns]);

  useEffect(() => {
    const newKeys = effectiveColumns.map(c => c.key);
    setColumnOrder(prev => {
      const existing = prev.filter(k => newKeys.includes(k));
      const added = newKeys.filter(k => !prev.includes(k));
      const next = [...existing, ...added];
      return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
    });
  }, [effectiveColumns]);

  // در نبود شخصی‌سازی، ترتیب ستون‌ها از ترتیب فیلدهای رکورد API می‌آید؛
  // چون SELECT * ترتیب واقعی ستون‌های جدول دیتابیس را حفظ می‌کند.
  useEffect(() => {
    if (userCustomizedLayoutRef.current || !data.length) return;
    const dbKeys = Object.keys(data[0] as Record<string, unknown>);
    const knownKeys = new Set(effectiveColumns.map(c => c.key));
    const dbOrder = dbKeys.filter(k => knownKeys.has(k));
    const remaining = effectiveColumns.map(c => c.key).filter(k => !dbOrder.includes(k));
    const next = [...dbOrder, ...remaining];
    setColumnOrder(prev => next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next);
  }, [data, effectiveColumns]);

  // ستون‌های جدیدی که در schema/API اضافه شوند نیز بدون برهم‌زدن شخصی‌سازی کاربر وارد می‌شوند.
  useEffect(() => {
    if (userCustomizedLayoutRef.current) {
      setColumnOrder(prev => {
        const newKeys = effectiveColumns.map(c => c.key);
        const existing = prev.filter(k => newKeys.includes(k));
        const added = newKeys.filter(k => !prev.includes(k));
        return [...existing, ...added];
      });
    }
  }, [effectiveColumns]);

  // Compute visible columns respecting order + hidden
  const visibleColumns = columnOrder
    .map(key => effectiveColumns.find(c => c.key === key))
    .filter((c): c is DataTableColumn<T> => !!c && !hiddenColumns.has(c.key));

  // Auto-calculate column widths based on content
  // - If user specified explicit width: use it as-is (honor user's choice)
  // - Otherwise: width = max(header width, max-cell-width) with sensible caps
  // - For wrap columns: cap at 600px to allow long names like "نام خط"
  // - For non-wrap columns: cap at 220px (most are short codes/numbers)
  const getColumnWidth = useCallback((col: DataTableColumn<T>): string | undefined => {
    // If user specified an explicit width, honor it as-is (no overrides)
    if (col.width) {
      return col.width;
    }

    // Estimate character width: ~8px for Persian/English mixed
    const CHAR_W = 8;
    const ICON_W = 36; // sort + filter icons
    const PADDING_W = 16; // p-2 = 8px left + 8px right (reduced from p-3)
    const MAX_W = col.wrap ? 600 : 220;
    const MIN_HEADER_W = 70;

    // Header text width
    const headerW = col.header.length * CHAR_W + ICON_W + PADDING_W;

    // Longest cell content width
    let maxCellW = 0;
    for (const row of data) {
      let text = "";
      const v = row[col.key as keyof T];
      if (v === null || v === undefined) text = "—";
      else if (col.type === "badge" && col.badgeLabels) text = col.badgeLabels[String(v)] || String(v);
      else if (col.type === "boolean" || col.type === "status") text = String(v) === "active" || v === true || v === 1 ? "فعال" : "غیرفعال";
      else if (col.type === "date") text = "۱۴۰۳/۰۵/۱۵"; // approx
      else if (col.type === "number") text = Number(v).toLocaleString("fa-IR");
      else text = String(v);
      const w = text.length * CHAR_W + PADDING_W;
      if (w > maxCellW) maxCellW = w;
    }

    const desired = Math.max(headerW, maxCellW, MIN_HEADER_W);
    return `${Math.min(desired, MAX_W)}px`;
  }, [data]);

  const getUniqueValues = (key: string): string[] => {
    const col = columns.find(c => c.key === key);
    // v4.3.77: ستون وضعیت (فعال/غیرفعال) — فهرست فیلتر فقط همین دو مقدار فارسی است؛
    // داده خام ممکن است active/inactive/deactive یا 1/0 باشد ولی نمایش همیشه واحد فارسی است
    if (col?.type === "status") {
      const present = new Set<string>();
      data.forEach(row => { const val = row[key as keyof T]; if (val !== null && val !== undefined && val !== "") present.add(statusLabel(val)); });
      return [STATUS_ACTIVE_LABEL, STATUS_INACTIVE_LABEL].filter(v => present.has(v));
    }
    // v4.3.77: ستون بج — مقدار خام از طریق badgeLabels به لیبل فارسی تبدیل می‌شود
    if (col?.type === "badge" && col.badgeLabels) {
      const present = new Set<string>();
      data.forEach(row => { const val = row[key as keyof T]; if (val !== null && val !== undefined && val !== "") present.add(col.badgeLabels?.[String(val)] || String(val)); });
      return Array.from(present).sort((a, b) => a.localeCompare(b, "fa"));
    }
    const values = new Set<string>();
    data.forEach(row => { const val = row[key as keyof T]; if (val !== null && val !== undefined && val !== "") values.add(String(val)); });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "fa"));
  };

  // v4.3.77: مقدار «نمایشی» سلول برای تطبیق فیلتر — ستون وضعیت با لیبل فارسی،
  // ستون بج با لیبل بج؛ بقیه ستون‌ها همان مقدار خام
  const filterDisplayValue = (row: T, key: string): string => {
    const col = columns.find(c => c.key === key);
    const val = row[key as keyof T];
    if (col?.type === "status") return statusLabel(val);
    if (col?.type === "badge" && col.badgeLabels) return col.badgeLabels?.[String(val ?? "")] || String(val ?? "");
    return String(val ?? "");
  };

  // Get filtered unique values — apply pending search to live-filter the list of values
  // This makes the in-filter search box feel instant (filters as you type)
  const getFilteredUniqueValues = (key: string): string[] => {
    const allValues = getUniqueValues(key);
    const search = getPendingFilter(key).search.trim().toLowerCase();
    if (!search) return allValues;
    return allValues.filter(v => v.toLowerCase().includes(search));
  };

  const isColumnFiltered = (key: string): boolean => { const f = appliedFilters[key]; return !!(f && (f.search !== "" || f.selectedValues.size > 0)); };
  const getPendingFilter = (key: string): PendingFilter => pendingFilters[key] || { search: "", selectedValues: new Set() };
  const setPendingSearch = (key: string, val: string) => setPendingFilters(prev => ({ ...prev, [key]: { search: val, selectedValues: getPendingFilter(key).selectedValues } }));
  const togglePendingValue = (key: string, val: string) => setPendingFilters(prev => { const cur = getPendingFilter(key); const next = new Set(cur.selectedValues); if (next.has(val)) next.delete(val); else next.add(val); return { ...prev, [key]: { search: cur.search, selectedValues: next } }; });
  const applyFilter = (key: string) => { const p = getPendingFilter(key); setAppliedFilters(prev => ({ ...prev, [key]: { search: p.search, selectedValues: new Set(p.selectedValues) } })); setOpenFilterCol(null); setPage(1); };
  const clearFilter = (key: string) => { setAppliedFilters(prev => { const n = { ...prev }; delete n[key]; return n; }); setPendingFilters(prev => { const n = { ...prev }; delete n[key]; return n; }); setOpenFilterCol(null); setPage(1); };

  const filtered = useMemo(() => {
    let result = [...data];
    if (search && searchKeys) { const l = search.toLowerCase(); result = result.filter(row => searchKeys.some(k => String(row[k as keyof T] ?? "").toLowerCase().includes(l))); }
    Object.entries(appliedFilters).forEach(([key, filter]) => {
      // v4.3.77: تطبیق با مقدار «نمایشی» — وضعیت با لیبل فارسی فعال/غیرفعال، بج با لیبل بج
      if (filter.search) result = result.filter(row => filterDisplayValue(row, key).toLowerCase().includes(filter.search.toLowerCase()));
      if (filter.selectedValues.size > 0) result = result.filter(row => filter.selectedValues.has(filterDisplayValue(row, key)));
    });
    const compareBySort = (a: T, b: T, key: string, direction: "asc" | "desc", order?: Array<string | number>) => {
      const av = a[key as keyof T];
      const bv = b[key as keyof T];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (order?.length) {
        const ai = order.findIndex(v => String(v) === String(av));
        const bi = order.findIndex(v => String(v) === String(bv));
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return direction === "asc" ? ai - bi : bi - ai;
        }
      }
      if (typeof av === "number" && typeof bv === "number") return direction === "asc" ? av - bv : bv - av;
      const c = String(av).localeCompare(String(bv), "fa", { numeric: true, sensitivity: "base" });
      return direction === "asc" ? c : -c;
    };
    if (sortKey && sortDir !== "none") result.sort((a, b) => compareBySort(a, b, sortKey, sortDir, defaultSort?.find(s => s.key === sortKey)?.order));
    // مرتب‌سازی اولیه چندمرحله‌ای تا وقتی کاربر ترتیب را دستی تغییر نداده است.
    if (!hasUserSorted && defaultSort?.length) {
      result.sort((a, b) => {
        for (const s of defaultSort) {
          const c = compareBySort(a, b, s.key, s.direction ?? "asc", s.order);
          if (c !== 0) return c;
        }
        return 0;
      });
    }
    return result;
  }, [data, search, searchKeys, appliedFilters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / activePageSize));
  const paginated = filtered.slice((page - 1) * activePageSize, page * activePageSize);

  // با تغییر فیلتر/تعداد آیتم در صفحه، صفحه فعلی باید معتبر بماند.
  useEffect(() => {
    setPage(p => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const changePageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
    if (layoutKey && typeof window !== "undefined") {
      try {
        const userRaw = localStorage.getItem("powerline_user");
        const userId = userRaw ? (JSON.parse(userRaw)?.id ?? "guest") : "guest";
        localStorage.setItem(`powerline_dt_page_size_${userId}_${layoutKey}`, String(size));
      } catch { /* ignore storage errors */ }
    }
  };

  const toggleSort = (key: string) => {
    setHasUserSorted(true);
    if (sortKey === key) {
      if (sortDir === "none") setSortDir("asc");
      else if (sortDir === "asc") setSortDir("desc");
      else { setSortDir("none"); setSortKey(null); }
    } else { setSortKey(key); setSortDir("asc"); }
  };
  const toggleColumnVisibility = (key: string) => {
    const n = new Set(hiddenColumns);
    if (n.has(key)) n.delete(key); else n.add(key);
    setHiddenColumns(n);
    persistUserLayout(n, columnOrder);
  };
  const moveColumn = (key: string, dir: "up" | "down") => {
    setColumnOrder(prev => {
      const idx = prev.indexOf(key); if (idx === -1) return prev;
      const n = [...prev]; const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= n.length) return prev;
      [n[idx], n[target]] = [n[target], n[idx]];
      persistUserLayout(hiddenColumns, n);
      return n;
    });
  };
  const toggleRowSelection = (id: number) => {
    setSelectionAllActive(false);
    setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const row = data.find(r => r.id === id);
    if (row) setSelectedRowCache(prev => { const n = new Map(prev); if (n.has(id)) n.delete(id); else n.set(id, row); return n; });
  };
  // انتخاب همه باید واقعاً همه رکوردهای نتیجه را انتخاب کند، نه فقط ۱۵ رکورد صفحه فعلی.
  const filteredIds = filtered.map(r => r.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedRows.has(id));
  const someFilteredSelected = filteredIds.some(id => selectedRows.has(id));
  const toggleSelectAll = async () => {
    if (selectingAll) return;
    if (selectionAllActive || allFilteredSelected) {
      setSelectedRows(new Set());
      setSelectedRowCache(new Map());
      setSelectionAllActive(false);
      return;
    }
    // v4.3.53: انتخاب اُپتیمیزه — ابتدا همان لحظه ردیف‌های موجود انتخاب می‌شوند
    // (تیک فوراً و بدون نمایش حالت منفی/نیمه‌انتخاب برمی‌گردد)، سپس اگر داده بیشتری
    // لازم بود (انتخاب همه صفحات) از سرور گرفته و انتخاب تکمیل می‌شود.
    const prevRows = selectedRows;
    const prevCache = selectedRowCache;
    setSelectingAll(true);
    setSelectedRows(new Set(filteredIds));
    setSelectedRowCache(new Map(filtered.map(r => [r.id, r] as const)));
    try {
      const rows = onLoadAllRows ? await onLoadAllRows() : filtered;
      const eligible = rows || [];
      setSelectedRows(new Set(eligible.map(r => r.id)));
      setSelectedRowCache(new Map(eligible.map(r => [r.id, r])));
      setSelectionAllActive(true);
      toast({ title: "انتخاب همه انجام شد", description: `${eligible.length.toLocaleString("fa-IR")} ردیف انتخاب شد` });
    } catch (err: any) {
      // برگشت به وضعیت قبل در صورت خطا
      setSelectedRows(prevRows);
      setSelectedRowCache(prevCache);
      toast({ title: "انتخاب همه ناموفق بود", description: err?.message || "دریافت همه رکوردها انجام نشد", variant: "destructive" });
    } finally {
      setSelectingAll(false);
    }
  };
  const getSortIcon = (key: string) => { if (sortKey !== key || sortDir === "none") return <ChevronsUpDown className="w-3 h-3 opacity-40" />; return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />; };

  // Open Export Dialog instead of exporting directly
  const handleExport = () => {
    setShowExportDialog(true);
  };

  // Callback for ExportDialog — fetch data based on scope
  // استخراج تمام کلیدهای ستون‌ها (شامل مخفی) برای اینکه در ExportDialog
  // کاربر بتواند انتخاب کند کدام ستون‌ها در خروجی باشند
  const handleExportGetData = useCallback(async (scope: ExportScope): Promise<Array<Record<string, unknown>>> => {
    // همه کلیدهای ستون‌ها (شامل مخفی)
    const allColKeys = columns.map(c => c.key);

    if (scope === "current") {
      return paginated.map(row => {
        const r: Record<string, unknown> = {};
        allColKeys.forEach(key => {
          r[key] = row[key as keyof T];
        });
        return r;
      });
    }
    if (scope === "filtered") {
      return filtered.map(row => {
        const r: Record<string, unknown> = {};
        allColKeys.forEach(key => {
          r[key] = row[key as keyof T];
        });
        return r;
      });
    }
    // all
    if (onLoadAllRows) {
      const allRows = await onLoadAllRows();
      return allRows.map(row => {
        const r: Record<string, unknown> = {};
        allColKeys.forEach(key => {
          r[key] = row[key as keyof T];
        });
        return r;
      });
    }
    // fallback به filtered
    return filtered.map(row => {
      const r: Record<string, unknown> = {};
      allColKeys.forEach(key => {
        r[key] = row[key as keyof T];
      });
      return r;
    });
  }, [paginated, filtered, columns, onLoadAllRows]);

  // Open Print Dialog
  const handlePrint = () => {
    setShowPrintDialog(true);
  };

  // Callback for PrintDialog — fetch data based on scope
  const handlePrintGetData = useCallback(async (scope: PrintScopeType): Promise<Array<Record<string, unknown>>> => {
    const allColKeys = columns.map(c => c.key);

    if (scope === "current") {
      return paginated.map(row => {
        const r: Record<string, unknown> = {};
        allColKeys.forEach(key => { r[key] = row[key as keyof T]; });
        return r;
      });
    }
    if (scope === "filtered") {
      return filtered.map(row => {
        const r: Record<string, unknown> = {};
        allColKeys.forEach(key => { r[key] = row[key as keyof T]; });
        return r;
      });
    }
    if (onLoadAllRows) {
      const allRows = await onLoadAllRows();
      return allRows.map(row => {
        const r: Record<string, unknown> = {};
        allColKeys.forEach(key => { r[key] = row[key as keyof T]; });
        return r;
      });
    }
    return filtered.map(row => {
      const r: Record<string, unknown> = {};
      allColKeys.forEach(key => { r[key] = row[key as keyof T]; });
      return r;
    });
  }, [paginated, filtered, columns, onLoadAllRows]);

  const hasAnyFilters = search.trim() !== "" || Object.values(appliedFilters).some((f: { search: string; selectedValues: Set<string> }) => f.search !== "" || f.selectedValues.size > 0) || (sortKey !== null && sortDir !== "none");
  const resetFilters = () => {
    setSearch("");
    setAppliedFilters({});
    setPendingFilters({});
    setOpenFilterCol(null);
    setSortKey(null);
    setSortDir("none");
    setPage(1);
  };

  // Copy selected rows to clipboard as TSV (tab-separated) — paste-able in Excel
  // If no row selected, copy all filtered rows
  const handleCopy = () => {
    const rowsToCopy = selectedRows.size > 0
      ? filtered.filter(r => selectedRows.has(r.id))
      : filtered;
    if (rowsToCopy.length === 0) {
      toast({ title: "هیچ ردیفی برای کپی نیست", description: "ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
      return;
    }

    // Build TSV string with tab-separated values
    // Replace newlines/tabs inside values to avoid breaking format
    const clean = (v: unknown) => {
      if (v === null || v === undefined) return "";
      let s = String(v);
      // Replace tabs and newlines inside cell content with space
      s = s.replace(/\t/g, " ").replace(/\r?\n/g, " ");
      return s;
    };

    const headers = visibleColumns.map(c => c.header);
    const headerLine = headers.join("\t");
    const dataLines = rowsToCopy.map(row =>
      visibleColumns.map(c => clean(row[c.key as keyof T])).join("\t")
    );
    const tsv = headerLine + "\n" + dataLines.join("\n");

    // بازخورد کپی اینجا و به‌صورت متمرکز نمایش داده می‌شود تا در همه صفحات یکسان باشد
    const showSuccess = () => {
      toast({
        title: "کپی شد",
        description: `${rowsToCopy.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV کپی شد — آماده پیست در اکسل`,
      });
    };
    const showError = () => {
      toast({ title: "کپی ناموفق", description: "مرورگر اجازه دسترسی به کلیپ‌بورد را نداد — دوباره تلاش کنید", variant: "destructive" });
    };
    const onError = (err: unknown) => {
      console.error("Copy failed:", err);
      // Fallback: use textarea
      const textarea = document.createElement("textarea");
      textarea.value = tsv;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { console.error(e); }
      document.body.removeChild(textarea);
      if (ok) showSuccess();
      else showError();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(showSuccess).catch(onError);
    } else {
      onError(new Error("Clipboard API not available"));
    }
  };

  // v4.3.77: قانون امنیتی حذف — تا زمانی که وضعیت ردیف «فعال» است حذف مجاز نیست.
  // جداولی که ستون نوع status دارند (خطوط، دکل‌ها، پیمانکار، پرسنل، تجهیزات، چک‌لیست،
  // فهرست بها، مراجع دکل و...) مشمول این قاعده‌اند؛ جداول بدون ستون فعال/غیرفعال عادی حذف می‌شوند.
  const statusColumn = columns.find(c => c.type === "status");

  const handleDelete = () => {
    const sel = filtered.filter(r => selectedRows.has(r.id));
    if (statusColumn && onDelete) {
      const activeRows = sel.filter(r => isActiveStatus(r[statusColumn.key as keyof T]));
      if (activeRows.length > 0) {
        toast({
          title: "حذف مجاز نیست",
          description: `${activeRows.length.toLocaleString("fa-IR")} ردیف انتخاب‌شده وضعیت «فعال» دارد — برای امنیت داده، ابتدا وضعیت را «غیرفعال» کنید؛ ردیف‌های غیرفعال قابل حذف هستند.`,
          variant: "destructive",
        });
        return;
      }
    }
    if (onDelete) onDelete(sel);
  };

  const renderCell = (row: T, col: DataTableColumn<T>) => {
    if (col.render) return col.render(row);
    const value = row[col.key as keyof T];
    if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
    if (col.type === "badge") { const v = String(value); return <Badge className={col.badgeColors?.[v] || "bg-slate-100 text-slate-700"} variant="secondary">{col.badgeLabels?.[v] || v}</Badge>; }
    if (col.type === "boolean") return value ? <Badge className="bg-green-100 text-green-700">بله</Badge> : <Badge className="bg-slate-100 text-slate-500">خیر</Badge>;
    if (col.type === "status") return isActiveStatus(value) ? <Badge className="bg-green-100 text-green-700">فعال</Badge> : <Badge className="bg-red-100 text-red-700">غیرفعال</Badge>;
    if (col.type === "date") {
      try { return toJalali(String(value)); } catch { return String(value); }
    }
    if (col.type === "number") return <span className="nums-fa">{Number(value).toLocaleString("fa-IR")}</span>;
    return String(value);
  };

  // همه جدول‌ها قابلیت انتخاب ردیف دارند؛ عملیات وابسته به callbackهای صفحه فعال می‌شوند.
  const hasSelection = true;
  // Selection is intentionally allowed to persist across pages for bulk operations.
  // Edit/duplicate, however, must only evaluate rows that are currently visible after search/filter.
  // This prevents a stale selection from another page/filter from blocking a single-row edit.
  const visibleSelectedRows = Array.from(selectedRowCache.values()).filter(r => selectedRows.has(r.id));
  const selCount = visibleSelectedRows.length;

  const handleEditClick = () => {
    if (selCount === 0) {
      // optional: parent can pass onEdit and decide what to do — we just skip silently
      return;
    }
    if (selCount > 1) {
      toast({
        title: "ویرایش یک ردیف در هر بار",
        description: `لطفاً فقط یک ردیف را انتخاب کنید. اکنون ${selCount.toLocaleString("fa-IR")} ردیف انتخاب شده است.`,
      });
      return;
    }
    // exactly 1 visible row — find it directly from the filtered data set
    const row = visibleSelectedRows[0];
    if (row && onEdit) onEdit(row);
  };

  // Duplicate handler — same single-selection rule as edit
  const handleDuplicateClick = () => {
    if (selCount === 0 || selCount > 1) return;
    const row = visibleSelectedRows[0];
    if (row && onDuplicate) onDuplicate(row);
  };

  const actionButton = (button: ReactNode, title: string, disabled = false) =>
    disabled ? <span title={title} className="inline-flex cursor-default">{button}</span> : button;

  return (
    <div className="space-y-3" dir="rtl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          {onAdd && <Button onClick={onAdd} className="bg-green-600 hover:bg-green-700 h-9 w-9 p-0" title="افزودن"><Plus className="w-4 h-4" /></Button>}
          {onEdit && actionButton(
            <Button variant="outline" size="icon" onClick={handleEditClick} disabled={selCount === 0} title={selCount === 0 ? "ابتدا یک ردیف انتخاب کنید" : selCount > 1 ? "فقط یک ردیف باید انتخاب شود" : "ویرایش ردیف انتخاب شده"} className="h-9 w-9 text-indigo-600 hover:bg-indigo-50 border-indigo-200">
              <Pencil className="w-4 h-4" />
            </Button>,
            selCount === 0 ? "ابتدا یک ردیف انتخاب کنید" : selCount > 1 ? "فقط یک ردیف باید انتخاب شود" : "ویرایش ردیف انتخاب شده",
            selCount === 0
          )}
          {onDuplicate && actionButton(
            <Button variant="outline" size="icon" onClick={handleDuplicateClick} disabled={selCount !== 1} title={selCount !== 1 ? "ابتدا دقیقاً یک ردیف انتخاب کنید" : "کپی به‌عنوان ردیف جدید"} className="h-9 w-9 text-emerald-600 hover:bg-emerald-50 border-emerald-200">
              <CopyPlus className="w-4 h-4" />
            </Button>,
            selCount !== 1 ? "ابتدا دقیقاً یک ردیف انتخاب کنید" : "کپی به‌عنوان ردیف جدید",
            selCount !== 1
          )}
          {onCopy && (
            <Button variant="outline" size="icon" onClick={handleCopy} title="کپی برای اکسل" className="h-9 w-9">
              <Copy className="w-4 h-4" />
            </Button>
          )}
          {onDelete && actionButton(
            <Button variant="outline" size="icon" onClick={handleDelete} disabled={selCount === 0} title={selCount === 0 ? "ابتدا یک یا چند ردیف انتخاب کنید" : "حذف ردیف‌های انتخاب‌شده"} className="h-9 w-9 text-red-600 hover:bg-red-50 border-red-200">
              <Trash2 className="w-4 h-4" />
            </Button>,
            selCount === 0 ? "ابتدا یک یا چند ردیف انتخاب کنید" : "حذف ردیف‌های انتخاب‌شده",
            selCount === 0
          )}

          {/* عنصر اضافه ماژول (مثل دکمه عملیات گروهی) — همان ردیف دکمه‌های اصلی */}
          {typeof toolbarExtra === "function" ? toolbarExtra(visibleSelectedRows) : toolbarExtra}

          {onImport && (
            <Button variant="outline" size="icon" onClick={onImport} title="وارد کردن از اکسل" className="h-9 w-9 text-green-600 hover:bg-green-50 border-green-200">
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleExport} title="خروجی گرفتن" className="h-9 w-9 text-blue-600 hover:bg-blue-50 border-blue-200"><Upload className="w-4 h-4" /></Button>
          {onRefresh && <Button variant="outline" size="icon" onClick={onRefresh} title="بارگذاری مجدد" className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>}
          <Button variant="outline" size="icon" onClick={handlePrint} title="چاپ گزارش" className="h-9 w-9 text-indigo-600 hover:bg-indigo-50 border-indigo-200"><Printer className="w-4 h-4" /></Button>

          {/* بازنشانی کامل فیلترها و مرتب‌سازی — در حالت عادی قرمز نیست؛ فقط هنگام فعال بودن فیلتر/مرتب‌سازی قرمز می‌شود */}
          <Button
            variant="outline" size="icon" onClick={resetFilters} disabled={!hasAnyFilters}
            title={hasAnyFilters ? "حذف فیلترها و مرتب‌سازی فعال" : "فیلتر فعالی وجود ندارد"}
            className={cn(
              "h-9 w-9 border-slate-200 transition-colors",
              hasAnyFilters
                ? "bg-red-50 text-red-600 hover:bg-red-100 border-red-200"
                : "text-slate-600 hover:bg-slate-50"
            )}
          ><RotateCcw className="w-4 h-4" /></Button>

          {/* Settings همیشه آخرین دکمه */}
          <div className="relative" ref={columnMenuRef}>
            <Button variant="outline" size="icon" title="تنظیمات و جابه‌جایی ستون‌ها" aria-label="تنظیمات و جابه‌جایی ستون‌ها" className="h-9 w-9 text-slate-700 hover:text-indigo-600" onClick={() => setShowColumnMenu(o => !o)}>
              <SettingsIcon className="w-4 h-4" />
            </Button>
            {showColumnMenu && (
              <div className="absolute z-50 mt-1 left-0 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg" dir="rtl">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">تنظیم ستون‌ها</span>
                  <button onClick={() => setShowColumnMenu(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-3 py-2 text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">ستون را با کشیدن و رها کردن به بالا یا پایین جابه‌جا کنید.</div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e; if (!over || active.id === over.id) return;
                  setColumnOrder(items => {
                    const oi = items.indexOf(String(active.id)); const ni = items.indexOf(String(over.id));
                    if (oi < 0 || ni < 0) return items;
                    const next = arrayMove(items, oi, ni);
                    persistUserLayout(hiddenColumns, next);
                    return next;
                  });
                }}>
                  <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
                    <div className="max-h-[70vh] overflow-y-auto p-1 scrollbar-thin">
                      {columnOrder.map((key, idx) => {
                        const col = columns.find(c => c.key === key); if (!col) return null;
                        return <SortableColumnRow key={key} id={key} header={col.header} hidden={hiddenColumns.has(key)} onToggle={() => toggleColumnVisibility(key)} onUp={() => moveColumn(key, "up")} onDown={() => moveColumn(key, "down")} first={idx===0} last={idx===columnOrder.length-1} />;
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          {/* شمارنده انتخاب — همیشه بعد از Settings و بدون امکان انتخاب همه */}
          {selCount > 0 && (
            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md nums-fa border border-indigo-200 inline-flex items-center gap-1 mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>{selCount.toLocaleString("fa-IR")} ردیف انتخاب شده
            </span>
          )}

        </div>

        {searchable && (

          <div className="relative min-w-[140px]" style={{ maxWidth: "280px", flex: "0 1 280px" }}>
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="جستجو..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-white dark:bg-slate-800" />
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onGetData={handleExportGetData}
        columns={columns.map(c => ({ key: c.key, header: c.header }))}
        visibleColumns={visibleColumns.map(c => ({ key: c.key, header: c.header }))}
        defaultFileName={title || "export"}
        currentCount={paginated.length}
        filteredCount={filtered.length}
        totalCount={onLoadAllRows ? -2 : filtered.length}
      />

      {/* Print Dialog */}
      <PrintDialog
        open={showPrintDialog}
        onClose={() => setShowPrintDialog(false)}
        onGetData={handlePrintGetData}
        columns={columns.map(c => ({ key: c.key, header: c.header }))}
        visibleColumns={visibleColumns.map(c => ({ key: c.key, header: c.header }))}
        defaultTitle={title || "گزارش"}
        currentCount={paginated.length}
        filteredCount={filtered.length}
        totalCount={onLoadAllRows ? -2 : filtered.length}
      />

      {/* Table */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed" dir="rtl">
            <thead>
              <tr className="bg-white dark:bg-slate-800 border-b-2 border-slate-200 dark:border-slate-700">
                {hasSelection && (
                  <th
                    className="p-2 w-10 text-center bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 z-10 sticky right-0"
                    title="انتخاب همه"
                  >
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = !selectingAll && !allFilteredSelected && someFilteredSelected; }}
                      onChange={() => { void toggleSelectAll(); }}
                      disabled={selectingAll}
                      className="w-4 h-4 cursor-pointer"
                      title="انتخاب/لغو انتخاب تمام ردیف‌ها در همه صفحات"
                    />
                  </th>
                )}
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      "p-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap bg-white dark:bg-slate-800",
                      "text-right"
                    )}
                    style={{ width: getColumnWidth(col) }}
                  >
                    <div className={cn(
                      "flex items-center gap-1",
                      "justify-start"
                    )}>
                      <span className="text-right">{col.header}</span>
                      {/* همه ستون‌ها فیلترپذیر هستند مگر صراحتاً غیرفعال شده باشند */}
                      {col.filterable !== false && (
                        <DropdownMenu open={openFilterCol === col.key} onOpenChange={(o) => { if (o) { setOpenFilterCol(col.key); if (!pendingFilters[col.key]) setPendingFilters(prev => ({ ...prev, [col.key]: { search: "", selectedValues: new Set() } })); } else setOpenFilterCol(null); }}>
                          <DropdownMenuTrigger asChild>
                            <button
                              className={cn("p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0", isColumnFiltered(col.key) || (sortKey === col.key && sortDir !== "none") ? "text-indigo-600" : "text-slate-400 hover:text-indigo-600")}
                              title="فیلتر و سورت"
                            >
                              <Filter className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-72">
                            <div className="p-3 space-y-3" dir="rtl">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-right">{col.header}</span>
                                {(isColumnFiltered(col.key) || (sortKey === col.key && sortDir !== "none")) && (
                                  <button onClick={() => { clearFilter(col.key); setSortKey(null); setSortDir("none"); }} className="text-xs text-red-500 hover:text-red-700 cursor-pointer">پاک کردن</button>
                                )}
                              </div>

                              {/* بخش سورت — همه ستون‌ها sortable هستند مگر صراحتاً غیرفعال شده باشند */}
                              {col.sortable !== false && (
                                <div className="space-y-1 border border-slate-100 dark:border-slate-700 rounded p-2 bg-slate-50 dark:bg-slate-800/50">
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">مرتب‌سازی</p>
                                  <div className="grid grid-cols-3 gap-1">
                                    <button
                                      onClick={() => { setSortKey(col.key); setSortDir("asc"); }}
                                      className={cn(
                                        "flex items-center justify-center gap-1 text-xs py-1.5 rounded cursor-pointer transition-colors",
                                        sortKey === col.key && sortDir === "asc"
                                          ? "bg-indigo-600 text-white"
                                          : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-600"
                                      )}
                                    >
                                      <ChevronUp className="w-3 h-3" /> صعودی
                                    </button>
                                    <button
                                      onClick={() => { setSortKey(col.key); setSortDir("desc"); }}
                                      className={cn(
                                        "flex items-center justify-center gap-1 text-xs py-1.5 rounded cursor-pointer transition-colors",
                                        sortKey === col.key && sortDir === "desc"
                                          ? "bg-indigo-600 text-white"
                                          : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-600"
                                      )}
                                    >
                                      <ChevronDown className="w-3 h-3" /> نزولی
                                    </button>
                                    <button
                                      onClick={() => { setSortKey(null); setSortDir("none"); }}
                                      className={cn(
                                        "flex items-center justify-center gap-1 text-xs py-1.5 rounded cursor-pointer transition-colors",
                                        sortKey !== col.key || sortDir === "none"
                                          ? "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-600"
                                          : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                                      )}
                                    >
                                      <ChevronsUpDown className="w-3 h-3" /> حذف
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* بخش جستجو در مقادیر ستون */}
                              <Input placeholder="جستجو در این ستون..." value={getPendingFilter(col.key).search} onChange={e => setPendingSearch(col.key, e.target.value)} className="text-sm text-right" onClick={e => e.stopPropagation()} autoFocus />
                              <div className="max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-700 rounded [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                {getFilteredUniqueValues(col.key).length === 0 ? (
                                  <div className="p-3 text-center text-slate-400 text-sm">موردی یافت نشد</div>
                                ) : (
                                  getFilteredUniqueValues(col.key).slice(0, 100).map(val => {
                                    const checked = getPendingFilter(col.key).selectedValues.has(val);
                                    return (
                                      <label key={val} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" checked={checked} onChange={() => togglePendingValue(col.key, val)} className="w-4 h-4 cursor-pointer" />
                                        <span className="min-w-0 whitespace-normal break-words leading-5 text-right line-clamp-2">{val}</span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                              <DropdownMenuSeparator />
                              <button onClick={() => toggleColumnVisibility(col.key)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 w-full text-right cursor-pointer">
                                {hiddenColumns.has(col.key) ? <><Eye className="w-4 h-4" /> نمایش این ستون</> : <><EyeOff className="w-4 h-4" /> مخفی کردن این ستون</>}
                              </button>
                              <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={(e) => { e.stopPropagation(); applyFilter(col.key); }}>
                                <Check className="w-4 h-4 ml-1" /> اعمال فیلتر
                              </Button>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + (hasSelection ? 1 : 0)} className="p-12 text-center">
                    <div className="inline-flex items-center gap-2 text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin" /> در حال بارگذاری...
                    </div>
                  </td>
                </tr>
              ) : paginated.length > 0 ? (
                paginated.map((row, i) => (
                  <tr
                    // v3.2.1: اگر ردیف id ندارد (مثلاً ستون id خالی در اکسل)، از ایندکس استفاده می‌شود
                    // تا خطای «two children with the same key null» رخ ندهد
                    key={row.id != null ? row.id : `row-${i}`}
                    className={cn(
                      "border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-default",
                      i % 2 === 1 && "bg-slate-50/50 dark:bg-slate-800/30",
                      selectedRows.has(row.id) && "bg-indigo-50 dark:bg-indigo-950/30",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={() => onRowClick?.(row)}
                    onContextMenu={(e) => { e.preventDefault(); if (onRowClick) onRowClick(row); }}
                  >
                    {hasSelection && (
                      <td
                        className="p-2 text-center sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 z-10"
                        onClick={e => e.stopPropagation()}
                      >
                        <input type="checkbox" checked={selectedRows.has(row.id)} onChange={() => toggleRowSelection(row.id)} className="w-4 h-4 cursor-pointer" />
                      </td>
                    )}
                    {visibleColumns.map(col => (
                      <td
                        key={col.key}
                        className={cn(
                          "p-2",
                          col.wrap ? "whitespace-normal break-words align-top" : "whitespace-nowrap",
                          "text-right"
                        )}
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length + (hasSelection ? 1 : 0)} className="p-12 text-center text-slate-400">موردی یافت نشد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — مشترک برای تمام جدول‌ها: اول، قبلی، شماره صفحه، بعدی، آخر + تعداد آیتم در صفحه */}
      <div className="flex flex-wrap items-center justify-between text-sm gap-3">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 nums-fa text-xs">
            {filtered.length > 0
              ? `نمایش ${((page - 1) * activePageSize + 1).toLocaleString("fa-IR")} تا ${Math.min(page * activePageSize, filtered.length).toLocaleString("fa-IR")} از ${filtered.length.toLocaleString("fa-IR")}`
              : "بدون رکورد"}
          </span>
          <label className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
            <span>نمایش در هر صفحه</span>
            <select
              value={activePageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs nums-fa outline-none focus:ring-2 focus:ring-indigo-500/30"
              aria-label="تعداد آیتم در هر صفحه"
            >
              {[10, 15, 25, 50, 100, 200].map(size => (
                <option key={size} value={size}>{size.toLocaleString("fa-IR")}</option>
              ))}
            </select>
          </label>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)} title="صفحه اول">
              اول
            </Button>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} title="صفحه قبلی">
              <ChevronRight className="w-4 h-4 ml-1" />
              قبلی
            </Button>
            <span className="px-3 py-1.5 min-w-[80px] text-center rounded-md bg-slate-100 dark:bg-slate-800 nums-fa text-slate-700 dark:text-slate-200 font-medium text-xs">
              {page.toLocaleString("fa-IR")} / {totalPages.toLocaleString("fa-IR")}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} title="صفحه بعدی">
              بعدی
              <ChevronLeft className="w-4 h-4 mr-1" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="صفحه آخر">
              آخر
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export with proper generic typing
export const DataTable = DataTableInner as <T extends { id: number }>(props: DataTableProps<T>) => JSX.Element;
