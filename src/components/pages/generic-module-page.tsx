"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { CreateContractDialog, CreateSafetyDialog, CreatePersonnelDialog, CreateContractorDialog, CreateEquipmentDialog } from "@/components/create-dialogs";
import type { PaginatedResponse } from "@/lib/types";

interface GenericItem { id: number; [key: string]: unknown }

const configs: Record<string, { title: string; columns: DataTableColumn<GenericItem>[]; create?: "contract" | "safety" | "personnel" | "contractor" | "equipment" }> = {
  contracts: { title: "قراردادها", create: "contract", columns: [
    { key: "contract_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },
    { key: "amount", header: "مبلغ (ریال)", sortable: true, type: "number" },
    { key: "start_date", header: "شروع", type: "date" }, { key: "end_date", header: "پایان", type: "date" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { draft: "پیش‌نویس", active: "فعال", expired: "منقضی", completed: "تکمیل" }, badgeColors: { draft: "bg-slate-100 text-slate-700", active: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700", completed: "bg-blue-100 text-blue-700" } },
  ]},
  invoices: { title: "صورت‌وضعیت‌ها", columns: [
    { key: "invoice_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },
    { key: "period_start", header: "از", type: "date" }, { key: "period_end", header: "تا", type: "date" },
    { key: "final_amount", header: "مبلغ نهایی", sortable: true, type: "number" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { draft: "پیش‌نویس", submitted: "ارسال", approved: "تأیید", paid: "پرداخت", rejected: "رد" }, badgeColors: { draft: "bg-slate-100 text-slate-700", submitted: "bg-blue-100 text-blue-700", approved: "bg-indigo-100 text-indigo-700", paid: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" } },
  ]},
  "safety-incidents": { title: "حوادث ایمنی", create: "safety", columns: [
    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "title", header: "عنوان", sortable: true, filterable: true },
    { key: "incident_type", header: "نوع", type: "badge", badgeLabels: { accident: "حادثه", near_miss: "Near Miss", unsafe_act: "ناایمن", unsafe_condition: "شرایط ناایمن", environmental: "محیط زیست" }, badgeColors: { accident: "bg-red-100 text-red-700", near_miss: "bg-amber-100 text-amber-700", unsafe_act: "bg-orange-100 text-orange-700" } },
    { key: "severity", header: "شدت", type: "badge", badgeLabels: { none: "بدون آسیب", minor: "جزئی", moderate: "متوسط", serious: "جدی", fatal: "مرگبار" }, badgeColors: { none: "bg-slate-100 text-slate-500", minor: "bg-yellow-100 text-yellow-700", moderate: "bg-orange-100 text-orange-700", serious: "bg-red-100 text-red-700" } },
    { key: "occurred_at", header: "تاریخ", type: "date" },
    { key: "status", header: "وضعیت", type: "badge", badgeLabels: { reported: "گزارش شده", under_investigation: "در حال بررسی", resolved: "حل شده", closed: "بسته شده" }, badgeColors: { reported: "bg-blue-100 text-blue-700", resolved: "bg-green-100 text-green-700", closed: "bg-slate-100 text-slate-500" } },
  ]},
  personnel: { title: "پرسنل", create: "personnel", columns: [
    { key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "first_name", header: "نام", sortable: true, filterable: true },
    { key: "last_name", header: "نام خانوادگی", sortable: true, filterable: true },
    { key: "personnel_type", header: "نوع", type: "badge", badgeLabels: { employee: "کارمند", contractor: "پیمانکار", operator: "اپراتور", guard: "نگهبان", manager: "مدیر", line_expert: "کارشناس خط", safety_expert: "کارشناس ایمنی", crew_supervisor: "سرپرست", lineman: "سیمبان", driver: "راننده" }, badgeColors: { employee: "bg-blue-100 text-blue-700", contractor: "bg-amber-100 text-amber-700", operator: "bg-purple-100 text-purple-700" } },
    { key: "position", header: "سمت", sortable: true, filterable: true },
    { key: "mobile", header: "موبایل", align: "left" },
  ]},
  contractors: { title: "پیمانکاران", create: "contractor", columns: [
    { key: "contractor_code", header: "کد", sortable: true, filterable: true, align: "left" },
    { key: "name", header: "نام", sortable: true, filterable: true },
    { key: "contact_person", header: "مسئول", sortable: true, filterable: true },
    { key: "phone", header: "تلفن", align: "left" }, { key: "mobile", header: "موبایل", align: "left" },
    { key: "is_active", header: "وضعیت", type: "boolean" },
  ]},
  equipment: { title: "تجهیزات", create: "equipment", columns: [
    { key: "serial_number", header: "سریال", sortable: true, filterable: true, align: "left" },
    { key: "manufacturer", header: "سازنده", sortable: true, filterable: true },
    { key: "model", header: "مدل" }, { key: "class_name", header: "گروه" },
    { key: "tower_code", header: "دکل" }, { key: "is_active", header: "وضعیت", type: "boolean" },
  ]},
  "audit-log": { title: "لاگ ممیزی", columns: [
    { key: "username", header: "کاربر", sortable: true, filterable: true },
    { key: "action", header: "عملیات", sortable: true, filterable: true },
    { key: "entity_type", header: "موجودیت", sortable: true, filterable: true },
    { key: "entity_id", header: "شناسه", align: "left" },
    { key: "ip_address", header: "IP", align: "left" },
    { key: "created_at", header: "زمان", type: "date" },
  ]},
  organization: { title: "سازمان", columns: [
    { key: "code", header: "کد", align: "left" }, { key: "name", header: "نام", sortable: true, filterable: true },
    { key: "org_type", header: "نوع", type: "badge", badgeLabels: { company: "شرکت", region: "منطقه", management: "مدیریت", unit: "واحد" }, badgeColors: { company: "bg-indigo-100 text-indigo-700", region: "bg-blue-100 text-blue-700", management: "bg-purple-100 text-purple-700", unit: "bg-slate-100 text-slate-700" } },
    { key: "phone", header: "تلفن", align: "left" },
  ]},
};

export function GenericModulePage({ moduleKey, endpoint }: { moduleKey: string; endpoint: string }) {
  const config = configs[moduleKey];
  const [data, setData] = useState<GenericItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await apiClient.get<PaginatedResponse<GenericItem>>(endpoint, { page: 1, page_size: 500, search: search || undefined });
        setData(result?.data || []);
      } catch (err) { console.error("خطا:", err); } finally { setLoading(false); }
    };
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [search, endpoint, refreshKey]);

  if (!config) return <div>ماژول پیدا نشد</div>;

  const renderCreate = () => {
    const props = { open: showCreate, onClose: () => setShowCreate(false), onCreated: () => { setShowCreate(false); setRefreshKey(k => k + 1); } };
    switch (config.create) {
      case "contract": return <CreateContractDialog {...props} />;
      case "safety": return <CreateSafetyDialog {...props} />;
      case "personnel": return <CreatePersonnelDialog {...props} />;
      case "contractor": return <CreateContractorDialog {...props} />;
      case "equipment": return <CreateEquipmentDialog {...props} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <DataTable data={data} columns={config.columns} loading={loading}
        searchKeys={config.columns.filter(c => c.filterable).map(c => c.key)}
        title={config.title}
        onAdd={config.create ? () => setShowCreate(true) : undefined}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />
      {renderCreate()}
    </div>
  );
}
