"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown, Search, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDistrictOptions } from "@/hooks/use-district-options";

/**
 * انتخاب «چند امور بهره‌برداری» — v4.3.85
 *
 * هر کاربر می‌تواند به چند امور دسترسی داشته باشد (مثلاً کارشناس انبارِ مشترک
 * بین دو امور، یا مدیر پیمانکارِ چند امور). لیست خالی = همهٔ امور (مدیر سیستم).
 *
 * تجربه: Popover + جستجو + چک‌باکس (مثل کمبوباکس‌های برنامه)؛ انتخاب‌ها به‌صورت
 * بج در دکمه نمایش داده می‌شوند؛ گزینهٔ «همهٔ امور» لیست را خالی می‌کند.
 */
export function DistrictMultiSelect({
  value, onChange, disabled = false, placeholder = "همهٔ امور (مدیر سیستم)", className,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  /** متن دکمه وقتی هیچ اموری انتخاب نشده (= همهٔ امور / مدیر سیستم) */
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { rows, loading } = useDistrictOptions();

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.id - b.id),
    [rows]
  );

  const idSet = useMemo(() => new Set(value.map(Number)), [value]);
  const nameOf = (id: number) => rows.find(r => Number(r.id) === Number(id))?.name ?? `امور ${id}`;

  const toggle = (id: number) => {
    const next = idSet.has(id) ? value.filter(v => Number(v) !== Number(id)) : [...value, Number(id)];
    onChange(next);
  };

  const selectAll = () => onChange([]);

  // حداکثر ۳ بج + «+N» — برای جمع‌وجور ماندن فرم
  const shown = value.slice(0, 3);
  const restCount = value.length - shown.length;

  return (
    <div className={cn("flex", className)} dir="rtl">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal h-auto min-h-9 py-1.5 px-2 bg-white dark:bg-slate-900",
              !value.length && "text-slate-500"
            )}
          >
            <span className="flex flex-wrap items-center gap-1 min-w-0 flex-1 text-right">
              {value.length === 0 ? (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Globe2 className="w-3.5 h-3.5 text-indigo-400" />
                  {placeholder}
                </span>
              ) : (
                <>
                  {shown.map(id => (
                    <Badge
                      key={id}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 border-indigo-200 text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40"
                    >
                      {nameOf(id)}
                    </Badge>
                  ))}
                  {restCount > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-slate-200 text-slate-500 nums-fa">
                      +{restCount.toLocaleString("fa-IR")}
                    </Badge>
                  )}
                </>
              )}
            </span>
            <ChevronsUpDown className="w-4 h-4 shrink-0 text-slate-400 opacity-50 mr-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(26rem,var(--radix-popover-trigger-width))] p-0" align="start" dir="rtl">
          <Command shouldFilter={true}>
            <div className="flex items-center gap-2 border-b px-3" cmdk-input-wrapper="">
              <Search className="w-4 h-4 shrink-0 text-slate-400" />
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="جستجوی نام امور..."
                className="flex h-9 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <CommandList className="max-h-64">
              <CommandEmpty className="py-4 text-center text-sm text-slate-400">
                {loading ? "در حال بارگذاری امور..." : "اموری یافت نشد"}
              </CommandEmpty>

              {/* گزینهٔ ویژه: همهٔ امور = خالی‌کردن لیست (مدیر سیستم) */}
              <CommandGroup>
                <CommandItem
                  value="همهٔ امور دسترسی کامل مدیر سیستم"
                  onSelect={() => selectAll()}
                  className="gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={value.length === 0}
                    onCheckedChange={() => selectAll()}
                    className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    aria-label="همهٔ امور"
                  />
                  <span className="flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-medium">همهٔ امور (دسترسی کامل — مدیر سیستم)</span>
                  </span>
                </CommandItem>
              </CommandGroup>

              <CommandGroup>
                {sorted.map(d => {
                  const id = Number(d.id);
                  const checked = idSet.has(id);
                  return (
                    <CommandItem
                      key={id}
                      value={d.name}
                      onSelect={() => toggle(id)}
                      className="gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(id)}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                        aria-label={d.name}
                      />
                      <span className="text-xs">{d.name}</span>
                      {d.status !== "active" && (
                        <span className="text-[10px] text-amber-600">غیرفعال</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
