"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { DataTable, type DataTableColumn, type DataTableHandle } from "@/components/data-table";
import { CreateLineDialog } from "@/components/create-line-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function LinesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rowsToDelete, setRowsToDelete] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const deletingRowsRef = useRef<any[]>([]);
  const tableRef = useRef<DataTableHandle | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 500, search: search || undefined });
      setData(result?.data || []);
    } catch (err) { console.error("خطا:", err); }
    finally { setLoading(false); }
  }, [search, refreshKey]);

  useEffect(() => {
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [load]);

  // Copy toast only — data-table itself writes TSV to clipboard
  const handleCopy = useCallback((rows: any[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای کپی، ابتدا ردیف(های) مورد نظر را انتخاب کنید" });
      return;
    }
    toast({
      title: "کپی شد",
      description: `${rows.length.toLocaleString("fa-IR")} ردیف به‌صورت TSV در کلیپ‌بورد کپی شد — آماده پیست در اکسل`
    });
  }, [toast]);

  const handleDeleteRequest = useCallback((rows: any[]) => {
    if (rows.length === 0) {
      toast({ title: "هیچ ردیفی انتخاب نشده", description: "برای حذف، ابتدا ردیف(های) مورد نظر را انتخاب کنید", variant: "destructive" });
      return;
    }
    setRowsToDelete(rows);
  }, [toast]);

  const handleEdit = useCallback((row: any) => {
    setEditRow(row);
    setShowCreate(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    const rows = deletingRowsRef.current;
    if (rows.length === 0) return;

    setIsDeleting(true);
    let success = 0;
    const failedRows: any[] = [];

    for (const row of rows) {
      try {
        await apiClient.delete(`${API_ENDPOINTS.lines}/${row.id}`);
        success++;
      } catch (err: any) {
        console.error("خطا در حذف ردیف:", row.id, err);
        failedRows.push({ row, error: err?.message || "نامشخص" });
      }
    }

    // Clear state — also clear selection inside DataTable
    deletingRowsRef.current = [];
    setRowsToDelete([]);
    setIsDeleting(false);
    setRefreshKey(k => k + 1);
    // IMPORTANT: clear selection in the table so the "X selected" badge disappears
    if (tableRef.current) tableRef.current.clearSelection();

    if (failedRows.length === 0) {
      toast({
        title: "حذف شد",
        description: `${success.toLocaleString("fa-IR")} ردیف با موفقیت از دیتابیس حذف شد`
      });
    } else {
      toast({
        title: "حذف ناقص",
        description: `${success.toLocaleString("fa-IR")} حذف شد، ${failedRows.length.toLocaleString("fa-IR")} ناموفق (${failedRows[0]?.error || "خطای دسترسی"})`,
        variant: "destructive",
      });
    }
  }, [toast]);

  // Sync ref when rowsToDelete changes
  useEffect(() => {
    deletingRowsRef.current = rowsToDelete;
  }, [rowsToDelete]);

  const columns: DataTableColumn<any>[] = [
    { key: "line_code", header: "کد خط", sortable: true, filterable: true, align: "right" },
    { key: "dispatch_code", header: "کد دیسپاچینگ", sortable: true, filterable: true, align: "right" },
    { key: "name", header: "نام خط", sortable: true, filterable: true, width: "340px", wrap: true, align: "right" },
    { key: "group_name", header: "نام مجموعه خط", sortable: true, filterable: true, hidden: true, width: "340px", wrap: true, align: "right" },
    { key: "line_type", header: "نوع", sortable: true, filterable: true, type: "badge", badgeLabels: { transmission: "انتقال", sub_distribution: "فوق توزیع", distribution: "توزیع", sub_transmission: "نیمه انتقال" }, badgeColors: { transmission: "bg-red-100 text-red-700", sub_distribution: "bg-amber-100 text-amber-700", distribution: "bg-blue-100 text-blue-700", sub_transmission: "bg-purple-100 text-purple-700" }, align: "right" },
    { key: "voltage_kv", header: "ولتاژ (kV)", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "circuit_count", header: "مدار", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "bundle_count", header: "باندل", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "conductor_type", header: "نوع سیم", sortable: true, filterable: true, align: "right" },
    { key: "tower_structure_type", header: "نوع سازه دکل", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "length_km", header: "طول خط (km)", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "circuit_length_km", header: "طول مدار (km)", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "total_towers", header: "تعداد کل دکل‌ها", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "tension_towers", header: "دکل‌های کششی", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "suspension_towers", header: "دکل‌های آویزی", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "plain_terrain", header: "دشت", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "semi_mountainous", header: "نیمه‌کوهستانی", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "mountainous", header: "صعب‌العبور", sortable: true, filterable: true, type: "number", align: "right", hidden: true },
    { key: "commission_year", header: "سال بهره‌برداری", sortable: true, filterable: true, type: "number", align: "right" },
    { key: "line_supervisor", header: "سرپرست خط", sortable: true, filterable: true, align: "right" },
    { key: "line_expert", header: "کارشناس خط", sortable: true, filterable: true, align: "right" },
    { key: "owner_org_name", header: "مالک", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true, hidden: true, align: "right" },
    { key: "is_active", header: "فعال", type: "boolean", filterable: true, align: "right" },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        searchKeys={["line_code", "name", "dispatch_code", "conductor_type", "line_supervisor", "line_expert"]}
        title="خطوط انتقال"
        onAdd={() => { setEditRow(null); setShowCreate(true); }}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onCopy={handleCopy}
        onDelete={handleDeleteRequest}
        onEdit={handleEdit}
        tableRef={tableRef}
      />
      <CreateLineDialog
        open={showCreate}
        editRow={editRow}
        onClose={() => { setShowCreate(false); setEditRow(null); }}
        onCreated={() => { setShowCreate(false); setEditRow(null); setRefreshKey(k => k + 1); }}
      />

      <AlertDialog open={rowsToDelete.length > 0} onOpenChange={(o) => { if (!o && !isDeleting) setRowsToDelete([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید حذف</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف {rowsToDelete.length.toLocaleString("fa-IR")} ردیف انتخاب‌شده از دیتابیس مطمئن هستید؟
              این عملیات ردیف‌ها را به‌صورت کامل از دیتابیس حذف می‌کند و قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "در حال حذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
