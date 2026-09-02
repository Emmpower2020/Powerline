"use client";

import { useEffect, useState } from "react";

/**
 * v4.3.53: تنظیم نمایش کارت‌های آماری بالای صفحات
 * از صفحه تنظیمات قابل تغییر است و همه صفحات بلافاصله اعمال می‌کنند.
 */
const STORAGE_KEY = "powerline_show_stats";
const CHANGE_EVENT = "powerline:stats-visibility-changed";

export function useStatsVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const read = () => {
      try { setVisible(localStorage.getItem(STORAGE_KEY) !== "0"); } catch { setVisible(true); }
    };
    read();
    window.addEventListener(CHANGE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(CHANGE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return visible;
}

export function setStatsVisible(visible: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* ignore storage errors */ }
}
