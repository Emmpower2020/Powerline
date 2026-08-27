/**
 * ساخت مسیر خطوط بر اساس «مجموعه خط» — v4.0.0
 *
 * منطق (طبق نیاز کاربر):
 * 1) دکل‌های هر خط بر اساس شماره دکل (tower_number) مرتب می‌شوند — این ترتیبِ فیزیکی مسیر است
 * 2) پرش‌های غیرعادی (فاصله > MAX_GAP_M بین دو دکل متوالی) مسیر را می‌شکنند (دکل جاافتاده/مشترک)
 * 3) خطوطی که «نام مجموعه» (group_name) یکسان دارند زنجیر می‌شوند: قطعه‌ها با نزدیک‌ترین
 *    سر-به-سر به هم وصل می‌شوند تا مسیر پیوسته‌ی مجموعه شکل بگیرد — نه وصل کردن الکی همه به همه
 */

import type { Line, Tower } from "@/lib/types";

/** حداکثر فاصله مجاز بین دو دکل متوالی (متر) — بیشتر از این یعنی نقطة گمشده */
export const MAX_GAP_M = 3000;

export interface RoutePoint {
  towerId: number;
  lat: number;
  lng: number;
}

/** یک قطعة مسیر متصل از یک خط (خط می‌تواند چند قطعه داشته باشد اگر شکستگی داشته باشد) */
export interface RoutePart {
  lineId: number;
  points: RoutePoint[];
  /** عدد ترتیب قطعه در خود خط */
  partIndex: number;
}

export interface GroupRoute {
  /** کلید یکتای مجموعه (group_name یا lineId) */
  key: string;
  /** نام مجموعه خط — اگر null باشد مجموعه‌ای ندارد */
  groupName: string | null;
  /** قطعه‌ها به ترتیب زنجیره (هر قطعه در جهت اتصال orient شده) */
  parts: RoutePart[];
  /** اتصال‌های بین قطعه‌های متوالی زنجیره (فاصله‌های کوتاه بین انتها/ابتدای قطعه‌ها) */
  connectors: Array<{ from: RoutePoint; to: RoutePoint; toLineId: number }>;
  towerCount: number;
}

export interface LineInfo {
  id: number;
  line_code: string;
  name: string;
  group_name: string | null;
  voltage_kv: number | null;
  towerCount: number;
}

export interface BuiltRoutes {
  groups: GroupRoute[];
  /** خطوط انتخاب‌شده‌ای که هیچ دکل GPS-داری ندارند */
  emptyLines: number[];
  stats: { totalTowers: number; totalParts: number };
}

// ─── ابزار ───

