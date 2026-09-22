"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
 * صدور صورت‌وضعیت — v4.3.87 (فهرست بهای کشوری)
 *
 * جریان کار:
 *   ۱) انتخاب قرارداد + فهرست بها + دوره (از/تا) + درصد مالیات
 *   ۲) «بارگذاری بازدیدهای دوره» → هر بازدید با ردیف متناسب فهرست کشوری:
 *      ولتاژ/مدار/باندل/روش بازدید از خط + «نوع زمین از موقعیت دکل»
 *      + ضرایب خودکار (باندل خط، بازدید دو نفره، تیر چوبی/تلسکوپی/پایه H)
 *   ۳) اقلام دستی (تعمیرات فصل ۱۰ و…) با تعداد + دکل زمینه (برای ضرایب
 *      زمینِ مسیر نیمه‌کوهستانی/صعب‌العبور بر اساس موقعیت دکل)
 *   ۴) جمع‌بندی (پایه / ضرایب / خالص / مالیات / نهایی) و صدور —
 *      قیمت‌های نهایی همه در سرور از فهرست بها بازمحاسبه می‌شوند.
 */

const METHOD_LABELS: Record<string, string> = {
  climbing: "بازدید صعودی", patrol: "بازدید پیمایشی", drone: "بازدید پهبادی",
};
const fa = (n: number | null | undefined) => (n ?? 0).toLocaleString("fa-IR");
const isActiveStatus = (v: unknown) => v === "active" || v === 1 || v === "1";

interface Coefficient {
  id: number; code: string; title: string; kind: string; kind_label: string; amount: number;
}
interface MatchedItem {
  item_id: number; code: string; title: string; unit: string | null;
  chapter?: number | null; base_unit_price: number;
  coefficients: Coefficient[];
  coefficient_amount: number; unit_price: number; terrain_label?: string;
}
interface CandidateInspection {
  inspection_id: number; inspection_code: string; inspection_date: string;
  line_code: string | null; line_name: string | null; tower_code: string | null;
  inspection_method: string; terrain_type: string | null; terrain_label: string;
  tower_structure: string | null; crew_size: number;
  voltage_kv: number | null; circuit_count: number | null; bundle_count: number | null;
  matched: MatchedItem | null;
}
interface PriceItemLite {
  id: number; code: string; title: string; unit: string | null; unit_price: number;
  chapter?: number | null; item_kind?: string | null; parent_code?: string | null;
  coefficient_kind?: string | null; activity_type?: string | null;
  voltage_kv?: number | null; circuit_count?: number | null; bundle_count?: number | null;
  terrain_type?: string | null; is_active?: unknown; status?: unknown;
}
interface ManualLine {
  key: number;
  price_list_item_id: string;
  quantity: string;
  line_id: string;
  tower_id: string;
  work_order_id: string;
}
interface GeneratedResult {
  id: number; invoice_code: string; items_count: number;
  base_amount: number; coefficient_amount: number;
  net_amount: number; tax_amount: number; final_amount: number;
}

