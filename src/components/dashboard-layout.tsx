"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { attachApiErrorLogging } from "@/lib/error-log";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  LayoutDashboard, Cable, Radio, Bug, ClipboardCheck, Wrench,
  LogOut, UserCog, Zap, ChevronLeft, BarChart3,
  Users as UsersIcon, Settings as SettingsIcon, Bell,
  FileText, Receipt, ShieldAlert, HardHat, Briefcase,
  Package, DollarSign, Waypoints, AlertTriangle, Map as MapIcon,
  AlertOctagon, Cable as CableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_VERSION } from "@/lib/version";
import { ContractSelect } from "@/components/contract-select";
import { useContractOptions } from "@/hooks/use-contract-options";

type Page =
  | "dashboard" | "maps"
  | "circuits" | "lines" | "towers"
  | "inspections" | "defects" | "work-orders"
  | "contractors" | "contracts" | "equipment" | "personnel" | "price-lists" | "invoices"
  | "conductors" | "tower-structures" | "tower-type-codes"
  | "safety" | "line-incidents"
  | "reports" | "users" | "error-log" | "settings";

interface NavItem { id: Page; label: string; icon: React.ComponentType<{ className?: string }>; permission?: string; group?: string; }

const navItems: NavItem[] = [
  // v3.2.0: سرو سامان کامل منو بر اساس وابستگی‌ها — ۵ سکشن + سیستمی
  // ─── سکشن ۱: نمای کلی ───
  { id: "dashboard", label: "داشبورد", icon: LayoutDashboard, group: "اصلی" },
  { id: "maps", label: "نقشه‌ها", icon: MapIcon, group: "اصلی" },
  // ─── سکشن ۲: خطوط و مدارها (وابستگی: مدار ← خط ← دکل) ───
  { id: "circuits", label: "مدارها", icon: Waypoints, group: "خطوط و مدارها" },
  { id: "lines", label: "خطوط انتقال", icon: Cable, group: "خطوط و مدارها" },
  { id: "towers", label: "دکل‌ها", icon: Radio, group: "خطوط و مدارها" },
  // ─── سکشن ۳: بهره‌برداری و تعمیرات ───
  { id: "inspections", label: "بازدیدها", icon: ClipboardCheck, group: "بهره‌برداری و تعمیرات" },
  { id: "defects", label: "عیوب", icon: Bug, group: "بهره‌برداری و تعمیرات" },
  { id: "work-orders", label: "دستورکارها", icon: Wrench, group: "بهره‌برداری و تعمیرات" },
  // ─── سکشن ۴: پیمانکاری و مالی ───
  { id: "contractors", label: "پیمانکاران", icon: Briefcase, group: "پیمانکاری و مالی" },
  { id: "contracts", label: "قراردادها", icon: FileText, group: "پیمانکاری و مالی" },
  { id: "equipment", label: "تجهیزات", icon: Package, group: "پیمانکاری و مالی" },
  { id: "personnel", label: "پرسنل پیمانکار", icon: HardHat, group: "پیمانکاری و مالی" },
  { id: "price-lists", label: "فهرست بها", icon: DollarSign, group: "پیمانکاری و مالی" },
  { id: "invoices", label: "صورت‌وضعیت‌ها", icon: Receipt, group: "پیمانکاری و مالی" },
  // ─── سکشن ۵: ایمنی ───
  { id: "safety", label: "حوادث ایمنی و شخصی", icon: ShieldAlert, group: "ایمنی" },
  { id: "line-incidents", label: "حوادث خطوط", icon: AlertTriangle, group: "ایمنی" },

  // v3.5.4: انواع سیم‌ها به بخش جدید «داده‌های پایه» منتقل شد (درخواست کاربر — کنار خط/دکل نباشد)
  { id: "conductors", label: "انواع سیم‌ها", icon: CableIcon, group: "داده‌های پایه" },
  { id: "tower-structures", label: "انواع ساختار دکل", icon: Radio, group: "داده‌های پایه" },
  { id: "tower-type-codes", label: "انواع کد دکل", icon: Waypoints, group: "داده‌های پایه" },
  // ─── سیستمی ───
  { id: "reports", label: "گزارش‌گیری", icon: BarChart3, group: "سیستمی" },
  { id: "users", label: "کاربران", icon: UsersIcon, group: "سیستمی" },
  // v3.4.0: لاگ خطاها — همه خطاها در یک جدول برای رفع عیب مدیر سیستم
  { id: "error-log", label: "لاگ خطاها", icon: AlertOctagon, group: "سیستمی" },
  { id: "settings", label: "تنظیمات", icon: SettingsIcon, group: "سیستمی" },
];

