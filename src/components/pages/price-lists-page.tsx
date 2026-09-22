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
import { ContractSelect } from "@/components/contract-select";
import {
  normalizeFa, parseBaseClassification, detectCoefficientKind, isCoefficientTitle,
  processStandardBoqRows, parseExcelNumber, chapterOf, type ParsedBoqItem,
  CHAPTER_LABELS, ACTIVITY_LABELS, METHOD_LABELS, TERRAIN_GROUP_LABELS, COEFFICIENT_KIND_LABELS,
  circuitLabel, bundleLabel,
} from "@/lib/boq-parser";

/**
 * صفحه فهرست بها — v4.3.87 (فهرست بهای کشوری)
 *
 * فرمت استاندارد کشوری: شماره ردیف فصل | شرح | واحد | بهای واحد
 *   • ردیف‌های اصلی کد ملی دارند (20101، 70103، 80101، 100101 …) و فصل از کد
 *     استخراج می‌شود (۲ نگهداری / ۷ کشیک و فراخوان / ۸ پهبادی / ۱۰ تعمیرات).
 *   • ردیف‌های «کاهش/اضافه بها» کد ملی ندارند → کد اختصاصی *<کد والد>-<n>
 *     می‌گیرند و زیر ردیف اصلی خود نمایش داده می‌شوند.
 *   • طبقه‌بندی (ولتاژ/مدار/باندل/روش بازدید/نوع زمین) به‌صورت خودکار از متن
 *     شرح استخراج می‌شود — «وقتی اسمی از باندل نیست یعنی تک‌باندل».
 */

interface PriceList {
  id: number; name: string; version: string | null; effective_date: string;
  is_active?: number | boolean; status?: string | number; contract_id?: number | null;
  contract_title?: string | null; created_at?: string;
}

interface PriceListItem {
  id: number; price_list_id: number; code: string; title: string;
  unit: string | null; unit_price: number; category: string | null;
  item_kind?: "base" | "coefficient" | string | null;
  chapter?: number | null; parent_code?: string | null;
  coefficient_kind?: string | null; sort_order?: number | null;
  activity_type?: string | null; inspection_method?: string | null;
  voltage_kv?: number | null; circuit_count?: number | null;
  bundle_count?: number | null; terrain_type?: string | null;
  is_active?: number | boolean; status?: string | number;
}

const asArray = (r: unknown): any[] => (Array.isArray(r) ? r : ((r as any)?.data || []));
const fmt = (v: unknown) => (v === null || v === undefined || v === "") ? "—" : Number(v).toLocaleString("fa-IR");

const isCoef = (it: PriceListItem) => it.item_kind === "coefficient";
const isPrivateCode = (code: string) => code.trim().startsWith("*");

