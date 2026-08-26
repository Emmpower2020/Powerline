"use client";

import { useEffect, useState, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Plus, ListChecks, FileSpreadsheet } from "lucide-react";
import { GenericBulkActions } from "@/components/generic-bulk-actions";

/**
 * صفحه فهرست بها — v2.8.1
 *
 * این صفحه در منو از v1.0.0 وجود داشت اما در switch صفحه اصلی case نداشت و
 * به‌جایش داشبورد نمایش داده می‌شد. حالا با endpoint های آماده modules.php وصل است:
 *   GET/POST  /price-lists        — فهرست‌ها
 *   GET/POST  /price-list-items   — اقلام هر فهرست (فیلتر با list_id)
 *   DELETE    /price-list-items/{id}
 *
 * نکته: این endpoint ها آرایه ساده برمی‌گردانند (بدون envelope صفحه‌بندی)،
 * بنابراین پاسخ apiClient مستقیم آرایه است — هر دو شکل پشتیبانی می‌شود.
 */

interface PriceList {
  id: number;
  name: string;
  version: string | null;
  effective_date: string;
  is_active: number;
}

interface PriceListItem {
  id: number;
  price_list_id: number;
  code: string;
  title: string;
  unit: string | null;
  unit_price: number;
  category: string | null;
  is_active: number;
}

const asArray = (r: unknown): any[] => (Array.isArray(r) ? r : ((r as any)?.data || []));

