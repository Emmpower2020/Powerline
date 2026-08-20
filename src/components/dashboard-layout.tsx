"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard, Cable, Radio, Bug, ClipboardCheck, Wrench,
  LogOut, User as UserIcon, Zap, ChevronLeft, BarChart3,
  Users as UsersIcon, Settings as SettingsIcon, Bell,
  FileText, Receipt, ShieldAlert, HardHat, Wrench as WrenchIcon,
  Package, DollarSign, ListChecks, ScrollText, Building2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type Page =
  | "dashboard" | "lines" | "towers" | "defects" | "inspections" | "work-orders"
  | "reports" | "users" | "settings"
  | "contracts" | "invoices" | "safety" | "line-incidents" | "personnel" | "contractors"
  | "equipment" | "price-lists" | "checklists" | "audit-log" | "organization";

interface NavItem { id: Page; label: string; icon: React.ComponentType<{ className?: string }>; permission?: string; group?: string; }

const navItems: NavItem[] = [
  { id: "dashboard", label: "داشبورد", icon: LayoutDashboard, group: "اصلی" },
  { id: "lines", label: "خطوط انتقال", icon: Cable, group: "اصلی" },
  { id: "towers", label: "دکل‌ها", icon: Radio, group: "اصلی" },
  { id: "defects", label: "عیوب", icon: Bug, group: "اصلی" },
  { id: "inspections", label: "بازدیدها", icon: ClipboardCheck, group: "اصلی" },
  { id: "work-orders", label: "دستورکارها", icon: Wrench, group: "اصلی" },
  { id: "contracts", label: "قراردادها", icon: FileText, group: "مدیریتی" },
  { id: "invoices", label: "صورت‌وضعیت‌ها", icon: Receipt, group: "مدیریتی" },
  { id: "safety", label: "حوادث ایمنی", icon: ShieldAlert, group: "مدیریتی" },
  { id: "line-incidents", label: "حوادث خط", icon: AlertTriangle, group: "مدیریتی" },
  { id: "personnel", label: "پرسنل", icon: HardHat, group: "مدیریتی" },
  { id: "contractors", label: "پیمانکاران", icon: WrenchIcon, group: "مدیریتی" },
  { id: "equipment", label: "تجهیزات", icon: Package, group: "مدیریتی" },
  { id: "price-lists", label: "فهرست بها", icon: DollarSign, group: "مدیریتی" },
  { id: "checklists", label: "چک‌لیست‌ها", icon: ListChecks, group: "مدیریتی" },
  { id: "organization", label: "سازمان", icon: Building2, group: "مدیریتی" },
  { id: "reports", label: "گزارش‌گیری", icon: BarChart3, group: "سیستمی" },
  { id: "users", label: "کاربران", icon: UsersIcon, group: "سیستمی" },
  { id: "audit-log", label: "لاگ ممیزی", icon: ScrollText, group: "سیستمی" },
  { id: "settings", label: "تنظیمات", icon: SettingsIcon, group: "سیستمی" },
];

export function DashboardLayout({ children, currentPage, onNavigate, title, subtitle }: {
  children: React.ReactNode; currentPage: Page; onNavigate: (page: Page) => void; title: string; subtitle?: string;
}) {
  const { user, logout, hasPermission } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNavItems = navItems.filter(item => !item.permission || hasPermission(item.permission));
  const groups: { [key: string]: NavItem[] } = {};
  visibleNavItems.forEach(item => { const g = item.group || "سایر"; if (!groups[g]) groups[g] = []; groups[g].push(item); });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex" dir="rtl">
      <aside className={cn("fixed lg:sticky top-0 right-0 z-40 h-screen w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 transition-transform duration-300", sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                <Zap className="w-6 h-6 text-white" fill="white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">مدیریت خطوط</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">انتقال برق</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName} className="mb-3">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 px-3 mb-1">{groupName}</p>
                {items.map(item => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button key={item.id} onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                      className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800")}>
                      <Icon className="w-4 h-4" />
                      <span className="flex-1 text-right">{item.label}</span>
                      {isActive && <ChevronLeft className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100 dark:border-slate-800">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Avatar className="w-8 h-8"><AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs">{user?.full_name?.split(" ").slice(0, 2).map(p => p[0]).join("")}</AvatarFallback></Avatar>
                  <div className="flex-1 text-right">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{user?.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{user?.username}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel><div className="flex flex-col"><span>{user?.full_name}</span><span className="text-xs text-slate-400 font-normal">{user?.email}</span></div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await logout(); }} className="text-red-600 cursor-pointer"><LogOut className="w-4 h-4 ml-2" />خروج از سیستم</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <div><h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>{subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="relative">
              <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="اعلان‌ها">
                <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                <span className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>
            </div>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)}><UserIcon className="w-4 h-4" /></Button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 bg-slate-50 dark:bg-slate-950">{children}</main>
      </div>
    </div>
  );
}
