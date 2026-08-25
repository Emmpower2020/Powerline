/**
 * پیکربندی ماژول نقشه — v4.0.0
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
  | "osm-hot"
  | "carto-light"
  | "carto-dark"
  | "esri-satellite"
  | "esri-street"
  | "esri-topo"
  | "opentopo";

// ─── تصاویر پیش‌فرض SVG برای نقشه‌های پایه ───
// پیش‌نمایش ثابت (بدون وابستگی به شبکه) — همیشه بارگذاری می‌شود
function svgThumb(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const THUMB_SVGS: Record<BasemapId, string | null> = {
  blank: null, // صفحه سفید با شبکه‌ی نقاط در CSS
  osm: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#f5f5f5"/><path d="M0 30 H220 M0 65 H220 M0 100 H220 M55 0 V130 M135 0 V130 M180 0 V130" stroke="#bbb" stroke-width="1.5" fill="none"/><path d="M0 65 H220" stroke="#888" stroke-width="4" fill="none"/><path d="M135 0 V130" stroke="#888" stroke-width="4" fill="none"/><rect x="65" y="35" width="25" height="15" fill="#ddd"/><rect x="145" y="75" width="30" height="15" fill="#ddd"/><circle cx="100" cy="50" r="3" fill="#9bca3f"/><circle cx="170" cy="35" r="3" fill="#9bca3f"/></svg>`),
  "osm-hot": svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#f5f0e8"/><path d="M0 30 H220 M0 65 H220 M0 100 H220 M55 0 V130 M135 0 V130" stroke="#c9b89a" stroke-width="1.5" fill="none"/><path d="M0 65 H220" stroke="#a98e58" stroke-width="4" fill="none"/><path d="M135 0 V130" stroke="#a98e58" stroke-width="3" fill="none"/><rect x="65" y="35" width="25" height="15" fill="#e8d9b8"/><rect x="145" y="75" width="30" height="15" fill="#e8d9b8"/><path d="M55 110 H135" stroke="#c64a3a" stroke-width="5" fill="none"/></svg>`),
  "carto-light": svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#ffffff"/><path d="M0 40 H220 M0 85 H220 M65 0 V130 M155 0 V130" stroke="#e2e8f0" stroke-width="2" fill="none"/><rect x="75" y="50" width="25" height="22" fill="#f1f5f9"/><rect x="165" y="90" width="30" height="22" fill="#f1f5f9"/><circle cx="100" cy="60" r="4" fill="#e2e8f0"/></svg>`),
  "carto-dark": svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#1a1a1a"/><path d="M0 40 H220 M0 85 H220 M65 0 V130 M155 0 V130" stroke="#3a3a3a" stroke-width="2" fill="none"/><rect x="75" y="50" width="25" height="22" fill="#252525"/><rect x="165" y="90" width="30" height="22" fill="#252525"/><circle cx="100" cy="60" r="4" fill="#2a2a2a"/></svg>`),
  "esri-satellite": svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a5a3a"/><stop offset="60%" stop-color="#5a6a3a"/><stop offset="60%" stop-color="#6a5a3a"/><stop offset="100%" stop-color="#4a3a2a"/></linearGradient></defs><rect width="220" height="130" fill="url(#sg)"/><path d="M0 90 Q40 75 80 90 T160 90 T220 90" stroke="#3a3a1a" stroke-width="2" fill="none"/><path d="M0 100 Q40 85 80 100 T160 100 T220 100" stroke="#3a3a1a" stroke-width="1" fill="none"/><circle cx="180" cy="35" r="2" fill="#fff" opacity="0.7"/><circle cx="40" cy="50" r="1" fill="#fff" opacity="0.7"/><path d="M50 110 L70 100 L90 110" stroke="#4a4a2a" stroke-width="2" fill="none"/></svg>`),
  "esri-street": svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#f8f4ed"/><path d="M0 40 H220 M0 85 H220 M65 0 V130 M155 0 V130" stroke="#d4c8b0" stroke-width="3" fill="none"/><path d="M0 40 H220" stroke="#e89c5a" stroke-width="5" fill="none"/><rect x="75" y="50" width="25" height="22" fill="#f1e5d0"/><rect x="165" y="90" width="30" height="22" fill="#f1e5d0"/><circle cx="100" cy="60" r="4" fill="#d4c8b0"/></svg>`),
  "esri-topo": svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#e8e5d5"/><path d="M0 65 Q30 30 60 65 T120 65 T220 65" stroke="#a89968" stroke-width="2" fill="none"/><path d="M0 85 Q30 65 60 85 T120 85 T220 85" stroke="#a89968" stroke-width="1.5" fill="none"/><path d="M0 45 Q30 20 60 45 T120 45 T220 45" stroke="#a89968" stroke-width="1.5" fill="none"/><path d="M0 105 Q30 85 60 105 T120 105 T220 105" stroke="#a89968" stroke-width="1" fill="none"/><circle cx="80" cy="65" r="3" fill="#7a8b3a"/><circle cx="140" cy="85" r="3" fill="#7a8b3a"/></svg>`),
  opentopo: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="130" viewBox="0 0 220 130"><rect width="220" height="130" fill="#d8d4b8"/><path d="M0 90 L40 50 L80 90 L120 35 L160 90 L220 50" stroke="#9a8b58" stroke-width="2" fill="none"/><path d="M0 110 L40 70 L80 110 L120 55 L160 110 L220 70" stroke="#9a8b58" stroke-width="1.5" fill="none"/><path d="M0 70 L40 30 L80 70 L120 15 L160 70 L220 30" stroke="#9a8b58" stroke-width="1" fill="none"/><circle cx="40" cy="50" r="2" fill="#7a8b3a"/><circle cx="120" cy="35" r="2" fill="#7a8b3a"/></svg>`),
};

export interface BasemapDef {
  id: BasemapId;
  title: string; // نام فارسی
  desc: string;
  url?: string; // خالی = صفحه سفید بدون کاشی
  attribution?: string;
  maxZoom?: number;
  subdomains?: string;
  // بندانگشتی پیش‌نمایش (کاشی ثابت از همان منبع — مختصات منطقه کرمانشاه)
  thumb?: { x: number; y: number; z: number };
  thumbClass?: string; // برای صفحه سفید که کاشی ندارد
  dark?: boolean; // تم تیره؟
}

export const BASEMAPS: BasemapDef[] = [
  {
    id: "blank",
    title: "صفحه خالی",
    desc: "سفید — بدون نقشه",
    thumbClass: "bg-white",
    // شبکه‌ی نقاط کم‌رنگ در CSS رسم می‌شود
  },
  {
    id: "osm",
    title: "نقشه خیابانی",
    desc: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "abc",
    maxZoom: 19,
    thumb: { x: 20945, y: 12135, z: 15 },
  },
  {
    id: "osm-hot",
    title: "نقشه انسانی",
    desc: "OSM Humanitarian",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OSM Team',
    subdomains: "ab",
    maxZoom: 19,
    thumb: { x: 20945, y: 12135, z: 15 },
  },
  {
    id: "carto-light",
    title: "روشن مینیمال",
    desc: "Carto Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
    thumb: { x: 20945, y: 12135, z: 15 },
  },
  {
    id: "carto-dark",
    title: "تیره",
    desc: "Carto Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
    dark: true,
    thumb: { x: 20945, y: 12135, z: 15 },
  },
  {
    id: "esri-satellite",
    title: "ماهواره‌ای",
    desc: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    thumb: { x: 10472, y: 6067, z: 14 },
  },
  {
    id: "esri-street",
    title: "خیابانی رنگی",
    desc: "Esri World Street",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, DeLorme, NAVTEQ",
    maxZoom: 19,
    thumb: { x: 10472, y: 6067, z: 14 },
  },
  {
    id: "esri-topo",
    title: "توپوگرافی",
    desc: "Esri World Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, USGS, NOAA",
    maxZoom: 19,
    thumb: { x: 10472, y: 6067, z: 14 },
  },
  {
    id: "opentopo",
    title: "کوهستانی",
    desc: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
    subdomains: "abc",
    maxZoom: 17,
    thumb: { x: 20945, y: 12135, z: 15 },
  },
];

export function basemapById(id: BasemapId): BasemapDef {
  return BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
}

// پیش‌نمایش نقشه پایه — همیشه SVG ثابت (بدون وابستگی به شبکه)
export function basemapThumbUrl(b: BasemapDef): string | null {
  return THUMB_SVGS[b.id] ?? null;
}
