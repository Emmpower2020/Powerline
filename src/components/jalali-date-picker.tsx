"use client";

import { useState } from "react";
import { toJalali, fromJalali, fromPersianNumber, todayJalali } from "@/lib/jalali";
import { Calendar, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JalaliDatePicker({ value, onChange, placeholder = "انتخاب تاریخ...", type = "date" }: {
  value: string; onChange: (isoDate: string) => void; placeholder?: string; type?: "date" | "datetime";
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const displayValue = value ? toJalali(value, type === "datetime" ? "jYYYY/jMM/jDD HH:mm" : "jYYYY/jMM/jDD") : "";

  const handleConfirm = () => {
    if (inputValue) {
      const cleaned = fromPersianNumber(inputValue.trim());
      try { onChange(fromJalali(cleaned)); } catch { onChange(cleaned); }
    }
    setEditing(false); setInputValue("");
  };
  const handleCancel = () => { setEditing(false); setInputValue(""); };
  const handleClear = () => { onChange(""); setEditing(false); };

  return (
    <div className="relative">
      {editing ? (
        <div className="flex gap-1">
          <Input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
            placeholder={type === "datetime" ? "۱۴۰۴/۰۵/۲۹ ۱۴:۳۰" : "۱۴۰۴/۰۵/۲۹"} className="text-right" autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") handleCancel(); }} />
          <Button type="button" size="icon" className="bg-green-600 hover:bg-green-700 shrink-0" onClick={handleConfirm} title="تأیید"><Check className="w-4 h-4" /></Button>
          <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={handleCancel} title="انصراف"><X className="w-4 h-4" /></Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <button type="button" onClick={() => setEditing(true)}
            className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent text-right hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span className={displayValue ? "" : "text-slate-400"}>{displayValue || placeholder}</span>
          </button>
          {value && <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={handleClear} title="پاک کردن"><X className="w-4 h-4" /></Button>}
        </div>
      )}
      {editing && <p className="text-xs text-slate-400 mt-1">فرمت: {type === "datetime" ? "سال/ماه/روز ساعت:دقیقه" : "سال/ماه/روز"} (مثال: {todayJalali()})</p>}
    </div>
  );
}
