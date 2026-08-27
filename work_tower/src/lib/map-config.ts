/**
 * پیکربندی ماژول نقشه — v4.2.0
 * تعریف نقشه‌های پایه، رنگ‌بندی ولتاژ و شکل نماد دکل‌ها
 */

// ─── رنگ‌بندی سطح ولتاژ ───
// 400 کیلوولت: بنفش | 230: قرمز | 132: سبز | 63: آبی (طبق درخواست کاربر)
export interface VoltageStyle {
  kv: number;
  label: string;
  color: string; // رنگ اصلی مسیر و نشانگر
  bg: string; // پس‌زمینه بج
  text: string; // رنگ متن بج
  border: string;
}

export const VOLTAGE_STYLES: VoltageStyle[] = [
  { kv: 400, label: "400 کیلوولت", color: "#8B5CF6", bg: "#EDE9FE", text: "#6D28D9", border: "#C4B5FD" },
  { kv: 230, label: "230 کیلوولت", color: "#EF4444", bg: "#FEE2E2", text: "#B91C1C", border: "#FCA5A5" },
  { kv: 132, label: "132 کیلوولت", color: "#22C55E", bg: "#DCFCE7", text: "#15803D", border: "#86EFAC" },
  { kv: 63, label: "63 کیلوولت", color: "#3B82F6", bg: "#DBEAFE", text: "#1D4ED8", border: "#93C5FD" },
];

export const UNKNOWN_VOLTAGE_STYLE: VoltageStyle = {
  kv: 0,
  label: "بدون ولتاژ",
  color: "#94A3B8",
  bg: "#F1F5F9",
  text: "#475569",
  border: "#CBD5E1",
};

export function voltageStyle(kv?: number | null): VoltageStyle {
  if (kv == null) return UNKNOWN_VOLTAGE_STYLE;
  const v = Number(kv);
  const exact = VOLTAGE_STYLES.find((s) => s.kv === v);
  if (exact) return exact;
  // نزدیک‌ترین سطح ولتاژ استاندارد
  const nearest = VOLTAGE_STYLES.reduce((a, b) =>
    Math.abs(b.kv - v) < Math.abs(a.kv - v) ? b : a
  );
  return Math.abs(nearest.kv - v) <= 20 ? nearest : UNKNOWN_VOLTAGE_STYLE;
}

export const VOLTAGE_ORDER: number[] = [400, 230, 132, 63];

// ─── شکل نماد دکل‌ها بر اساس نوع سازه ───
// فلزی مشبک: مربع | تیر چوبی: مثلث | تیر بتنی: دایره | تلسکوپی: لوزی
export type TowerShape = "square" | "triangle" | "circle" | "diamond" | "cross";

export interface TowerTypeStyle {
  type: string;
  shape: TowerShape;
  label: string; // نام فارسی
}

export const TOWER_TYPE_STYLES: TowerTypeStyle[] = [
  { type: "lattice_steel", shape: "square", label: "فلزی مشبک" },
  { type: "wood", shape: "triangle", label: "تیر چوبی" },
  { type: "concrete", shape: "circle", label: "تیر بتنی" },
  { type: "concrete_tele", shape: "diamond", label: "تلسکوپی بتنی" },
  { type: "steel_tele", shape: "diamond", label: "تلسکوپی فلزی" },
  { type: "other", shape: "cross", label: "سایر" },
];

export function towerTypeStyle(towerType?: string | null): TowerTypeStyle {
  const found = TOWER_TYPE_STYLES.find((t) => t.type === towerType);
  return found || TOWER_TYPE_STYLES[TOWER_TYPE_STYLES.length - 1];
}

export function towerTypeLabel(towerType?: string | null): string {
  return towerTypeStyle(towerType).label;
}

// ─── نقشه‌های پایه ───
export type BasemapId =
  | "blank"
  | "osm"
  | "esri-satellite"
  | "esri-street"
  | "esri-topo"
  | "opentopo";

export interface BasemapDef {
  id: BasemapId;
  title: string; // نام فارسی
  desc: string;
  url?: string; // خالی = صفحه سفید بدون کاشی
  attribution?: string;
  maxZoom?: number;
  subdomains?: string;
  // بندانگشتی پیش‌نمایش — مختصات کاشی واقعی از هر منبع (منطقه کرمانشاه)
  thumb?: { x: number; y: number; z: number };
  thumbClass?: string; // برای صفحه سفید که کاشی ندارد
  dark?: boolean; // تم تیره؟
  // رنگ پیش‌فرض متن برچسب‌های خط — وارونه نسبت به پس‌زمینه نقشه
  labelColor?: string;
}

