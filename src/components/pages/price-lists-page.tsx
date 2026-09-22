"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, ListChecks, FileSpreadsheet, Download, Upload, Filter } from "lucide-react";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { ContractSelect } from "@/components/contract-select";

/**
 * صفحه فهرست بها — v4.3.86
 *
 * طبقه‌بندی اقلام مطابق فهرست بهای کشوری:
 *   سطح ولتاژ (۶۳/۱۳۲/۲۳۰/۴۰۰) × تعداد مدار (تک/دو/چهار) × تعداد باندل (۱..۴)
 *   × نوع فعالیت (بازدید صعودی / پیمایشی / تعمیرات / عملیات) × نوع سازه دکل
 *   + بهای واحد جداگانه برای دشت / تپه‌ماهور / نیمه‌کوهستانی / صعب‌العبور
 *   + ردیف‌های «ضریب کاهش/افزایش بها» (کد ندارند — دامنه اعمال با فیلدهای طبقه‌بندی)
 */

interface PriceList {
  id: number;
  contract_id?: number | null;
  contract_title?: string | null;
  name: string;
  version: string | null;
  effective_date: string;
  status: number | string;
}

interface PriceListItem {
  id: number;
  price_list_id: number;
  code: string;
  title: string;
  unit: string | null;
  unit_price: number;
  category: string | null;
  status: number | string;
  contract_title?: string | null;
  // v4.3.86: طبقه‌بندی + قیمت‌های زمین + ضریب
  //   item_kind: base = قلم عادی | coefficient = ردیف ضریب
  //   activity_type: inspection = بازدید | repair = تعمیرات | operation = عملیات
  //   inspection_method: climbing = صعودی | patrol = پیمایشی
  item_kind?: string | null;
  voltage_kv?: number | null;
  circuit_count?: number | null;
  bundle_count?: number | null;
  activity_type?: string | null;
  inspection_method?: string | null;
  tower_structure?: string | null;
  terrain_type?: string | null;
  unit_price_plain?: number | null;
  unit_price_hilly?: number | null;
  unit_price_semi_mountainous?: number | null;
  unit_price_impassable?: number | null;
  coefficient_percent?: number | null;
}

const asArray = (r: unknown): any[] => (Array.isArray(r) ? r : ((r as any)?.data || []));

/** وضعیت فعال — سازگار با 'active' عددی 1 و رشته '1' (دیتابیس‌های قدیمی/جدید) */
const isActiveStatus = (v: unknown) => v === "active" || v === 1 || v === "1";

export const ACTIVITY_LABELS: Record<string, string> = {
  inspection: "بازدید", repair: "تعمیرات", operation: "عملیات",
};
export const METHOD_LABELS: Record<string, string> = {
  climbing: "بازدید صعودی", patrol: "بازدید پیمایشی",
};
export const TERRAIN_LABELS: Record<string, string> = {
  plain: "دشت", hilly: "تپه‌ماهور", semi_mountainous: "نیمه‌کوهستانی", impassable: "صعب‌العبور",
};
const STRUCTURES = ["مشبک فلزی", "تیر چوبی", "تلسکوپی فلزی"];

const fmt = (v: unknown) => (v === null || v === undefined || v === "") ? "—" : Number(v).toLocaleString("fa-IR");
const circuitLabel = (n: number | null | undefined) => n === 1 ? "تک‌مداره" : n === 2 ? "دو مداره" : n === 4 ? "چهارمداره" : n ? `${n} مداره` : null;