const CHAPTER_BADGES: Record<string, string> = {
  "2": "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  "7": "bg-orange-100 text-orange-700 hover:bg-orange-100",
  "8": "bg-sky-100 text-sky-700 hover:bg-sky-100",
  "10": "bg-rose-100 text-rose-700 hover:bg-rose-100",
};

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

  // فیلترهای نمایش
  const [fChapter, setFChapter] = useState("all");
  const [fMode, setFMode] = useState("all"); // all | base | coefficient
  const [fActivity, setFActivity] = useState("all");
  const [fMethod, setFMethod] = useState("all");
  const [fVoltage, setFVoltage] = useState("all");
  const [fTerrain, setFTerrain] = useState("all");
  const [fSearch, setFSearch] = useState("");

  const selectedList = lists.find(l => String(l.id) === selectedListId) || null;

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

  useEffect(() => {
    if (!selectedListId) { setItems([]); return; }
    const load = async () => {
      setItemsLoading(true);
      try {
        const r = await apiClient.get<unknown>(API_ENDPOINTS.priceListItems, { list_id: Number(selectedListId), page_size: 5000 });
        setItems(asArray(r));
      } catch (err) {
        console.error("خطا در بارگذاری اقلام:", err);
      } finally { setItemsLoading(false); }
    };
    load();
  }, [selectedListId, refreshKey]);

  // فیلتر سمت کلاینت (علاوه بر فیلتر سروری)
  const filteredItems = useMemo(() => {
    const q = normalizeFa(fSearch).toLowerCase();
    return items.filter(it => {
      if (fMode === "base" && isCoef(it)) return false;
      if (fMode === "coefficient" && !isCoef(it)) return false;
      if (fChapter !== "all") {
        const ch = it.chapter ?? null;
        if (fChapter === "none" ? ch !== null : String(ch) !== fChapter) return false;
      }
      if (fActivity !== "all") {
        if (fActivity === "general" ? !!it.activity_type : (it.activity_type || "") !== fActivity) return false;
      }
      if (fMethod !== "all") {
        if (fMethod === "general" ? !!it.inspection_method : (it.inspection_method || "") !== fMethod) return false;
      }
      if (fVoltage !== "all") {
        if (fVoltage === "general" ? it.voltage_kv !== null && it.voltage_kv !== undefined : Number(it.voltage_kv) !== Number(fVoltage)) return false;
      }
      if (fTerrain !== "all") {
        if (fTerrain === "general" ? !!it.terrain_type : (it.terrain_type || "") !== fTerrain) return false;
      }
      if (q) {
        const hay = normalizeFa(`${it.code} ${it.title} ${it.parent_code || ""} ${it.category || ""}`).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, fChapter, fMode, fActivity, fMethod, fVoltage, fTerrain, fSearch]);

  const stats = useMemo(() => ({
    total: items.length,
    base: items.filter(i => !isCoef(i)).length,
    coef: items.filter(i => isCoef(i)).length,
    zeroPrice: items.filter(i => !Number(i.unit_price)).length,
  }), [items]);

  const requestDelete = async (list: PriceListItem[]) => {
    setDeleting(true);
    try {
      for (const it of list) {
        await apiClient.delete(`${API_ENDPOINTS.priceListItems}/${it.id}`);
      }
      toast({ title: "حذف انجام شد", description: `${list.length.toLocaleString("fa-IR")} ردیف حذف شد${list.some(i => !isCoef(i)) ? " (ضرایب فرزند ردیف‌های اصلی هم حذف شدند)" : ""}.` });
      setPendingDelete(null);
      setRefreshKey(k => k + 1);
    } catch (err: unknown) {
      toast({ title: "حذف ناموفق", description: (err as Error)?.message || "خطا در حذف ردیف", variant: "destructive" });
    } finally { setDeleting(false); }
  };

  // کپی ردیف به‌عنوان پایه رکورد جدید (بدون ذخیره — فرم باز می‌شود)
  const handleDuplicate = (row: PriceListItem) => {
    setEditingItem({ ...row, id: -1, code: isCoef(row) ? "" : row.code, title: `${row.title} (کپی)` });
    setShowCreateItem(true);
  };

  const columns: DataTableColumn<PriceListItem>[] = [
    {
      key: "code", header: "کد ردیف", width: "8%", sortable: true, align: "left",
      render: (row) => (
        <span className="flex items-center gap-1.5" dir="ltr">
          <span className="nums-fa font-mono text-xs">{row.code}</span>
          {isPrivateCode(row.code) ? (
            <Badge className="px-1.5 py-0 text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">اختصاصی</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "title", header: "شرح ردیف", sortable: true, wrap: true,
      render: (row) => isCoef(row) ? (
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 text-slate-400" aria-hidden>↳</span>
          <span className="text-slate-600 dark:text-slate-300">{row.title}</span>
          {row.parent_code ? <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-slate-500" dir="ltr">{row.parent_code}</Badge> : null}
        </div>
      ) : (
        <span className="text-slate-800 dark:text-slate-100">{row.title}</span>
      ),
    },
    {
      key: "chapter", header: "فصل", sortable: true, align: "center", width: "8%",
      render: (row) => {
        const ch = row.chapter ?? null;
        if (!ch) return <span className="text-xs text-slate-400">—</span>;
        return (
          <Badge className={`text-[11px] ${CHAPTER_BADGES[String(ch)] || ""}`}>
            {CHAPTER_LABELS[ch]?.replace("فصل ", "") ?? ch}
          </Badge>
        );
      },
    },
    {
      key: "item_kind", header: "نوع", align: "center", width: "7%",
      render: (row) => isCoef(row)
        ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">ضریب</Badge>
        : <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">اصلی</Badge>,
    },
    {
      key: "specs", header: "مشخصات", sortable: false, align: "center", width: "13%",
      render: (row) => {
        if (isCoef(row)) {
          return row.coefficient_kind ? (
            <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300">
              {COEFFICIENT_KIND_LABELS[row.coefficient_kind] || row.coefficient_kind}
            </Badge>
          ) : <span className="text-xs text-slate-400">—</span>;
        }
        const parts: React.ReactNode[] = [];
        if (row.activity_type) parts.push(<Badge key="a" className="bg-teal-50 text-teal-700 hover:bg-teal-50">{ACTIVITY_LABELS[row.activity_type] || row.activity_type}</Badge>);
        if (row.inspection_method) parts.push(<Badge key="m" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">{METHOD_LABELS[row.inspection_method] || row.inspection_method}</Badge>);
        if (row.voltage_kv) parts.push(<Badge key="v" className="nums-fa bg-violet-100 text-violet-700 hover:bg-violet-100">{Number(row.voltage_kv).toLocaleString("fa-IR")}kV</Badge>);
        if (row.circuit_count) parts.push(<Badge key="c" className="bg-blue-100 text-blue-700 hover:bg-blue-100">{circuitLabel(row.circuit_count)}</Badge>);
        if (row.bundle_count) parts.push(<Badge key="b" className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100">{bundleLabel(row.bundle_count)}</Badge>);
        if (row.terrain_type) parts.push(<Badge key="t" className="bg-lime-50 text-lime-700 hover:bg-lime-50">{TERRAIN_GROUP_LABELS[row.terrain_type] || row.terrain_type}</Badge>);
        return parts.length
          ? <div className="flex flex-wrap items-center justify-center gap-1">{parts}</div>
          : <span className="text-xs text-slate-400">عمومی</span>;
      },
    },
    { key: "unit", header: "واحد", align: "center", width: "7%" },
    {
      key: "unit_price", header: "بهای واحد (ریال)", sortable: true, align: "left", width: "12%",
      render: (row) => {
        const v = Number(row.unit_price) || 0;
        const neg = v < 0;
        const coef = isCoef(row);
        return (
          <span className={`nums-fa font-medium tabular-nums ${neg ? "text-red-600 dark:text-red-400" : coef ? "text-amber-700 dark:text-amber-400" : "text-slate-700 dark:text-slate-200"}`}>
            {neg ? "−" : ""}{Math.abs(v).toLocaleString("fa-IR")}
          </span>
        );
      },
    },
    {
      key: "status", header: "وضعیت", align: "center", width: "7%",
      render: (row) => {
        const active = row.is_active === 1 || row.is_active === true || row.status === "active" || row.status === 1 || row.status === "1";
        return active
          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">فعال</Badge>
          : <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100">غیرفعال</Badge>;
      },
    },
  ];

  if (listsLoading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> در حال بارگذاری فهرست‌ها…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* انتخاب فهرست + اکشن‌ها */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <ListChecks className="h-5 w-5 text-slate-400" />
          <div className="min-w-64 flex-1">
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger><SelectValue placeholder="انتخاب فهرست بها…" /></SelectTrigger>
              <SelectContent>
                {lists.map(l => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}{l.version ? ` — نسخه ${l.version}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCreateList(true)}>
            <Plus className="ml-1 h-4 w-4" /> فهرست جدید
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedListId} onClick={() => setShowImport(true)}>
            <Upload className="ml-1 h-4 w-4" /> ایمپورت فهرست کشوری
          </Button>
          <Button variant="outline" size="sm" onClick={downloadStandardTemplate}>
            <Download className="ml-1 h-4 w-4" /> دانلود قالب استاندارد
          </Button>
          <Button size="sm" disabled={!selectedListId} onClick={() => { setEditingItem(null); setShowCreateItem(true); }}>
            <Plus className="ml-1 h-4 w-4" /> ثبت ردیف جدید
          </Button>
        </CardContent>
      </Card>

      {/* آمار + فیلترها */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="nums-fa gap-1">کل: {stats.total.toLocaleString("fa-IR")}</Badge>
            <Badge className="nums-fa gap-1 bg-slate-100 text-slate-600 hover:bg-slate-100">اصلی: {stats.base.toLocaleString("fa-IR")}</Badge>
            <Badge className="nums-fa gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">ضریب: {stats.coef.toLocaleString("fa-IR")}</Badge>
            {stats.zeroPrice > 0 ? (
              <Badge className="nums-fa gap-1 bg-red-50 text-red-600 hover:bg-red-50">بدون قیمت: {stats.zeroPrice.toLocaleString("fa-IR")}</Badge>
            ) : null}
            {selectedList?.contract_title ? (
              <Badge variant="outline" className="text-slate-500">قرارداد: {selectedList.contract_title}</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={fChapter} onValueChange={setFChapter}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه فصل‌ها</SelectItem>
                <SelectItem value="2">فصل ۲ — نگهداری</SelectItem>
                <SelectItem value="7">فصل ۷ — کشیک</SelectItem>
                <SelectItem value="8">فصل ۸ — پهبادی</SelectItem>
                <SelectItem value="10">فصل ۱۰ — تعمیرات</SelectItem>
                <SelectItem value="none">بدون فصل</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fMode} onValueChange={setFMode}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ردیف‌ها</SelectItem>
                <SelectItem value="base">فقط اصلی</SelectItem>
                <SelectItem value="coefficient">فقط ضرایب</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fActivity} onValueChange={setFActivity}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه فعالیت‌ها</SelectItem>
                <SelectItem value="inspection">بازدید</SelectItem>
                <SelectItem value="repair">تعمیرات</SelectItem>
                <SelectItem value="operation">عملیات</SelectItem>
                <SelectItem value="service">خدمات فنی</SelectItem>
                <SelectItem value="general">عمومی</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fMethod} onValueChange={setFMethod}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه روش‌ها</SelectItem>
                <SelectItem value="climbing">صعودی</SelectItem>
                <SelectItem value="patrol">پیمایشی</SelectItem>
                <SelectItem value="drone">پهبادی</SelectItem>
                <SelectItem value="general">عمومی</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fVoltage} onValueChange={setFVoltage}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ولتاژها</SelectItem>
                <SelectItem value="63">۶۳kV</SelectItem>
                <SelectItem value="132">۱۳۲kV</SelectItem>
                <SelectItem value="230">۲۳۰kV</SelectItem>
                <SelectItem value="400">۴۰۰kV</SelectItem>
                <SelectItem value="general">عمومی</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fTerrain} onValueChange={setFTerrain}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه زمین‌ها</SelectItem>
                <SelectItem value="plain_hilly">دشت و تپه‌ماهور</SelectItem>
                <SelectItem value="semi_mountainous">نیمه‌کوهستانی</SelectItem>
                <SelectItem value="impassable">صعب‌العبور</SelectItem>
                <SelectItem value="general">عمومی</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              placeholder="جستجو در کد/شرح…"
              className="h-8 w-52 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* جدول اقلام */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            accessKey="price-lists"
            data={filteredItems}
            columns={columns}
            loading={itemsLoading}
            searchKeys={["code", "title", "category", "parent_code"]}
            title={`اقلام ${selectedList?.name ?? "فهرست بها"}`}
            layoutKey="price-list-items"
            onAdd={() => { setEditingItem(null); setShowCreateItem(true); }}
            onRefresh={() => setRefreshKey(k => k + 1)}
            onDelete={(rows) => setPendingDelete(rows)}
            onEdit={(row) => { setEditingItem(row); setShowCreateItem(true); }}
            onDuplicate={handleDuplicate}
            onCopy={() => {}}
            onImport={() => setShowImport(true)}
            pageSize={25}
          />
        </CardContent>
      </Card>

      <CreatePriceListDialog
        open={showCreateList}
        onClose={() => setShowCreateList(false)}
        onCreated={() => setRefreshKey(k => k + 1)}
      />
      <PriceListItemDialog
        open={showCreateItem}
        priceListId={selectedListId ? Number(selectedListId) : null}
        items={items}
        editing={editingItem}
        onClose={() => { setShowCreateItem(false); setEditingItem(null); }}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
      <ImportPriceListDialog
        open={showImport}
        priceListId={selectedListId ? Number(selectedListId) : null}
        existingCount={items.length}
        onClose={() => setShowImport(false)}
        onImported={() => setRefreshKey(k => k + 1)}
      />
      <AlertDialog open={!!pendingDelete} onOpenChange={v => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {pendingDelete?.length.toLocaleString("fa-IR")} ردیف</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <p>
                  {pendingDelete?.some(i => !isCoef(i))
                    ? "با حذف ردیف اصلی، ضرایب فرزند آن هم حذف می‌شوند. این عمل بازگشت‌پذیر نیست."
                    : "این عمل بازگشت‌پذیر نیست."}
                </p>
                <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                  {pendingDelete?.slice(0, 8).map(i => (
                    <li key={i.id} className="truncate" dir="auto">
                      <span className="font-mono text-[11px] text-slate-500" dir="ltr">{i.code}</span> — {i.title}
                    </li>
                  ))}
                  {(pendingDelete?.length ?? 0) > 8 ? <li className="text-slate-400">… و {(pendingDelete!.length - 8).toLocaleString("fa-IR")} ردیف دیگر</li> : null}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={e => { e.preventDefault(); requestDelete(pendingDelete!); }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null} حذف قطعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// دیالوگ ایجاد فهرست
// ═══════════════════════════════════════════════════════════════
function CreatePriceListDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", version: "", effective_date: "", contract_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setForm({ name: "", version: "", effective_date: "", contract_id: "" }); setError(null); }
  }, [open]);

  const submit = async () => {
    if (!form.name.trim()) { setError("نام فهرست الزامی است"); return; }
    setSaving(true); setError(null);
    try {
      await apiClient.post(API_ENDPOINTS.priceLists, {
        name: form.name.trim(),
        version: form.version.trim() || "1.0",
        effective_date: form.effective_date || new Date().toISOString().slice(0, 10),
        contract_id: form.contract_id ? Number(form.contract_id) : null,
      });
      toast({ title: "فهرست ایجاد شد", description: form.name.trim() });
      onCreated(); onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message || "خطا در ایجاد فهرست");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>ثبت فهرست جدید</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">نام فهرست *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: فهرست بهای کشوری ۱۴۰۵" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">نسخه</Label>
              <Input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} placeholder="1405.1" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">تاریخ اعتبار</Label>
              <JalaliDatePicker value={form.effective_date} onChange={v => setForm({ ...form, effective_date: v ?? "" })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">قرارداد (اختیاری)</Label>
            <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v ?? "" })} />
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null} ثبت فهرست
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// دیالوگ ثبت/ویرایش ردیف (اصلی یا ضریب)
// ═══════════════════════════════════════════════════════════════
const emptyItemForm = {
  mode: "base" as "base" | "coefficient",
  code: "", title: "", unit: "", unit_price: "", category: "",
  chapter: "none", parent_code: "", coefficient_kind: "other",
  activity_type: "none", inspection_method: "none",
  voltage_kv: "", circuit_count: "none", bundle_count: "none", terrain_type: "none",
};

function PriceListItemDialog({ open, priceListId, items, editing, onClose, onSaved }: {
  open: boolean;
  priceListId: number | null;
  items: PriceListItem[];
  editing: PriceListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyItemForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseItems = useMemo(() => items.filter(i => !isCoef(i)), [items]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing && editing.id > 0) {
      const coef = isCoef(editing);
      setForm({
        mode: coef ? "coefficient" : "base",
        code: editing.code ?? "",
        title: editing.title ?? "",
        unit: editing.unit ?? "",
        unit_price: String(editing.unit_price ?? ""),
        category: editing.category ?? "",
        chapter: editing.chapter !== null && editing.chapter !== undefined ? String(editing.chapter) : "none",
        parent_code: editing.parent_code ?? "",
        coefficient_kind: editing.coefficient_kind ?? "other",
        activity_type: editing.activity_type ?? "none",
        inspection_method: editing.inspection_method ?? "none",
        voltage_kv: editing.voltage_kv !== null && editing.voltage_kv !== undefined ? String(editing.voltage_kv) : "",
        circuit_count: editing.circuit_count !== null && editing.circuit_count !== undefined ? String(editing.circuit_count) : "none",
        bundle_count: editing.bundle_count !== null && editing.bundle_count !== undefined ? String(editing.bundle_count) : "none",
        terrain_type: editing.terrain_type ?? "none",
      });
    } else {
      setForm(emptyItemForm);
    }
  }, [open, editing]);

  // کد اختصاصی پیشنهادی برای ضریب جدید: *<والد>-<n>
  const suggestedCoefCode = useMemo(() => {
    if (form.mode !== "coefficient" || !form.parent_code) return "";
    const n = items.filter(i => isCoef(i) && i.parent_code === form.parent_code).length + 1;
    return `*${form.parent_code}-${n}`;
  }, [form.mode, form.parent_code, items]);

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!priceListId) { setError("ابتدا یک فهرست انتخاب کنید"); return; }
    if (!form.title.trim()) { setError("شرح ردیف الزامی است"); return; }
    if (form.mode === "coefficient" && !form.parent_code) { setError("انتخاب ردیف والد برای ضریب الزامی است"); return; }
    setSaving(true); setError(null);
    try {
      const price = form.unit_price.trim() === "" ? 0 : Number(form.unit_price.replace(/[^\d.\-]/g, ""));
      const payload: Record<string, unknown> = {
        price_list_id: priceListId,
        title: form.title.trim(),
        unit: form.unit.trim() || (form.mode === "coefficient" ? "ضریب" : "برج"),
        unit_price: isFinite(price) ? price : 0,
        item_kind: form.mode,
        chapter: form.mode === "base" && form.chapter !== "none" ? Number(form.chapter) : null,
        category: form.category.trim() || (form.chapter !== "none" ? CHAPTER_LABELS[Number(form.chapter)] : ""),
        activity_type: form.mode === "base" && form.activity_type !== "none" ? form.activity_type : null,
        inspection_method: form.mode === "base" && form.inspection_method !== "none" ? form.inspection_method : null,
        voltage_kv: form.mode === "base" && form.voltage_kv.trim() !== "" ? Number(form.voltage_kv) || null : null,
        circuit_count: form.mode === "base" && form.circuit_count !== "none" ? Number(form.circuit_count) : null,
        bundle_count: form.mode === "base" && form.bundle_count !== "none" ? Number(form.bundle_count) : null,
        terrain_type: form.mode === "base" && form.terrain_type !== "none" ? form.terrain_type : null,
      };
      if (form.mode === "coefficient") {
        payload.parent_code = form.parent_code;
        payload.coefficient_kind = form.coefficient_kind;
        payload.code = form.code.trim() || suggestedCoefCode;
      } else if (form.code.trim()) {
        payload.code = form.code.trim();
      }
      if (editing && editing.id > 0) {
        await apiClient.put(`${API_ENDPOINTS.priceListItems}/${editing.id}`, payload);
        toast({ title: "ردیف ویرایش شد", description: payload.title as string });
      } else {
        await apiClient.post(API_ENDPOINTS.priceListItems, payload);
        toast({ title: "ردیف ثبت شد", description: payload.title as string });
      }
      onSaved(); onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message || "خطا در ذخیره ردیف");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing && editing.id > 0
              ? `ویرایش ردیف: ${editing.code}`
              : form.mode === "coefficient" ? "ثبت ردیف ضریب جدید" : "ثبت ردیف اصلی جدید"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* نوع ردیف */}
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="plitem-mode" checked={form.mode === "base"} onChange={() => setF("mode", "base")} className="accent-slate-700" />
              ردیف اصلی (کد ملی)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="plitem-mode" checked={form.mode === "coefficient"} onChange={() => setF("mode", "coefficient")} className="accent-amber-600" />
              ردیف ضریب کاهش/افزایش بها
            </label>
          </div>

          {form.mode === "coefficient" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">ردیف والد *</Label>
                  <Select value={form.parent_code} onValueChange={v => setF("parent_code", v)}>
                    <SelectTrigger><SelectValue placeholder="انتخاب ردیف اصلی…" /></SelectTrigger>
                    <SelectContent>
                      {baseItems.slice(0, 400).map(b => (
                        <SelectItem key={b.id} value={b.code}>
                          <span dir="ltr" className="font-mono text-xs">{b.code}</span> — {b.title.slice(0, 50)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">نوع ضریب</Label>
                  <Select value={form.coefficient_kind} onValueChange={v => setF("coefficient_kind", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COEFFICIENT_KIND_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  کد اختصاصی {editing ? "" : "(خالی = پیشنهاد خودکار)"}
                </Label>
                <Input value={form.code} onChange={e => setF("code", e.target.value)} dir="ltr"
                  placeholder={suggestedCoefCode || "*20101-1"} className="font-mono text-sm" />
                {!editing && suggestedCoefCode ? (
                  <p className="text-[11px] text-slate-400">پیشنهاد: <span className="font-mono" dir="ltr">{suggestedCoefCode}</span></p>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">شرح ردیف *</Label>
            <Input value={form.title} onChange={e => setF("title", e.target.value)}
              placeholder={form.mode === "coefficient" ? "کاهش بها بابت بازدید تیر چوبی و بتنی، طبق بند ۸ مقدمه فصل" : "بازدید پیمایشی خط ۶۳ کیلوولت دشت و تپه ماهور تک مداره."} />
            {form.mode === "base" && form.title.trim() ? <ClassificationPreview title={form.title} code={form.code} /> : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {form.mode === "base" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">کد ملی (اختیاری)</Label>
                <Input value={form.code} onChange={e => setF("code", e.target.value)} dir="ltr" placeholder="20101" className="font-mono text-sm" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">واحد</Label>
              <Input value={form.unit} onChange={e => setF("unit", e.target.value)} placeholder="برج / زنجیره / مورد / عدد" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                بهای واحد (ریال) {form.mode === "coefficient" ? "— منفی = کاهش بها" : ""}
              </Label>
              <Input value={form.unit_price} onChange={e => setF("unit_price", e.target.value)} dir="ltr"
                placeholder={form.mode === "coefficient" ? "-382000" : "955000"} className="nums-fa" />
            </div>
          </div>

          {form.mode === "base" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">فصل فهرست</Label>
                  <Select value={form.chapter} onValueChange={v => setF("chapter", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">نامشخص</SelectItem>
                      <SelectItem value="2">فصل ۲ — نگهداری</SelectItem>
                      <SelectItem value="7">فصل ۷ — کشیک و فراخوان</SelectItem>
                      <SelectItem value="8">فصل ۸ — بازدید پهبادی</SelectItem>
                      <SelectItem value="10">فصل ۱۰ — تعمیرات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">نوع فعالیت</Label>
                  <Select value={form.activity_type} onValueChange={v => setF("activity_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عمومی</SelectItem>
                      <SelectItem value="inspection">بازدید</SelectItem>
                      <SelectItem value="repair">تعمیرات</SelectItem>
                      <SelectItem value="operation">عملیات</SelectItem>
                      <SelectItem value="service">خدمات فنی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">روش بازدید</Label>
                  <Select value={form.inspection_method} onValueChange={v => setF("inspection_method", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عمومی</SelectItem>
                      <SelectItem value="climbing">صعودی</SelectItem>
                      <SelectItem value="patrol">پیمایشی</SelectItem>
                      <SelectItem value="drone">پهبادی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">ولتاژ (kV)</Label>
                  <Select value={form.voltage_kv || "none"} onValueChange={v => setF("voltage_kv", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عمومی</SelectItem>
                      <SelectItem value="63">۶۳</SelectItem>
                      <SelectItem value="132">۱۳۲</SelectItem>
                      <SelectItem value="230">۲۳۰</SelectItem>
                      <SelectItem value="400">۴۰۰</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">تعداد مدار</Label>
                  <Select value={form.circuit_count} onValueChange={v => setF("circuit_count", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عمومی</SelectItem>
                      <SelectItem value="1">تک‌مداره</SelectItem>
                      <SelectItem value="2">دو مداره</SelectItem>
                      <SelectItem value="4">چهارمداره</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">تعداد باندل</Label>
                  <Select value={form.bundle_count} onValueChange={v => setF("bundle_count", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عمومی</SelectItem>
                      <SelectItem value="1">تک‌باندل</SelectItem>
                      <SelectItem value="2">دو باندل</SelectItem>
                      <SelectItem value="3">سه باندل</SelectItem>
                      <SelectItem value="4">چهار باندل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">نوع زمین</Label>
                  <Select value={form.terrain_type} onValueChange={v => setF("terrain_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">همه زمین‌ها</SelectItem>
                      <SelectItem value="plain_hilly">دشت و تپه‌ماهور</SelectItem>
                      <SelectItem value="semi_mountainous">نیمه‌کوهستانی</SelectItem>
                      <SelectItem value="impassable">صعب‌العبور</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            {editing ? "اعمال ویرایش" : "ثبت ردیف"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** پیش‌نمایش طبقه‌بندی استخراج‌شده از شرح — کمک کاربر برای فرم دستی */
function ClassificationPreview({ title, code }: { title: string; code: string }) {
  const cls = useMemo(() => parseBaseClassification(code || "00000", title), [title, code]);
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] dark:bg-slate-800/60">
      <span className="text-slate-400">استخراج خودکار از شرح:</span>
      {cls.inspection_method ? <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">{METHOD_LABELS[cls.inspection_method]}</Badge> : null}
      {cls.activity_type ? <Badge className="bg-teal-50 text-teal-700 hover:bg-teal-50">{ACTIVITY_LABELS[cls.activity_type]}</Badge> : null}
      {cls.voltage_kv ? <Badge className="nums-fa bg-violet-100 text-violet-700 hover:bg-violet-100">{cls.voltage_kv}kV</Badge> : null}
      {cls.circuit_count ? <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{circuitLabel(cls.circuit_count)}</Badge> : null}
      {cls.bundle_count ? <Badge className="bg-cyan-100 text-cyan-700 hover:bg-cyan-100">{bundleLabel(cls.bundle_count)}</Badge> : null}
      {cls.terrain_type ? <Badge className="bg-lime-50 text-lime-700 hover:bg-lime-50">{TERRAIN_GROUP_LABELS[cls.terrain_type]}</Badge> : null}
      {!cls.inspection_method && !cls.activity_type && !cls.voltage_kv && !cls.circuit_count && !cls.terrain_type ? (
        <span className="text-slate-400">عمومی — طبقه‌بندی‌ای از شرح استخراج نشد</span>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// دیالوگ ایمپورت فهرست بهای کشوری (فرمت استاندارد ۴ ستونه)
//   شماره ردیف فصل | شرح ردیف فصل | واحد | بهای واحد
// ═══════════════════════════════════════════════════════════════
function ImportPriceListDialog({ open, priceListId, existingCount, onClose, onImported }: {
  open: boolean;
  priceListId: number | null;
  existingCount: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ items: ParsedBoqItem[]; warnings: string[] } | null>(null);
  const [replace, setReplace] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) { reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setError(null); setFileName(""); setParsed(null); setReplace(false); setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setParsed(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = wb.SheetNames.find(n => normalizeFa(n).includes("main") || normalizeFa(n).includes("اقلام") || normalizeFa(n).includes("فهرست")) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });

      // یافتن سطر سرستون‌ها (در ۵ سطر اول): شماره ردیف فصل | شرح | واحد | بهای واحد
      let headerIdx = -1;
      let colMap = { code: -1, title: -1, unit: -1, price: -1 };
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const hdr = (rows[i] || []).map(c => normalizeFa(c));
        const cCode = hdr.findIndex(h => /شماره\s*ردیف\s*فصل|کد\s*ردیف/.test(h));
        const cTitle = hdr.findIndex(h => /شرح\s*ردیف|شرح/.test(h));
        const cUnit = hdr.findIndex(h => /^واحد$/.test(h));
        const cPrice = hdr.findIndex(h => /بهای\s*واحد|بهای\s*یگانه/.test(h));
        if (cTitle >= 0 && cPrice >= 0) {
          headerIdx = i;
          colMap = { code: cCode, title: cTitle, unit: cUnit >= 0 ? cUnit : 2, price: cPrice };
          break;
        }
      }
      if (headerIdx < 0) {
        throw new Error("فرمت فایل شناسایی نشد — فهرست بهای کشوری باید ستون‌های «شماره ردیف فصل / شرح ردیف فصل / واحد / بهای واحد» را داشته باشد. برای نمونه از «دانلود قالب استاندارد» استفاده کنید.");
      }

      const raw = rows.slice(headerIdx + 1).map(r => {
        const cell = (idx: number) => (idx >= 0 && idx < (r?.length ?? 0) ? r[idx] : "");
        const code = String(cell(colMap.code) ?? "").trim();
        const title = String(cell(colMap.title) ?? "").trim();
        return {
          code,
          title,
          unit: String(cell(colMap.unit) ?? "").trim() || null,
          unit_price: parseExcelNumber(cell(colMap.price)),
        };
      }).filter(r => r.title);

      const result = processStandardBoqRows(raw);
      if (!result.items.length) throw new Error("هیچ ردیف معتبری در فایل یافت نشد");
      setFileName(file.name);
      setParsed(result);
      if (result.warnings.length) {
        toast({
          title: "فایل پارس شد — با هشدار",
          description: `${result.warnings.length.toLocaleString("fa-IR")} هشدار (مثل قیمت خالی) — پیش‌نمایش را ببینید.`,
        });
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || "خواندن فایل ناموفق بود — فقط xlsx / xls / csv");
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!parsed || !priceListId) return;
    setImporting(true); setError(null);
    try {
      const r = await apiClient.post<{ imported_items?: number; imported_coefficients?: number } | unknown>(
        API_ENDPOINTS.priceListImport,
        { price_list_id: priceListId, items: parsed.items, replace },
      );
      const d = (r as any)?.data ?? r ?? {};
      toast({
        title: "ایمپورت فهرست کشوری انجام شد",
        description: `${Number(d.imported_items ?? 0).toLocaleString("fa-IR")} ردیف اصلی و ${Number(d.imported_coefficients ?? 0).toLocaleString("fa-IR")} ردیف ضریب ثبت شد${replace ? " (ردیف‌های قبلی حذف شدند)" : ""}.`,
      });
      onImported(); onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message || "خطا در ایمپورت");
    } finally { setImporting(false); }
  };

  const stat = useMemo(() => {
    if (!parsed) return null;
    const base = parsed.items.filter(i => i.item_kind === "base");
    const coef = parsed.items.filter(i => i.item_kind === "coefficient");
    const byChapter: Record<number, number> = {};
    for (const i of base) byChapter[i.chapter ?? 0] = (byChapter[i.chapter ?? 0] ?? 0) + 1;
    return { base, coef, byChapter, zero: parsed.items.filter(i => !i.unit_price).length };
  }, [parsed]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ایمپورت فهرست بهای کشوری</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            فایل اکسل فهرست بهای کشوری را <b>بدون تغییر فرمت</b> آپلود کنید — همان فایلی که کارفرما تحویل می‌دهد
            (ستون‌ها: شماره ردیف فصل / شرح ردیف فصل / واحد / بهای واحد).
            طبقه‌بندی‌ها (فصل، ولتاژ، تعداد مدار و باندل، روش بازدید، نوع زمین) <b>خودکار از متن شرح</b> استخراج می‌شوند؛
            ردیف‌های «کاهش/اضافه بها» که کد ملی ندارند، <b>کد اختصاصی</b> به شکل <span className="font-mono" dir="ltr">*کد-ردیفِ-والد-n</span> می‌گیرند و به ردیف بالایی خود وصل می‌شوند.
          </p>

          <div className="flex items-center gap-2">
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pickFile} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="ml-1 h-4 w-4" />}
              انتخاب فایل اکسل
            </Button>
            {fileName ? <span className="text-xs text-slate-500">{fileName}</span> : null}
          </div>

          {error ? <p className="whitespace-pre-line rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20">{error}</p> : null}

          {stat ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="nums-fa">کل: {parsed!.items.length.toLocaleString("fa-IR")}</Badge>
                <Badge className="nums-fa bg-slate-100 text-slate-600 hover:bg-slate-100">اصلی: {stat.base.length.toLocaleString("fa-IR")}</Badge>
                <Badge className="nums-fa bg-amber-100 text-amber-800 hover:bg-amber-100">ضریب: {stat.coef.length.toLocaleString("fa-IR")}</Badge>
                {[2, 7, 8, 10].filter(c => stat.byChapter[c]).map(c => (
                  <Badge key={c} className={`nums-fa ${CHAPTER_BADGES[String(c)]}`}>
                    {CHAPTER_LABELS[c]}: {stat.byChapter[c].toLocaleString("fa-IR")}
                  </Badge>
                ))}
                {stat.zero > 0 ? (
                  <Badge className="nums-fa bg-red-50 text-red-600 hover:bg-red-50">بدون قیمت: {stat.zero.toLocaleString("fa-IR")}</Badge>
                ) : null}
              </div>

              {parsed!.warnings.length ? (
                <div className="max-h-24 space-y-0.5 overflow-y-auto rounded-md bg-amber-50 p-2 text-[11px] text-amber-700 dark:bg-amber-900/20">
                  {parsed!.warnings.slice(0, 12).map((w, i) => <p key={i}>• {w}</p>)}
                  {parsed!.warnings.length > 12 ? <p>… و {(parsed!.warnings.length - 12).toLocaleString("fa-IR")} هشدار دیگر</p> : null}
                </div>
              ) : null}

              {/* پیش‌نمایش ۲۵ ردیف اول */}
              <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-right text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">کد</th>
                        <th className="px-2 py-1.5 font-medium">شرح</th>
                        <th className="px-2 py-1.5 font-medium">طبقه‌بندی</th>
                        <th className="px-2 py-1.5 font-medium">بها</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed!.items.slice(0, 25).map(it => (
                        <tr key={it.code} className={`border-t border-slate-100 dark:border-slate-800 ${it.item_kind === "coefficient" ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
                          <td className="px-2 py-1 font-mono text-[10px] text-slate-500" dir="ltr">{it.code}</td>
                          <td className="max-w-72 truncate px-2 py-1">{it.item_kind === "coefficient" ? "↳ " : ""}{it.title}</td>
                          <td className="px-2 py-1 text-slate-500">
                            {it.item_kind === "coefficient"
                              ? COEFFICIENT_KIND_LABELS[it.coefficient_kind ?? "other"]
                              : [it.inspection_method && METHOD_LABELS[it.inspection_method],
                                 it.voltage_kv && `${it.voltage_kv}kV`,
                                 circuitLabel(it.circuit_count),
                                 bundleLabel(it.bundle_count),
                                 it.terrain_type && TERRAIN_GROUP_LABELS[it.terrain_type],
                                 it.chapter && `فصل ${it.chapter}`]
                                  .filter(Boolean).join(" · ")}
                          </td>
                          <td className={`nums-fa px-2 py-1 tabular-nums ${it.unit_price < 0 ? "text-red-600" : ""}`} dir="ltr">
                            {it.unit_price < 0 ? "−" : ""}{Math.abs(it.unit_price).toLocaleString("fa-IR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800">
                  پیش‌نمایش {Math.min(25, parsed!.items.length).toLocaleString("fa-IR")} ردیف از {parsed!.items.length.toLocaleString("fa-IR")}
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                <Switch checked={replace} onCheckedChange={setReplace} />
                <span>
                  جایگزینی کامل — {existingCount.toLocaleString("fa-IR")} ردیف موجود این فهرست حذف و فایل جدید جایگزین شود
                  {existingCount === 0 ? <span className="text-slate-400"> (فعلاً فهرست خالی است)</span> : null}
                </span>
              </label>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>انصراف</Button>
          <Button onClick={doImport} disabled={!parsed || importing || !priceListId}>
            {importing ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Upload className="ml-1 h-4 w-4" />}
            ایمپورت {parsed ? `${parsed.items.length.toLocaleString("fa-IR")} ردیف` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// دانلود قالب استاندارد (فرمت کشوری + چند ردیف نمونه واقعی)
// ═══════════════════════════════════════════════════════════════
async function downloadStandardTemplate() {
  const XLSX = await import("xlsx");
  const sample: (string | number)[][] = [
    ["شماره ردیف فصل", "شرح ردیف فصل", "واحد", "بهای واحد"],
    [20101, "بازديد پيمايشي خط 63 کيلوولت دشت و تپه ماهور تک مداره.", "برج", 955000],
    ["", "کاهش بها بابت بازید تیر چوبی و بتنی،طبق بند 8 مقدمه فصل", "برج", -382000],
    ["", "اضافه بها بابت انجام بازدید دو نفره ،طبق بند 9 مقدمه فصل", "برج", 859500],
    ["", "اضافه بها بابت انجام بازدید خطوط دو باندل،طبق بند 11 مقدمه فصل", "برج", 95500],
    [20102, "بازديد صعودي خط 63 کيلوولت دشت و تپه ماهور تک مداره.", "برج", 1432000],
    [70103, "کشيک گروه تعميرات خطوط به ازاء هر ساعت.", "ساعت", 3709000],
    [80101, "بازديد پهپادي خط 63 کيلوولت دشت و تپه ماهور تک‌مداره", "برج", 1607000],
    [100101, "تعويض مقره کششي سرد 400 کيلوولت در دشت و تپه ماهور از يک تا همه مقره ها در هر زنجيره.", "زنجیره", 15847000],
    ["", "اضافه بها بابت انجام فعالیت در مسیر نیمه کوهستانی،طبق بند 12 مقدمه فصل", "زنجیره", 7131150],
  ];
  const guide: (string | number)[][] = [
    ["راهنمای قالب فهرست بهای کشوری"],
    [""],
    ["۱. فرمت فایل دقیقاً همان فهرست بهای رسمی است — نیازی به تغییر آن نیست."],
    ["۲. ستون «شماره ردیف فصل» برای ردیف‌های اصلی پر می‌شود (مثل 20101 یا 100101)."],
    ["۳. ردیف‌های کاهش/اضافه بها کد ندارند — سلوله خالی بماند؛ برنامه کد اختصاصی *<کد والد>-<n> می‌سازد."],
    ["۴. طبقه‌بندی‌ها (فصل/ولتاژ/مدار/باندل/روش بازدید/نوع زمین) خودکار از متن «شرح» استخراج می‌شوند."],
    ["۵. اگر در شرح از باندل نامی برده نشود یعنی تک‌باندل (قاعده فهرست کشوری)."],
    ["۶. ردیف ضریب همیشه باید بلافاصله زیر ردیف اصلی خودش باشد (مثل فایل رسمی)."],
    ["۷. قیمت‌های منفی = کاهش بها، مثبت = اضافه بها."],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws["!cols"] = [{ wch: 16 }, { wch: 80 }, { wch: 10 }, { wch: 14 }];
  ws["!rtl"] = true;
  XLSX.utils.book_append_sheet(wb, ws, "Main");
  const wg = XLSX.utils.aoa_to_sheet(guide);
  wg["!cols"] = [{ wch: 100 }];
  wg["!rtl"] = true;
  XLSX.utils.book_append_sheet(wb, wg, "راهنما");
  XLSX.writeFile(wb, "فهرست_بها_کشوری_قالب_استاندارد.xlsx");
}