// مختصات کاشی ثابت برای منطقه کرمانشاه — z=12 (نمای منطقه)
// v4.2.1: اصلاح مختصات — قبلاً 2618/1517 به ناحیه خزر اشاره می‌کرد که خالی بود.
// مختصات صحیح برای lat=34.3, lng=47.0: x=2582, y=1632
const KERMANSHAH_TILE = { x: 2582, y: 1632, z: 12 };

// مختصات کاشی ماهواره‌ای Esri برای همان ناحیه
const ESRI_SAT_TILE = { x: 2582, y: 1632, z: 12 };

export const BASEMAPS: BasemapDef[] = [
  {
    id: "blank",
    title: "صفحه خالی",
    desc: "سفید — بدون نقشه",
    thumbClass: "bg-white",
    labelColor: "#0f172a", // مشکی روی سفید
  },
  {
    id: "osm",
    title: "نقشه خیابانی",
    desc: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "abc",
    maxZoom: 19,
    thumb: KERMANSHAH_TILE,
    labelColor: "#0f172a",
  },
  {
    id: "esri-satellite",
    title: "ماهواره‌ای",
    desc: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    thumb: ESRI_SAT_TILE,
    labelColor: "#ffffff", // سفید روی ماهواره
  },
  {
    id: "esri-street",
    title: "خیابانی رنگی",
    desc: "Esri World Street",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, DeLorme, NAVTEQ",
    maxZoom: 19,
    thumb: ESRI_SAT_TILE,
    labelColor: "#0f172a",
  },
  {
    id: "esri-topo",
    title: "توپوگرافی",
    desc: "Esri World Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, USGS, NOAA",
    maxZoom: 19,
    thumb: ESRI_SAT_TILE,
    labelColor: "#0f172a",
  },
  {
    id: "opentopo",
    title: "کوهستانی",
    desc: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
    subdomains: "abc",
    maxZoom: 17,
    thumb: KERMANSHAH_TILE,
    labelColor: "#0f172a",
  },
];

export function basemapById(id: BasemapId): BasemapDef {
  return BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
}

// ─── پیش‌نمایش واقعی نقشه پایه (کاشی واقعی از همان منبع) ───
// همیشه URL زنده از همان منبع بارگذاری می‌شود — اگر کاشی در دسترس نباشد، SVG سفیدشی جایگزین می‌شود
const FALLBACK_THUMB_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130"><rect width="220" height="130" fill="#f1f5f9"/><text x="50%" y="50%" font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">پیش‌نمایش</text></svg>`
);

// v4.2.2: پارامتر cache-busting برای اطمینان از بارگذاری نسخه جدید بعد از تغییر مختصات
const THUMB_CACHE_BUSTER = "v4.2.2";

// v4.2.2: مسیر پروکسی محلی برای دور زدن CORS/مسدودسازی روی مرورگر کاربر
// مسیر: /api/tile/<provider>/<z>/<x>/<y>
// این تابع provider مناسب را بر اساس BasemapId برمی‌گرداند
function basemapProvider(id: BasemapId): string | null {
  switch (id) {
    case "osm": return "osm";
    case "esri-satellite": return "esri-satellite";
    case "esri-street": return "esri-street";
    case "esri-topo": return "esri-topo";
    case "opentopo": return "opentopo";
    default: return null;
  }
}

export function basemapThumbUrl(b: BasemapDef): string | null {
  if (b.id === "blank") return null;
  if (!b.thumb) return FALLBACK_THUMB_SVG;
  // v4.2.2: استفاده از پروکسی محلی برای بارگذاری کاشی از طریق سرور خودمان
  // این کار از مشکلات CORS، مسدودسازی شبکه، و عدم بارگذاری در برخی مرورگرها جلوگیری می‌کند
  const provider = basemapProvider(b.id);
  if (!provider) return FALLBACK_THUMB_SVG;
  const { z, x, y } = b.thumb;
  return `/api/tile/${provider}/${z}/${x}/${y}?cb=${THUMB_CACHE_BUSTER}`;
}

/** رنگ پیش‌فرض برچسب‌های خطوط روی نقشه (وارونه نسبت به پس‌زمینه) */
export function basemapLabelColor(b: BasemapDef): string {
  return b.labelColor ?? (b.dark ? "#f1f5f9" : "#0f172a");
}

/**
 * v4.2.2: URL کاشی برای TileLayer — از طریق پروکسی محلی
 * این کار از مشکلات CORS، مسدودسازی شبکه، و عدم بارگذاری برخی کاشی‌ها جلوگیری می‌کند.
 * الگوی {z}/{x}/{y} که Leaflet آن‌ها را با مختصات واقعی جایگزین می‌کند.
 */
export function basemapTileUrl(b: BasemapDef): string | null {
  if (b.id === "blank") return null;
  const provider = basemapProvider(b.id);
  if (!provider) return null;
  return `/api/tile/${provider}/{z}/{x}/{y}`;
}
