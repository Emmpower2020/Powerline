"use client";
import { useState, type ReactNode } from "react";
import { ListChecks, Power, PowerOff, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { ContractSelect } from "@/components/contract-select";
import { DistrictSelect } from "@/components/district-select";
import { BulkOperationPanel, type BulkOperationProgress } from "@/components/bulk-operation-dialog";

export function GenericBulkActions({
  rows,
  endpoint,
  entityName,
  onApplied,
  canToggleStatus = false,
  canChangeContract = false,
  canChangeDistrict = false,
  statusField = "status",
  additionalActions,
}: {
  rows: any[];
  endpoint: string;
  entityName: string;
  onApplied: () => void;
  canToggleStatus?: boolean;
  canChangeContract?: boolean;
  /** v4.3.79: نام فیلد وضعیت فعال/غیرفعال — جداول گردش‌کاری activity_status دارند */
  statusField?: string;
  /** v4.3.79: ویرایش گروهی امور بهره‌برداری — برای جدول‌هایی که district_id دارند */
  canChangeDistrict?: boolean;
  additionalActions?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [pendingRun, setPendingRun] = useState<{ patch: Record<string, unknown>; label: string } | null>(null);
  const [operationOpen, setOperationOpen] = useState(false);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractId, setContractId] = useState("");
  // v4.3.79: ویرایش گروهی امور بهره‌برداری — همان الگوی تغییر قرارداد
  const [districtOpen, setDistrictOpen] = useState(false);
  const [districtId, setDistrictId] = useState("");
  const { toast } = useToast();

  const requestRun = (patch: Record<string, unknown>, label: string) => {
    if (!rows.length) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: `برای ${label} ابتدا ردیف‌ها را انتخاب کنید` });
      return;
    }
    setPendingRun({ patch, label });
    setProgress({ completed: 0, total: rows.length, success: 0, failed: 0 });
    setOperationOpen(true);
  };

  const run = async () => {
    if (!pendingRun || !rows.length) return;
    setBusy(true);
    let ok = 0, fail = 0;
    // v4.3.53: درخواست‌ها به‌جای یکی‌یکی، در دسته‌های ۱۰تایی موازی ارسال می‌شوند
    // تا عملیات روی ردیف‌های زیاد چند برابر سریع‌تر تمام شود.
    const CHUNK = 10;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
          chunk.map((row) => apiClient.put(`${endpoint}/${row.id}`, pendingRun.patch)),
        );
        for (const r of results) { if (r.status === "fulfilled") ok++; else fail++; }
        setProgress({ completed: Math.min(i + CHUNK, rows.length), total: rows.length, success: ok, failed: fail });
      }
      onApplied();
      setOperationOpen(false);
      setContractOpen(false);
      setDistrictOpen(false);
      toast({
        title: fail ? "اعمال ناقص" : "انجام شد",
        description: `${pendingRun.label} روی ${ok.toLocaleString("fa-IR")} ${entityName} اعمال شد${fail ? `، ${fail.toLocaleString("fa-IR")} مورد ناموفق بود` : ""}`,
        variant: fail ? "destructive" : undefined,
      });
    } finally {
      setBusy(false);
      setPendingRun(null);
    }
  };

  const openContractDialog = () => {
    if (!rows.length) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "ابتدا ردیف‌های موردنظر را انتخاب کنید" });
      return;
    }
    setContractId("");
    setContractOpen(true);
  };

  const applyContract = async () => {
    if (!contractId) {
      toast({ title: "قرارداد را انتخاب کنید" });
      return;
    }
    // «نامشخص» → قرارداد ردیف‌ها پاک می‌شود (NULL)؛ پنجره باز می‌ماند و به مرحلهٔ تأیید می‌رود
    const isUnknown = contractId === "__unknown__";
    requestRun(
      { contract_id: isUnknown ? null : Number(contractId) },
      isUnknown ? "پاک کردن قرارداد" : "انتقال به قرارداد",
    );
  };

  // ── v4.3.79: تغییر گروهی امور بهره‌برداری ──
  const openDistrictDialog = () => {
    if (!rows.length) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "ابتدا ردیف‌های موردنظر را انتخاب کنید" });
      return;
    }
    setDistrictId("");
    setDistrictOpen(true);
  };

  const applyDistrict = async () => {
    if (!districtId) {
      toast({ title: "امور بهره‌برداری را انتخاب کنید" });
      return;
    }
    // «نامشخص» → امور ردیف‌ها پاک می‌شود (NULL)؛ پنجره باز می‌ماند و به مرحلهٔ تأیید می‌رود
    const isUnknown = districtId === "__unknown__";
    requestRun(
      { district_id: isUnknown ? null : Number(districtId) },
      isUnknown ? "پاک کردن امور بهره‌برداری" : "انتقال به امور بهره‌برداری",
    );
  };

  return <>
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" disabled={busy} className="h-9 w-9 text-indigo-600 hover:bg-indigo-50 border-indigo-200" title="عملیات گروهی">
          <ListChecks className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-right">عملیات گروهی</DropdownMenuLabel>
        <DropdownMenuSeparator/>
        {/* v4.3.80: فعال/غیرفعال همیشه بالای منو — الگوی واحد با خطوط/دکل‌ها/پرسنل */}
        {canToggleStatus && <>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => requestRun({[statusField]: "active"}, "فعال کردن") }><Power className="w-4 h-4 text-emerald-600"/>فعال کردن</DropdownMenuItem>
          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => requestRun({[statusField]: "inactive"}, "غیرفعال کردن") }><PowerOff className="w-4 h-4 text-slate-500"/>غیرفعال کردن</DropdownMenuItem>
        </>}
        {canToggleStatus && (canChangeContract || canChangeDistrict || additionalActions) && <DropdownMenuSeparator />}
        {canChangeContract && <DropdownMenuItem className="gap-2 cursor-pointer" onClick={openContractDialog}>
          <FileText className="w-4 h-4 text-indigo-600" /> تغییر قرارداد
        </DropdownMenuItem>}
        {canChangeDistrict && <DropdownMenuItem className="gap-2 cursor-pointer" onClick={openDistrictDialog}>
          <MapPin className="w-4 h-4 text-emerald-600" /> تغییر امور بهره‌برداری
        </DropdownMenuItem>}
        {(canChangeContract || canChangeDistrict) && additionalActions && <DropdownMenuSeparator />}
        {additionalActions}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* دیالوگ یکپارچه: انتخاب قرارداد/امور → تأیید/اجرا در همان پنجره (بدون فلش نور پس‌زمینه) */}
    <Dialog open={contractOpen || districtOpen || operationOpen} onOpenChange={(open) => { if (!open && !busy) { setContractOpen(false); setDistrictOpen(false); setOperationOpen(false); setPendingRun(null); } }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {operationOpen
              ? (busy ? `در حال اجرای ${pendingRun?.label ?? "عملیات گروهی"}` : "تأیید عملیات گروهی")
              : contractOpen
                ? "تغییر گروهی قرارداد"
                : "تغییر گروهی امور بهره‌برداری"}
          </DialogTitle>
        </DialogHeader>
        {operationOpen ? (
          <BulkOperationPanel
            entityName={entityName}
            operationLabel={pendingRun?.label ?? "عملیات گروهی"}
            progress={progress}
            running={busy}
            onCancel={() => { if (!busy) { setOperationOpen(false); setPendingRun(null); } }}
            onConfirm={run}
          />
        ) : contractOpen ? (
          <>
            <div className="space-y-3">
              <p className="text-sm text-slate-500 text-right">قرارداد انتخاب‌شده روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> ردیف اعمال می‌شود. برای پاک کردن قرارداد «نامشخص» را انتخاب کنید.</p>
              <ContractSelect value={contractId} onChange={setContractId} preserveUnknownValue />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContractOpen(false)} disabled={busy}>انصراف</Button>
              <Button type="button" className="bg-indigo-600 hover:bg-indigo-700" onClick={applyContract} disabled={busy || !contractId}>اعمال روی همه</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-sm text-slate-500 text-right">امور بهره‌برداری انتخاب‌شده روی <span className="font-bold text-indigo-600 nums-fa">{rows.length.toLocaleString("fa-IR")}</span> ردیف اعمال می‌شود. برای پاک کردن امور «نامشخص» را انتخاب کنید.</p>
              <DistrictSelect value={districtId} onChange={setDistrictId} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDistrictOpen(false)} disabled={busy}>انصراف</Button>
              <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={applyDistrict} disabled={busy || !districtId}>اعمال روی همه</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  </>;
}
