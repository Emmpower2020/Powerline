"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { useDistrictOptions } from "@/hooks/use-district-options";

/**
 * انتخاب «امور بهره‌برداری» — v4.3.78
 * همان تجربهٔ انتخاب قرارداد؛ خالی = نامشخص (دادهٔ بدون امور).
 */
export function DistrictSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "انتخاب امور...",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { options, loading } = useDistrictOptions(true);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? "در حال بارگذاری امور..." : options.length ? placeholder : "اموری ثبت نشده — ابتدا از داده‌های پایه تعریف کنید"}
      searchPlaceholder="جستجوی نام امور..."
      disabled={disabled}
      className={className}
      preserveUnknownValue
      optionItemClassName="hover:bg-indigo-50 hover:text-indigo-800 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-200"
    />
  );
}
