"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { Line, Tower } from "@/lib/types";
import {
  BASEMAPS,
  VOLTAGE_STYLES,
  UNKNOWN_VOLTAGE_STYLE,
  TOWER_TYPE_STYLES,
  basemapById,
  basemapThumbUrl,
  voltageStyle,
  type BasemapId,
} from "@/lib/map-config";
import {
  buildRoutes,
  linesWithTowerCount,
  routesLengthKm,
  type LineInfo,
} from "@/lib/line-routes";
import { TowerMap, type MapTool } from "@/components/tower-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Search,
  X,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Info,
  ChevronDown,
  ChevronRight,
  ListFilter,
  AlertTriangle,
  RefreshCw,
  Ruler,
  Square,
  MapPin,
  Plus,
  Minus,
  Home,
  Scan,
  Eye,
  EyeOff,
} from "lucide-react";

/**
 * صفحه نقشه‌ها — v4.1.0 بازطراحی نوار ابزار:
 * - نوار ابزار بالای نقشه با: اندازه‌گیری طول/مساحت، موقعیت جغرافیایی،
 *   زوم به ناحیه، زوم این +، زوم اوت -، بازگشت به خانه (Home)
 * - پنل لیست خطوط به سمت چپ منتقل شد و ارتفاع آن کم شد
 * - دکمه‌های نقشه پایه/راهنما/تمام‌صفحه به نوار بالا منتقل شد
 * - نام خط روی مسیر دائمی نوشته می‌شود
 * - شماره دکل بدون صفر پیشینی نمایش داده می‌شود
 */

const fa = (n: number) => n.toLocaleString("fa-IR");

// شکل‌های SVG کوچک برای راهنما (legend)
function ShapeIcon({ shape, color, size = 14 }: { shape: string; color: string; size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0">
      {shape === "square" && <rect x={s * 0.12} y={s * 0.12} width={s * 0.76} height={s * 0.76} rx={1.5} fill={color} stroke="#fff" strokeWidth="1" />}
      {shape === "triangle" && <polygon points={`${s / 2},${s * 0.08} ${s * 0.94},${s * 0.9} ${s * 0.06},${s * 0.9}`} fill={color} stroke="#fff" strokeWidth="1" />}
      {shape === "circle" && <circle cx={s / 2} cy={s / 2} r={s * 0.42} fill={color} stroke="#fff" strokeWidth="1" />}
      {shape === "diamond" && <polygon points={`${s / 2},${s * 0.05} ${s * 0.95},${s / 2} ${s / 2},${s * 0.95} ${s * 0.05},${s / 2}`} fill={color} stroke="#fff" strokeWidth="1" />}
      {shape === "cross" && (
        <g stroke={color} strokeWidth="2.2" strokeLinecap="round">
          <line x1={s * 0.18} y1={s * 0.18} x2={s * 0.82} y2={s * 0.82} />
          <line x1={s * 0.82} y1={s * 0.18} x2={s * 0.18} y2={s * 0.82} />
        </g>
      )}
    </svg>
  );
}

