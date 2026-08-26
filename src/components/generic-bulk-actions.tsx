"use client";
import { useState } from "react";
import { ListChecks, Power, PowerOff, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";

export function GenericBulkActions({ rows, endpoint, entityName, onApplied, canToggleActive = false }: { rows: any[]; endpoint: string; entityName: string; onApplied: () => void; canToggleActive?: boolean }) {
  const [busy, setBusy] = useState(false); const { toast } = useToast();
  const run = async (patch: Record<string, unknown>, label: string) => {
    if (!rows.length) { toast({ title: "هیچ ردیفی انتخاب نشده", description: `برای ${label} ابتدا ردیف‌ها را انتخاب کنید` }); return; }
    setBusy(true); let ok=0, fail=0;
    try { for (const row of rows) { try { await apiClient.put(`${endpoint}/${row.id}`, patch); ok++; } catch { fail++; } } onApplied(); toast({ title: fail ? "اعمال ناقص" : "انجام شد", description: `${ok.toLocaleString("fa-IR")} ${entityName} با موفقیت ${label} شد${fail ? `، ${fail.toLocaleString("fa-IR")} مورد ناموفق بود` : ""}`, variant: fail ? "destructive" : undefined }); }
    finally { setBusy(false); }
  };
  return <DropdownMenu dir="rtl">
    <DropdownMenuTrigger asChild><Button variant="outline" size="icon" disabled={busy} className="h-9 w-9 text-indigo-600 hover:bg-indigo-50 border-indigo-200" title="عملیات گروهی"><ListChecks className="w-4 h-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56"><DropdownMenuLabel className="text-xs text-right">عملیات گروهی</DropdownMenuLabel><DropdownMenuSeparator/>
      {canToggleActive && <><DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => run({is_active: 1}, "فعال") }><Power className="w-4 h-4 text-emerald-600"/>فعال کردن</DropdownMenuItem><DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => run({is_active: 0}, "غیرفعال") }><PowerOff className="w-4 h-4 text-slate-500"/>غیرفعال کردن</DropdownMenuItem></>}
      <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { onApplied(); toast({title:"بروزرسانی شد", description:"جدول با داده‌های جدید بارگذاری شد"}); }}><RefreshCcw className="w-4 h-4 text-blue-600"/>بروزرسانی</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