// v2.8.0: اعلان‌های نمونه برای زنگوله
const SAMPLE_NOTIFICATIONS = [
  {
    id: 1,
    type: "warning" as const,
    title: "عیب بحرانی جدید",
    message: "عیب جدیدی با شدت بحرانی در خط «شرق کرمانشاه-مرصاد» ثبت شد",
    time: "۵ دقیقه پیش",
    icon: AlertTriangle,
  },
  {
    id: 2,
    type: "info" as const,
    title: "بازدید جدید",
    message: "بازدید خط «بندر امام - اهواز» توسط کارشناس احمدی ثبت شد",
    time: "۲۵ دقیقه پیش",
    icon: ClipboardCheck,
  },
  {
    id: 3,
    type: "success" as const,
    title: "دستورکار تکمیل شد",
    message: "دستورکار تعمیر دکل 61404-015 تکمیل شد",
    time: "۲ ساعت پیش",
    icon: Wrench,
  },
  {
    id: 4,
    type: "info" as const,
    title: "کاربر جدید",
    message: "کاربر جدید «کارشناس رستمی» به سیستم اضافه شد",
    time: "دیروز",
    icon: UsersIcon,
  },
];

/** v3.5.2: نشان وضعیت داده‌های مرجع در هدر — آنلاین / حافظه محلی / آفلاین */
function DataStatusBadge() {
  const { offline, fromCache, loading } = useBootstrap();

  if (offline) {
    return (
      <span
        title="هاست در دسترس نیست — داده‌های مرجع از حافظه محلی سیستم شما نمایش داده می‌شوند"
        className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      >
        <AlertTriangle className="w-3 h-3" />
        حافظه محلی (هاست قطع)
      </span>
    );
  }
  if (fromCache && !loading) {
    return (
      <span
        title="داده‌های مرجع از حافظه محلی سیستم شما خوانده شده — در پس‌زمینه تازه‌سازی می‌شود"
        className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-[10px] font-medium text-sky-700 dark:text-sky-400"
      >
        <CableIcon className="w-3 h-3" />
        حافظه محلی
      </span>
    );
  }
  return null;
}

