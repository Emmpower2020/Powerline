"use client"

import { useToast } from "@/hooks/use-toast"
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const text = `${title || ""} ${description || ""}`;
        const isError = variant === "destructive" || /خطا|ناموفق|اشتباه|مشکل/.test(text);
        const isWarning = !isError && /هشدار|انتخاب نشده|الزامی|مجاز نیست|دقت/.test(text);
        const isSuccess = !isError && !isWarning && /انجام شد|ذخیره شد|موفق|فعال شد|غیرفعال شد|تأیید شد|راستی‌آزمایی شد|کپی شد|به‌روزرسانی شد|بروزرسانی شد/.test(text);
        const Icon = isError ? AlertCircle : isWarning ? TriangleAlert : isSuccess ? CheckCircle2 : Info;
        return (
          <Toast key={id} variant={variant} className={`border-l-4 ${isError ? "border-l-red-500" : isWarning ? "border-l-amber-500" : isSuccess ? "border-l-emerald-500" : "border-l-blue-500"}`} {...props}>
            <div className="flex w-full items-start gap-3 pr-1">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isError ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300" : isWarning ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300" : isSuccess ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="grid min-w-0 flex-1 gap-1 text-right">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}