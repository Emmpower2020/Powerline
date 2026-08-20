"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LoginForm } from "@/components/login-form";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DashboardPage } from "@/components/pages/dashboard-page";
import { LinesPage } from "@/components/pages/lines-page";
import { TowersPage } from "@/components/pages/towers-page";
import { DefectsPage } from "@/components/pages/defects-page";
import { InspectionsPage, WorkOrdersPage } from "@/components/pages/inspections-work-orders-page";
import { ReportsPage } from "@/components/pages/reports-page";
import { UsersPage } from "@/components/pages/users-page";
import { SettingsPage } from "@/components/pages/settings-page";
import { GenericModulePage } from "@/components/pages/generic-module-page";
import { Loader2 } from "lucide-react";

type Page =
  | "dashboard" | "lines" | "towers" | "defects" | "inspections" | "work-orders"
  | "reports" | "users" | "settings"
  | "contracts" | "invoices" | "safety" | "line-incidents" | "personnel" | "contractors"
  | "equipment" | "price-lists" | "checklists" | "audit-log" | "organization";

const pageInfo: Record<Page, { title: string; subtitle?: string }> = {
  dashboard: { title: "داشبورد", subtitle: "نمای کلی" },
  lines: { title: "خطوط انتقال", subtitle: "مدیریت خطوط" },
  towers: { title: "دکل‌ها", subtitle: "مدیریت دکل‌ها و GIS" },
  defects: { title: "عیوب", subtitle: "ثبت و پیگیری" },
  inspections: { title: "بازدیدها", subtitle: "بازدیدهای فنی" },
  "work-orders": { title: "دستورکارها", subtitle: "تعمیرات" },
  contracts: { title: "قراردادها", subtitle: "مدیریت قراردادها" },
  invoices: { title: "صورت‌وضعیت‌ها", subtitle: "مالی" },
  safety: { title: "حوادث ایمنی", subtitle: "حوادث و Near Miss" },
  "line-incidents": { title: "حوادث خط", subtitle: "قطعی‌ها" },
  personnel: { title: "پرسنل", subtitle: "مدیریت پرسنل" },
  contractors: { title: "پیمانکاران", subtitle: "مدیریت پیمانکاران" },
  equipment: { title: "تجهیزات", subtitle: "مدیریت تجهیزات" },
  "price-lists": { title: "فهرست بها", subtitle: "بها" },
  checklists: { title: "چک‌لیست‌ها", subtitle: "قالب‌ها" },
  "audit-log": { title: "لاگ ممیزی", subtitle: "تاریخچه" },
  organization: { title: "سازمان", subtitle: "ساختار" },
  reports: { title: "گزارش‌گیری", subtitle: "گزارش‌ها" },
  users: { title: "کاربران", subtitle: "مدیریت کاربران" },
  settings: { title: "تنظیمات", subtitle: "پروفایل و تنظیمات" },
};

export default function Home() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /></div>;
  if (!user) return <LoginForm />;

  const info = pageInfo[currentPage];

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard": return <DashboardPage />;
      case "lines": return <LinesPage />;
      case "towers": return <TowersPage />;
      case "defects": return <DefectsPage />;
      case "inspections": return <InspectionsPage />;
      case "work-orders": return <WorkOrdersPage />;
      case "contracts": return <GenericModulePage moduleKey="contracts" endpoint="/contracts" />;
      case "invoices": return <GenericModulePage moduleKey="invoices" endpoint="/invoices" />;
      case "safety": return <GenericModulePage moduleKey="safety-incidents" endpoint="/safety-incidents" />;
      case "line-incidents": return <GenericModulePage moduleKey="safety-incidents" endpoint="/safety-incidents" />;
      case "personnel": return <GenericModulePage moduleKey="personnel" endpoint="/personnel" />;
      case "contractors": return <GenericModulePage moduleKey="contractors" endpoint="/contractors" />;
      case "equipment": return <GenericModulePage moduleKey="equipment" endpoint="/equipment" />;
      case "audit-log": return <GenericModulePage moduleKey="audit-log" endpoint="/audit-log" />;
      case "organization": return <GenericModulePage moduleKey="organization" endpoint="/organization" />;
      case "reports": return <ReportsPage />;
      case "users": return <UsersPage />;
      case "settings": return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <DashboardLayout currentPage={currentPage} onNavigate={(p) => setCurrentPage(p as Page)} title={info.title} subtitle={info.subtitle}>
      {renderPage()}
    </DashboardLayout>
  );
}