/** تبدیل مقدار عددی اکسل (ممیز، ارقام فارسی، ٪) به عدد */
export function parseExcelNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  let s = String(v).trim();
  for (let i = 0; i < 10; i++) s = s.split(fa[i]).join(String(i));
  s = s.replace(/[٫,٬\s]/g, "").replace(/[٪%]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** نرمال‌سازی نوع فعالیت: فارسی/انگلیسی → کلید (بازدید/تعمیرات/عملیات) */
export function normalizeActivity(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const map: Record<string, string> = {
    inspection: "inspection", repair: "repair", operation: "operation",
    "بازدید": "inspection", "تعمیرات": "repair", "عملیات": "operation",
  };
  return map[s] ?? map[s.toLowerCase()] ?? null;
}

/** نرمال‌سازی روش بازدید: صعودی/پیمایشی → climbing/patrol */
export function normalizeMethod(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const map: Record<string, string> = {
    climbing: "climbing", patrol: "patrol",
    "صعودی": "climbing", "بازدید صعودی": "climbing",
    "پیمایشی": "patrol", "بازدید پیمایشی": "patrol",
  };
  return map[s] ?? map[s.toLowerCase()] ?? null;
}

/** نرمال‌سازی نوع زمین: فارسی/انگلیسی → کلید */
export function normalizeTerrain(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const map: Record<string, string> = {
    plain: "plain", hilly: "hilly", semi_mountainous: "semi_mountainous", impassable: "impassable",
    "دشت": "plain", "تپه ماهور": "hilly", "تپه‌ماهور": "hilly",
    "نیمه کوهستانی": "semi_mountainous", "نیمه‌کوهستانی": "semi_mountainous",
    "صعب العبور": "impassable", "صعب‌العبور": "impassable", "کوهستانی": "impassable",
  };
  return map[s] ?? null;
}

export function PriceListsPage() {
  const { toast } = useToast();

  const [lists, setLists] = useState<PriceList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string>("");

  const [items, setItems] = useState<PriceListItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [showCreateList, setShowCreateList] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PriceListItem[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // v4.3.86: فیلترهای طبقه‌بندی
  const [fActivity, setFActivity] = useState("all");
  const [fMethod, setFMethod] = useState("all");
  const [fVoltage, setFVoltage] = useState("all");
  const [fMode, setFMode] = useState("all"); // all | items | coefficients

  const selectedList = lists.find(l => String(l.id) === selectedListId) || null;

  // بارگذاری فهرست‌ها
  useEffect(() => {
    const load = async () => {
      setListsLoading(true);
      try {
        const r = await apiClient.get<unknown>(API_ENDPOINTS.priceLists);
        const arr = asArray(r);
        setLists(arr);
        setSelectedListId(prev => prev || (arr.length ? String(arr[0].id) : ""));
      } catch (err) {
        console.error("خطا در بارگذاری فهرست‌ها:", err);
      } finally { setListsLoading(false); }
    };
    load();
  }, [refreshKey]);

  // بارگذاری اقلام فهرست انتخاب‌شده
  useEffect(() => {
    if (!selectedListId) { setItems([]); return; }
    const load = async () => {
      setItemsLoading(true);
      try {
        const r = await apiClient.get<unknown>(API_ENDPOINTS.priceListItems, { list_id: Number(selectedListId), page_size: 5000 });
        setItems(asArray(r).map(item => ({ ...item, contract_title: selectedList?.contract_title || null })));
      } catch (err) {
        console.error("خطا در بارگذاری اقلام:", err);
      } finally { setItemsLoading(false); }
    };
    load();
  }, [selectedListId, refreshKey, selectedList?.contract_title]);

  const isCoef = (it: PriceListItem) =>
    it.item_kind === "coefficient" || Number((it as any).is_coefficient) === 1;

  // فیلتر سمت کلاینت (علاوه بر فیلتر سروری)
  const filteredItems = useMemo(() => items.filter(it => {
    if (fMode === "items" && isCoef(it)) return false;
    if (fMode === "coefficients" && !isCoef(it)) return false;
    if (fActivity !== "all") {
      if (fActivity === "general" ? !!it.activity_type : (it.activity_type || "") !== fActivity) return false;
    }
    if (fMethod !== "all") {
      if (fMethod === "general" ? !!it.inspection_method : (it.inspection_method || "") !== fMethod) return false;
    }
    if (fVoltage !== "all") {
      if (fVoltage === "general" ? it.voltage_kv !== null && it.voltage_kv !== undefined : Number(it.voltage_kv) !== Number(fVoltage)) return false;
    }
    return true;
  }), [items, fActivity, fMethod, fVoltage, fMode]);

  const columns: DataTableColumn<PriceListItem>[] = [
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "شرح", sortable: true, filterable: true, wrap: true },
    {
      key: "specs", header: "مشخصات", sortable: false, filterable: false, align: "center",
      render: (row) => isCoef(row) ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">ضریب</Badge> : (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {row.voltage_kv ? <Badge className="nums-fa bg-violet-100 text-violet-700 hover:bg-violet-100">{Number(row.voltage_kv).toLocaleString("fa-IR")}kV</Badge> : null}
          {row.circuit_count ? <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{circuitLabel(row.circuit_count)}</Badge> : null}
          {row.bundle_count ? <Badge className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100">{Number(row.bundle_count).toLocaleString("fa-IR")} باندل</Badge> : null}
          {row.tower_structure ? <Badge className="bg-stone-100 text-stone-700 hover:bg-stone-100">{row.tower_structure}</Badge> : null}
          {!row.voltage_kv && !row.circuit_count && !row.bundle_count && !row.tower_structure
            ? <span className="text-xs text-slate-400">عمومی</span> : null}
        </div>
      ),
    },
    {
      key: "activity_type", header: "نوع فعالیت", sortable: true, filterable: true, align: "center",
      render: (row) => isCoef(row) ? <span className="text-xs text-slate-400">—</span> : (row.activity_type
        ? <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{ACTIVITY_LABELS[row.activity_type] || row.activity_type}</Badge>
        : <span className="text-xs text-slate-400">عمومی</span>),
    },
    {
      key: "inspection_method", header: "روش بازدید", sortable: true, filterable: true, align: "center",
      render: (row) => row.inspection_method
        ? <Badge className={row.inspection_method === "climbing" ? "bg-teal-100 text-teal-700 hover:bg-teal-100" : "bg-cyan-100 text-cyan-700 hover:bg-cyan-100"}>{METHOD_LABELS[row.inspection_method] || row.inspection_method}</Badge>
        : <span className="text-xs text-slate-400">—</span>,
    },
    { key: "unit", header: "واحد", sortable: true, filterable: true, align: "center" },
    { key: "unit_price", header: "بهای پایه (ریال)", sortable: true, type: "number" },
    { key: "unit_price_plain", header: "دشت", sortable: true, type: "number" },
    { key: "unit_price_hilly", header: "تپه‌ماهور", sortable: true, type: "number" },
    { key: "unit_price_semi_mountainous", header: "نیمه‌کوهستانی", sortable: true, type: "number" },
    { key: "unit_price_impassable", header: "صعب‌العبور", sortable: true, type: "number" },
    {
      key: "coefficient_percent", header: "درصد ضریب", sortable: true, align: "center",
      render: (row) => !isCoef(row) ? <span className="text-slate-300">—</span> : (
        <span className={`nums-fa font-bold ${Number(row.coefficient_percent) < 0 ? "text-red-600" : "text-green-700"}`}>
          {Number(row.coefficient_percent) > 0 ? "+" : ""}{Number(row.coefficient_percent).toLocaleString("fa-IR")}٪
        </span>
      ),
    },
    { key: "category", header: "دسته", sortable: true, filterable: true },
    { key: "status", header: "وضعیت", type: "status" },
  ];

  const handleDuplicate = async (row: PriceListItem) => {
    try {
      await apiClient.post(API_ENDPOINTS.priceListItems, {
        price_list_id: row.price_list_id, code: `${row.code}-COPY`, title: `${row.title} - کپی`,
        unit: row.unit, unit_price: row.unit_price, category: row.category,
        item_kind: isCoef(row) ? "coefficient" : "base",
        activity_type: row.activity_type ?? null, inspection_method: row.inspection_method ?? null,
        voltage_kv: row.voltage_kv ?? null, circuit_count: row.circuit_count ?? null, bundle_count: row.bundle_count ?? null,
        tower_structure: row.tower_structure ?? null, terrain_type: row.terrain_type ?? null,
        unit_price_plain: row.unit_price_plain ?? null, unit_price_hilly: row.unit_price_hilly ?? null,
        unit_price_semi_mountainous: row.unit_price_semi_mountainous ?? null, unit_price_impassable: row.unit_price_impassable ?? null,
        coefficient_percent: row.coefficient_percent ?? null,
      });
      setRefreshKey(k => k + 1);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    if (!pendingDelete || pendingDelete.length === 0) return;
    setDeleting(true);
    try {
      let ok = 0, fail = 0;
      for (const item of pendingDelete) {
        try {
          await apiClient.delete(`${API_ENDPOINTS.priceListItems}/${item.id}`);
          ok++;
        } catch { fail++; }
      }
      if (fail === 0) {
        toast({ title: "حذف انجام شد", description: `${ok.toLocaleString("fa-IR")} قلم از فهرست بها حذف شد` });
      } else {
        toast({ title: "حذف ناقص", description: `${ok.toLocaleString("fa-IR")} قلم حذف شد، ${fail.toLocaleString("fa-IR")} قلم خطا خورد`, variant: "destructive" });
      }
      setPendingDelete(null);
      setRefreshKey(k => k + 1);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* انتخاب فهرست + دکمه‌ها */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-1 min-w-0">
              <div className="w-full sm:w-80">
                <Select value={selectedListId} onValueChange={v => setSelectedListId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={listsLoading ? "در حال بارگذاری..." : "انتخاب فهرست بها..."} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {lists.map(l => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name} {l.version ? `(${l.version})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedList && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">نسخه: {selectedList.version || "—"}</Badge>
                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 nums-fa">تاریخ اجرا: {new Date(selectedList.effective_date).toLocaleDateString("fa-IR")}</Badge>
                  <Badge className={isActiveStatus(selectedList.status) ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                    {isActiveStatus(selectedList.status) ? "فعال" : "غیرفعال"}
                  </Badge>
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 nums-fa">{items.length.toLocaleString("fa-IR")} ردیف</Badge>
                  <Badge className="nums-fa bg-amber-100 text-amber-800 hover:bg-amber-100">
                    {items.filter(isCoef).length.toLocaleString("fa-IR")} ضریب
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" onClick={() => setShowCreateList(true)}>
                <Plus className="w-4 h-4 ml-2" />
                فهرست جدید
              </Button>
              <Button variant="outline" disabled={!selectedListId} onClick={() => { setShowImport(true); }}>
                <Upload className="w-4 h-4 ml-2" />
                ورود از اکسل
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="w-4 h-4 ml-2" />
                دانلود قالب
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={!selectedListId} onClick={() => { setEditingItem(null); setShowCreateItem(true); }}>
                <Plus className="w-4 h-4 ml-2" />
                قلم جدید
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* فیلترهای طبقه‌بندی */}
      {selectedListId ? (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0"><Filter className="w-3.5 h-3.5" />نمایش:</span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
                <Select value={fMode} onValueChange={setFMode}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه ردیف‌ها</SelectItem>
                    <SelectItem value="items">فقط اقلام</SelectItem>
                    <SelectItem value="coefficients">فقط ضرایب</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={fActivity} onValueChange={setFActivity}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه فعالیت‌ها</SelectItem>
                    <SelectItem value="inspection">بازدید</SelectItem>
                    <SelectItem value="repair">تعمیرات</SelectItem>
                    <SelectItem value="operation">عملیات</SelectItem>
                    <SelectItem value="general">عمومی (بدون نوع)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={fMethod} onValueChange={setFMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه روش‌ها</SelectItem>
                    <SelectItem value="climbing">بازدید صعودی</SelectItem>
                    <SelectItem value="patrol">بازدید پیمایشی</SelectItem>
                    <SelectItem value="general">بدون روش</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={fVoltage} onValueChange={setFVoltage}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه ولتاژها</SelectItem>
                    <SelectItem value="63">۶۳ kV</SelectItem>
                    <SelectItem value="132">۱۳۲ kV</SelectItem>
                    <SelectItem value="230">۲۳۰ kV</SelectItem>
                    <SelectItem value="400">۴۰۰ kV</SelectItem>
                    <SelectItem value="general">عمومی (بدون ولتاژ)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-end text-xs text-slate-500 nums-fa">
                  {filteredItems.length.toLocaleString("fa-IR")} از {items.length.toLocaleString("fa-IR")} ردیف
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* جدول اقلام */}
      {listsLoading ? (
        <Card><CardContent className="p-0">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        </CardContent></Card>
      ) : lists.length === 0 ? (
        <Card><CardContent className="p-0">
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <ListChecks className="w-12 h-12 mb-3 opacity-50" />
            <p>هنوز فهرست بهایی ثبت نشده — با دکمه «فهرست جدید» شروع کنید</p>
          </div>
        </CardContent></Card>
      ) : (
        <DataTable
          accessKey="price-lists"
          data={filteredItems}
          columns={columns}
          loading={itemsLoading}
          searchKeys={["contract_title", "code", "title", "category"]}
          title="اقلام فهرست بها"
          layoutKey="price-list-items"
          onAdd={() => { setEditingItem(null); setShowCreateItem(true); }}
          onRefresh={() => setRefreshKey(k => k + 1)}
          onDelete={(rows) => setPendingDelete(rows)}
          onEdit={(row) => { setEditingItem(row); setShowCreateItem(true); }}
          onDuplicate={handleDuplicate}
          onCopy={() => {}}
          onImport={() => setShowImport(true)}
          onLoadAllRows={async () => filteredItems}
          toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.priceListItems} entityName="قلم" onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus />}
        />
      )}

      <CreatePriceListDialog
        open={showCreateList}
        onClose={() => setShowCreateList(false)}
        onCreated={() => { setShowCreateList(false); setRefreshKey(k => k + 1); }}
      />

      <PriceListItemDialog
        open={showCreateItem}
        priceListId={selectedListId ? Number(selectedListId) : null}
        editing={editingItem}
        onClose={() => { setShowCreateItem(false); setEditingItem(null); }}
        onSaved={() => { setShowCreateItem(false); setEditingItem(null); setRefreshKey(k => k + 1); }}
      />

      <ImportPriceListDialog
        open={showImport}
        priceListId={selectedListId ? Number(selectedListId) : null}
        existingCount={items.length}
        onClose={() => setShowImport(false)}
        onImported={() => { setShowImport(false); setRefreshKey(k => k + 1); }}
      />

      {/* تأیید حذف اقلام */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف قلم(های) فهرست بها</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {pendingDelete && pendingDelete.length === 1
                ? `قلم «${pendingDelete[0].title}» به‌طور کامل حذف می‌شود. این عمل قابل بازگشت نیست.`
                : `${(pendingDelete?.length ?? 0).toLocaleString("fa-IR")} قلم انتخاب‌شده به‌طور کامل حذف می‌شوند. این عمل قابل بازگشت نیست.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse sm:flex-row-reverse">
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {deleting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال حذف...</> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── دیالوگ ایجاد فهرست بها ───
function CreatePriceListDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", version: "", effective_date: "", contract_id: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("نام فهرست الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.post(API_ENDPOINTS.priceLists, {
        name: form.name.trim(),
        version: form.version.trim() || null,
        effective_date: form.effective_date || undefined,
        contract_id: form.contract_id ? Number(form.contract_id) : null,
      });
      setForm({ name: "", version: "", effective_date: "", contract_id: "" });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد فهرست");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">ثبت فهرست بها جدید</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <div className="space-y-2">
            <Label className="text-right block">نام فهرست (اجباری)</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: فهرست بها ۱۴۰۵" className="text-right" autoFocus />
          </div>
          <div className="space-y-2">
            <Label className="text-right block">قرارداد</Label>
            <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">نسخه</Label>
              <Input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} placeholder="1405.1" className="text-right" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">تاریخ اجرا</Label>
              <JalaliDatePicker value={form.effective_date} onChange={v => setForm({ ...form, effective_date: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : "ایجاد فهرست"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── دیالوگ ثبت/ویرایش قلم فهرست بها (v4.3.86 — طبقه‌بندی کامل) ───
const emptyItemForm = {
  code: "", title: "", unit: "دکل", category: "بازدید", unit_price: "",
  voltage: "general", circuits: "general", bundles: "general",
  activity: "general", method: "general", structure: "general",
  p_plain: "", p_hilly: "", p_semi: "", p_impassable: "",
  isCoefficient: false, coefPercent: "",
};

function PriceListItemDialog({ open, priceListId, editing, onClose, onSaved }: {
  open: boolean; priceListId: number | null; editing: PriceListItem | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyItemForm });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        code: editing.code || "",
        title: editing.title || "",
        unit: editing.unit || "",
        category: editing.category || "",
        unit_price: editing.unit_price != null ? String(editing.unit_price) : "",
        voltage: editing.voltage_kv != null ? String(editing.voltage_kv) : "general",
        circuits: editing.circuit_count != null ? String(editing.circuit_count) : "general",
        bundles: editing.bundle_count != null ? String(editing.bundle_count) : "general",
        activity: editing.activity_type || "general",
        method: editing.inspection_method || "general",
        structure: editing.tower_structure || "general",
        p_plain: editing.unit_price_plain != null ? String(editing.unit_price_plain) : "",
        p_hilly: editing.unit_price_hilly != null ? String(editing.unit_price_hilly) : "",
        p_semi: editing.unit_price_semi_mountainous != null ? String(editing.unit_price_semi_mountainous) : "",
        p_impassable: editing.unit_price_impassable != null ? String(editing.unit_price_impassable) : "",
        isCoefficient: editing.item_kind === "coefficient" || Number((editing as any).is_coefficient) === 1,
        coefPercent: editing.coefficient_percent != null ? String(editing.coefficient_percent) : "",
      });
    } else {
      setForm({ ...emptyItemForm });
    }
  }, [open, editing]);

  const isCoef = form.isCoefficient;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("شرح قلم الزامی است"); return; }
    if (!priceListId) { setError("ابتدا یک فهرست بها انتخاب کنید"); return; }
    if (isCoef && !form.coefPercent.trim()) { setError("درصد ضریب را وارد کنید (مثبت = افزایش، منفی = کاهش)"); return; }
    setSubmitting(true); setError(null);
    const payload: Record<string, unknown> = {
      price_list_id: priceListId,
      code: form.code.trim() || undefined,
      title: form.title.trim(),
      unit: form.unit.trim() || (isCoef ? "ضریب" : "دکل"),
      unit_price: parseExcelNumber(form.unit_price) ?? (isCoef ? 0 : 0),
      category: form.category.trim() || (isCoef ? "ضریب" : "عملیات"),
      item_kind: isCoef ? "coefficient" : "base",
      activity_type: form.activity === "general" ? null : form.activity,
      inspection_method: form.method === "general" ? null : form.method,
      voltage_kv: form.voltage === "general" ? null : Number(form.voltage),
      circuit_count: form.circuits === "general" ? null : Number(form.circuits),
      bundle_count: form.bundles === "general" ? null : Number(form.bundles),
      tower_structure: form.structure === "general" ? null : form.structure,
      terrain_type: null,
      unit_price_plain: parseExcelNumber(form.p_plain),
      unit_price_hilly: parseExcelNumber(form.p_hilly),
      unit_price_semi_mountainous: parseExcelNumber(form.p_semi),
      unit_price_impassable: parseExcelNumber(form.p_impassable),
      coefficient_percent: isCoef ? (parseExcelNumber(form.coefPercent) ?? 0) : null,
    };
    try {
      if (editing) {
        await apiClient.put(`${API_ENDPOINTS.priceListItems}/${editing.id}`, payload);
      } else {
        await apiClient.post(API_ENDPOINTS.priceListItems, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره قلم");
    } finally { setSubmitting(false); }
  };

  const priceField = (key: "p_plain" | "p_hilly" | "p_semi" | "p_impassable", label: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">{label}</Label>
      <Input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value.replace(/[^0-9.\-]/g, "") })} dir="ltr" className="text-left" placeholder="—" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            {editing ? `ویرایش قلم فهرست بها: ${editing.code}` : "ثبت قلم جدید فهرست بها"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}

          {/* ردیف ضریب */}
          <div className="flex items-center justify-between rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3">
            <div>
              <Label className="text-sm font-medium text-amber-900 dark:text-amber-200">این ردیف «ضریب کاهش/افزایش بها» است</Label>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">ضرایب در فهرست رسمی کد ندارند؛ دامنه اعمال با فیلدهای زیر مشخص می‌شود (تیر چوبی، نوع فعالیت و...)</p>
            </div>
            <Switch checked={isCoef} onCheckedChange={v => setForm({ ...form, isCoefficient: v })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">شرح قلم (اجباری)</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={isCoef ? "مثلاً: کاهش بها — دکل تیر چوبی" : "مثلاً: بازدید صعودی دکل ۶۳ کیلوولت — تک‌مداره تک‌باندل"} className="text-right" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">کد (خالی = خودکار)</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="SZ-63-2C-1B" dir="ltr" className="text-left" disabled={isCoef && !!editing ? false : false} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">{isCoef ? "درصد ضریب (−کاهش / +افزایش)" : "واحد"}</Label>
              {isCoef ? (
                <Input value={form.coefPercent} onChange={e => setForm({ ...form, coefPercent: e.target.value.replace(/[^0-9.\-+]/g, "") })} dir="ltr" className="text-left" placeholder="-15" />
              ) : (
                <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="text-right" />
              )}
            </div>
          </div>

          {isCoef ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">دامنه: نوع فعالیت</Label>
                <Select value={form.activity} onValueChange={v => setForm({ ...form, activity: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">همه فعالیت‌ها</SelectItem>
                    <SelectItem value="inspection">بازدید</SelectItem>
                    <SelectItem value="repair">تعمیرات</SelectItem>
                    <SelectItem value="operation">عملیات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">دامنه: نوع سازه دکل</Label>
                <Select value={form.structure} onValueChange={v => setForm({ ...form, structure: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">همه سازه‌ها</SelectItem>
                    {STRUCTURES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">دامنه: سطح ولتاژ</Label>
                <Select value={form.voltage} onValueChange={v => setForm({ ...form, voltage: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">همه سطوح</SelectItem>
                    <SelectItem value="63">۶۳ kV</SelectItem>
                    <SelectItem value="132">۱۳۲ kV</SelectItem>
                    <SelectItem value="230">۲۳۰ kV</SelectItem>
                    <SelectItem value="400">۴۰۰ kV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">سطح ولتاژ</Label>
                  <Select value={form.voltage} onValueChange={v => setForm({ ...form, voltage: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">عمومی</SelectItem>
                      <SelectItem value="63">۶۳ kV</SelectItem>
                      <SelectItem value="132">۱۳۲ kV</SelectItem>
                      <SelectItem value="230">۲۳۰ kV</SelectItem>
                      <SelectItem value="400">۴۰۰ kV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">تعداد مدار</Label>
                  <Select value={form.circuits} onValueChange={v => setForm({ ...form, circuits: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">عمومی</SelectItem>
                      <SelectItem value="1">تک‌مداره</SelectItem>
                      <SelectItem value="2">دو مداره</SelectItem>
                      <SelectItem value="4">چهارمداره</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">تعداد باندل</Label>
                  <Select value={form.bundles} onValueChange={v => setForm({ ...form, bundles: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">عمومی</SelectItem>
                      <SelectItem value="1">تک‌باندل</SelectItem>
                      <SelectItem value="2">دو باندل</SelectItem>
                      <SelectItem value="3">سه‌باندل</SelectItem>
                      <SelectItem value="4">چهار باندل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">نوع فعالیت</Label>
                  <Select value={form.activity} onValueChange={v => setForm({ ...form, activity: v, ...(v !== "inspection" ? { method: "general" } : {}) })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">عمومی</SelectItem>
                      <SelectItem value="inspection">بازدید</SelectItem>
                      <SelectItem value="repair">تعمیرات</SelectItem>
                      <SelectItem value="operation">عملیات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">روش بازدید</Label>
                  <Select value={form.method} onValueChange={v => setForm({ ...form, method: v })} disabled={form.activity !== "inspection"}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">هر روش</SelectItem>
                      <SelectItem value="climbing">صعودی</SelectItem>
                      <SelectItem value="patrol">پیمایشی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">نوع سازه دکل</Label>
                  <Select value={form.structure} onValueChange={v => setForm({ ...form, structure: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">همه سازه‌ها</SelectItem>
                      {STRUCTURES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">دسته</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["بازدید", "تعمیرات", "عملیات", "مواد", "حمل‌ونقل"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">واحد</Label>
                  <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="text-right" />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                <p className="text-xs text-slate-500 text-right">
                  بهای واحد (ریال) — بهای پایه برای حالت عمومی؛ چهار قیمت زمین هنگام صدور صورت‌وضعیت به‌طور خودکار بر اساس نوع زمین هر دکل انتخاب می‌شود (خالی = استفاده از بهای پایه)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">بهای پایه</Label>
                    <Input value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value.replace(/[^0-9.\-]/g, "") })} dir="ltr" className="text-left" />
                  </div>
                  {priceField("p_plain", "دشت")}
                  {priceField("p_hilly", "تپه‌ماهور")}
                  {priceField("p_semi", "نیمه‌کوهستانی")}
                  {priceField("p_impassable", "صعب‌العبور")}
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ذخیره...</> : (editing ? "اعمال ویرایش" : "افزودن قلم")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── ایمپورت اکسل (شیت اقلام + شیت ضرایب) ───
const H = (row: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) {
    // تطبیق دقیق
    if (row[k] !== undefined && row[k] !== "") return row[k];
    // تطبیق با فاصله‌های نرمال‌شده (نیم‌فاصله → فاصله)
    const nk = k.replace(/[‌\u200c]/g, " ").replace(/\s+/g, " ").trim();
    for (const rk of Object.keys(row)) {
      if (rk.replace(/[‌\u200c]/g, " ").replace(/\s+/g, " ").trim() === nk && row[rk] !== "" && row[rk] !== undefined) return row[rk];
    }
  }
  return undefined;
};

async function parseWorkbook(file: File): Promise<{ items: any[]; coefficients: any[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const items: any[] = [];
  const coefficients: any[] = [];

  for (const sheetName of wb.SheetNames) {
    // «ضرایب» (جمع) شامل «ضریب» (مفرد) به‌عنوان زیررشته نیست — هر دو بررسی می‌شوند
    const isCoefSheet = sheetName.includes("ضرایب") || sheetName.includes("ضریب") || sheetName.toLowerCase().includes("coef");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
    for (const row of rows) {
      if (isCoefSheet) {
        const title = H(row, "عنوان ضریب", "عنوان", "title");
        const percent = parseExcelNumber(H(row, "درصد (− کاهش / + افزایش)", "درصد", "percent", "coefficient_percent"));
        if (!title || percent === null) continue;
        coefficients.push({
          title: String(title),
          unit_price: 0,
          category: String(H(row, "دسته", "category") || "ضریب"),
          unit: "ضریب",
          item_kind: "coefficient",
          voltage_kv: parseExcelNumber(H(row, "سطح ولتاژ (اختیاری)", "سطح ولتاژ", "voltage_kv")),
          activity_type: normalizeActivity(H(row, "نوع فعالیت (اختیاری)", "نوع فعالیت", "activity_type")),
          inspection_method: normalizeMethod(H(row, "روش بازدید (اختیاری)", "روش بازدید", "inspection_method")),
          tower_structure: (H(row, "نوع سازه دکل (اختیاری)", "نوع سازه دکل", "tower_structure") || null),
          coefficient_percent: percent,
        });
      } else {
        const title = H(row, "شرح", "title", "شرح کار", "شرح فعالیت");
        const hasAnyPrice = [H(row, "بهای پایه (ریال)", "بهای واحد (ریال)", "بهای واحد", "unit_price"),
          H(row, "بهای دشت (ریال)", "دشت", "unit_price_plain"),
          H(row, "بهای تپه‌ماهور (ریال)", "تپه‌ماهور", "unit_price_hilly"),
          H(row, "بهای نیمه‌کوهستانی (ریال)", "نیمه‌کوهستانی", "unit_price_semi_mountainous"),
          H(row, "بهای صعب‌العبور (ریال)", "صعب‌العبور", "unit_price_impassable")].some(v => parseExcelNumber(v) !== null);
        if (!title || (!hasAnyPrice && !String(title).includes("ضریب"))) continue;
        const isCoefRow = String(H(row, "نوع فعالیت", "activity_type") || "").includes("ضریب") || String(title).startsWith("ضریب") || String(H(row, "دسته", "category") || "").includes("ضریب");
        if (isCoefRow) {
          const percent = parseExcelNumber(H(row, "درصد", "درصد ضریب", "coefficient_percent"));
          if (percent !== null) {
            coefficients.push({
              title: String(title), unit_price: 0, category: "ضریب", unit: "ضریب", item_kind: "coefficient",
              voltage_kv: parseExcelNumber(H(row, "سطح ولتاژ (kV)", "سطح ولتاژ", "voltage_kv")),
              activity_type: normalizeActivity(H(row, "نوع فعالیت", "activity_type")),
              inspection_method: normalizeMethod(H(row, "روش بازدید", "inspection_method")),
              tower_structure: (H(row, "نوع سازه دکل", "tower_structure") || null),
              coefficient_percent: percent,
            });
            continue;
          }
        }
        // سازگاری: اگر «نوع فعالیت» صعودی/پیمایشی بود (قالب قدیمی)، به بازدید+روش تبدیل می‌شود
        const rawActivity = H(row, "نوع فعالیت", "activity_type");
        let activity = normalizeActivity(rawActivity);
        let method = normalizeMethod(H(row, "روش بازدید", "inspection_method"));
        if (!activity) {
          const legacy = normalizeMethod(rawActivity);
          if (legacy) { activity = "inspection"; method = method ?? legacy; }
        }
        if (activity && activity !== "inspection") method = null;
        items.push({
          code: String(H(row, "کد", "code") || "") || undefined,
          title: String(title),
          unit: String(H(row, "واحد", "unit") || "دکل"),
          category: String(H(row, "دسته", "category") || "عملیات"),
          unit_price: parseExcelNumber(H(row, "بهای پایه (ریال)", "بهای واحد (ریال)", "بهای واحد", "unit_price")) ?? 0,
          item_kind: "base",
          activity_type: activity,
          inspection_method: method,
          voltage_kv: parseExcelNumber(H(row, "سطح ولتاژ (kV)", "سطح ولتاژ", "ولتاژ", "voltage_kv")),
          circuit_count: parseExcelNumber(H(row, "تعداد مدار", "circuit_count")),
          bundle_count: parseExcelNumber(H(row, "تعداد باندل", "bundle_count")),
          tower_structure: (H(row, "نوع سازه دکل", "سازه دکل", "tower_structure") || null),
          terrain_type: normalizeTerrain(H(row, "نوع زمین", "terrain_type")),
          unit_price_plain: parseExcelNumber(H(row, "بهای دشت (ریال)", "دشت", "unit_price_plain")),
          unit_price_hilly: parseExcelNumber(H(row, "بهای تپه‌ماهور (ریال)", "تپه‌ماهور", "unit_price_hilly")),
          unit_price_semi_mountainous: parseExcelNumber(H(row, "بهای نیمه‌کوهستانی (ریال)", "نیمه‌کوهستانی", "unit_price_semi_mountainous")),
          unit_price_impassable: parseExcelNumber(H(row, "بهای صعب‌العبور (ریال)", "صعب‌العبور", "unit_price_impassable")),
          coefficient_percent: null,
        });
      }
    }
  }
  return { items, coefficients };
}

function ImportPriceListDialog({ open, priceListId, existingCount, onClose, onImported }: {
  open: boolean; priceListId: number | null; existingCount: number; onClose: () => void; onImported: () => void;
}) {
  const { toast } = useToast();
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ items: any[]; coefficients: any[] } | null>(null);
  const [fileName, setFileName] = useState("");
  const [replace, setReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (!open) { setParsed(null); setFileName(""); setError(null); setReplace(false); } }, [open]);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true); setError(null); setParsed(null);
    try {
      const result = await parseWorkbook(file);
      if (result.items.length === 0 && result.coefficients.length === 0) {
        setError("هیچ ردیف معتبری در فایل پیدا نشد.\n\nشیت‌ها باید «اقلام» و «ضرایب» نام داشته باشند یا عنوان ستون‌ها مطابق قالب استاندارد باشد. از دکمه «دانلود قالب» نمونه بگیرید.");
      } else {
        setParsed(result);
        setFileName(file.name);
      }
    } catch (err) {
      console.error(err);
      setError("خواندن فایل اکسل ناموفق بود — فقط فایل xlsx / xls / csv پذیرفته می‌شود");
    } finally { setParsing(false); }
  };

  const doImport = async () => {
    if (!parsed || !priceListId) return;
    setImporting(true); setError(null);
    try {
      const all = [...parsed.items, ...parsed.coefficients];
      const r = await apiClient.post<any>(API_ENDPOINTS.priceListImport, { price_list_id: priceListId, items: all, replace });
      const d = (r as any)?.data || r || {};
      const nItems = Number(d.imported_items ?? parsed.items.length);
      const nCoefs = Number(d.imported_coefficients ?? parsed.coefficients.length);
      onImported();
      setTimeout(() => {
        toast({ title: "ایمپورت فهرست بها انجام شد", description: `${nItems.toLocaleString("fa-IR")} قلم و ${nCoefs.toLocaleString("fa-IR")} ضریب ثبت شد${replace ? " (اقلام قبلی حذف شدند)" : ""}` });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایمپورت");
    } finally { setImporting(false); }
  };

  // توجه: toast داخل همین کامپوننت گرفته می‌شود تا پیام نتیجهٔ ایمپورت نمایش داده شود
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" />
            ورود فهرست بها از اکسل
          </DialogTitle>
        </DialogHeader>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pickFile} />
        <div className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right whitespace-pre-line">{error}</div>}

          {!parsed ? (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
              {parsing ? <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" /> : (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-3">فایل اکسل فهرست بها را انتخاب کنید</p>
                  <p className="text-xs text-slate-400 mb-4">
                    هر دو شیت «اقلام» و «ضرایب» به‌صورت خودکار خوانده می‌شود — عنوان ستون‌ها می‌تواند فارسی (قالب استاندارد) یا انگلیسی باشد
                  </p>
                  <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={parsing}>
                    <Upload className="w-4 h-4 ml-2" />
                    انتخاب فایل اکسل
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                <p className="text-sm text-slate-700 dark:text-slate-200 text-right"><span className="font-medium">فایل:</span> {fileName}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 nums-fa">{parsed.items.length.toLocaleString("fa-IR")} قلم</Badge>
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 nums-fa">{parsed.coefficients.length.toLocaleString("fa-IR")} ضریب</Badge>
                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 nums-fa">{existingCount.toLocaleString("fa-IR")} ردیف موجود در فهرست</Badge>
                </div>
                {parsed.items.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded border border-slate-100 dark:border-slate-800 mt-1">
                    <table className="w-full text-xs">
                      <tbody>
                        {parsed.items.slice(0, 8).map((it, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                            <td className="px-2 py-1.5 text-left nums-fa text-slate-400" dir="ltr">{it.code || "—"}</td>
                            <td className="px-2 py-1.5 text-right">{it.title}</td>
                            <td className="px-2 py-1.5 text-left nums-fa text-slate-500 whitespace-nowrap" dir="ltr">{(it.unit_price ?? 0).toLocaleString("fa-IR")}</td>
                          </tr>
                        ))}
                        {parsed.items.length > 8 ? <tr><td colSpan={3} className="px-2 py-1.5 text-center text-slate-400 nums-fa">و {(parsed.items.length - 8).toLocaleString("fa-IR")} ردیف دیگر...</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-3">
                <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="w-4 h-4" />
                <span className="text-red-700 dark:text-red-300">پاک کردن ردیف‌های موجود این فهرست قبل از ورود ({existingCount.toLocaleString("fa-IR")} ردیف)</span>
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setParsed(null); setFileName(""); }}>فایل دیگر</Button>
                <Button type="button" onClick={doImport} disabled={importing} className="bg-indigo-600 hover:bg-indigo-700">
                  {importing ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ورود...</> : `ورود ${(parsed.items.length + parsed.coefficients.length).toLocaleString("fa-IR")} ردیف`}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── دانلود قالب استاندارد (سمت کلاینت — دو شیت + راهنما) ───
async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const itemHeaders = ["ردیف", "کد", "شرح", "واحد", "دسته", "سطح ولتاژ (kV)", "تعداد مدار", "تعداد باندل", "نوع فعالیت", "روش بازدید", "نوع سازه دکل", "بهای پایه (ریال)", "بهای دشت (ریال)", "بهای تپه‌ماهور (ریال)", "بهای نیمه‌کوهستانی (ریال)", "بهای صعب‌العبور (ریال)"];
  const itemRows = [
    [1, "SZ-63-2C-1B", "بازدید صعودی دکل ۶۳ کیلوولت — دو مداره تک‌باندل", "دکل", "بازدید", 63, 2, 1, "بازدید", "صعودی", "", 2700000, 2700000, 3100500, 3645000, 4320000],
    [2, "PM-230-2C-1B", "بازدید پیمایشی دکل ۲۳۰ کیلوولت — دو مداره تک‌باندل", "دکل", "بازدید", 230, 2, 1, "بازدید", "پیمایشی", "", 1606500, 1606500, 1847475, 2168775, 2570400],
    [3, "OP-001", "تعویض مقره پلیمری روی دکل", "عدد", "تعمیرات", "", "", "", "تعمیرات", "", "", 2500000, "", "", "", ""],
    [4, "SZ-400-2C-3B", "بازدید صعودی دکل ۴۰۰ کیلوولت — دو مداره سه‌باندل", "دکل", "بازدید", 400, 2, 3, "بازدید", "صعودی", "مشبک فلزی", 8429400, 8429400, 9693810, 11379690, 13487040],
  ];
  const coefHeaders = ["عنوان ضریب", "درصد (− کاهش / + افزایش)", "دسته", "نوع فعالیت (اختیاری)", "روش بازدید (اختیاری)", "نوع سازه دکل (اختیاری)", "سطح ولتاژ (اختیاری)", "توضیح"];
  const coefRows = [
    ["کاهش بها — دکل تیر چوبی", -15, "ضریب", "", "", "تیر چوبی", "", "روی همه اقلام بازدید/تعمیرات دکل تیر چوبی اعمال می‌شود"],
    ["کاهش بها — حجم کار بیش از ۵۰ دکل", -5, "ضریب", "بازدید", "صعودی", "", "", "فقط روی بازدید صعودی اعمال می‌شود"],
    ["افزایش بها — شرایط جوی نامساعد", 10, "ضریب", "", "", "", "", "نمونه ضریب افزایش"],
  ];
  const guideRows = [
    ["راهنمای قالب استاندارد فهرست بها — Powerline Web نسخه ۴.۳.۸۶"],
    [""],
    ["۱) شیت «اقلام»: ستون الزامی فقط «شرح» و حداقل یکی از ستون‌های قیمت است؛ کدِ خالی به‌صورت خودکار ساخته می‌شود."],
    ["۲) طبقه‌بندی: سطح ولتاژ (63/132/230/400)، تعداد مدار (1/2/4)، تعداد باندل (1 تا 4)، نوع فعالیت (بازدید/تعمیرات/عملیات)، روش بازدید (صعودی/پیمایشی — فقط برای اقلام بازدید)، نوع سازه دکل (مشبک فلزی/تیر چوبی/تلسکوپی فلزی). خالی = عمومی (همه موارد)."],
    ["۳) قیمت‌ها: اگر ستون‌های چهارگانه زمین خالی باشند «بهای پایه» استفاده می‌شود؛ هنگام صدور صورت‌وضعیت قیمت بر اساس نوع زمین هر دکل انتخاب می‌شود."],
    ["۴) شیت «ضرایب»: درصد مثبت = افزایش بها، منفی = کاهش بها. دامنه اعمال با ستون‌های اختیاری (نوع فعالیت/نوع سازه/ولتاژ) محدود می‌شود؛ خالی = همه اقلام."],
    ["۵) نمونه: ضریب «تیر چوبی» فقط با پر کردن ستون «نوع سازه دکل (اختیاری)» با «تیر چوبی» روی دکل‌های چوبی اعمال می‌شود."],
    ["۶) در برنامه: فهرست ها ← انتخاب فهرست ← «ورود از اکسل» ← همین فایل. هر دو شیت خودکار خوانده می‌شود."],
  ];

  const wb = XLSX.utils.book_new();
  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
  const wsCoefs = XLSX.utils.aoa_to_sheet([coefHeaders, ...coefRows]);
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  // ستون‌ها RTL نمی‌شوند در xlsx community — عرض ستون‌ها را مناسب می‌گذاریم
  wsItems["!cols"] = [{ wch: 5 }, { wch: 14 }, { wch: 48 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 17 }];
  wsCoefs["!cols"] = [{ wch: 44 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 46 }];
  wsGuide["!cols"] = [{ wch: 118 }];
  XLSX.utils.book_append_sheet(wb, wsItems, "اقلام");
  XLSX.utils.book_append_sheet(wb, wsCoefs, "ضرایب");
  XLSX.utils.book_append_sheet(wb, wsGuide, "راهنما");
  XLSX.writeFile(wb, "فهرست_بها_قالب_استاندارد.xlsx");
}

export { fmt as formatPrice };