function haversineM(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** شمارة دکل با تحمل مقادیر NULL — از انتهای عددی کد دکل هم استفاده می‌شود */
function towerSortKey(t: Tower): number {
  if (t.tower_number != null) return t.tower_number;
  const m = /(\d+)\s*$/.exec(t.tower_code || "");
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

// ─── ساخت قطعه‌های مسیر هر خط ───

/**
 * دکل‌های یک خط را به قطعه‌های متصل تبدیل می‌کند.
 * ترتیب بر اساس شمارة دکل؛ شکست در فاصله‌های بزرگ‌تر از MAX_GAP_M.
 */
export function buildLineParts(lineId: number, lineTowers: Tower[]): RoutePart[] {
  const withGps = lineTowers
    .filter((t) => t.gps_lat != null && t.gps_lng != null)
    .sort((a, b) => towerSortKey(a) - towerSortKey(b) || (a.tower_code || "").localeCompare(b.tower_code || ""));

  if (withGps.length === 0) return [];

  const parts: RoutePart[] = [];
  let current: RoutePoint[] = [
    { towerId: withGps[0].id, lat: withGps[0].gps_lat!, lng: withGps[0].gps_lng! },
  ];

  for (let i = 1; i < withGps.length; i++) {
    const t = withGps[i];
    const p: RoutePoint = { towerId: t.id, lat: t.gps_lat!, lng: t.gps_lng! };
    const prev = current[current.length - 1];
    const gap = haversineM(prev, p);
    if (gap > MAX_GAP_M) {
      // شکست — قطعة قبلی تمام شد
      if (current.length >= 1) parts.push({ lineId, points: current, partIndex: parts.length });
      current = [p];
    } else {
      current.push(p);
    }
  }
  parts.push({ lineId, points: current, partIndex: parts.length });
  return parts;
}

// ─── زنجیر کردن قطعه‌های یک مجموعه (greedy نزدیک‌ترین سر) ───

/**
 * قطعه‌های یک مجموعه خط را به ترتیب جغرافیایی زنجیر می‌کند.
 * استراتژی: از بزرگ‌ترین قطعه شروع، سپس هر بار نزدیک‌ترین سرِ قطعة بعدی
 * به یکی از دو سرِ زنجیر فعلی پیدا و در همان سمت متصل می‌شود.
 */
export function chainParts(parts: RoutePart[]): { parts: RoutePart[]; connectors: GroupRoute["connectors"] } {
  if (parts.length === 0) return { parts: [], connectors: [] };
  if (parts.length === 1) return { parts, connectors: [] };

  const remaining = [...parts];
  // شروع با قطعه‌ای که بیشترین دکل را دارد (پرکارترین بخش مسیر)
  remaining.sort((a, b) => b.points.length - a.points.length);
  const chain: RoutePart[] = [remaining.shift()!];
  const connectors: GroupRoute["connectors"] = [];
  const firstPt = (p: RoutePart) => p.points[0];
  const lastPt = (p: RoutePart) => p.points[p.points.length - 1];

  while (remaining.length > 0) {
    let best = {
      dist: Infinity,
      remIdx: -1,
      remEnd: 0 as 0 | 1, // کدام سرِ قطعة باقی‌مانده (0=ابتدا، 1=انتها)
      chainEnd: 0 as 0 | 1, // کدام سرِ زنجیر (0=ابتدا، 1=انتها)
    };

    const cf = firstPt(chain[0]);
    const cb = lastPt(chain[chain.length - 1]);

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const sStart = firstPt(seg);
      const sEnd = lastPt(seg);
      const candidates: Array<[number, 0 | 1, 0 | 1]> = [
        [haversineM(cf, sStart), 0, 0],
        [haversineM(cf, sEnd), 1, 0],
        [haversineM(cb, sStart), 0, 1],
        [haversineM(cb, sEnd), 1, 1],
      ];
      for (const [dist, remEnd, chainEnd] of candidates) {
        if (dist < best.dist) best = { dist, remIdx: i, remEnd, chainEnd };
      }
    }

    const seg = remaining.splice(best.remIdx, 1)[0];
    let oriented = seg;
    if (best.chainEnd === 1) {
      // اتصال به انتهای زنجیر: ابتدای قطعه باید کنار انتهای زنجیر باشد
      if (best.remEnd === 1) oriented = { ...seg, points: [...seg.points].reverse() };
      connectors.push({ from: lastPt(chain[chain.length - 1]), to: firstPt(oriented), toLineId: oriented.lineId });
      chain.push(oriented);
    } else {
      // اتصال به ابتدای زنجیر: انتهای قطعه باید کنار ابتدای زنجیر باشد
      if (best.remEnd === 0) oriented = { ...seg, points: [...seg.points].reverse() };
      connectors.push({ from: lastPt(oriented), to: firstPt(chain[0]), toLineId: oriented.lineId });
      chain.unshift(oriented);
    }
  }

  return { parts: chain, connectors };
}

// ─── API اصلی: ساخت مسیر خطوط انتخاب‌شده ───

/**
 * برای خطوط انتخاب‌شده، مسیرها را بر اساس مجموعه خط می‌سازد.
 * @param lines همه خطوط (برای خواندن group_name)
 * @param towers همه دکل‌ها
 * @param selectedLineIds شناسه خطوط انتخاب‌شده
 */
export function buildRoutes(
  lines: Line[],
  towers: Tower[],
  selectedLineIds: Set<number>
): BuiltRoutes {
  const towersByLine = new Map<number, Tower[]>();
  for (const t of towers) {
    if (t.line_id == null) continue;
    const arr = towersByLine.get(t.line_id);
    if (arr) arr.push(t);
    else towersByLine.set(t.line_id, [t]);
  }

  // گروه‌بندی خطوط انتخاب‌شده بر اساس مجموعه
  const groupsMap = new Map<string, { groupName: string | null; lineIds: number[] }>();
  const emptyLines: number[] = [];

  for (const line of lines) {
    if (!selectedLineIds.has(line.id)) continue;
    const lineTowers = towersByLine.get(line.id) || [];
    const withGps = lineTowers.filter((t) => t.gps_lat != null && t.gps_lng != null);
    if (withGps.length === 0) {
      emptyLines.push(line.id);
      continue;
    }
    const key = line.group_name ? `g:${line.group_name}` : `l:${line.id}`;
    let g = groupsMap.get(key);
    if (!g) {
      g = { groupName: line.group_name || null, lineIds: [] };
      groupsMap.set(key, g);
    }
    g.lineIds.push(line.id);
  }

  const groups: GroupRoute[] = [];
  let totalTowers = 0;
  let totalParts = 0;

  for (const [key, g] of groupsMap) {
    // ساخت قطعه‌های هر خط مجموعه
    const allParts: RoutePart[] = [];
    for (const lineId of g.lineIds) {
      const parts = buildLineParts(lineId, towersByLine.get(lineId) || []);
      allParts.push(...parts);
      totalParts += parts.length;
      totalTowers += parts.reduce((s, p) => s + p.points.length, 0);
    }
    if (allParts.length === 0) continue;

    const { parts: chained, connectors } = chainParts(allParts);
    groups.push({
      key,
      groupName: g.groupName,
      parts: chained,
      connectors,
      towerCount: chained.reduce((s, p) => s + p.points.length, 0),
    });
  }

  // مرتب‌سازی گروه‌ها بر اساس نام مجموعه برای نمایش پایدار
  groups.sort((a, b) => (a.groupName || "").localeCompare(b.groupName || "", "fa"));

  return { groups, emptyLines, stats: { totalTowers, totalParts } };
}

/** آمار هر خط برای نمایش در فهرست کنار نقشه */
export function linesWithTowerCount(lines: Line[], towers: Tower[]): LineInfo[] {
  const counts = new Map<number, { total: number; withGps: number }>();
  for (const t of towers) {
    if (t.line_id == null) continue;
    let c = counts.get(t.line_id);
    if (!c) {
      c = { total: 0, withGps: 0 };
      counts.set(t.line_id, c);
    }
    c.total++;
    if (t.gps_lat != null && t.gps_lng != null) c.withGps++;
  }
  return lines.map((l) => ({
    id: l.id,
    line_code: l.line_code,
    name: l.name,
    group_name: l.group_name ?? null,
    voltage_kv: l.voltage_kv,
    towerCount: counts.get(l.id)?.withGps ?? 0,
  }));
}

/** طول کل مسیرهای رسم‌شده (کیلومتر) — شامل قطعه‌ها و اتصال‌های بین قطعه‌ای */
export function routesLengthKm(routes: BuiltRoutes): number {
  let meters = 0;
  const segLen = (a: RoutePoint, b: RoutePoint) => haversineM(a, b);
  for (const g of routes.groups) {
    for (const part of g.parts) {
      for (let i = 1; i < part.points.length; i++) {
        meters += segLen(part.points[i - 1], part.points[i]);
      }
    }
    for (const c of g.connectors) {
      meters += segLen(c.from, c.to);
    }
  }
  return meters / 1000;
}
