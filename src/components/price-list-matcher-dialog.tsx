"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ReceiptText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const terrainFa: Record<string,string> = { plain:"دشت و تپه‌ماهور", semi_mountainous:"نیمه‌کوهستانی", mountainous:"صعب‌العبور" };
const methodFa: Record<string,string> = { patrol:"پیمایشی", climbing:"صعودی" };

export function PriceListMatcherDialog({
  open, onClose, sourceType, sourceId, sourceLabel, onCreated
}: { open:boolean; onClose:()=>void; sourceType:"inspection"|"work_order"; sourceId:number|null; sourceLabel?:string; onCreated?:()=>void }) {
  const { toast } = useToast();
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [result,setResult]=useState<any>(null);
  const [quantity,setQuantity]=useState("1");

  useEffect(()=>{
    if (!open || !sourceId) { setResult(null); return; }
    setLoading(true); setResult(null); setQuantity("1");
    apiClient.get<any>(API_ENDPOINTS.priceListMatch(sourceType,sourceId))
      .then(r=>setResult(r?.data ?? r))
      .catch(e=>setResult({matched:false,message:e instanceof Error?e.message:"خطا در تطبیق"}))
      .finally(()=>setLoading(false));
  },[open,sourceId,sourceType]);

  const saveMeasurement=async()=>{
    if(!sourceId || !result?.matched) return;
    const q=Number(quantity);
    if(!q || q<=0){toast({title:"مقدار نامعتبر است",variant:"destructive"});return;}
    setSaving(true);
    try{
      await apiClient.post(API_ENDPOINTS.billingMeasurements,{source_type:sourceType,source_id:sourceId,price_list_id:result.price_list.id,quantity:q});
      toast({title:"متره ثبت شد",description:"عملیات به فهرست بها متصل شد و برای صورت‌وضعیت آماده است."});
      onCreated?.(); onClose();
    }catch(e){toast({title:"ثبت متره ناموفق بود",description:e instanceof Error?e.message:"خطای نامشخص",variant:"destructive"});}
    finally{setSaving(false);}
  };

  const c=result?.context;
  const base=result?.base_item;
  const adjustments=result?.adjustments||[];
  const qty=Number(quantity)||0;
  const total=qty*(Number(result?.unit_total)||0);

  return <Dialog open={open} onOpenChange={v=>!v&&onClose()}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="text-right">اتصال عملیات به فهرست بها</DialogTitle></DialogHeader>
      {loading ? <div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600"/></div> : !result ? null : <div className="space-y-4 text-right" dir="rtl">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="font-semibold">{sourceLabel || (sourceType === "inspection" ? "بازدید" : "دستورکار")} #{sourceId?.toLocaleString("fa-IR")}</div>
          {c && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-sm">
            <Badge variant="outline">ولتاژ: {c.voltage_kv ?? "—"} کیلوولت</Badge>
            <Badge variant="outline">مدار: {c.circuit_count ?? "—"}</Badge>
            <Badge variant="outline">باندل: {c.bundle_count ?? "—"}</Badge>
            <Badge variant="outline">زمین: {terrainFa[c.terrain_type] || c.terrain_type || "—"}</Badge>
            <Badge variant="outline">ساختار: {c.tower_structure || "—"}</Badge>
            {sourceType === "inspection" && <Badge variant="outline">نوع بازدید: {methodFa[c.inspection_method] || c.inspection_method || "—"}</Badge>}
            {sourceType === "inspection" && <Badge variant="outline">نفرات: {c.crew_size ?? "—"}</Badge>}
          </div>}
        </div>
        {!result.matched ? <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4">{result.message || "ردیف مطابق پیدا نشد"}</div> : <>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex items-center justify-between gap-3"><div className="font-bold">ردیف اصلی</div><Badge className="bg-indigo-600">{base.code}</Badge></div>
            <div className="mt-2 text-sm leading-6">{base.title}</div>
            <div className="mt-2 font-semibold nums-fa">{Number(base.unit_price).toLocaleString("fa-IR")} ریال / {base.unit || "واحد"}</div>
          </div>
          {adjustments.length>0 && <div className="space-y-2"><div className="font-bold">افزایش / کاهش اعمال‌شده</div>{adjustments.map((a:any)=><div key={a.id} className="flex items-center justify-between gap-3 rounded border p-2 text-sm"><span>{a.title}</span><span className={Number(a.amount)<0?"text-red-600":"text-emerald-700"}>{Number(a.amount).toLocaleString("fa-IR")} ریال</span></div>)}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end"><div><Label>مقدار متره</Label><Input value={quantity} onChange={e=>setQuantity(e.target.value)} type="number" min="0.001" step="0.001" dir="ltr" /></div><div className="rounded-lg bg-slate-900 text-white p-3"><div className="text-xs opacity-80">مبلغ واحد پس از اعمال قوانین</div><div className="font-bold text-lg nums-fa">{Number(result.unit_total).toLocaleString("fa-IR")} ریال</div><div className="text-xs mt-1 opacity-80">مبلغ کل: {total.toLocaleString("fa-IR")} ریال</div></div></div>
        </>}
      </div>}
      <DialogFooter className="flex-row-reverse sm:flex-row-reverse">
        <Button variant="outline" onClick={onClose}>بستن</Button>
        {result?.matched && <Button onClick={saveMeasurement} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving?<><Loader2 className="w-4 h-4 ml-2 animate-spin"/>در حال ذخیره...</>:<><ReceiptText className="w-4 h-4 ml-2"/>ثبت متره</>}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