export function InvoiceBuilderDialog({ open, onClose, onGenerated }: {
  open: boolean;
  onClose: () => void;
  onGenerated?: () => void;
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
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [candsLoading, setCandsLoading] = useState(false);
  const [candsError, setCandsError] = useState<string | null>(null);

  const [priceItems, setPriceItems] = useState<PriceItemLite[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [towers, setTowers] = useState<Record<string, any[]>>({});
  const [manualLines, setManualLines] = useState<ManualLine[]>([]);
  const [mChapter, setMChapter] = useState("all");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const manualKey = useState({ v: 1 })[0];

  useEffect(() => {
    if (!open) return;
    setResult(null); setError(null); setCandidates(null); setSelected(new Set());
    setQuantities({}); setManualLines([]); setCandsError(null);
    apiClient.get<unknown>(API_ENDPOINTS.priceLists).then(r => {
      const arr = Array.isArray(r) ? r : ((r as any)?.data || []);
      const act = arr.filter((l: any) => isActiveStatus(l.is_active ?? l.status));
      setPriceLists(act);
      setPriceListId(prev => prev || (act.length ? String(act[act.length - 1].id) : ""));
    }).catch(() => setPriceLists([]));
    apiClient.get<unknown>("/work-orders", { page_size: 500 }).then(r => {
      setWorkOrders((Array.isArray(r) ? r : ((r as any)?.data || [])));
    }).catch(() => setWorkOrders([]));
    apiClient.get<unknown>("/lines", { page_size: 500 }).then(r => {
      setLines((Array.isArray(r) ? r : ((r as any)?.data || [])));
    }).catch(() => setLines([]));
  }, [open]);

  // اقلام فهرست انتخاب‌شده (برای اقلام دستی)
  useEffect(() => {
    if (!priceListId) { setPriceItems([]); return; }
    apiClient.get<unknown>(API_ENDPOINTS.priceListItems, { list_id: Number(priceListId), page_size: 5000 })
      .then(r => { setPriceItems(Array.isArray(r) ? r : ((r as any)?.data || [])); })
      .catch(() => setPriceItems([]));
  }, [priceListId]);

  const loadCandidates = async () => {
    if (!contractId) { setCandsError("ابتدا قرارداد را انتخاب کنید"); return; }
    if (!periodStart || !periodEnd) { setCandsError("بازه زمانی دوره را کامل کنید"); return; }
    setCandsLoading(true); setCandsError(null); setCandidates(null);
    try {
      const r = await apiClient.get<any>(API_ENDPOINTS.invoiceCandidates, {
        contract_id: Number(contractId),
        period_start: periodStart,
        period_end: periodEnd,
        ...(priceListId ? { price_list_id: Number(priceListId) } : {}),
      });
      const items: CandidateInspection[] = r?.items || [];
      setCandidates(items);
      // پیش‌فرض: همهٔ بازدیدهای دارای قلمِ متناسب انتخاب می‌شوند
      const sel = new Set<number>();
      const q: Record<number, string> = {};
      for (const c of items) {
        if (c.matched) { sel.add(c.inspection_id); q[c.inspection_id] = "1"; }
      }
      setSelected(sel);
      setQuantities(q);
      if (!items.length) {
        setCandsError("در این دوره بازدیدی (ارسالی/تأییدشده) برای قرارداد انتخاب‌شده پیدا نشد.");
      }
    } catch (err: unknown) {
      setCandsError((err as Error)?.message || "خطا در بارگذاری بازدیدهای دوره");
    } finally { setCandsLoading(false); }
  };

  const toggleSel = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const addManualLine = () => {
    setManualLines(prev => [...prev, {
      key: Date.now() + prev.length,
      price_list_item_id: "", quantity: "1",
      line_id: "", tower_id: "", work_order_id: "",
    }]);
  };

  const setManual = (key: number, field: keyof ManualLine, value: string) => {
    setManualLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  };

  // برج‌های خط انتخاب‌شده برای اقلام دستی
  const loadTowersForLine = (lineId: string) => {
    if (!lineId || towers[lineId]) return;
    apiClient.get<unknown>("/towers", { line_id: Number(lineId), page_size: 1000 }).then(r => {
      const arr = Array.isArray(r) ? r : ((r as any)?.data || []);
      setTowers(prev => ({ ...prev, [lineId]: arr }));
    }).catch(() => setTowers(prev => ({ ...prev, [lineId]: [] })));
  };

  const manualChapterItems = useMemo(() => {
    const base = priceItems.filter(p => (p.item_kind ?? "base") !== "coefficient" && isActiveStatus(p.is_active ?? p.status));
    if (mChapter === "all") return base;
    return base.filter(p => String(p.chapter ?? "") === mChapter);
  }, [priceItems, mChapter]);

  // ── جمع‌بندی پیش‌نمایش (سرور هنگام صدور بازمحاسبه می‌کند) ──
  const totals = useMemo(() => {
    let base = 0, coef = 0;
    if (candidates) {
      for (const c of candidates) {
        if (!selected.has(c.inspection_id) || !c.matched) continue;
        const q = Math.max(0.001, Number(quantities[c.inspection_id] || "1") || 1);
        base += c.matched.base_unit_price * q;
        coef += c.matched.coefficient_amount * q;
      }
    }
    for (const ml of manualLines) {
      const item = priceItems.find(p => p.id === Number(ml.price_list_item_id));
      if (!item) continue;
      const q = Math.max(0.001, Number(ml.quantity || "1") || 1);
      base += Number(item.unit_price) * q;
    }
    const net = base + coef;
    const tax = net * (Number(taxPercent) || 0) / 100;
    return { base, coef, net, tax, final: net + tax };
  }, [candidates, selected, quantities, manualLines, priceItems, taxPercent]);

  const submit = async () => {
    if (!contractId) { setError("قرارداد را انتخاب کنید"); return; }
    if (!priceListId) { setError("فهرست بها را انتخاب کنید"); return; }
    const items: unknown[] = [];
    let picked = 0;
    if (candidates) {
      for (const c of candidates) {
        if (!selected.has(c.inspection_id) || !c.matched) continue;
        picked++;
        items.push({
          inspection_id: c.inspection_id,
          quantity: Math.max(0.001, Number(quantities[c.inspection_id] || "1") || 1),
        });
      }
    }
    for (const ml of manualLines) {
      if (!ml.price_list_item_id) continue;
      picked++;
      items.push({
        price_list_item_id: Number(ml.price_list_item_id),
        quantity: Math.max(0.001, Number(ml.quantity || "1") || 1),
        ...(ml.line_id ? { line_id: Number(ml.line_id) } : {}),
        ...(ml.tower_id ? { tower_id: Number(ml.tower_id) } : {}),
        ...(ml.work_order_id ? { work_order_id: Number(ml.work_order_id) } : {}),
      });
    }
    if (!picked) { setError("حداقل یک بازدید یا قلم دستی انتخاب کنید"); return; }

    setSubmitting(true); setError(null);
    try {
      const r = await apiClient.post<any>(API_ENDPOINTS.invoiceGenerate, {
        contract_id: Number(contractId),
        price_list_id: Number(priceListId),
        period_start: periodStart || new Date().toISOString().slice(0, 10),
        period_end: periodEnd || new Date().toISOString().slice(0, 10),
        tax_percent: Number(taxPercent) || 0,
        items,
      });
      const d = (r as any)?.data ?? r ?? {};
      setResult({
        id: Number(d.id), invoice_code: String(d.invoice_code ?? ""),
        items_count: Number(d.items_count ?? 0),
        base_amount: Number(d.base_amount ?? 0), coefficient_amount: Number(d.coefficient_amount ?? 0),
        net_amount: Number(d.net_amount ?? 0), tax_amount: Number(d.tax_amount ?? 0),
        final_amount: Number(d.final_amount ?? 0),
      });
      toast({ title: `صورت‌وضعیت ${d.invoice_code ?? ""} صادر شد`, description: `${Number(d.items_count ?? 0).toLocaleString("fa-IR")} ردیف (پایه + ضرایب)` });
      onGenerated?.();
    } catch (err: unknown) {
      setError((err as Error)?.message || "خطا در صدور صورت‌وضعیت");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-600" /> صدور صورت‌وضعیت از فهرست بهای کشوری
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-900/20">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">
                صورت‌وضعیت <b dir="ltr">{result.invoice_code}</b> با {result.items_count.toLocaleString("fa-IR")} ردیف صادر شد
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
              <SumCard label="بهای پایه" value={result.base_amount} />
              <SumCard label="کاهش/افزایش بها" value={result.coefficient_amount} accent />
              <SumCard label="جمع خالص" value={result.net_amount} />
              <SumCard label="مالیات" value={result.tax_amount} />
              <SumCard label="قابل پرداخت" value={result.final_amount} strong />
            </div>
            <DialogFooter className="flex-row-reverse">
              <Button variant="outline" onClick={() => printInvoice(result.id)}>
                <Printer className="w-4 h-4 ml-2" /> چاپ صورت‌وضعیت
              </Button>
              <Button variant="outline" onClick={() => { setResult(null); onClose(); }}>بستن</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setResult(null)}>
                صدور صورت‌وضعیت جدید
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* تنظیمات دوره */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">قرارداد *</Label>
                <ContractSelect value={contractId} onChange={v => setContractId(v ?? "")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">فهرست بها *</Label>
                <Select value={priceListId} onValueChange={setPriceListId}>
                  <SelectTrigger><SelectValue placeholder="انتخاب فهرست…" /></SelectTrigger>
                  <SelectContent>
                    {priceLists.map((l: any) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}{l.version ? ` — ${l.version}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">از تاریخ</Label>
                <JalaliDatePicker value={periodStart} onChange={v => setPeriodStart(v ?? "")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">تا تاریخ</Label>
                <JalaliDatePicker value={periodEnd} onChange={v => setPeriodEnd(v ?? "")} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={loadCandidates} disabled={candsLoading || !priceListId}>
                {candsLoading ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
                بارگذاری بازدیدهای دوره
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                درصد مالیات
                <Input value={taxPercent} onChange={e => setTaxPercent(e.target.value)} dir="ltr" className="h-8 w-16 text-center text-xs nums-fa" />
              </label>
              {candidates ? (
                <Badge variant="secondary" className="nums-fa">
                  {candidates.length.toLocaleString("fa-IR")} بازدید — {selected.size.toLocaleString("fa-IR")} انتخاب‌شده
                </Badge>
              ) : null}
            </div>

            {candsError ? (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {candsError}
              </p>
            ) : null}

            {/* بازدیدهای دوره */}
            {candidates && candidates.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800">
                      <tr>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="px-2 py-2">بازدید</th>
                        <th className="px-2 py-2">خط / دکل</th>
                        <th className="px-2 py-2">زمین / روش</th>
                        <th className="px-2 py-2">ردیف فهرست</th>
                        <th className="w-14 px-2 py-2">تعداد</th>
                        <th className="px-2 py-2 text-left">بها (ریال)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map(c => (
                        <CandidateRow
                          key={c.inspection_id}
                          c={c}
                          checked={selected.has(c.inspection_id)}
                          qty={quantities[c.inspection_id] ?? "1"}
                          onToggle={() => toggleSel(c.inspection_id)}
                          onQty={v => setQuantities(prev => ({ ...prev, [c.inspection_id]: v }))}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* اقلام دستی */}
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">اقلام دستی (تعمیرات و سایر فصول)</span>
                  <Select value={mChapter} onValueChange={setMChapter}>
                    <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه فصل‌ها</SelectItem>
                      <SelectItem value="2">فصل ۲ — نگهداری</SelectItem>
                      <SelectItem value="7">فصل ۷ — کشیک</SelectItem>
                      <SelectItem value="8">فصل ۸ — پهبادی</SelectItem>
                      <SelectItem value="10">فصل ۱۰ — تعمیرات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={addManualLine}>
                  <Plus className="ml-1 h-4 w-4" /> افزودن قلم
                </Button>
              </div>
              {manualLines.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-400">
                  برای افزودن تعمیرات (فصل ۱۰) یا سایر اقلام، «افزودن قلم» را بزنید — با انتخاب دکل، ضرایب مسیر بر اساس موقعیت دکل اعمال می‌شود.
                </p>
              ) : null}
              {manualLines.map(ml => (
                <ManualLineRow
                  key={ml.key}
                  line={ml}
                  items={manualChapterItems}
                  lines={lines}
                  towers={towers[ml.line_id] || []}
                  workOrders={workOrders}
                  onTowerLoad={loadTowersForLine}
                  onChange={setManual}
                  onRemove={() => setManualLines(prev => prev.filter(l => l.key !== ml.key))}
                />
              ))}
            </div>

            {/* جمع‌بندی */}
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
              <SumCard label="بهای پایه" value={totals.base} />
              <SumCard label="کاهش/افزایش بها" value={totals.coef} accent />
              <SumCard label="جمع خالص" value={totals.net} />
              <SumCard label={`مالیات (${taxPercent || 0}٪)`} value={totals.tax} />
              <SumCard label="قابل پرداخت" value={totals.final} strong />
            </div>

            {error ? <p className="whitespace-pre-line rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20">{error}</p> : null}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>انصراف</Button>
              <Button onClick={submit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
                {submitting ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />در حال صدور...</> : <><Receipt className="w-4 h-4 ml-2" />صدور صورت‌وضعیت</>}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SumCard({ label, value, accent, strong }: { label: string; value: number; accent?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${strong ? "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-700"}`}>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`nums-fa mt-0.5 tabular-nums ${strong ? "text-base font-bold text-indigo-700 dark:text-indigo-300" : "text-sm font-medium"} ${accent && value < 0 ? "text-red-600" : ""}`}>
        {value < 0 ? "−" : ""}{Math.abs(Math.round(value)).toLocaleString("fa-IR")}
      </p>
    </div>
  );
}

function CandidateRow({ c, checked, qty, onToggle, onQty }: {
  c: CandidateInspection; checked: boolean; qty: string;
  onToggle: () => void; onQty: (v: string) => void;
}) {
  const m = c.matched;
  return (
    <tr className={`border-t border-slate-100 dark:border-slate-800 ${checked ? "bg-indigo-50/40 dark:bg-indigo-900/10" : ""}`}>
      <td className="px-2 py-1.5 text-center">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-3.5 w-3.5 accent-indigo-600" />
      </td>
      <td className="px-2 py-1.5">
        <div className="font-mono text-[10px] text-slate-500" dir="ltr">{c.inspection_code}</div>
        <div className="nums-fa text-[10px] text-slate-400">{c.inspection_date}</div>
      </td>
      <td className="px-2 py-1.5">
        <div className="text-slate-700 dark:text-slate-200">{c.line_code || "—"}</div>
        <div className="text-[10px] text-slate-400">دکل {c.tower_code || "—"}{c.tower_structure ? ` — ${c.tower_structure}` : ""}</div>
      </td>
      <td className="px-2 py-1.5">
        <Badge variant="outline" className="text-[10px] text-lime-700 border-lime-300">{c.terrain_label}</Badge>
        <div className="mt-0.5 text-[10px] text-slate-500">
          {METHOD_LABELS[c.inspection_method] || c.inspection_method}
          {c.crew_size > 1 ? ` — ${c.crew_size.toLocaleString("fa-IR")} نفره` : ""}
        </div>
      </td>
      <td className="max-w-64 px-2 py-1.5">
        {m ? (
          <>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-indigo-600" dir="ltr">{m.code}</span>
              {m.chapter ? <Badge className="bg-slate-100 px-1 py-0 text-[9px] text-slate-500">فصل {m.chapter}</Badge> : null}
            </div>
            <div className="truncate text-[11px] text-slate-600 dark:text-slate-300" title={m.title}>{m.title}</div>
            {m.coefficients.length ? (
              <div className="mt-0.5 space-y-0.5">
                {m.coefficients.map(k => (
                  <div key={k.id} className="flex items-center gap-1 text-[10px]">
                    <span className={k.amount < 0 ? "text-red-500" : "text-emerald-600"}>
                      {k.amount < 0 ? "−" : "+"}{Math.abs(k.amount).toLocaleString("fa-IR")}
                    </span>
                    <span className="text-slate-400">{k.kind_label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <span className="text-[11px] text-red-500">قلم متناسب یافت نشد</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <Input value={qty} onChange={e => onQty(e.target.value)} dir="ltr" disabled={!checked || !m}
          className="h-7 w-12 text-center text-xs nums-fa" />
      </td>
      <td className="px-2 py-1.5 text-left">
        {m ? (
          <>
            <div className="nums-fa text-[11px] tabular-nums text-slate-500">{fa(m.base_unit_price)}</div>
            <div className={`nums-fa text-sm font-medium tabular-nums ${m.unit_price < m.base_unit_price ? "text-red-600" : "text-slate-800 dark:text-slate-100"}`}>
              {fa(m.unit_price)}
            </div>
          </>
        ) : "—"}
      </td>
    </tr>
  );
}

function ManualLineRow({ line, items, lines, towers, workOrders, onTowerLoad, onChange, onRemove }: {
  line: ManualLine;
  items: PriceItemLite[];
  lines: any[];
  towers: any[];
  workOrders: any[];
  onTowerLoad: (lineId: string) => void;
  onChange: (key: number, field: keyof ManualLine, value: string) => void;
  onRemove: () => void;
}) {
  const item = items.find(p => p.id === Number(line.price_list_item_id));
  return (
    <div className="grid grid-cols-12 items-end gap-2 rounded-md border border-slate-100 p-2 dark:border-slate-800">
      <div className="col-span-12 space-y-1 md:col-span-5">
        <Label className="text-[11px] text-slate-500">ردیف فهرست بها</Label>
        <SearchableSelect
          value={line.price_list_item_id}
          onChange={v => onChange(line.key, "price_list_item_id", v ?? "")}
          options={items.map(p => ({
            value: String(p.id),
            label: `${p.code} — ${p.title.slice(0, 70)}${p.chapter ? ` (فصل ${p.chapter})` : ""}`,
          }))}
          placeholder="جستجو و انتخاب ردیف…"
        />
        {item ? <p className="nums-fa text-[10px] text-slate-400">بهای واحد: {fa(Number(item.unit_price))} ریال — {item.unit || "—"}</p> : null}
      </div>
      <div className="col-span-4 space-y-1 md:col-span-2">
        <Label className="text-[11px] text-slate-500">تعداد</Label>
        <Input value={line.quantity} onChange={e => onChange(line.key, "quantity", e.target.value)} dir="ltr" className="h-8 text-xs nums-fa" />
      </div>
      <div className="col-span-4 space-y-1 md:col-span-2">
        <Label className="text-[11px] text-slate-500">خط (زمینه)</Label>
        <Select value={line.line_id} onValueChange={v => { onChange(line.key, "line_id", v); onChange(line.key, "tower_id", ""); onTowerLoad(v); }}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {lines.map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.line_code} — {String(l.name ?? "").slice(0, 30)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-4 space-y-1 md:col-span-2">
        <Label className="text-[11px] text-slate-500">دکل (زمینه ضرایب)</Label>
        <Select value={line.tower_id} onValueChange={v => onChange(line.key, "tower_id", v)} disabled={!line.line_id}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {towers.map((t: any) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.tower_code}{t.terrain_type ? ` — ${({ plain: "دشت", hilly: "تپه‌ماهور", semi_mountainous: "نیمه‌کوهستانی", impassable: "صعب‌العبور" } as any)[t.terrain_type] || ""}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-11 space-y-1 md:col-span-1">
        <Label className="text-[11px] text-slate-500">حذف</Label>
        <Button variant="ghost" size="sm" onClick={onRemove} className="h-8 w-8 p-0 text-red-500 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="col-span-12 space-y-1 md:col-span-12">
        <Label className="text-[11px] text-slate-500">دستورکار (اختیاری)</Label>
        <Select value={line.work_order_id} onValueChange={v => onChange(line.key, "work_order_id", v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {workOrders.map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.wo_code} — {String(w.title ?? "").slice(0, 40)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
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
                      <th className="px-2 py-2">مبلغ (ریال)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => {
                      const isCoef = Number(it.coefficient_amount ?? 0) !== 0 && !Number(it.base_amount ?? 0);
                      return (
                        <tr key={it.id} className={`border-t border-slate-100 dark:border-slate-800 ${isCoef ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}>
                          <td className="px-2 py-1.5 text-center nums-fa text-slate-400">{(i + 1).toLocaleString("fa-IR")}</td>
                          <td className="px-2 py-1.5 text-right">
                            {isCoef ? <span className="ml-1 text-amber-600" aria-hidden>↳</span> : null}
                            {it.description}
                            {isCoef ? <Badge className="mr-1 bg-amber-100 px-1 py-0 text-[9px] text-amber-800 hover:bg-amber-100">ضریب</Badge> : null}
                          </td>
                          <td className="px-2 py-1.5 text-center">{it.unit}</td>
                          <td className="px-2 py-1.5 text-center nums-fa">{fa(Number(it.quantity))}</td>
                          <td className={`px-2 py-1.5 text-center nums-fa ${Number(it.unit_price) < 0 ? "text-red-600" : ""}`}>
                            {Number(it.unit_price) < 0 ? "−" : ""}{fa(Math.abs(Number(it.unit_price)))}
                          </td>
                          <td className={`px-2 py-1.5 text-center nums-fa font-medium ${Number(it.total_price) < 0 ? "text-red-600" : ""}`}>
                            {Number(it.total_price) < 0 ? "−" : ""}{fa(Math.abs(Number(it.total_price)))}
                          </td>
                        </tr>
                      );
                    })}
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

// ─── چاپ رسمی صورت‌وضعیت (A4 — مطابق فهرست بهای کشوری) ───
export async function printInvoice(invoiceId: number) {
  const r = await apiClient.get<any>(API_ENDPOINTS.invoiceItems(invoiceId));
  const d = (r as any)?.items ? (r as any) : (r as any)?.data;
  const inv = d?.invoice || {};
  const items = d?.items || [];

  const toFa = (s: unknown) => String(s ?? "—");
  const num = (v: unknown) => Number(v ?? 0).toLocaleString("fa-IR");
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const rowsHtml = items.map((it: any, i: number) => {
    const isCoef = Number(it.coefficient_amount ?? 0) !== 0 && !Number(it.base_amount ?? 0);
    const up = Number(it.unit_price ?? 0);
    const tp = Number(it.total_price ?? 0);
    return `
    <tr${isCoef ? ' class="coef"' : ""}>
      <td class="c">${(i + 1).toLocaleString("fa-IR")}</td>
      <td class="c" dir="ltr">${esc(it.pli_code || "—")}</td>
      <td class="r">${isCoef ? "&nbsp;&nbsp;↳ " : ""}${esc(it.description)}</td>
      <td class="c">${esc(it.unit || "—")}</td>
      <td class="c">${num(it.quantity)}</td>
      <td class="c">${up < 0 ? "−" : ""}${num(Math.abs(up))}</td>
      <td class="c">${tp < 0 ? "−" : ""}${num(Math.abs(tp))}</td>
    </tr>`;
  }).join("");

  const sumBase = items.reduce((s: number, it: any) => s + Number(it.base_amount ?? 0), 0);
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
  tr.coef td { background:#FBF6E9; }
  tr.coef td.r { color:#7a5b00; }
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
    <span>تعداد ردیف: <b>${items.length.toLocaleString("fa-IR")}</b> (شامل ضرایب کاهش/افزایش بها)</span>
    ${inv.district_name ? `<span>امور بهره‌برداری: <b>${esc(inv.district_name)}</b></span>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">ردیف</th><th style="width:78px">کد فهرست</th><th>شرح</th>
        <th style="width:46px">واحد</th><th style="width:44px">تعداد</th>
        <th style="width:90px">بهای واحد (ریال)</th><th style="width:95px">مبلغ (ریال)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <table class="totals">
    <tr><td class="l">جمع بهای پایه اقلام</td><td class="c">${num(sumBase)}</td></tr>
    <tr><td class="l">جمع کاهش / افزایش بها (ضرایب)</td><td class="c">${sumCoef < 0 ? "−" : ""}${num(Math.abs(sumCoef))}</td></tr>
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
