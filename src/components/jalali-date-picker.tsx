"use client";

import { useEffect, useState } from "react";
import { toJalali, fromJalali, fromPersianNumber } from "@/lib/jalali";
import { Input } from "@/components/ui/input";

/**
 * ورودی تاریخ استاندارد متنی در کل پروژه.
 * ظاهر قبلی تقویم/دکمه‌ها حذف شده و کاربر مستقیماً تاریخ شمسی را تایپ می‌کند.
 * خروجی همچنان ISO است تا APIهای فعلی بدون Migration کار کنند.
 */
export function JalaliDatePicker({ value, onChange, placeholder, type = "date" }: {
  value: string; onChange: (isoDate: string) => void; placeholder?: string; type?: "date" | "datetime";
}) {
  const defaultPlaceholder = type === "datetime" ? "1405/05/30 14:30" : "1405/05/30";
  const formatDisplay = (v: string) => {
    if (!v) return "";
    const raw = String(v).trim();
    if (/^[۰-۹0-9]{4}[/-][۰-۹0-9]{1,2}[/-][۰-۹0-9]{1,2}(?:[ T][۰-۹0-9]{1,2}:[۰-۹0-9]{2})?$/.test(raw)) {
      const ascii = fromPersianNumber(raw).replace(/-/g, "/");
      if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(ascii)) return ascii;
    }
    try { return toJalali(raw, type === "datetime" ? "jYYYY/jMM/jDD HH:mm" : "jYYYY/jMM/jDD"); } catch { return raw; }
  };

  const initial = formatDisplay(value);
  const [text, setText] = useState(initial);
  useEffect(() => setText(formatDisplay(value)), [value, type]);

  const handleChange = (next: string) => {
    setText(next);
    const cleaned = fromPersianNumber(next.trim()).replace(/-/g, "/");
    const re = type === "datetime"
      ? /^\d{4}\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?: \d{1,2}:\d{2})?$/
      : /^\d{4}\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])$/;
    if (cleaned === "") onChange("");
    else if (re.test(cleaned)) onChange(fromJalali(cleaned));
    else onChange(next);
  };

  return <Input
    type="text"
    value={text}
    onChange={e => handleChange(e.target.value)}
    placeholder={placeholder || defaultPlaceholder}
    dir="ltr"
    className="text-left"
    autoComplete="off"
    inputMode="numeric"
  />;
}