// دکمه نوار ابزار
function ToolBtn({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`map-tool-btn ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}

export function MapPage() {
  // داده
  const [lines, setLines] = useState<Line[]>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // وضعیت UI — پیش‌فرض هیچ خطی انتخاب نشده
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [basemapId, setBasemapId] = useState<BasemapId>("osm");
  const [hoveredLineId, setHoveredLineId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [basemapPanel, setBasemapPanel] = useState(false);
  const [legendPanel, setLegendPanel] = useState(false);
  const [showLineLabels, setShowLineLabels] = useState(true);
  const [fitTrigger, setFitTrigger] = useState(0);

  // نوار ابزار — ابزار فعال + ترایگرهای زوم
  const [activeTool, setActiveTool] = useState<MapTool>(null);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [homeTrigger, setHomeTrigger] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // بارگذاری خطوط + دکل‌ها
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [linesRes, towersRes] = await Promise.all([
        apiClient.get<any>(API_ENDPOINTS.lines, { page: 1, page_size: 1000 }),
        apiClient.get<any>(API_ENDPOINTS.towers, { page: 1, page_size: 100000 }),
      ]);
      setLines(linesRes?.data || []);
      setTowers(towersRes?.data || []);
    } catch (err) {
      console.error("خطا در بارگذاری داده نقشه:", err);
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => {
    const d = setTimeout(load, 200);
    return () => clearTimeout(d);
  }, [load]);

  // ایندکس‌ها و مسیرها
  const linesById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const towersById = useMemo(() => new Map(towers.map((t) => [t.id, t])), [towers]);
  const lineInfos = useMemo(() => linesWithTowerCount(lines, towers), [lines, towers]);
  const routes = useMemo(
    () => buildRoutes(lines, towers, selectedLineIds),
    [lines, towers, selectedLineIds]
  );
  const totalKm = useMemo(() => routesLengthKm(routes), [routes]);

  // گروه‌بندی خطوط بر اساس ولتاژ برای فهرست کناری
  const voltageGroups = useMemo(() => {
    const byKv = new Map<string, { kv: number | null; label: string; color: string; bg: string; border: string; text: string; lines: LineInfo[] }>();
    for (const li of lineInfos) {
      const vs = li.voltage_kv != null ? voltageStyle(li.voltage_kv) : UNKNOWN_VOLTAGE_STYLE;
      const key = String(vs.kv);
      let g = byKv.get(key);
      if (!g) {
        g = { kv: vs.kv || null, label: vs.label, color: vs.color, bg: vs.bg, border: vs.border, text: vs.text, lines: [] };
        byKv.set(key, g);
      }
      g.lines.push(li);
    }
    const order = [400, 230, 132, 63, 0];
    return Array.from(byKv.values()).sort((a, b) => order.indexOf(a.kv ?? 0) - order.indexOf(b.kv ?? 0));
  }, [lineInfos]);

  // فیلتر جستجو در فهرست
  const s = search.trim();
  const filteredGroups = useMemo(() => {
    if (!s) return voltageGroups;
    const needle = s.toLowerCase();
    return voltageGroups
      .map((g) => ({
        ...g,
        lines: g.lines.filter(
          (l) =>
            l.name.toLowerCase().includes(needle) ||
            l.line_code.toLowerCase().includes(needle) ||
            (l.group_name || "").toLowerCase().includes(needle)
        ),
      }))
      .filter((g) => g.lines.length > 0);
  }, [voltageGroups, s]);

  // عملیات انتخاب
  const toggleLine = useCallback((id: number) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((gLines: LineInfo[]) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      const ids = gLines.map((l) => l.id);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedLineIds(new Set()), []);
  const toggleAllLines = useCallback(() => {
    setSelectedLineIds((prev) => {
      const ids = lineInfos.map((l) => l.id);
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set<number>() : new Set(ids);
    });
  }, [lineInfos]);

  // با اولین انتخاب نقشه روی محدوده خطوط تنظیم می‌شود
  const hadSelectionRef = useRef(false);
  useEffect(() => {
    const has = selectedLineIds.size > 0;
    if (has && !hadSelectionRef.current) {
      const timer = setTimeout(() => setFitTrigger((t) => t + 1), 120);
      hadSelectionRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!has) hadSelectionRef.current = false;
  }, [selectedLineIds]);

  // تمام‌صفحه مرورگر
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // سوییچ ابزار فعال
  const toggleTool = useCallback((tool: NonNullable<MapTool>) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

  // بستن پنل‌ها با کلیک بیرون
  useEffect(() => {
    if (!basemapPanel && !legendPanel) return;
    const close = () => {
      setBasemapPanel(false);
      setLegendPanel(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", close);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", close);
    };
  }, [basemapPanel, legendPanel]);

  const selectedCount = selectedLineIds.size;
  const drawnTowerCount = routes.stats.totalTowers;

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="-m-3 lg:-m-4 relative bg-slate-100 dark:bg-slate-950 overflow-hidden"
      style={{ height: isFullscreen ? "100vh" : "calc(100vh - 3.5rem)" }}
    >
      {/* نقشه تمام‌صفحه */}
      <div className="absolute inset-0">
        {loading ? (
          <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
              <p className="text-sm">در حال بارگذاری خطوط و دکل‌ها...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-900 p-6">
            <div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 p-6 text-center shadow-lg">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">خطا در دریافت داده‌های نقشه</h3>
              <p className="text-sm text-slate-500 mb-4 leading-relaxed">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                <RefreshCw className="w-4 h-4 ml-1" /> تلاش مجدد
              </Button>
            </div>
          </div>
        ) : (
          <TowerMap
            basemapId={basemapId}
            routes={routes}
            towersById={towersById}
            linesById={linesById}
            hoveredLineId={hoveredLineId}
            fitTrigger={fitTrigger}
            activeTool={activeTool}
            zoomInTrigger={zoomInTrigger}
            zoomOutTrigger={zoomOutTrigger}
            homeTrigger={homeTrigger}
            showLineLabels={showLineLabels}
            labelSafeLeft={sidebarOpen ? 320 : 12}
            onToolDone={() => setActiveTool(null)}
          />
        )}
      </div>

      {/* ─── نوار ابزار نقشه ─── */}
      {!loading && !error && (
        <div
          className={`map-toolbar map-floating-panel absolute z-[2000] top-2 flex items-center gap-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-1.5 py-1.5 ${basemapPanel || legendPanel ? "map-toolbar-panel-open" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* خانه — بازگشت به نمای اولیه / محدوده خطوط */}
          <ToolBtn
            title="بازگشت به خانه — نمای اولیه"
            onClick={() => setHomeTrigger((t) => t + 1)}
          >
            <Home className="w-4 h-4" />
          </ToolBtn>
          {/* زوم این + */}
          <ToolBtn
            title="زوم این"
            onClick={() => setZoomInTrigger((t) => t + 1)}
          >
            <Plus className="w-4 h-4" />
          </ToolBtn>
          {/* زوم اوت - */}
          <ToolBtn
            title="زوم اوت"
            onClick={() => setZoomOutTrigger((t) => t + 1)}
          >
            <Minus className="w-4 h-4" />
          </ToolBtn>
          {/* زوم به ناحیه — کنار کنترل‌های زوم */}
          <ToolBtn
            active={activeTool === "zoom-area"}
            title="زوم به ناحیه (کشیدن مستطیل)"
            onClick={() => toggleTool("zoom-area")}
          >
            <Scan className="w-4 h-4" />
          </ToolBtn>

          <span className="map-tool-divider" />

          {/* اندازه‌گیری طول */}
          <ToolBtn
            active={activeTool === "measure-distance"}
            title="اندازه‌گیری طول"
            onClick={() => toggleTool("measure-distance")}
          >
            <Ruler className="w-4 h-4" />
          </ToolBtn>
          {/* اندازه‌گیری مساحت */}
          <ToolBtn
            active={activeTool === "measure-area"}
            title="اندازه‌گیری مساحت"
            onClick={() => toggleTool("measure-area")}
          >
            <Square className="w-4 h-4" />
          </ToolBtn>
          {/* موقعیت جغرافیایی */}
          <ToolBtn
            active={activeTool === "coordinates"}
            title="نمایش موقعیت جغرافیایی"
            onClick={() => toggleTool("coordinates")}
          >
            <MapPin className="w-4 h-4" />
          </ToolBtn>

          <span className="map-tool-divider" />

          {/* نمایش/مخفی کردن نام خطوط */}
          <ToolBtn
            active={showLineLabels}
            title={showLineLabels ? "مخفی کردن نام خطوط" : "نمایش نام خطوط"}
            onClick={() => setShowLineLabels((v) => !v)}
          >
            {showLineLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </ToolBtn>

          <span className="map-tool-divider" />

          {/* انتخاب نقشه پایه */}
          <div className="relative">
            <ToolBtn
              active={basemapPanel}
              title="انتخاب نقشه پایه"
              onClick={() => {
                setBasemapPanel((v) => !v);
                setLegendPanel(false);
              }}
            >
              <MapIcon className="w-4 h-4" />
            </ToolBtn>

            {/* پنل انتخاب نقشه — شبکه نقشه‌ها */}
            {basemapPanel && (
              <div className="absolute top-full mt-2 right-0 w-[360px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-none overflow-hidden z-[2100] map-basemap-popup">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">انتخاب نقشه پایه</span>
                  <button
                    onClick={() => setBasemapPanel(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2.5 grid grid-cols-3 gap-2">
                  {BASEMAPS.map((b) => {
                    const thumb = basemapThumbUrl(b);
                    const active = b.id === basemapId;
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          setBasemapId(b.id);
                          setBasemapPanel(false);
                        }}
                        className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer text-right ${
                          active
                            ? "border-violet-500 shadow-lg shadow-violet-500/20"
                            : "border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600"
                        }`}
                      >
                        <div
                          className="h-[64px] w-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative"
                          style={b.id === "blank" ? { background: "#ffffff" } : undefined}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={b.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.opacity = "0";
                              }}
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{
                                backgroundImage:
                                  "radial-gradient(circle, #e2e8f0 1px, transparent 1px)",
                                backgroundSize: "12px 12px",
                              }}
                            />
                          )}
                          {active && (
                            <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center shadow">
                              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3.5">
                                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div className="px-1.5 py-1.5 bg-white dark:bg-slate-900">
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{b.title}</p>
                          <p className="text-[9px] text-slate-400 truncate">{b.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* راهنما (Legend) */}
          <div className="relative">
            <ToolBtn
              active={legendPanel}
              title="راهنما"
              onClick={() => {
                setLegendPanel((v) => !v);
                setBasemapPanel(false);
              }}
            >
              <Info className="w-4 h-4" />
            </ToolBtn>

            {legendPanel && (
              <div className="absolute top-full mt-2 right-0 w-[250px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-none overflow-hidden p-3 space-y-3 z-[2100] map-legend-popup">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">سطح ولتاژ (رنگ مسیر)</p>
                  <div className="space-y-1">
                    {VOLTAGE_STYLES.map((v) => (
                      <div key={v.kv} className="flex items-center gap-2">
                        <span className="w-6 h-[5px] rounded-full" style={{ background: v.color }} />
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">{v.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">نوع سازه دکل (شکل)</p>
                  <div className="space-y-1.5">
                    {TOWER_TYPE_STYLES.filter((t) => t.type !== "other").map((t) => (
                      <div key={t.type} className="flex items-center gap-2">
                        <ShapeIcon shape={t.shape} color="#64748b" size={15} />
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">{t.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-6 border-t-2 border-dashed border-slate-400" />
                    <span className="text-[10px] text-slate-500">اتصال قطعه‌های هم‌مجموعه</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* تمام‌صفحه */}
          <ToolBtn
            title={isFullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </ToolBtn>
        </div>
      )}

      {/* ─── پنل انتخاب خطوط (سمت چپ) — v4.2.2: top هم‌سطح جعبه ابزار، مینیمال = جمع شدن ارتفاعی ─── */}
      {!loading && !error && (
        <div
          className="map-line-sidebar absolute z-[700] transition-all duration-300"
          style={{
            top: "0.5rem",
            bottom: sidebarOpen ? "2.5rem" : "auto",
            left: "0.75rem",
            width: "340px",
            height: sidebarOpen ? undefined : "auto",
          }}
        >
          <div className={`map-floating-panel flex flex-col bg-white/97 dark:bg-slate-900/97 backdrop-blur overflow-hidden ${sidebarOpen ? "h-full" : ""}`}>
            {/* هدر پنل — قابل کلیک برای جمع/باز کردن */}
            <div
              className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-l from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 shrink-0 cursor-pointer select-none"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <ListFilter className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">انتخاب خطوط</h3>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {sidebarOpen && selectedCount > 0 && (
                    <button
                      onClick={clearSelection}
                      className="text-[13px] text-red-600 hover:text-red-700 dark:text-red-400 cursor-pointer px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      پاک کردن
                    </button>
                  )}
                  <button
                    onClick={() => setSidebarOpen((v) => !v)}
                    title={sidebarOpen ? "جمع کردن پنل" : "باز کردن پنل"}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {sidebarOpen
                      ? <ChevronRight className="w-4 h-4" />
                      : <ChevronDown className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
              {sidebarOpen && (
                <div className="relative mt-2">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="جستجوی نام یا کد خط..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pr-9 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                  {s && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {!sidebarOpen && selectedCount > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[13px] text-slate-500 dark:text-slate-400">
                    <b className="text-slate-700 dark:text-slate-200 nums-fa">{fa(selectedCount)}</b> خط انتخاب شده
                  </span>
                </div>
              )}
            </div>

            {/* فهرست گروه‌های ولتاژ — فقط وقتی پنل باز است */}
            {sidebarOpen && (
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {filteredGroups.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-400">
                      خطی با این جستجو پیدا نشد
                    </div>
                  )}
                  {filteredGroups.map((g) => {
                    const allSelected = g.lines.every((l) => selectedLineIds.has(l.id));
                    const someSelected = g.lines.some((l) => selectedLineIds.has(l.id));
                    const collapsed = collapsedGroups.has(g.kv ?? 0);
                    return (
                      <div key={String(g.kv)} className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0">
                        {/* سرگروه ولتاژ */}
                        <div
                          className="flex items-center gap-2 px-3 py-2 select-none sticky top-0 z-10"
                          style={{ background: g.bg }}
                        >
                          <Checkbox
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            onCheckedChange={() => toggleGroup(g.lines)}
                            className="data-[state=checked]:border-white"
                            style={{ borderColor: g.color }}
                          />
                          <button
                            onClick={() =>
                              setCollapsedGroups((prev) => {
                                const next = new Set(prev);
                                const k = g.kv ?? 0;
                                if (next.has(k)) next.delete(k);
                                else next.add(k);
                                return next;
                              })
                            }
                            className="flex flex-1 items-center gap-2 cursor-pointer min-w-0 text-right"
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                            <span className="text-sm font-bold truncate" style={{ color: g.text }}>
                              خطوط {g.label}
                            </span>
                            <span
                              className="text-[12px] rounded-full px-1.5 py-0.5 shrink-0 nums-fa"
                              style={{ background: "rgba(255,255,255,0.7)", color: g.text }}
                            >
                              {fa(g.lines.length)}
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                              style={{ color: g.text }}
                            />
                          </button>
                        </div>
                        {/* خطوط گروه */}
                        {!collapsed && (
                          <div className="py-1">
                            {g.lines.map((l) => {
                              const checked = selectedLineIds.has(l.id);
                              return (
                                <label
                                  key={l.id}
                                  className="flex items-start gap-2 px-3 py-1.5 mx-1.5 rounded-lg cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                  onMouseEnter={() => setHoveredLineId(l.id)}
                                  onMouseLeave={() => setHoveredLineId(null)}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleLine(l.id)}
                                    className="mt-0.5"
                                  />
                                  <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: g.color }} />
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className="block text-[13.5px] leading-snug truncate text-slate-600 dark:text-slate-300"
                                      title={l.name}
                                    >
                                      {l.name}
                                    </span>
                                    <span className="flex items-center gap-1.5 mt-0.5">
                                      <span
                                        className="text-[11.5px] font-mono rounded px-1 py-px bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                        dir="ltr"
                                      >
                                        {l.line_code}
                                      </span>
                                      <span className="text-[11.5px] text-slate-400 nums-fa">
                                        {l.towerCount > 0 ? `${fa(l.towerCount)} دکل` : "بدون دکل"}
                                      </span>
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* فوتر پنل — وضعیت انتخاب */}
                <div className="shrink-0 px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      <b className="text-slate-800 dark:text-slate-100 nums-fa">{fa(selectedCount)}</b> خط انتخاب
                    </span>
                    <span className="text-slate-400 nums-fa">{fa(drawnTowerCount)} دکل</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* دکمه باز کردن پنل حذف شد — در حالت مینیمال، هدر پنل همچنان قابل مشاهده است و کاربر می‌تواند با کلیک روی هدر یا دکمه chevron پنل را باز کند */}

      {/* ─── نوار وضعیت پایین — v4.2.3: به وسط پایین منتقل شد تا با سایدبار خطوط تداخل نداشته باشد ─── */}
      {!loading && !error && (
        <div className="absolute z-[500] bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none" dir="rtl">
          {selectedCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12px] text-slate-600 dark:text-slate-300 shadow-lg">
                <Layers className="w-3.5 h-3.5 text-violet-500" />
                <b className="nums-fa">{fa(selectedCount)}</b> خط
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12px] text-slate-600 dark:text-slate-300 shadow-lg">
                <b className="nums-fa">{fa(drawnTowerCount)}</b> دکل
              </span>
              {totalKm > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12px] text-slate-600 dark:text-slate-300 shadow-lg">
                  <b className="nums-fa">{fa(Math.round(totalKm))}</b> کیلومتر
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
