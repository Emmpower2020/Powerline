"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LoginForm } from "@/components/login-form";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DashboardPage } from "@/components/pages/dashboard-page";
import { LinesPage } from "@/components/pages/lines-page";
import { TowersPage } from "@/components/pages/towers-page";
import { MapPage } from "@/components/pages/map-page";
import { DefectsPage } from "@/components/pages/defects-page";
import { CircuitsPage } from "@/components/pages/circuits-page";
import { ConductorsPage } from "@/components/pages/conductors-page";
import { PersonnelPage } from "@/components/pages/personnel-page";
import { InspectionsPage, WorkOrdersPage } from "@/components/pages/inspections-work-orders-page";
import { ReportsPage } from "@/components/pages/reports-page";
import { UsersPage } from "@/components/pages/users-page";
import { SettingsPage } from "@/components/pages/settings-page";
import { ErrorLogPage } from "@/components/pages/error-log-page";
import { GenericModulePage } from "@/components/pages/generic-module-page";
import { PriceListsPage } from "@/components/pages/price-lists-page";
import { Loader2 } from "lucide-react";

type Page =
  | "dashboard" | "maps"
  | "circuits" | "lines" | "towers"
  | "inspections" | "defects" | "work-orders"
  | "contractors" | "contracts" | "equipment" | "personnel" | "price-lists" | "invoices"
  | "conductors"
  | "safety" | "line-incidents"
  | "reports" | "users" | "error-log" | "settings";

const pageInfo: Record<Page, { title: string; subtitle?: string }> = {
  dashboard: { title: "داشبورد", subtitle: "نمای کلی" },
  maps: { title: "نقشه‌ها", subtitle: "نمای GIS دکل‌ها" },
  circuits: { title: "مدارها", subtitle: "کدهای دیسپاچینگ" },
  conductors: { title: "انواع سیم‌ها", subtitle: "سیم‌های استاندارد ACSR" },
  lines: { title: "خطوط انتقال", subtitle: "مدیریت خطوط" },
  towers: { title: "دکل‌ها", subtitle: "مدیریت دکل‌ها" },
  inspections: { title: "بازدیدها", subtitle: "بازدیدهای فنی" },
  defects: { title: "عیوب", subtitle: "ثبت و پیگیری" },
  "work-orders": { title: "دستورکارها", subtitle: "تعمیرات" },
  contractors: { title: "پیمانکاران", subtitle: "مدیریت پیمانکاران" },
  contracts: { title: "قراردادها", subtitle: "مدیریت قراردادها" },
  equipment: { title: "تجهیزات", subtitle: "مدیریت تجهیزات" },
  personnel: { title: "پرسنل پیمانکار", subtitle: "مدیریت پرسنل" },
  "price-lists": { title: "فهرست بها", subtitle: "بها" },
  invoices: { title: "صورت‌وضعیت‌ها", subtitle: "مالی" },
  safety: { title: "حوادث ایمنی و شخصی", subtitle: "حوادث و Near Miss" },
  "line-incidents": { title: "حوادث خطوط", subtitle: "قطعی‌ها" },
  reports: { title: "گزارش‌گیری", subtitle: "گزارش‌ها" },
  users: { title: "کاربران", subtitle: "مدیریت کاربران" },
  "error-log": { title: "لاگ خطاها", subtitle: "رفع عیب سیستم" },
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
      // v3.0.0: ماژول جدید مدارها (کدهای دیسپاچینگ) + صفحه اختصاصی پرسنل
      case "circuits": return <CircuitsPage />;
      // v3.5.0: انواع سیم‌ها
      case "conductors": return <ConductorsPage />;
      case "maps": return <MapPage />;
      case "defects": return <DefectsPage />;
      case "inspections": return <InspectionsPage />;
      case "work-orders": return <WorkOrdersPage />;
      case "contracts": return <GenericModulePage moduleKey="contracts" endpoint="/contracts" />;
      case "invoices": return <GenericModulePage moduleKey="invoices" endpoint="/invoices" />;
      case "safety": return <GenericModulePage moduleKey="safety-incidents" endpoint="/safety-incidents" />;
      case "line-incidents": return <GenericModulePage moduleKey="safety-incidents" endpoint="/safety-incidents" />;
      case "personnel": return <PersonnelPage />;
      case "contractors": return <GenericModulePage moduleKey="contractors" endpoint="/contractors" />;
      case "equipment": return <GenericModulePage moduleKey="equipment" endpoint="/equipment" />;
      case "price-lists": return <PriceListsPage />;
      case "reports": return <ReportsPage />;
      case "users": return <UsersPage />;
      // v3.4.0: لاگ خطاها
      case "error-log": return <ErrorLogPage />;
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
