"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import { ContractSelect } from "@/components/contract-select";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Receipt, Printer, Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * صدور صورت‌وضعیت — v4.3.86
 *
 * جریان کار:
 *   ۱) انتخاب قرارداد + فهرست بها + دوره (از/تا) + درصد مالیات
 *   ۲) «بارگذاری بازدیدهای دوره» → بازدیدهای ارسال‌شده/تأییدشده قرارداد در دوره،
 *      هر ردیف با قلم متناسب فهرست بها (ولتاژ/مدار/باندل/نوع بازدید/نوع سازه) +
 *      قیمت همان نوع زمین + ضرایب (مثل کاهش بها تیر چوبی)
 *   ۳) اقلام دستی (تعمیرات) از فهرست بها با تعداد دلخواه + اتصال اختیاری به دستورکار
 *   ۴) جمع‌بندی (پایه / ضرایب / خالص / مالیات / نهایی) و صدور
 *   قیمت‌های نهایی همه در سرور از فهرست بها بازمحاسبه می‌شوند.
 */

const METHOD_LABELS: Record<string, string> = {
  climbing: "بازدید صعودی", patrol: "بازدید پیمایشی",
};
/** وضعیت فعال — سازگار با 'active' عددی 1 و رشته '1' */
const isActiveStatus = (v: unknown) => v === "active" || v === 1 || v === "1";
const fa = (n: number | null | undefined) => (n ?? 0).toLocaleString("fa-IR");

interface CandidateInspection {
  inspection_id: number;
  inspection_code: string;
  inspection_date: string;
  line_code: string | null;
  line_name: string | null;
  tower_code: string | null;
  activity_type: string;
  inspection_method: string;
  terrain_type: string;
  terrain_label: string;
  tower_structure: string | null;
  voltage_kv: number | null;
  circuit_count: number | null;
  bundle_count: number | null;
  matched: {
    item_id: number; code: string; title: string; unit: string | null;
    base_unit_price: number | null; coefficients: Array<{ id: number; title: string; percent: number }>;
    coefficient_percent: number; unit_price: number | null;
  } | null;
}

interface PriceListItemLite {
  id: number; code: string; title: string; unit: string | null; unit_price: number;
  voltage_kv?: number | null; circuit_count?: number | null; bundle_count?: number | null;
  activity_type?: string | null; inspection_method?: string | null; tower_structure?: string | null;
  item_kind?: string | null; is_coefficient?: number;
}

interface ManualLine {
  uid: number;
  price_list_item_id: string;
  quantity: string;
  work_order_id: string;
}

interface GeneratedResult {
  invoice_code: string; items_count: number; base_amount: number; coefficient_amount: number;
  net_amount: number; tax_amount: number; final_amount: number; id: number;
}