export function DashboardLayout({ children, currentPage, onNavigate, title, subtitle }: {
  children: React.ReactNode; currentPage: Page; onNavigate: (page: Page) => void; title: string; subtitle?: string;
}) {
  const { user, logout, hasPermission } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { rows: contractRows, loading: contractsLoading } = useContractOptions(true);
  const [selectedContract, setSelectedContract] = useState("");

  // v3.4.0: فعال‌سازی ثبت خودکار خطاهای API در «لاگ خطاها» (یک‌بار)
  useEffect(() => {
    attachApiErrorLogging();
  }, []);

  // v4.3.39: قرارداد پیش‌فرض = آخرین قرارداد فعال؛ انتخاب کاربر تا زمان تغییر/رفرش حفظ می‌شود.
  useEffect(() => {
    if (contractsLoading || !contractRows.length) return;
    const saved = localStorage.getItem("powerline_selected_contract");
    const savedExists = saved === "__unknown__" || !!saved && contractRows.some((r: any) => String(r.id) === saved);
    const active = contractRows
      .filter((r: any) => r.status === "active")
      .sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];
    const next = savedExists ? String(saved) : (active ? String(active.id) : String(contractRows[0].id));
    setSelectedContract(next);
    localStorage.setItem("powerline_selected_contract", next);
  }, [contractRows, contractsLoading]);

  const onContractChange = (value: string) => {
    // __unknown__ یعنی فقط رکوردهایی که هنوز قرارداد ندارند (contract_id IS NULL).
    // تغییر قرارداد هرگز navigation انجام نمی‌دهد؛ فقط Scope داده عوض می‌شود.
    setSelectedContract(value);
    if (typeof window !== "undefined") {
      if (value) localStorage.setItem("powerline_selected_contract", value);
      else localStorage.removeItem("powerline_selected_contract");
      // v4.3.53: صفحاتی مثل نقشه به این رویداد گوش می‌دهند و داده خود را از نو می‌گیرند
      window.dispatchEvent(new Event("powerline:contract-changed"));
    }
  };
  const visibleNavItems = navItems.filter(item => !item.permission || hasPermission(item.permission));
  const groups: { [key: string]: NavItem[] } = {};
  visibleNavItems.forEach(item => { const g = item.group || "سایر"; if (!groups[g]) groups[g] = []; groups[g].push(item); });

  // v2.8.0: حروف اول نام کاربر برای آواتار
  const userInitials = user?.full_name
    ?.split(" ")
    .slice(0, 2)
    .map(p => p[0])
    .join("") || "؟";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex" dir="rtl">
      <aside className={cn("fixed lg:sticky top-0 right-0 z-[1000000] h-screen w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 transition-transform duration-300", sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
        <div className="flex flex-col h-full">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800">
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
          {/* v4.2.4: نشان نسخه برنامه در پایین سایدبار — کاربر می‌بیند کدام نسخه در حال اجراست */}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 dark:text-slate-500" dir="ltr">{APP_VERSION}</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">نسخه برنامه</span>
          </div>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-[999999] lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="flex-1 flex flex-col min-w-0">
        {/* v2.8.0: هدر با ارتفاع کم‌تر (h-16 → h-14) و padding کم‌تر */}
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          {/* سمت راست هدر: فقط عنوان */}
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {/* سمت چپ هدر: اطلاعات کاربر + تم + اعلان + منوی موبایل */}
          <div className="flex items-center gap-1.5">
            {/* v3.5.2: وضعیت داده‌های مرجع — آنلاین/کش محلی/آفلاین */}
            <DataStatusBadge />
            <div className="hidden lg:flex items-center gap-2 min-w-[338px] max-w-[468px]">
              <span className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">قرارداد جاری</span>
              <div className="min-w-0 flex-1">
                <ContractSelect value={selectedContract} onChange={onContractChange} disabled={contractsLoading} className="min-w-0 flex-1" preserveUnknownValue />
              </div>
            </div>
            {/* v2.8.0: اطلاعات کاربر با آیکون UserCog زیبا‌تر */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden lg:flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  {/* آواتار با گرادیان و آیکون */}
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                      <UserCog className="w-4 h-4 text-white" />
                    </div>
                    {/* نقطه وضعیت سبز */}
                    <span className="absolute bottom-0 left-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />
                  </div>
                  <div className="text-right mr-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[120px] leading-tight">{user?.full_name}</p>
                    <p className="text-[10px] text-slate-400 truncate max-w-[120px] leading-tight">{user?.username}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              {/* v2.8.0: DropdownMenu راست‌چین — align="start" برای RTL */}
              <DropdownMenuContent align="end" className="w-60 text-right" dir="rtl">
                {/* هدر کاربر با گرادیان */}
                <div className="px-3 py-3 bg-gradient-to-l from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border-b border-slate-100 dark:border-slate-800 rounded-t-md">
                  <div className="flex items-center gap-2.5" dir="rtl">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/30 shrink-0">
                      <UserCog className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{user?.full_name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email || user?.username}</p>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await logout(); }} className="text-red-600 cursor-pointer">
                  <LogOut className="w-4 h-4 ml-2" />خروج از سیستم
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
            {/* v2.8.0: زنگوله با Popover واقعی و لیست اعلان‌ها */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="اعلان‌ها">
                  <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  <span className="absolute top-1.5 left-1.5 min-w-4 h-4 px-1 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center nums-fa">
                    {SAMPLE_NOTIFICATIONS.length.toLocaleString("fa-IR")}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0" dir="rtl">
                {/* هدر زنگوله */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-l from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-t-md">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">اعلان‌ها</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 nums-fa">
                    {SAMPLE_NOTIFICATIONS.length.toLocaleString("fa-IR")} اعلان جدید
                  </span>
                </div>
                {/* لیست اعلان‌ها */}
                <div className="max-h-80 overflow-y-auto scrollbar-hover">
                  {SAMPLE_NOTIFICATIONS.map(notif => {
                    const Icon = notif.icon;
                    const colorClass =
                      notif.type === "warning" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" :
                      notif.type === "info" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" :
                      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
                    return (
                      <div
                        key={notif.id}
                        className="flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", colorClass)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{notif.title}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{notif.message}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{notif.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* فوتر زنگوله */}
                <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-md">
                  <button className="w-full text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors cursor-pointer py-1">
                    مشاهده همه اعلان‌ها
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)}><UserCog className="w-4 h-4" /></Button>
          </div>
        </header>
        {/* v2.8.0: padding کم‌تر برای main (p-4 lg:p-6 → p-3 lg:p-4) */}
        <main className="flex-1 p-3 lg:p-4 bg-slate-50 dark:bg-slate-950"><div key={`${currentPage}-${selectedContract}`}>{children}</div></main>
      </div>
    </div>
  );
}
