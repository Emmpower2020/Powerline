"use client";

import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from "@/components/ui/hover-card";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * نشان «سلامت داده» — v2.4.3
 * هاور روی نشان، پنجرهٔ مرتب و خوانا با فهرست شماره‌دار خطاها نشان می‌دهد
 * (به‌جای tooltipِ خام مرورگر که ریز و به‌هم‌ریخته بود)
 */
export function IssuesBadge({ issues, entityLabel = "رکورد" }: { issues: string[]; entityLabel?: string }) {
  if (!issues || issues.length === 0) {
    return (
      <span className="inline-flex items-center justify-center text-emerald-600" title="بدون خطا">
        <CheckCircle2 className="w-4 h-4" />
      </span>
    );
  }
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-bold cursor-help hover:bg-amber-200 transition-colors nums-fa"
        >
          <AlertTriangle className="w-3 h-3" />
          {issues.length.toLocaleString("fa-IR")} خطا
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="left" align="start" className="w-80 p-0" dir="rtl">
        <div className="rounded-lg overflow-hidden border border-amber-200 dark:border-amber-900">
          <div className="bg-amber-50 dark:bg-amber-950/40 px-3 py-2 flex items-center gap-2 border-b border-amber-100 dark:border-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 nums-fa">
              {issues.length.toLocaleString("fa-IR")} خطای داده در این {entityLabel}
            </span>
          </div>
          <ol className="p-2.5 space-y-1.5 max-h-56 overflow-y-auto bg-white dark:bg-slate-900">
            {issues.map((msg, i) => (
              <li key={i} className="flex gap-2 items-start text-[11px] leading-5 text-slate-700 dark:text-slate-300">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 text-[9px] font-bold flex items-center justify-center nums-fa">
                  {(i + 1).toLocaleString("fa-IR")}
                </span>
                <span className="break-words">{msg}</span>
              </li>
            ))}
          </ol>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
