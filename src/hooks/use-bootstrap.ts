"use client";

/**
 * هوک داده تجمیعی مرجع — v3.5.2
 *
 * یک درخواست /bootstrap = پرسنل + مدارها + سیم‌ها + خطوط (به‌جای ۹ درخواست جدا).
 * استور در سطح ماژول است (مثل error-log): هر تعداد کامپوننت که subscribe کند،
 * فقط «یک» درخواست شبکه مشترک است.
 *
 * چرخه داده:
 *  ۱) فوراً از کش محلی (localStorage) نمایش داده می‌شود اگر باشد
 *  ۲) در پس‌زمینه /bootstrap از سرور گرفته می‌شود (TTL = ۱۰ دقیقه)
 *  ۳) اگر PHP هاست قدیمی بود و /bootstrap را نداشت (404) → fallback به
 *     درخواست‌های تکی همان endpoint های قبلی
 *  ۴) اگر شبکه/هاست قطع بود → داده محلی با وضعیت offline می‌ماند
 *  ۵) بعد از هر نوشتن موفق (api-client) کل کش بی‌اعتبار و در تلاش بعدی
 *     دوباره از سرور خوانده می‌شود
 */

import { useEffect, useSyncExternalStore } from "react";
import { apiClient } from "@/lib/api-client";
import { readCache, writeCache, browserOnline, cacheEpoch } from "@/lib/local-cache";

const CACHE_KEY = "bootstrap";
const TTL_MS = 1000 * 60 * 10; // ۱۰ دقیقه تازگی داده مرجع

export interface BootstrapData {
  personnel: Array<{
    id: number; personnel_code?: string; first_name: string; last_name: string;
    position?: string | null;
  }>;
  circuits: Array<{
    id: number; dispatch_code: string; name: string | null; voltage: number | null;
  }>;
  conductors: Array<{
    id: number; name: string; standard: string | null; sectional_area_all: number | null;
    [k: string]: unknown;
  }>;
  lines: Array<{
    id: number; line_code: string; name: string; voltage_kv: number | null;
    dispatch_code?: string | null; conductor_type?: string | null;
    tower_structure?: string | null; status?: string;
  }>;
  generated_at?: string;
}

interface BootstrapState {
  data: BootstrapData | null;
  status: "idle" | "loading" | "ready" | "offline";
  fromCache: boolean;
  lastFetch: number;
}

const EMPTY: BootstrapData = { personnel: [], circuits: [], conductors: [], lines: [] };

// ─── استور ماژول‌سطح (یک نمونه برای کل اپ) ───
let state: BootstrapState = { data: null, status: "idle", fromCache: false, lastFetch: 0 };
const listeners = new Set<() => void>();

/** epoch دفعه‌قبل دیده‌شده — برای تشخیص کهنگی بعد از نوشتن */
let seenEpoch = cacheEpoch();

function set(patch: Partial<BootstrapState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BootstrapState {
  return state;
}

/** v3.5.1: نام سیم‌ها را نرمال می‌کند (دیتای قدیمی با کوتیشن) */
function normalizeConductors(list: BootstrapData["conductors"]): BootstrapData["conductors"] {
  return list.map(c => ({
    ...c,
    name: String(c.name ?? "").trim().replace(/^'+|'+$/g, "").trim(),
  }));
}

/** fallback: اگر /bootstrap روی هاست نبود، همان endpoint های تکی */
async function fetchLegacy(): Promise<BootstrapData> {
  const [personnel, circuits, conductors] = await Promise.all([
    apiClient.get<any>("personnel", { page: 1, page_size: 500 }).catch(() => null),
    apiClient.get<any>("circuits").catch(() => null),
    apiClient.get<any>("conductors").catch(() => null),
  ]);
  const arr = (r: any): any[] => (Array.isArray(r) ? r : (r?.data || []));
  return {
    personnel: personnel ? arr(personnel) : [],
    circuits: circuits ? arr(circuits) : [],
    conductors: conductors ? normalizeConductors(arr(conductors)) : [],
    lines: [], // fallback سبک — خطوط فقط از bootstrap کامل می‌آید
  };
}

async function fetchBootstrap(): Promise<BootstrapData> {
  try {
    const r = await apiClient.get<any>("bootstrap");
    const d: BootstrapData = {
      personnel: r?.personnel || [],
      circuits: r?.circuits || [],
      conductors: normalizeConductors(r?.conductors || []),
      lines: r?.lines || [],
      generated_at: r?.generated_at,
    };
    return d;
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404) {
      // PHP هاست هنوز /bootstrap ندارد → درخواست‌های تکی
      return await fetchLegacy();
    }
    throw err;
  }
}

/** تضمین بارگذاری: کش محلی فوری + تازه‌سازی شبکه در صورت نیاز */
function ensureLoaded(force = false): void {
  // v3.5.2: اگر api-client بعد از یک نوشتن موفق کش را کهنه علامت زده، تازه‌سازی اجباری است
  if (cacheEpoch() !== seenEpoch) {
    seenEpoch = cacheEpoch();
    force = true;
  }

  // ۱) داده تازه در حافظه؟
  if (!force && state.status === "ready" && Date.now() - state.lastFetch < TTL_MS) return;
  if (state.status === "loading") return;

  // ۲) کش محلی — فوراً منتشر کن (اگر داده‌ای در حافظه نیست یا جدیدتر از حافظه است)
  const cached = readCache<BootstrapData>(CACHE_KEY, TTL_MS);
  if (cached && (!state.data || cached.at > state.lastFetch)) {
    set({ data: cached.data, fromCache: true, status: cached.stale ? "loading" : "ready" });
  }
  if (!cached && !state.data) {
    set({ data: EMPTY, status: "loading" });
  }

  // ۳) تازه‌سازی فقط اگر آنلاین هستیم یا داده کهنه/مجبوریم
  const needsRefresh = force || !cached || cached.stale || !state.lastFetch;
  if (!needsRefresh) return;
  if (!browserOnline()) {
    set({ status: "offline" });
    return;
  }

  set({ status: "loading" });
  fetchBootstrap()
    .then(d => {
      writeCache(CACHE_KEY, d, TTL_MS);
      set({ data: d, status: "ready", fromCache: false, lastFetch: Date.now() });
    })
    .catch(() => {
      // شبکه/هاست قطع — داده محلی می‌ماند
      set({ status: state.data && state.data !== EMPTY ? "offline" : "offline" });
    });
}

export function useBootstrap() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ensureLoaded();
  }, []);

  return {
    data: snap.data,
    status: snap.status,
    fromCache: snap.fromCache,
    loading: snap.status === "loading",
    offline: snap.status === "offline",
    refresh: () => ensureLoaded(true),
  };
}