export function PriceListsPage() {
  const { toast } = useToast();

  const [lists, setLists] = useState<PriceList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string>("");

  const [items, setItems] = useState<PriceListItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [showCreateList, setShowCreateList] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PriceListItem[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedList = lists.find(l => String(l.id) === selectedListId) || null;

  // بارگذاری فهرست‌ها
  useEffect(() => {
    const load = async () => {
      setListsLoading(true);
      try {
        const r = await apiClient.get<unknown>(API_ENDPOINTS.priceLists);
        const arr = asArray(r);
        setLists(arr);
        // اولین فهرست به‌صورت پیش‌فرض انتخاب شود (فقط بار اول)
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
        const r = await apiClient.get<unknown>(API_ENDPOINTS.priceListItems, { list_id: Number(selectedListId) });
        setItems(asArray(r));
      } catch (err) {
        console.error("خطا در بارگذاری اقلام:", err);
      } finally { setItemsLoading(false); }
    };
    load();
  }, [selectedListId, refreshKey]);

  const columns: DataTableColumn<PriceListItem>[] = [
    { key: "code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "شرح", sortable: true, filterable: true, wrap: true },
    { key: "unit", header: "واحد", sortable: true, filterable: true },
    { key: "unit_price", header: "بهای واحد (ریال)", sortable: true, type: "number" },
    { key: "category", header: "دسته", sortable: true, filterable: true },
    { key: "is_active", header: "فعال", type: "boolean" },
  ];

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleEdit = async (row: PriceListItem) => {
    const title = window.prompt("شرح قلم", row.title);
    if (title === null) return;
    const unit = window.prompt("واحد", row.unit || "");
    if (unit === null) return;
    const price = window.prompt("بهای واحد (ریال)", String(row.unit_price));
    if (price === null) return;
    const category = window.prompt("دسته", row.category || "");
    if (category === null) return;
    try {
      await apiClient.put(`${API_ENDPOINTS.priceListItems}/${row.id}`, { title, unit: unit || null, unit_price: Number(price) || 0, category: category || null });
      setRefreshKey(k => k + 1);
    } catch (e) { console.error(e); }
  };

  const handleDuplicate = async (row: PriceListItem) => {
    try {
      await apiClient.post(API_ENDPOINTS.priceListItems, { price_list_id: row.price_list_id, code: `${row.code}-COPY`, title: `${row.title} - کپی`, unit: row.unit, unit_price: row.unit_price, category: row.category });
      setRefreshKey(k => k + 1);
    } catch (e) { console.error(e); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      for (const r of rows) {
        await apiClient.post(API_ENDPOINTS.priceListItems, { price_list_id: Number(selectedListId), code: r.code || r["کد"], title: r.title || r["شرح"], unit: r.unit || r["واحد"] || "عدد", unit_price: Number(r.unit_price || r["بهای واحد (ریال)"] || 0), category: r.category || r["دسته"] || "عملیات" });
      }
      setRefreshKey(k => k + 1);
    } catch (e) { console.error("خطا در import فهرست بها", e); }
    finally { e.target.value = ""; }
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
        toast({ title: "حذف انجام شد", description: `${ok} قلم از فهرست بها حذف شد` });
      } else {
        toast({ title: "حذف ناقص", description: `${ok} قلم حذف شد، ${fail} قلم خطا خورد`, variant: "destructive" });
      }
      setPendingDelete(null);
      setRefreshKey(k => k + 1);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
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
                  <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                    نسخه: {selectedList.version || "—"}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 nums-fa">
                    تاریخ اجرا: {new Date(selectedList.effective_date).toLocaleDateString("fa-IR")}
                  </Badge>
                  <Badge className={selectedList.is_active ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                    {selectedList.is_active ? "فعال" : "غیرفعال"}
                  </Badge>
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 nums-fa">
                    {items.length} قلم
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" onClick={() => setShowCreateList(true)}>
                <Plus className="w-4 h-4 ml-2" />
                فهرست جدید
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={!selectedListId} onClick={() => setShowCreateItem(true)}>
                <Plus className="w-4 h-4 ml-2" />
                قلم جدید
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* جدول اقلام */}
      {listsLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          </CardContent>
        </Card>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <ListChecks className="w-12 h-12 mb-3 opacity-50" />
              <p>هنوز فهرست بهایی ثبت نشده — با دکمه «فهرست جدید» شروع کنید</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          data={items}
          columns={columns}
          loading={itemsLoading}
          searchKeys={["code", "title", "category"]}
          title="اقلام فهرست بها"
          layoutKey="price-list-items"
          onAdd={() => setShowCreateItem(true)}
          onRefresh={() => setRefreshKey(k => k + 1)}
          onDelete={(rows) => setPendingDelete(rows)}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onCopy={() => {}}
          onImport={() => importInputRef.current?.click()}
          onLoadAllRows={async () => items}
          toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.priceListItems} entityName="قلم" onApplied={() => setRefreshKey(k => k + 1)} canToggleActive />}
        />
      )}

      {/* دیالوگ فهرست جدید */}
      <CreatePriceListDialog
        open={showCreateList}
        onClose={() => setShowCreateList(false)}
        onCreated={() => { setShowCreateList(false); setRefreshKey(k => k + 1); }}
      />

      {/* دیالوگ قلم جدید */}
      <CreatePriceListItemDialog
        open={showCreateItem}
        priceListId={selectedListId ? Number(selectedListId) : null}
        onClose={() => setShowCreateItem(false)}
        onCreated={() => { setShowCreateItem(false); setRefreshKey(k => k + 1); }}
      />

      {/* تأیید حذف اقلام */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف قلم(های) فهرست بها</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {pendingDelete && pendingDelete.length === 1
                ? `قلم «${pendingDelete[0].title}» به‌طور کامل حذف می‌شود. این عمل قابل بازگشت نیست.`
                : `${pendingDelete?.length ?? 0} قلم انتخاب‌شده به‌طور کامل حذف می‌شوند. این عمل قابل بازگشت نیست.`}
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
  const [form, setForm] = useState({ name: "", version: "", effective_date: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("نام فهرست الزامی است"); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.post(API_ENDPOINTS.priceLists, {
        name: form.name.trim(),
        version: form.version.trim() || null,
        effective_date: form.effective_date || undefined,
      });
      setForm({ name: "", version: "", effective_date: "" });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد فهرست");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">فهرست بها جدید</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <div className="space-y-2">
            <Label className="text-right block">نام فهرست (اجباری)</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: فهرست بها ۱۴۰۵" className="text-right" autoFocus />
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

// ─── دیالوگ ایجاد قلم فهرست بها ───
function CreatePriceListItemDialog({ open, priceListId, onClose, onCreated }: {
  open: boolean; priceListId: number | null; onClose: () => void; onCreated: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", title: "", unit: "عدد", unit_price: "", category: "عملیات" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("شرح قلم الزامی است"); return; }
    if (!priceListId) { setError("ابتدا یک فهرست بها انتخاب کنید"); return; }
    setSubmitting(true); setError(null);
    try {
      await apiClient.post(API_ENDPOINTS.priceListItems, {
        price_list_id: priceListId,
        code: form.code.trim() || undefined,
        title: form.title.trim(),
        unit: form.unit.trim() || "عدد",
        unit_price: form.unit_price ? Number(form.unit_price.replace(/[^0-9.]/g, "")) : 0,
        category: form.category.trim() || "عملیات",
      });
      setForm({ code: "", title: "", unit: "عدد", unit_price: "", category: "عملیات" });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد قلم");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">
            <span className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-indigo-600" />قلم جدید فهرست بها</span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right">{error}</div>}
          <div className="space-y-2">
            <Label className="text-right block">شرح قلم (اجباری)</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="مثلاً: تعویض مقره پلیمری" className="text-right" autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">کد (خالی = خودکار)</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="P-006" dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">واحد</Label>
              <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-right block">بهای واحد (ریال)</Label>
              <Input type="text" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value.replace(/[^0-9.]/g, "") })} dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label className="text-right block">دسته</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="عملیات">عملیات</SelectItem>
                  <SelectItem value="بازدید">بازدید</SelectItem>
                  <SelectItem value="تعمیرات">تعمیرات</SelectItem>
                  <SelectItem value="مواد">مواد</SelectItem>
                  <SelectItem value="حمل‌ونقل">حمل‌ونقل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال ثبت...</> : "افزودن قلم"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
