"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { useDistrictOptions, currentUserIsDistrictAdmin, currentUserDistrictId } from "@/hooks/use-district-options";

/**
 * انتخاب «امور بهره‌برداری» — v4.3.78
 * همان تجربهٔ انتخاب قرارداد؛ خالی = نامشخص (دادهٔ بدون امور).
 *
 * v4.3.81: autoLock — برای کاربر غیرمدیر (اموردار)، فیلد قفل و همیشه امور خودِ کاربر است؛
 * تغییر امور فقط برای مدیران باز است. مقدار value در حالت قفل نادیده گرفته می‌شود
 * و onChange دیگر صدا زده نمی‌شود (فرم‌ها هنگام ذخیره resolveDistrictValue را به کار می‌برند).
 */
export function DistrictSelect({
  value,
  onChange,
  disabled = false,
  autoLock = false,
  placeholder = "انتخاب امور...",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoLock?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { options, loading } = useDistrictOptions(true);

  // v4.3.81: قفل امور برای کاربران غیرمدیر — امور خودکار از حساب کاربری
  const locked = autoLock && !currentUserIsDistrictAdmin();
  const lockedValue = currentUserDistrictId() !== null ? String(currentUserDistrictId()) : "";
  const effectiveValue = locked ? lockedValue : value;

  return (
    <SearchableSelect
      value={effectiveValue}
      onChange={locked ? () => {} : onChange}
      options={options}
      placeholder={loading ? "در حال بارگذاری امور..." : options.length ? (locked ? "امور شما (خودکار)" : placeholder) : "اموری ثبت نشده — ابتدا از داده‌های پایه تعریف کنید"}
      searchPlaceholder="جستجوی نام امور..."
      disabled={disabled || locked}
      className={className}
      preserveUnknownValue
      optionItemClassName="hover:bg-indigo-50 hover:text-indigo-800 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-200"
    />
  );
}
