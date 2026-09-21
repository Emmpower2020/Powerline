"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Measurement {
  id: number;
  source_type: string;
  source_id: number;
  contract_id: number | null;
  price_code: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  performed_date: string | null;
  contract_title?: string | null;
  contractor_name?: string | null;
}

const faDate = (v?: string | null) => v ? String(v).slice(0, 10).replace(/-/g, "/") : "—";
const faAmount = (v: number) => Number(v || 0).toLocaleString("fa-IR");

export function BillingMeasurementsInvoiceDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Measurement[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.billingMeasurements);
      const data = Array.isArray(res) ? res : (res?.data || []);
      setRows(data as Measurement[]);
      setSelected([]);
      const dates = (data as Measurement[]).map(r => r.performed_date).filter(Boolean).sort();
      setPeriodStart(dates[0] ? String(dates[0]).slice(0, 10) : "");
      setPeriodEnd(dates.length ? String(dates[dates.length - 1]).slice(0, 10) : "");
    } catch (e) {
      toast({ title: "بارگذاری متره‌ها ناموفق بود", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open]);

  const selectedRows = useMemo(() => rows.filter(r => selected.includes(r.id)), [rows, selected]);
  const contracts = Array.from(new Set(selectedRows.map(r => r.contract_id).filter(Boolean)));
  const total = selectedRows.reduce((sum, r) => sum + Number(r.total_price || 0), 0);
  const canInvoice = selectedRows.length > 0 && contracts.length === 1;

  const toggle = (id: number) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === rows.length ? [] : rows.map(r => r.id));

  const issueInvoice = async () => {
    if (!canInvoice) return;
    setSaving(true);
    try {
      const res = await apiClient.post<any>(API_ENDPOINTS.invoiceFromMeasurements, {
        measurement_ids: selected,
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
      });
      const data = res?.data ?? res;
      toast({
        title: "صورت‌وضعیت ایجاد شد",
        description: `${data?.invoice_code || ""} — مبلغ نهایی ${faAmount(data?.final_amount || 0)} ریال`,
      });
      await load();
      onCreated?.();
    } catch (e) {
      toast({ title: "صدور صورت‌وضعیت ناموفق بود", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={v => !v && onClose()}>
    <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden" dir="rtl">
      <DialogHeader>
        <DialogTitle className="text-right">صدور صورت‌وضعیت از متره‌های ثبت‌شده</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border bg-slate-50 p-3">
          <div><Label>شروع دوره</Label><Input value={periodStart} onChange={e => setPeriodStart(e.target.value)} type="date" dir="ltr" /></div>
          <div><Label>پایان دوره</Label><Input value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} type="date" dir="ltr" /></div>
          <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => void load()} disabled={loading}><RefreshCw className="w-4 h-4 ml-2" />به‌روزرسانی</Button></div>
        </div>

        {loading ? <div className="h-48 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div> : rows.length === 0 ? <div className="rounded-lg border p-8 text-center text-slate-500">متره آماده برای صورت‌وضعیت وجود ندارد.</div> : <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-center"><input type="checkbox" checked={selected.length === rows.length && rows.length > 0} onChange={toggleAll} /></th>
                <th className="p-2 text-right">منبع</th><th className="p-2 text-right">کد فهرست</th><th className="p-2 text-right">شرح</th><th className="p-2 text-right">قرارداد / پیمانکار</th><th className="p-2 text-right">تاریخ</th><th className="p-2 text-left">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <tr key={r.id} className={`border-t ${selected.includes(r.id) ? "bg-indigo-50" : ""}`}>
                <td className="p-2 text-center"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-2">{r.source_type === "inspection" ? "بازدید" : "دستورکار"} #{Number(r.source_id).toLocaleString("fa-IR")}</td>
                <td className="p-2 font-mono">{r.price_code || "—"}</td>
                <td className="p-2 min-w-[260px]">{r.description}</td>
                <td className="p-2 min-w-[180px]">{r.contract_title || "—"}<div className="text-xs text-slate-500">{r.contractor_name || "—"}</div></td>
                <td className="p-2 whitespace-nowrap">{faDate(r.performed_date)}</td>
                <td className="p-2 text-left whitespace-nowrap font-semibold">{faAmount(r.total_price)} ریال</td>
              </tr>)}
            </tbody>
          </table>
        </div>}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border p-3">
          <div className="text-sm">انتخاب‌شده: <b>{selectedRows.length.toLocaleString("fa-IR")}</b> متره — جمع: <b>{faAmount(total)} ریال</b></div>
          {!canInvoice && selectedRows.length > 0 && <div className="text-sm text-red-600">برای صدور، همه متره‌های انتخابی باید متعلق به یک قرارداد باشند.</div>}
        </div>
      </div>
      <DialogFooter className="flex-row-reverse sm:flex-row-reverse">
        <Button variant="outline" onClick={onClose}>بستن</Button>
        <Button onClick={() => void issueInvoice()} disabled={!canInvoice || saving} className="bg-emerald-600 hover:bg-emerald-700"><ReceiptText className="w-4 h-4 ml-2" />{saving ? "در حال صدور..." : "صدور صورت‌وضعیت"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