export function InvoiceBuilderDialog({ open, onClose, onGenerated }: {
  open: boolean; onClose: () => void; onGenerated: () => void;
}) {
  const { toast } = useToast();
  const [contractId, setContractId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [taxPercent, setTaxPercent] = useState("10");

  const [candidates, setCandidates] = useState<CandidateInspection[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candsError, setCandsError] = useState<string | null>(null);

  const [priceItems, setPriceItems] = useState<PriceListItemLite[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [manualLines, setManualLines] = useState<ManualLine[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);

  // بارگذاری فهرست‌های فعال + دستورکارها هنگام باز شدن دیالوگ
  useEffect(() => {
    if (!open) return;
    apiClient.get<any>(API_ENDPOINTS.priceLists)
      .then(r => {
        const arr = Array.isArray(r) ? r : (r?.data || []);
        setPriceLists(arr);
        const actives = arr.filter((l: any) => isActiveStatus(l.status));
        if (actives.length) setPriceListId(prev => prev || String(actives[0].id));
      })
      .catch(() => setPriceLists([]));
    apiClient.get<any>(API_ENDPOINTS.workOrders, { page: 1, page_size: 500 })
      .then(r => setWorkOrders((Array.isArray(r) ? r : (r?.data || []))))
      .catch(() => setWorkOrders([]));
  }, [open]);

  // اقلام فهرست انتخاب‌شده (برای اقلام دستی)
  useEffect(() => {
    if (!open || !priceListId) { setPriceItems([]); return; }
    apiClient.get<any>(API_ENDPOINTS.priceListItems, { list_id: Number(priceListId), page_size: 5000 })
      .then(r => {
        const arr = (Array.isArray(r) ? r : (r?.data || [])) as PriceListItemLite[];
        setPriceItems(arr.filter(i => i.item_kind !== "coefficient" && Number(i.is_coefficient) !== 1));
      })
      .catch(() => setPriceItems([]));
  }, [open, priceListId]);

  // ریست کامل هنگام بسته شدن
  useEffect(() => {
    if (!open) {
      setCandidates(null); setSelected(new Set()); setManualLines([]);
      setResult(null); setError(null); setCandsError(null);
    }
  }, [open]);

  const loadCandidates = async () => {
    if (!contractId) { setCandsError("قرارداد را انتخاب کنید"); return; }
    if (!periodStart || !periodEnd) { setCandsError("دوره (از تاریخ / تا تاریخ) را مشخص کنید"); return; }
    setLoadingCandidates(true); setCandsError(null); setCandidates(null);
    try {
      const r = await apiClient.get<any>(API_ENDPOINTS.invoiceCandidates, {
        contract_id: Number(contractId), period_start: periodStart, period_end: periodEnd,
        ...(priceListId ? { price_list_id: Number(priceListId) } : {}),
      });
      const d = (r as any)?.items || (r as any)?.data?.items || [];
      setCandidates(d);
      // پیش‌فرض: همهٔ بازدیدهای دارای قلم متناسب انتخاب می‌شوند
      setSelected(new Set(d.filter((c: CandidateInspection) => c.matched?.unit_price != null).map((c: CandidateInspection) => c.inspection_id)));
    } catch (err) {
      setCandsError(err instanceof Error ? err.message : "خطا در بارگذاری بازدیدهای دوره");
    } finally { setLoadingCandidates(false); }
  };

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── جمع‌بندی (نمایشی — محاسبه نهایی در سرور انجام می‌شود) ──
  const summary = useMemo(() => {
    let base = 0, coef = 0;
    (candidates || []).forEach(c => {
      if (selected.has(c.inspection_id) && c.matched?.unit_price != null) {
        const b = c.matched.base_unit_price ?? 0;
        base += b;
        coef += (c.matched.unit_price - b);
      }
    });
    manualLines.forEach(ml => {
      const item = priceItems.find(p => String(p.id) === ml.price_list_item_id);
      if (item) {
        const q = Number(ml.quantity) || 0;
        base += (item.unit_price || 0) * q;
      }
    });
    const net = base + coef;
    const tax = net * (Number(taxPercent) || 0) / 100;
    return { base, coef, net, tax, final: net + tax };
  }, [candidates, selected, manualLines, priceItems, taxPercent]);

  const addManualLine = () => setManualLines(prev => [...prev, { uid: Date.now() + Math.random(), price_list_item_id: "", quantity: "1", work_order_id: "" }]);
  const removeManualLine = (uid: number) => setManualLines(prev => prev.filter(l => l.uid !== uid));
  const updateManualLine = (uid: number, patch: Partial<ManualLine>) => setManualLines(prev => prev.map(l => l.uid === uid ? { ...l, ...patch } : l));

  const submit = async () => {
    if (!contractId) { setError("قرارداد را انتخاب کنید"); return; }
    const insItems = (candidates || []).filter(c => selected.has(c.inspection_id)).map(c => ({ inspection_id: c.inspection_id, quantity: 1 }));
    const manItems = manualLines
      .filter(ml => ml.price_list_item_id && Number(ml.quantity) > 0)
      .map(ml => ({
        price_list_item_id: Number(ml.price_list_item_id),
        quantity: Number(ml.quantity),
        ...(ml.work_order_id ? { work_order_id: Number(ml.work_order_id) } : {}),
      }));
    const all = [...insItems, ...manItems];
    if (all.length === 0) { setError("حداقل یک بازدید یا یک قلم انتخاب کنید"); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await apiClient.post<any>(API_ENDPOINTS.invoiceGenerate, {
        contract_id: Number(contractId),
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
        ...(priceListId ? { price_list_id: Number(priceListId) } : {}),
        tax_percent: Number(taxPercent) || 0,
        items: all,
      });
      const d = (r as any)?.data || r;
      setResult({
        id: d.id, invoice_code: d.invoice_code, items_count: d.items_count,
        base_amount: d.base_amount, coefficient_amount: d.coefficient_amount,
        net_amount: d.net_amount, tax_amount: d.tax_amount, final_amount: d.final_amount,
      });
      toast({ title: "صورت‌وضعیت صادر شد", description: `کد: ${d.invoice_code} — ${(d.items_count ?? 0).toLocaleString("fa-IR")} قلم` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در صدور صورت‌وضعیت");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            صدور صورت‌وضعیت از فهرست بها
          </DialogTitle>
          <DialogDescription className="text-right">
            بازدیدها و تعمیرات دورهٔ انتخابی به‌طور خودکار به قلم متناسب فهرست بها متصل و قیمت‌گذاری می‌شوند
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50/70 dark:bg-green-950/20 p-5 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
              <p className="text-lg font-bold text-green-800 dark:text-green-300">صورت‌وضعیت {result.invoice_code} صادر شد</p>
              <p className="text-sm text-green-700 dark:text-green-400 mt-1 nums-fa">{fa(result.items_count)} قلم ثبت شد</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">
                <div className="rounded-lg bg-white/70 dark:bg-slate-800/60 p-2"><p className="text-slate-500">جمع پایه</p><p className="font-bold nums-fa">{fa(result.base_amount)}</p></div>
                <div className="rounded-lg bg-white/70 dark:bg-slate-800/60 p-2"><p className="text-slate-500">کاهش/افزایش بها</p><p className="font-bold nums-fa text-amber-600">{fa(result.coefficient_amount)}</p></div>
                <div className="rounded-lg bg-white/70 dark:bg-slate-800/60 p-2"><p className="text-slate-500">مالیات</p><p className="font-bold nums-fa">{fa(result.tax_amount)}</p></div>
                <div className="rounded-lg bg-white/70 dark:bg-slate-800/60 p-2"><p className="text-slate-500">مبلغ نهایی (ریال)</p><p className="font-bold nums-fa text-indigo-700">{fa(result.final_amount)}</p></div>
              </div>
              <p className="text-xs text-slate-500 mt-3">صورت‌وضعیت با وضعیت «غیرفعال» ثبت شده است — با «عملیات گروهی» فعالش کنید تا محافظت‌شده باشد</p>
            </div>
            <DialogFooter className="flex-row-reverse sm:flex-row-reverse">
              <Button variant="outline" onClick={onClose}>بستن</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => printInvoice(result.id)}>
                <Printer className="w-4 h-4 ml-2" />
                چاپ صورت‌وضعیت
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="bg-red-50 dark:bg-red-950 text-red-600 text-sm p-3 rounded-lg text-right whitespace-pre-line">{error}</div>}

            {/* مشخصات دوره */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">قرارداد (اجباری)</Label>
                  <ContractSelect value={contractId} onChange={setContractId} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">فهرست بهای مبنای محاسبه</Label>
                  <Select value={priceListId} onValueChange={setPriceListId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="آخرین فهرست فعال" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {priceLists.filter(l => isActiveStatus(l.status)).map(l => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name} {l.version ? `(${l.version})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">درصد مالیات</Label>
                  <Input value={taxPercent} onChange={e => setTaxPercent(e.target.value.replace(/[^0-9.]/g, ""))} dir="ltr" className="text-left" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">از تاریخ (اجباری)</Label>
                  <JalaliDatePicker value={periodStart} onChange={setPeriodStart} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 text-right block">تا تاریخ (اجباری)</Label>
                  <JalaliDatePicker value={periodEnd} onChange={setPeriodEnd} />
                </div>
                <div className="flex items-end">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={loadCandidates} disabled={loadingCandidates}>
                    {loadingCandidates ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال بارگذاری...</> : "بارگذاری بازدیدهای دوره"}
                  </Button>
                </div>
              </div>
            </div>

            {candsError && <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-sm p-3 rounded-lg text-right">{candsError}</div>}

            {/* بازدیدهای دوره */}
            {candidates !== null ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium">بازدیدهای دورهٔ انتخابی — {fa(selected.size)} از {fa(candidates.length)} انتخاب شده</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelected(new Set(candidates.filter(c => c.matched?.unit_price != null).map(c => c.inspection_id)))}>انتخاب همه</Button>
                    <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>لغو انتخاب</Button>
                  </div>
                </div>
                {candidates.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    در این دوره برای این قرارداد بازدیدی با وضعیت «ارسال شده» یا «تأیید شده» یافت نشد
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="px-2 py-2 w-8"></th>
                          <th className="px-2 py-2 text-right">کد بازدید</th>
                          <th className="px-2 py-2 text-right">دکل / خط</th>
                          <th className="px-2 py-2">نوع بازدید</th>
                          <th className="px-2 py-2">نوع زمین</th>
                          <th className="px-2 py-2 text-right">قلم فهرست بها</th>
                          <th className="px-2 py-2">بهای واحد (ریال)</th>
                          <th className="px-2 py-2">ضرایب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map(c => {
                          const has = c.matched?.unit_price != null;
                          return (
                            <tr key={c.inspection_id} className={`border-t border-slate-100 dark:border-slate-800 ${selected.has(c.inspection_id) ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`}>
                              <td className="px-2 py-1.5 text-center">
                                <input type="checkbox" className="w-4 h-4" disabled={!has} checked={selected.has(c.inspection_id)} onChange={() => toggle(c.inspection_id)} />
                              </td>
                              <td className="px-2 py-1.5 nums-fa text-right" dir="ltr">{c.inspection_code}</td>
                              <td className="px-2 py-1.5 text-right">{c.tower_code || "—"} / {c.line_code || "—"}</td>
                              <td className="px-2 py-1.5 text-center">{METHOD_LABELS[c.inspection_method] || c.inspection_method || "بازدید"}</td>
                              <td className="px-2 py-1.5 text-center">{c.terrain_label}</td>
                              <td className="px-2 py-1.5 text-right">
                                {has ? (<span className="nums-fa" dir="ltr">{c.matched!.code}</span>) : <Badge className="bg-red-100 text-red-700">قلمی یافت نشد</Badge>}
                              </td>
                              <td className="px-2 py-1.5 text-center nums-fa">{has ? fa(c.matched!.unit_price) : "—"}</td>
                              <td className="px-2 py-1.5 text-center">
                                {has && c.matched!.coefficients.length > 0 ? (
                                  <span className="nums-fa text-amber-700" title={c.matched!.coefficients.map(k => `${k.title} (${k.percent}٪)`).join(" ، ")}>
                                    {c.matched!.coefficient_percent > 0 ? "+" : ""}{c.matched!.coefficient_percent.toLocaleString("fa-IR")}٪
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {/* اقلام دستی (تعمیرات) */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium">اقلام دستی (تعمیرات و عملیات) — {fa(manualLines.length)} قلم</p>
                <Button size="sm" variant="outline" onClick={addManualLine}><Plus className="w-3.5 h-3.5 ml-1" />افزودن قلم</Button>
              </div>
              {manualLines.length === 0 ? (
                <p className="p-3 text-xs text-slate-400 text-center">برای افزودن تعمیرات انجام‌شده (خارج از بازدیدها) قلمی از فهرست بها انتخاب کنید</p>
              ) : (
                <div className="p-3 space-y-2">
                  {manualLines.map(ml => {
                    const item = priceItems.find(p => String(p.id) === ml.price_list_item_id);
                    return (
                      <div key={ml.uid} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-6">
                          <SearchableSelect
                            value={ml.price_list_item_id}
                            onChange={v => updateManualLine(ml.uid, { price_list_item_id: v })}
                            options={priceItems.map(p => ({
                              value: String(p.id),
                              label: `${p.code} — ${(p.title || "").slice(0, 60)}`,
                              description: [p.voltage_kv ? `${Number(p.voltage_kv).toLocaleString("fa-IR")}kV` : null, p.circuit_count ? `${p.circuit_count} مداره` : null, p.activity_type === "inspection" && p.inspection_method ? (METHOD_LABELS[p.inspection_method] || p.inspection_method) : (p.activity_type || null)].filter(Boolean).join(" • "),
                            }))}
                            placeholder="انتخاب قلم از فهرست بها..."
                            searchPlaceholder="جستجوی کد یا شرح..."
                          />
                        </div>
                        <div className="col-span-2">
                          <Input value={ml.quantity} onChange={e => updateManualLine(ml.uid, { quantity: e.target.value.replace(/[^0-9.]/g, "") })} dir="ltr" className="text-left" placeholder="تعداد" />
                        </div>
                        <div className="col-span-3">
                          <SearchableSelect
                            value={ml.work_order_id}
                            onChange={v => updateManualLine(ml.uid, { work_order_id: v })}
                            options={workOrders.map(w => ({ value: String(w.id), label: `${w.wo_code} — ${(w.title || "").slice(0, 40)}` }))}
                            placeholder="دستورکار (اختیاری)"
                            allowClear
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => removeManualLine(ml.uid)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {item ? (
                          <div className="col-span-12 text-[11px] text-slate-400 -mt-1">
                            {item.unit || "عدد"} × {fa(item.unit_price)} ریال = <span className="nums-fa">{fa((item.unit_price || 0) * (Number(ml.quantity) || 0))}</span> ریال
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* جمع‌بندی */}
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs">
                <div><p className="text-slate-500 mb-1">اقلام انتخابی</p><p className="font-bold nums-fa text-sm">{fa(selected.size + manualLines.filter(m => m.price_list_item_id).length)}</p></div>
                <div><p className="text-slate-500 mb-1">جمع پایه (ریال)</p><p className="font-bold nums-fa text-sm">{fa(summary.base)}</p></div>
                <div><p className="text-slate-500 mb-1">کاهش/افزایش بها</p><p className="font-bold nums-fa text-sm text-amber-600">{fa(summary.coef)}</p></div>
                <div><p className="text-slate-500 mb-1">مالیات ({fa(Number(taxPercent) || 0)}٪)</p><p className="font-bold nums-fa text-sm">{fa(summary.tax)}</p></div>
                <div><p className="text-slate-500 mb-1">مبلغ نهایی (ریال)</p><p className="font-bold nums-fa text-sm text-indigo-700">{fa(summary.final)}</p></div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 text-center">جمع نمایشی تقریبی است — مبلغ نهایی هنگام صدور در سرور از فهرست بها بازمحاسبه می‌شود</p>
            </div>

            <DialogFooter className="flex-row-reverse sm:flex-row-reverse">
              <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
              <Button type="button" onClick={submit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
                {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال صدور...</> : <><Receipt className="w-4 h-4 ml-2" />صدور صورت‌وضعیت</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── مشاهده اقلام + چاپ ───
export function InvoiceItemsDialog({ invoice, open, onClose }: {
  invoice: { id: number; invoice_code: string; final_amount?: number | string } | null;
  open: boolean; onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ invoice: any; items: any[] } | null>(null);

  useEffect(() => {
    if (!open || !invoice) { setData(null); return; }
    setLoading(true);
    apiClient.get<any>(API_ENDPOINTS.invoiceItems(invoice.id))
      .then(r => {
        const d = (r as any)?.items ? r : (r as any)?.data;
        setData(d || { invoice: null, items: [] });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, invoice]);

  if (!invoice) return null;
  const inv = data?.invoice;
  const items = data?.items || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            اقلام صورت‌وضعیت {invoice.invoice_code}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
        ) : !data ? (
          <div className="p-6 text-center text-sm text-red-500">بارگذاری اقلام ناموفق بود</div>
        ) : (
          <div className="space-y-3">
            {inv ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="bg-slate-100 text-slate-600">قرارداد: {inv.contract_title || "—"}</Badge>
                <Badge className="bg-slate-100 text-slate-600">پیمانکار: {inv.contractor_name || "—"}</Badge>
                <Badge className="bg-slate-100 text-slate-600 nums-fa">دوره: {inv.period_start} تا {inv.period_end}</Badge>
                <Badge className="bg-indigo-100 text-indigo-700 nums-fa">مبلغ نهایی: {fa(Number(inv.final_amount))} ریال</Badge>
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="max-h-[50vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-2 py-2 w-8">#</th>
                      <th className="px-2 py-2 text-right">شرح</th>
                      <th className="px-2 py-2">واحد</th>
                      <th className="px-2 py-2">تعداد</th>
                      <th className="px-2 py-2">بهای واحد</th>
                      <th className="px-2 py-2">ضریب</th>
                      <th className="px-2 py-2">مبلغ (ریال)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1.5 text-center nums-fa text-slate-400">{(i + 1).toLocaleString("fa-IR")}</td>
                        <td className="px-2 py-1.5 text-right">{it.description}</td>
                        <td className="px-2 py-1.5 text-center">{it.unit}</td>
                        <td className="px-2 py-1.5 text-center nums-fa">{fa(Number(it.quantity))}</td>
                        <td className="px-2 py-1.5 text-center nums-fa">{fa(Number(it.unit_price))}</td>
                        <td className="px-2 py-1.5 text-center nums-fa">{it.coefficient_percent != null ? `${Number(it.coefficient_percent).toLocaleString("fa-IR")}٪` : "—"}</td>
                        <td className="px-2 py-1.5 text-center nums-fa font-medium">{fa(Number(it.total_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter className="flex-row-reverse sm:flex-row-reverse">
              <Button variant="outline" onClick={onClose}>بستن</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => printInvoice(invoice.id)}>
                <Printer className="w-4 h-4 ml-2" />
                چاپ صورت‌وضعیت
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── چاپ رسمی صورت‌وضعیت ───
export async function printInvoice(invoiceId: number) {
  const r = await apiClient.get<any>(API_ENDPOINTS.invoiceItems(invoiceId));
  const d = (r as any)?.items ? (r as any) : (r as any)?.data;
  const inv = d?.invoice || {};
  const items = d?.items || [];

  const toFa = (s: unknown) => String(s ?? "—");
  const num = (v: unknown) => Number(v ?? 0).toLocaleString("fa-IR");
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const rowsHtml = items.map((it: any, i: number) => `
    <tr>
      <td class="c">${(i + 1).toLocaleString("fa-IR")}</td>
      <td class="c" dir="ltr">${esc(it.pli_code || "—")}</td>
      <td class="r">${esc(it.description)}</td>
      <td class="c">${esc(it.unit || "—")}</td>
      <td class="c">${num(it.quantity)}</td>
      <td class="c">${num(it.unit_price)}</td>
      <td class="c">${it.coefficient_percent != null ? num(it.coefficient_percent) + "٪" : "—"}</td>
      <td class="c">${num(it.total_price)}</td>
    </tr>`).join("");

  const sumBase = items.reduce((s: number, it: any) => s + Number(it.base_amount ?? it.total_price ?? 0), 0);
  const sumCoef = items.reduce((s: number, it: any) => s + Number(it.coefficient_amount ?? 0), 0);
  const net = Number(inv.net_amount ?? inv.total_amount ?? 0);
  const tax = Number(inv.tax_amount ?? 0);
  const final = Number(inv.final_amount ?? 0);
  const taxPct = inv.tax_percent != null ? Number(inv.tax_percent).toLocaleString("fa-IR") : "۱۰";

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>صورت‌وضعیت ${esc(inv.invoice_code || "")}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Tahoma, Arial, sans-serif; font-size:11px; color:#000; background:#fff; padding:16px; }
  .head { display:flex; justify-content:space-between; align-items:center; border:2px solid #222; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
  .head h1 { font-size:16px; }
  .head .meta { font-size:11px; line-height:1.9; }
  .info { display:flex; flex-wrap:wrap; gap:6px 18px; border:1px solid #888; padding:8px 12px; border-radius:6px; margin-bottom:10px; font-size:11px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#EBF1DE; border:1px solid #777; padding:6px 4px; font-size:10.5px; text-align:center; }
  td { border:1px solid #999; padding:4px 6px; font-size:10px; }
  td.c { text-align:center; } td.r { text-align:right; }
  tr.alt td { background:#f6f6f6; }
  .totals { margin-top:10px; width:340px; margin-right:auto; }
  .totals td { border:1px solid #777; padding:5px 8px; font-size:11px; }
  .totals td.l { background:#f3f3f3; width:55%; }
  .signs { display:flex; gap:10px; margin-top:26px; }
  .sign { flex:1; border:1px solid #777; border-radius:6px; padding:26px 8px 8px; text-align:center; font-size:11px; }
  .foot { margin-top:14px; text-align:center; font-size:9px; color:#666; }
  @page { size:A4 portrait; margin:12mm; }
</style>
</head>
<body>
  <div class="head">
    <h1>صورت‌وضعیت ${esc(inv.invoice_code || "")}</h1>
    <div class="meta">
      قرارداد: <b>${esc(inv.contract_title || "—")}</b><br>
      پیمانکار: <b>${esc(inv.contractor_name || "—")}</b>
    </div>
    <div class="meta">
      دوره: <b>${toFa(inv.period_start)}</b> تا <b>${toFa(inv.period_end)}</b><br>
      تاریخ چاپ: <b>${new Date().toLocaleDateString("fa-IR")}</b>
    </div>
  </div>
  <div class="info">
    <span>مرحله: <b>${esc(inv.status || "—")}</b></span>
    <span>تعداد اقلام: <b>${items.length.toLocaleString("fa-IR")}</b></span>
    ${inv.district_name ? `<span>امور بهره‌برداری: <b>${esc(inv.district_name)}</b></span>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">ردیف</th><th style="width:70px">کد فهرست</th><th>شرح</th>
        <th style="width:46px">واحد</th><th style="width:44px">تعداد</th>
        <th style="width:80px">بهای واحد (ریال)</th><th style="width:52px">ضریب</th><th style="width:90px">مبلغ (ریال)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <table class="totals">
    <tr><td class="l">جمع بهای پایه اقلام</td><td class="c">${num(sumBase)}</td></tr>
    <tr><td class="l">جمع کاهش / افزایش بها (ضرایب)</td><td class="c">${num(sumCoef)}</td></tr>
    <tr><td class="l">جمع خالص</td><td class="c">${num(net)}</td></tr>
    <tr><td class="l">مالیات بر ارزش افزوده (${taxPct}٪)</td><td class="c">${num(tax)}</td></tr>
    <tr><td class="l"><b>مبلغ نهایی قابل پرداخت (ریال)</b></td><td class="c"><b>${num(final)}</b></td></tr>
  </table>
  <div class="signs">
    <div class="sign">تهیه‌کننده</div>
    <div class="sign">تأییدکننده فنی</div>
    <div class="sign">پیمانکار</div>
    <div class="sign">کارفرما</div>
  </div>
  <div class="foot">این صورت‌وضعیت توسط سامانه مدیریت خطوط انتقال برق (Powerline) تولید شده است</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  let printed = false;
  iframe.onload = () => {
    if (printed) return;
    printed = true;
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch { const w = window.open(url, "_blank"); if (w) setTimeout(() => w.print(), 800); }
      setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 2000);
    }, 400);
  };
  iframe.src = url;
  setTimeout(() => {
    if (!printed) {
      printed = true;
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* noop */ }
      setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 2000);
    }
  }, 3000);
}
