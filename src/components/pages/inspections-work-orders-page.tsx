"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { Inspection, WorkOrder, PaginatedResponse } from "@/lib/types";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { CreateInspectionDialog, CreateWorkOrderDialog } from "@/components/create-dialogs";
import { Badge } from "@/components/ui/badge";
import { GenericBulkActions } from "@/components/generic-bulk-actions";

export function InspectionsPage() {
  const [data, setData] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { const result = await apiClient.get<PaginatedResponse<Inspection>>(API_ENDPOINTS.inspections, { page: 1, page_size: 500 }); setData(result?.data || []); }
      catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
    };
    load();
  }, [refreshKey]);

  const statusLabels: Record<string, string> = { draft: "پیش‌نویس", in_progress: "در حال انجام", submitted: "ارسال شده", approved: "تأیید شده", rejected: "رد شده", cancelled: "لغو شده" };
  const priorityLabels: Record<string, string> = { routine: "معمول", emergency: "اضطراری", follow_up: "پیگیری", commissioning: "راه‌اندازی" };
  const handleDelete = async (rows: Inspection[]) => {
    if (!rows.length || !window.confirm(`آیا ${rows.length.toLocaleString("fa-IR")} بازدید حذف شود؟`)) return;
    for (const row of rows) { try { await apiClient.delete(`${API_ENDPOINTS.inspections}/${row.id}`); } catch (e) { console.error(e); } }
    setRefreshKey(k => k + 1);
  };
  const handleDuplicate = async (row: Inspection) => {
    try { await apiClient.post(API_ENDPOINTS.inspections, { inspection_date: row.inspection_date, priority: row.priority, weather: row.weather || null, notes: row.notes || null, line_id: row.line_id || null, tower_id: row.tower_id || null, contract_id: row.contract_id || null, district_id: (row as any).district_id ?? null }); setRefreshKey(k => k + 1); } catch (e) { console.error(e); }
  };

  const columns: DataTableColumn<Inspection>[] = [
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "inspection_code", header: "کد", sortable: true, filterable: true, align: "left" },
    // v4.3.78: امور بهره‌برداری بازدید
    { key: "district_name", header: "امور بهره‌برداری", sortable: true, filterable: true },
    { key: "line_code", header: "خط", sortable: true, filterable: true },
    { key: "tower_code", header: "دکل" },
    { key: "inspector_name", header: "بازرس", sortable: true, filterable: true },
    { key: "inspection_date", header: "تاریخ", sortable: true, type: "date" },
    { key: "priority", header: "نوع", type: "badge", badgeLabels: priorityLabels, badgeColors: { routine: "bg-slate-100 text-slate-700", emergency: "bg-red-100 text-red-700", follow_up: "bg-amber-100 text-amber-700", commissioning: "bg-blue-100 text-blue-700" } },
    // v4.3.78: ستون وضعیت استاندارد فعال/غیرفعال — ستون مرحله با نام «مرحله بازدید» جدا شد
    { key: "status", header: "مرحله بازدید", type: "badge", badgeLabels: statusLabels, badgeColors: { draft: "bg-slate-100 text-slate-700", submitted: "bg-amber-100 text-amber-700", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700", cancelled: "bg-slate-100 text-slate-500" } },
    { key: "activity_status", header: "وضعیت", type: "status", filterable: true, align: "right" },
  ];

  return (
    <div className="space-y-4">
      <DataTable data={data} columns={columns} loading={loading}
        searchKeys={columns.map(c => c.key)}
        title="بازدیدها" onAdd={() => setShowCreate(true)} onRefresh={() => setRefreshKey(k => k + 1)}
        onCopy={() => {}} onDelete={handleDelete} onDuplicate={handleDuplicate} onImport={() => alert("برای وارد کردن اطلاعات بازدید از قالب اکسل پروژه استفاده کنید.")} onLoadAllRows={async () => data}
        toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.inspections} entityName="بازدید" onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus statusField="activity_status" canChangeContract canChangeDistrict />} />
      <CreateInspectionDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); setRefreshKey(k => k + 1); }} />
    </div>
  );
}

export function WorkOrdersPage() {
  const [data, setData] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { const result = await apiClient.get<PaginatedResponse<WorkOrder>>(API_ENDPOINTS.workOrders, { page: 1, page_size: 500 }); setData(result?.data || []); }
      catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
    };
    load();
  }, [refreshKey]);

  const statusLabels: Record<string, string> = { draft: "پیش‌نویس", assigned: "اختصاص داده شده", in_progress: "در حال انجام", on_hold: "متوقف", completed: "تکمیل شده", cancelled: "لغو شده", verified: "تأیید نهایی" };
  const priorityLabels: Record<string, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };
  const handleDelete = async (rows: WorkOrder[]) => {
    if (!rows.length || !window.confirm(`آیا ${rows.length.toLocaleString("fa-IR")} دستورکار حذف شود؟`)) return;
    for (const row of rows) { try { await apiClient.delete(`${API_ENDPOINTS.workOrders}/${row.id}`); } catch (e) { console.error(e); } }
    setRefreshKey(k => k + 1);
  };
  const handleDuplicate = async (row: WorkOrder) => {
    try { await apiClient.post(API_ENDPOINTS.workOrders, { title: row.title, description: row.description || null, priority: row.priority, planned_start: row.planned_start || null, planned_end: row.planned_end || null, crew_id: row.crew_id || null, outage_required: !!row.outage_required, contract_id: row.contract_id || null, district_id: (row as any).district_id ?? null }); setRefreshKey(k => k + 1); } catch (e) { console.error(e); }
  };

  const columns: DataTableColumn<WorkOrder>[] = [
    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },
    { key: "wo_code", header: "کد", sortable: true, filterable: true, align: "left" },
    // v4.3.78: امور بهره‌برداری دستورکار
    { key: "district_name", header: "امور بهره‌برداری", sortable: true, filterable: true },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "priority", header: "اولویت", type: "badge", badgeLabels: priorityLabels, badgeColors: { critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", medium: "bg-amber-100 text-amber-700", low: "bg-slate-100 text-slate-700" } },
    { key: "crew_name", header: "اکیپ", sortable: true, filterable: true },
    { key: "planned_start", header: "شروع پلن", type: "date" },
    // v4.3.78: ستون وضعیت استاندارد فعال/غیرفعال — ستون مرحله با نام «مرحله دستورکار» جدا شد
    { key: "status", header: "مرحله دستورکار", type: "badge", badgeLabels: statusLabels, badgeColors: { draft: "bg-slate-100 text-slate-700", assigned: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-700", completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700", verified: "bg-indigo-100 text-indigo-700" } },
    { key: "activity_status", header: "وضعیت", type: "status", filterable: true, align: "right" },
  ];

  return (
    <div className="space-y-4">
      <DataTable data={data} columns={columns} loading={loading}
        searchKeys={columns.map(c => c.key)}
        title="دستورکارها" onAdd={() => setShowCreate(true)} onRefresh={() => setRefreshKey(k => k + 1)}
        onCopy={() => {}} onDelete={handleDelete} onDuplicate={handleDuplicate} onImport={() => alert("برای وارد کردن اطلاعات دستورکار از قالب اکسل پروژه استفاده کنید.")} onLoadAllRows={async () => data}
        toolbarExtra={(rows) => <GenericBulkActions rows={rows} endpoint={API_ENDPOINTS.workOrders} entityName="دستورکار" onApplied={() => setRefreshKey(k => k + 1)} canToggleStatus statusField="activity_status" canChangeContract canChangeDistrict />} />
      <CreateWorkOrderDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); setRefreshKey(k => k + 1); }} />
    </div>
  );
}
