"use client";

import type { ReactNode } from "react";

/**
 * باکس سفید بخش‌بندی فرم — v4.3.74
 * همان ظرایم سکشن‌های فرم خطوط/دکل‌ها برای همه فرم‌های ثبت/ویرایش/کپی.
 */
export function FormSection({
  title,
  children,
  accent = "bg-blue-600",
  className = "",
}: {
  title: string;
  children: ReactNode;
  /** رنگ نوار کنار عنوان */
  accent?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-3 p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 ${className}`}>
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
        <div className={`w-1 h-5 ${accent} rounded`}></div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}
