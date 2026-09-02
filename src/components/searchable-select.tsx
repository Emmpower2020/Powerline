"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * کمبوباکس قابل جستجو — v3.0.0
 *
 * طبق درخواست کاربر: «در تمام کمبوباکس‌ها قابلیت جستوجو بزار داشته باشن
 * که بتونیم زود پیدا کنیم نیاز نباشه کلی بگردیم تا پیدا کنیم»
 *
 * بر پایه Popover + Command (cmdk) — راست‌چین با placeholder فارسی
 */

export interface SearchableOption {
  value: string;
  label: string;
  /** متن توضیحی کوچک کنار label (مثلاً نام مدار کنار کد دیسپاچینگ) */
  description?: string;
  /** کلید گروه‌بندی اختیاری — گزینه‌ها گروه‌بندی‌شده نمایش داده می‌شوند */
  group?: string;
}

export function SearchableSelect({
  value, onChange, options, placeholder = "انتخاب...", searchPlaceholder = "جستجو...",
  emptyText = "موردی یافت نشد", disabled = false, allowClear = false, className, align = "start", preserveUnknownValue = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** سازگاری با فراخوانی‌های قدیمی؛ دکمه × دیگر نمایش داده نمی‌شود. */
  allowClear?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  /** اگر true باشد مقدار ویژه نامشخص به‌صورت __unknown__ حفظ می‌شود. */
  preserveUnknownValue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const UNKNOWN_VALUE = "__unknown__";
  const displayOptions = useMemo(() => [
    { value: UNKNOWN_VALUE, label: "نامشخص" },
    ...options.filter(o => o.value !== UNKNOWN_VALUE),
  ], [options]);
  const selected = value === UNKNOWN_VALUE
    ? (displayOptions.find(o => o.value === UNKNOWN_VALUE) || null)
    : (value ? (options.find(o => o.value === value) || null) : null);

  // گروه‌بندی گزینه‌ها (اختیاری)
  const grouped = useMemo(() => {
    const groups = new Map<string, SearchableOption[]>();
    for (const opt of displayOptions) {
      const g = opt.group || "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return Array.from(groups.entries());
  }, [displayOptions]);

  return (
    <div className={cn("flex gap-1", className)}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal h-9 bg-white dark:bg-slate-900",
              !selected && "text-slate-400"
            )}
          >
            <span className="truncate flex items-center gap-2 min-w-0 text-right">
              {selected ? (
                <>
                  <span className="truncate">{selected.label}</span>
                  {selected.description && (
                    <span className="text-xs text-slate-400 truncate hidden sm:inline">{selected.description}</span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="w-4 h-4 shrink-0 text-slate-400 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,var(--radix-popover-trigger-width))] p-0" align={align} dir="rtl">
          <Command shouldFilter={true}>
            <div className="flex items-center gap-2 border-b px-3" cmdk-input-wrapper="">
              <Search className="w-4 h-4 shrink-0 text-slate-400" />
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="flex h-9 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <CommandList className="max-h-64">
              <CommandEmpty className="py-4 text-center text-sm text-slate-400">{emptyText}</CommandEmpty>
              {grouped.map(([groupName, opts]) => (
                <CommandGroup key={groupName || "_"} heading={groupName || undefined}>
                  {opts.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={`${opt.label} ${opt.value} ${opt.description || ""}`}
                      onSelect={() => {
                        if (opt.value === UNKNOWN_VALUE) {
                          onChange(preserveUnknownValue ? UNKNOWN_VALUE : "");
                        } else {
                          onChange(opt.value === value ? "" : opt.value);
                        }
                        setOpen(false);
                        setQuery("");
                      }}
                      className="cursor-pointer hover:bg-slate-50 hover:text-slate-900 data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-800 dark:hover:bg-slate-800 dark:data-[selected=true]:bg-indigo-950/50 dark:data-[selected=true]:text-indigo-200"
                    >
                      <Check className={cn("w-4 h-4 shrink-0 ml-2", value === opt.value ? "opacity-100" : "opacity-0")} />
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span className="truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="text-xs text-slate-400 truncate">{opt.description}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * چند-انتخاب قابل جستجو — v3.0.0
 *
 * برای «کد دیسپاچینگ» خطوط که می‌تواند ترکیبی از چند مدار باشد (مثل CM607-MN609).
 * مقادیر انتخاب‌شده به‌صورت چیپ نمایش داده می‌شوند و خروجی با «-» به هم متصل می‌شود.
 */
export function SearchableMultiSelect({
  values, onChange, options, placeholder = "انتخاب...", searchPlaceholder = "جستجو...",
  emptyText = "موردی یافت نشد", disabled = false, maxItems, confirmSelection = false,
  confirmLabel = "تأیید انتخاب", className, align = "start",
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  maxItems?: number;
  /** نمایش دکمه تأیید برای بستن لیست انتخاب‌ها پس از انتخاب چندگانه */
  confirmSelection?: boolean;
  confirmLabel?: string;
  className?: string;
  align?: "start" | "center" | "end";
  /** اگر true باشد مقدار ویژه نامشخص به‌صورت __unknown__ حفظ می‌شود. */
  preserveUnknownValue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const toggle = (v: string) => {
    if (values.includes(v)) {
      onChange(values.filter(x => x !== v));
    } else {
      if (maxItems && values.length >= maxItems) return;
      onChange([...values, v]);
    }
  };

  const selectedItems = options.filter(o => values.includes(o.value));

  return (
    <div className={cn("flex gap-1", className)}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal min-h-9 h-auto py-1.5 bg-white dark:bg-slate-900",
              values.length === 0 && "text-slate-400"
            )}
          >
            {values.length === 0 ? (
              <span className="text-slate-400">{placeholder}</span>
            ) : (
              <span className="flex flex-wrap gap-1 min-w-0">
                {selectedItems.map(item => (
                  <Badge key={item.value} variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 normal-case font-normal">
                    {item.label}
                  </Badge>
                ))}
              </span>
            )}
            <ChevronsUpDown className="w-4 h-4 shrink-0 text-slate-400 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,var(--radix-popover-trigger-width))] p-0" align={align} dir="rtl">
          <Command shouldFilter={true}>
            <div className="flex items-center gap-2 border-b px-3" cmdk-input-wrapper="">
              <Search className="w-4 h-4 shrink-0 text-slate-400" />
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="flex h-9 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <CommandList className="max-h-64">
              <CommandEmpty className="py-4 text-center text-sm text-slate-400">{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const isSelected = values.includes(opt.value);
                  const atLimit = maxItems != null && values.length >= maxItems && !isSelected;
                  return (
                    <CommandItem
                      key={opt.value}
                      value={`${opt.label} ${opt.value} ${opt.description || ""}`}
                      disabled={atLimit}
                      onSelect={() => { toggle(opt.value); setQuery(""); }}
                      className="cursor-pointer hover:bg-slate-50 hover:text-slate-900 data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-800 dark:hover:bg-slate-800 dark:data-[selected=true]:bg-indigo-950/50 dark:data-[selected=true]:text-indigo-200"
                    >
                      <div className={cn(
                        "w-4 h-4 shrink-0 ml-2 border rounded flex items-center justify-center",
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span className="truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="text-xs text-slate-400 truncate">{opt.description}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1 flex items-center gap-1">
              {confirmSelection && (
                <Button
                  type="button"
                  variant="default"
                  className="flex-1 h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => { setOpen(false); setQuery(""); }}
                >
                  <Check className="w-4 h-4 ml-1" />
                  {confirmLabel}
                </Button>
              )}
              {values.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("text-xs text-slate-500 hover:text-red-600", confirmSelection ? "shrink-0" : "w-full")}
                  onClick={() => onChange([])}
                >
                  پاک کردن همه ({values.length.toLocaleString("fa-IR")})
                </Button>
              )}
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
