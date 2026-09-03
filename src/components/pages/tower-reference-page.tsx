"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { GenericBulkActions } from "@/components/generic-bulk-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/error-log";

interface RefRow { id:number; name?:string; code?:string; title?:string|null; sort_order:number; status:string; }

export function TowerReferencePage({ kind }: { kind: "structures" | "type-codes" }) {
  const endpoint = kind === "structures" ? "tower-structures" : "tower-type-codes";
  const singular = kind === "structures" ? "ساختار دکل" : "کد نوع دکل";
  const [data,setData]=useState<RefRow[]>([]); const [loading,setLoading]=useState(true); const [refreshKey,setRefreshKey]=useState(0);
  const [open,setOpen]=useState(false); const [edit,setEdit]=useState<RefRow|null>(null); const [value,setValue]=useState(""); const [title,setTitle]=useState(""); const [sort,setSort]=useState("0"); const [active,setActive]=useState(true); const [saving,setSaving]=useState(false);
  const tableRef=useRef<DataTableHandle|null>(null); const {toast}=useToast();
  const load=useCallback(async()=>{setLoading(true);try{const r=await apiClient.get<any>(endpoint,{page:1,page_size:500});setData(Array.isArray(r)?r:(r?.data||[]));}catch(e:any){logError({title:`خطا در بارگذاری ${singular}`,message:e?.message||"خطا",source:`pages/${endpoint}`});toast({title:`خطا در بارگذاری ${singular}`,description:e?.message||"خطا",variant:"destructive"});}finally{setLoading(false);}},[endpoint,singular,toast,refreshKey]);
  useEffect(()=>{load()},[load]);
  const columns:DataTableColumn<RefRow>[] = kind === "structures" ? [
    {key:"name",header:"نام ساختار دکل",sortable:true,filterable:true,align:"right"},
    {key:"sort_order",header:"ترتیب",sortable:true,filterable:true,type:"number",align:"right"},
    {key:"status",header:"وضعیت",sortable:true,filterable:true,type:"status",align:"right"},
  ] : [
    {key:"code",header:"کد",sortable:true,filterable:true,align:"right"},
    {key:"title",header:"عنوان",sortable:true,filterable:true,align:"right"},
    {key:"sort_order",header:"ترتیب",sortable:true,filterable:true,type:"number",align:"right"},
    {key:"status",header:"وضعیت",sortable:true,filterable:true,type:"status",align:"right"},
  ];
  const start=(row?:RefRow)=>{setEdit(row||null);setValue(row?.name||row?.code||"");setTitle(row?.title||"");setSort(String(row?.sort_order??0));setActive((row?.status??"active")==="active");setOpen(true)};
  const save=async()=>{if(!value.trim()){toast({title:"مقدار الزامی است",variant:"destructive"});return;} setSaving(true); try{const payload=kind==="structures"?{name:value.trim(),sort_order:Number(sort)||0,status:active?"active":"inactive"}:{code:value.trim(),title:title.trim()||null,sort_order:Number(sort)||0,status:active?"active":"inactive"}; if(edit) await apiClient.put(`${endpoint}/${edit.id}`,payload); else await apiClient.post(endpoint,payload); setOpen(false);setRefreshKey(k=>k+1);toast({title:"ذخیره شد"});}catch(e:any){toast({title:"ذخیره انجام نشد",description:e?.message||"خطا",variant:"destructive"})}finally{setSaving(false)}};
  const remove=async(rows:RefRow[])=>{if(!rows.length)return;for(const r of rows){try{await apiClient.delete(`${endpoint}/${r.id}`)}catch{}}setRefreshKey(k=>k+1);tableRef.current?.clearSelection()};
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2"><div><h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{singular}</h2><p className="text-xs text-slate-500">مدیریت مقادیر مرجع مورد استفاده در فرم‌ها</p></div><Button onClick={()=>start()} className="gap-2"><Plus className="w-4 h-4"/>افزودن</Button></div>
    <DataTable data={data} columns={columns} loading={loading} title={singular} accessKey={kind==="structures"?"tower-structures":"tower-type-codes"} searchKeys={kind==="structures"?["name"]:["code","title"]} onAdd={()=>start()} onRefresh={()=>setRefreshKey(k=>k+1)} onEdit={start} onDelete={remove} tableRef={tableRef} layoutKey={`tower-${kind}`} toolbarExtra={(rows)=><GenericBulkActions rows={rows} endpoint={endpoint} entityName={singular} onApplied={()=>setRefreshKey(k=>k+1)} canToggleStatus/>}/>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle className="text-right">{edit?`ویرایش ${singular}`:`ثبت ${singular} جدید`}</DialogTitle></DialogHeader><div className="space-y-4 text-right">
      <div className="space-y-2"><Label className="text-right block">{kind==="structures"?"نام ساختار":"کد"}</Label><Input value={value} onChange={e=>setValue(e.target.value)} dir="rtl" /></div>
      {kind==="type-codes"&&<div className="space-y-2"><Label className="text-right block">عنوان</Label><Input value={title} onChange={e=>setTitle(e.target.value)} /></div>}
      <div className="space-y-2"><Label className="text-right block">ترتیب نمایش</Label><Input type="number" value={sort} onChange={e=>setSort(e.target.value)} dir="ltr" /></div>
      <div className="flex items-center justify-between border rounded-lg px-3 py-2"><Label>فعال</Label><Switch checked={active} onCheckedChange={setActive}/></div>
    </div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>انصراف</Button><Button onClick={save} disabled={saving}>{saving?<Loader2 className="w-4 h-4 animate-spin"/>:"ذخیره"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
