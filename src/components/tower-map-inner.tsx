"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap, ScaleControl } from "react-leaflet";
import L from "leaflet";
import {
  basemapById,
  basemapLabelColor,
  basemapTileUrl,
  voltageStyle,
  towerTypeStyle,
  towerTypeLabel,
  type BasemapId,
} from "@/lib/map-config";
import type { BuiltRoutes, RoutePoint } from "@/lib/line-routes";
import type { Line, Tower } from "@/lib/types";

/* ────────────────────────────────────────────────────────────────
 * رندرکننده Canvas سفارشی — رسم شکل‌های متفاوت برای انواع دکل
 * فلزی: مربع | چوبی: مثلث | بتنی: دایره | تلسکوپی: لوزی | سایر: ضربدر
 * (همه با اندازه ثابت پیکسلی + برچسب شماره دکل بدون صفر پیشینی)
 * ──────────────────────────────────────────────────────────────── */

const LABEL_MIN_ZOOM = 14;
/** زیر این زوم، دکل‌ها رسم نمی‌شوند و فقط مسیر خط دیده می‌شود */
const MARKER_MIN_ZOOM = 13;

type CanvasRenderer = L.Canvas & {
  _drawing: boolean;
  _ctx: CanvasRenderingContext2D;
  _updateShape: (layer: unknown, shape: string) => void;
};

const ShapeCanvasRenderer = (L.Canvas as any).extend({
  _updateShape(layer: any, shape: string) {
    const self = this as unknown as CanvasRenderer;
    if (!self._drawing || layer._empty()) return;
    const zoom = (self as any)._map ? (self as any)._map.getZoom() : 0;

    // در زوم‌های پایین فقط مسیر خط دیده می‌شود
    if (zoom < MARKER_MIN_ZOOM && layer.options.isTower) return;

    const r = Math.max(
      Math.round(
        zoom >= 16 ? (layer._radius || 5) + 1 : zoom >= 14 ? layer._radius || 5 : Math.max((layer._radius || 5) - 1, 3)
      ),
      1
    );
    const p = layer._point;
    const ctx = self._ctx;
    ctx.beginPath();
    switch (shape) {
      case "square":
        ctx.rect(p.x - r * 0.95, p.y - r * 0.95, r * 1.9, r * 1.9);
        break;
      case "triangle":
        ctx.moveTo(p.x, p.y - r * 1.35);
        ctx.lineTo(p.x + r * 1.2, p.y + r * 0.95);
        ctx.lineTo(p.x - r * 1.2, p.y + r * 0.95);
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(p.x, p.y - r * 1.45);
        ctx.lineTo(p.x + r * 1.45, p.y);
        ctx.lineTo(p.x, p.y + r * 1.45);
        ctx.lineTo(p.x - r * 1.45, p.y);
        ctx.closePath();
        break;
      case "cross": {
        const s = r * 1.15;
        ctx.moveTo(p.x - s, p.y - s);
        ctx.lineTo(p.x + s, p.y + s);
        ctx.moveTo(p.x + s, p.y - s);
        ctx.lineTo(p.x - s, p.y + s);
        break;
      }
      default:
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    (self as any)._fillStroke(ctx, layer);

    // برچسب شماره دکل (بدون کد دکل و بدون صفر پیشینی) — فقط در زوم بالا
    const label: string | undefined = layer.options.towerLabel;
    if (label && zoom >= (layer.options.labelMinZoom ?? LABEL_MIN_ZOOM)) {
      ctx.save();
      ctx.font = `600 11.5px Vazirmatn, Tahoma, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      ctx.textAlign = "left";
      const tx = p.x + r + 4;
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.strokeText(label, tx, p.y);
      ctx.fillStyle = "#334155";
      ctx.fillText(label, tx, p.y);
      ctx.restore();
    }
  },
});

const ShapeMarker = (L.CircleMarker as any).extend({
  _updatePath() {
    (this._renderer as any)._updateShape(this, this.options.shape || "circle");
  },
  _project() {
    (L.CircleMarker.prototype as any)._project.call(this);
    if (this._pxBounds && this.options.towerLabel) {
      this._pxBounds.max.x += 48; // فضای برچسب شماره دکل
      this._pxBounds.max.y += 6;
      this._pxBounds.min.y -= 6;
    }
  },
});

/** تبدیل شماره دکل به برچسب — بدون صفر پیشینی (مثلاً 007 → 7) */
function formatTowerLabel(t: Tower): string | undefined {
  if (t.tower_number == null) return undefined;
  const n = Number(t.tower_number);
  if (!isFinite(n) || n <= 0) return undefined;
  return String(n);
}

function makeShapeMarker(
  latlng: L.LatLngExpression,
  opts: {
    shape: string;
    color: string;
    radius?: number;
    renderer: unknown;
    towerLabel?: string;
    popupHtml?: string;
    onTowerClick?: (towerId: number) => void;
    towerId?: number;
  }
) {
  const marker = new (ShapeMarker as any)(latlng, {
    renderer: opts.renderer,
    shape: opts.shape,
    radius: opts.radius ?? 5,
    color: "#ffffff",
    weight: 1.6,
    fillColor: opts.color,
    fillOpacity: 1,
    opacity: 1,
    towerLabel: opts.towerLabel,
    labelMinZoom: LABEL_MIN_ZOOM,
    isTower: true,
    interactive: true,
    bubblingMouseEvents: false,
  }) as L.CircleMarker;
  if (opts.popupHtml) marker.bindPopup(opts.popupHtml, { maxWidth: 300, className: "tower-popup" });
  if (opts.towerId != null && opts.onTowerClick) {
    marker.on("click", () => opts.onTowerClick?.(opts.towerId!));
  }
  return marker;
}

/* ────────────────────────────────────────────────────────────────
 * محتوای پاپ‌آپ دکل
 * ──────────────────────────────────────────────────────────────── */

function towerPopupHtml(tower: Tower, line?: Line): string {
  const vs = voltageStyle(line?.voltage_kv);
  const ts = towerTypeStyle(tower.tower_type);
  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const row = (k: string, v: string) =>
    `<tr><td style="padding:2px 8px 2px 0;color:#64748b;font-size:11px;white-space:nowrap">${k}</td><td style="padding:2px 0;font-size:12px;font-weight:600;color:#0f172a">${v}</td></tr>`;
  return `
  <div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;min-width:220px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="width:12px;height:12px;border-radius:3px;background:${vs.color};display:inline-block"></span>
      <b style="font-size:14px;color:#0f172a">دکل ${esc(formatTowerLabel(tower) ?? "—")}</b>
      ${tower.tower_code ? `<span style="background:#f1f5f9;border-radius:99px;padding:1px 8px;font-size:11px;color:#475569">کد ${esc(tower.tower_code)}</span>` : ""}
    </div>
    <table style="border-collapse:collapse">
      ${row("خط", esc(line ? `${line.name}` : tower.line_name || "—"))}
      ${row("کد خط", esc(line?.line_code ?? tower.line_code ?? "—"))}
      ${row("ولتاژ", `<span style="color:${vs.color}">${vs.label}</span>`)}
      ${row("نوع سازه", `<svg width="14" height="14" style="vertical-align:-2px" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" rx="2" fill="${vs.color}"/></svg> ${ts.label}`)}
      ${tower.foundation_type ? row("ساختار", esc(tower.foundation_type)) : ""}
      ${tower.tower_structure ? row("نوع دکل", esc(tower.tower_structure)) : ""}
      ${row("مختصات", `<span dir="ltr" style="font-size:11px">${tower.gps_lat?.toFixed(5) ?? "—"}, ${tower.gps_lng?.toFixed(5) ?? "—"}</span>`)}
    </table>
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
 * لایه‌های مسیر و دکل‌ها — مدیریت امری (imperative) برای کارایی
 * ──────────────────────────────────────────────────────────────── */

function RoutesOverlay({
  routes,
  towersById,
  linesById,
  hoveredLineId,
  onTowerClick,
  fitTrigger,
  labelColor,
  bmIsDark,
  showLineLabels,
  labelSafeLeft,
}: {
  routes: BuiltRoutes;
  towersById: Map<number, Tower>;
  linesById: Map<number, Line>;
  hoveredLineId: number | null;
  onTowerClick?: (tower: Tower) => void;
  fitTrigger: number;
  labelColor: string;
  bmIsDark: boolean;
  showLineLabels: boolean;
  labelSafeLeft: number;
}) {
  const map = useMap();
  // رندرکننده SVG جداگانه برای مسیرها
  const svgRendererRef = useRef<L.SVG | null>(null);
  // رندرکننده Canvas برای دکل‌ها (سفارشی با اشکال)
  const canvasRendererRef = useRef<any>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const polylineIndexRef = useRef<Map<number, L.Polyline[]>>(new Map());
  const towerClickRef = useRef(onTowerClick);
  useEffect(() => {
    towerClickRef.current = onTowerClick;
  }, [onTowerClick]);

  // نمونه نقشه برای اشکال‌زدایی — window.__powerlineMap
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__powerlineMap = map;
    return () => {
      if ((window as unknown as Record<string, unknown>).__powerlineMap === map) {
        delete (window as unknown as Record<string, unknown>).__powerlineMap;
      }
    };
  }, [map]);

  useEffect(() => {
    // لایه‌های مجزا برای تضمین ترتیب نمایش: خطوط پایین‌تر، دکل‌ها بالاتر
    // تا نماد دکل‌ها هیچ‌وقت زیر مسیر خط قرار نگیرد.
    const linePane = map.getPane("powerline-line-pane") ?? map.createPane("powerline-line-pane");
    linePane.style.zIndex = "400";
    const towerPane = map.getPane("powerline-tower-pane") ?? map.createPane("powerline-tower-pane");
    towerPane.style.zIndex = "450";

    // رندرکننده SVG برای مسیرها
    const svgRenderer = L.svg({ padding: 0.3, pane: "powerline-line-pane" });
    svgRenderer.addTo(map);
    // رندرکننده Canvas سفارشی برای دکل‌ها — همیشه روی مسیرها
    const canvasRenderer = new (ShapeCanvasRenderer as any)({ padding: 0.3, pane: "powerline-tower-pane" });
    canvasRenderer.addTo(map);
    const group = L.layerGroup().addTo(map);
    svgRendererRef.current = svgRenderer as unknown as L.SVG;
    canvasRendererRef.current = canvasRenderer;
    groupRef.current = group;
    return () => {
      group.remove();
      (svgRenderer as L.Layer).remove();
      (canvasRenderer as L.Layer).remove();
      svgRendererRef.current = null;
      canvasRendererRef.current = null;
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    const svgRenderer = svgRendererRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!group || !svgRenderer || !canvasRenderer) return;
    group.clearLayers();
    polylineIndexRef.current = new Map();

    const casings: L.Polyline[] = [];
    const mains: L.Polyline[] = [];
    const connectors: L.Polyline[] = [];
    const markers: L.CircleMarker[] = [];
    const routeLabels: Array<{ marker: L.Marker; latlngs: [number, number][] }> = [];

    for (const g of routes.groups) {
      for (const part of g.parts) {
        const line = linesById.get(part.lineId);
        const vs = voltageStyle(line?.voltage_kv);
        let latlngs = part.points.map((p) => [p.lat, p.lng] as [number, number]);
        if (latlngs.length === 0) continue;

        // v4.2.1: معکوس‌سازی جهت مسیر برای خوانایی متن نام خط
        // leaflet-textpath متن را در جهت مسیر می‌چیند. اگر مسیر راست‌به‌چپ باشد،
        // متن ۱۸۰° چرخیده (سر و ته) نمایش داده می‌شود. با معکوس کردن نقاط،
        // جهت کلی مسیر چپ‌به‌راست می‌شود و متن همیشه بالای خط و قابل خواندن است.
        if (latlngs.length >= 2 && latlngs[latlngs.length - 1][1] < latlngs[0][1]) {
          latlngs = [...latlngs].reverse();
        }

        // مسیر با دورخط سفید برای خوانایی روی هر نقشه
        casings.push(
          L.polyline(latlngs, {
            renderer: svgRenderer,
            color: "#ffffff",
            weight: 6,
            opacity: 0.7,
            interactive: false,
          })
        );
        const main = L.polyline(latlngs, {
          renderer: svgRenderer,
          color: vs.color,
          weight: 3,
          opacity: 0.95,
          interactive: true,
        });
        const lineName = line ? `${line.name}` : `خط ${part.lineId}`;
        const lineCode = line?.line_code || "";

        // v4.2.6: برچسب HTML به‌جای SVG textPath.
        // این کار شکل‌دهی صحیح حروف فارسی/عربی را به موتور متن مرورگر می‌سپارد
        // و مشکل «شکسته شدن» یا جدا افتادن حروف روی مسیر را از بین می‌برد.
        const routeLabel = createRouteLabel(routeMidpoint(latlngs), lineName, labelColor, bmIsDark);
        routeLabels.push({ marker: routeLabel, latlngs });

        // تولتیپ تعاملی هنگام hover — با جزئیات بیشتر
        main.bindTooltip(
          `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif"><b>${lineName}</b>${lineCode ? ` <span style="color:#64748b;font-size:11px">(${lineCode})</span>` : ""}<div style="color:${vs.color};font-size:11px">${vs.label} — ${part.points.length.toLocaleString("fa-IR")} دکل</div></div>`,
          { sticky: true, className: "route-tooltip", direction: "top" }
        );
        mains.push(main);
        const idx = polylineIndexRef.current.get(part.lineId) || [];
        idx.push(main);
        polylineIndexRef.current.set(part.lineId, idx);

        // دکل‌ها — شکل بر اساس نوع سازه، رنگ بر اساس ولتاژ
        // برچسب = شماره دکل (بدون صفر پیشینی)
        for (const p of part.points) {
          const tower = towersById.get(p.towerId);
          if (!tower) continue;
          const ts = towerTypeStyle(tower.tower_type);
          markers.push(
            makeShapeMarker([p.lat, p.lng], {
              shape: ts.shape,
              color: vs.color,
              radius: 5,
              renderer: canvasRenderer,
              towerLabel: formatTowerLabel(tower),
              popupHtml: towerPopupHtml(tower, line),
              towerId: tower.id,
              onTowerClick: (id) => {
                const t = towersById.get(id);
                if (t) towerClickRef.current?.(t);
              },
            })
          );
        }
      }

      // اتصال‌های بین قطعه‌های یک مجموعه
      for (const c of g.connectors) {
        const line = linesById.get(c.toLineId);
        const vs = voltageStyle(line?.voltage_kv);
        connectors.push(
          L.polyline(
            [
              [c.from.lat, c.from.lng],
              [c.to.lat, c.to.lng],
            ],
            { renderer: svgRenderer, color: vs.color, weight: 2.5, opacity: 0.85, dashArray: "6 8", interactive: false }
          )
        );
      }
    }

    for (const c of casings) c.addTo(group);
    for (const m of mains) m.addTo(group);
    for (const cn of connectors) cn.addTo(group);
    for (const mk of markers) mk.addTo(group);
    for (const entry of routeLabels) entry.marker.addTo(group);

    // نام خط همیشه در مرکزِ بخش قابل‌مشاهده همان خط قرار می‌گیرد.
    // این محاسبه با هر pan/zoom تکرار می‌شود تا برچسب در ناحیه‌ای که واقعاً
    // روی صفحه دیده می‌شود باقی بماند؛ نه در مرکز کل مسیر که ممکن است خارج از viewport باشد.
    const updateVisibleRouteLabels = () => {
      const size = map.getSize();
      const left = Math.max(0, Math.min(labelSafeLeft, size.x - 20));
      const right = Math.max(left + 20, size.x - 10);
      const top = 8;
      const bottom = Math.max(top + 20, size.y - 8);

      for (const entry of routeLabels) {
        if (!showLineLabels) {
          entry.marker.setOpacity(0);
          continue;
        }
        const pos = visiblePolylineMidpoint(map, entry.latlngs, { left, top, right, bottom });
        if (!pos) {
          entry.marker.setOpacity(0);
        } else {
          entry.marker.setLatLng(pos);
          entry.marker.setOpacity(1);
        }
      }
    };

    updateVisibleRouteLabels();
    map.on("move zoom resize", updateVisibleRouteLabels);

    return () => {
      map.off("move zoom resize", updateVisibleRouteLabels);
    };
  }, [routes, towersById, linesById, labelColor, bmIsDark, showLineLabels, labelSafeLeft]);

  // هایلایت خطِ hover شده از فهرست کناری
  useEffect(() => {
    const idx = polylineIndexRef.current;
    for (const [lineId, polys] of idx) {
      const isHover = lineId === hoveredLineId;
      for (const pl of polys) {
        pl.setStyle({ weight: isHover ? 6 : 3, opacity: isHover ? 1 : 0.95 });
      }
    }
  }, [hoveredLineId, routes]);

  // تنظیم نقشه روی محدوده انتخاب فعلی
  useEffect(() => {
    if (fitTrigger <= 0) return;
    const allPoints: [number, number][] = [];
    for (const g of routes.groups) {
      for (const part of g.parts) {
        for (const p of part.points) allPoints.push([p.lat, p.lng]);
      }
    }
    if (allPoints.length === 0) return;
    if (allPoints.length === 1) {
      map.setView(allPoints[0], 15);
    } else {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 17 });
    }
  }, [fitTrigger]);

  return null;
}

/* ────────────────────────────────────────────────────────────────
 * نوار ابزار نقشه: اندازه‌گیری طول/مساحت، موقعیت، زوم به ناحیه،
 * زوم این/اوت، و بازگشت به خانه (نمایش همه خطوط)
 * ──────────────────────────────────────────────────────────────── */

export type MapTool = "measure-distance" | "measure-area" | "coordinates" | "zoom-area" | null;

/** محاسبه‌ی مساحت چندضلعی کروی (متر مربع) */
function polygonArea(latlngs: L.LatLng[]): number {
  if (latlngs.length < 3) return 0;
  const R = 6371000; // شعاع زمین (متر)
  let total = 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  for (let i = 0; i < latlngs.length; i++) {
    const p1 = latlngs[i];
    const p2 = latlngs[(i + 1) % latlngs.length];
    total +=
      toRad(p2.lng - p1.lng) *
      (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs((total * R * R) / 2);
}

function MapTools({
  activeTool,
  zoomInTrigger,
  zoomOutTrigger,
  homeTrigger,
  routes,
  onToolDone,
}: {
  activeTool: MapTool;
  zoomInTrigger: number;
  zoomOutTrigger: number;
  homeTrigger: number;
  routes: BuiltRoutes;
  onToolDone?: () => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<L.LatLng[]>([]);
  const boxRef = useRef<L.Rectangle | null>(null);
  const startRef = useRef<L.LatLng | null>(null);
  const coordDivRef = useRef<HTMLDivElement | null>(null);
  const activeToolRef = useRef<MapTool>(activeTool);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    const g = L.layerGroup().addTo(map);
    layerRef.current = g;
    return () => {
      g.remove();
      layerRef.current = null;
    };
  }, [map]);

  // ریست با تغییر ابزار
  useEffect(() => {
    pointsRef.current = [];
    layerRef.current?.clearLayers();
    if (boxRef.current) {
      boxRef.current.remove();
      boxRef.current = null;
    }
    startRef.current = null;

    // حالت‌های تعاملی نقشه
    if (activeTool === "zoom-area") {
      map.dragging.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.boxZoom.enable();
      map.getContainer().style.cursor = "";
    }
    if (activeTool === "measure-distance" || activeTool === "measure-area") {
      map.doubleClickZoom.disable();
      map.getContainer().style.cursor = "crosshair";
    } else if (activeTool !== "zoom-area") {
      map.doubleClickZoom.enable();
    }
  }, [activeTool, map]);

  // تابع رسم اندازه‌گیری — wrapper روی تابع خارجی برای دسترسی به ref ها
  const drawMeasure = useCallback((pts: L.LatLng[]) => {
    drawMeasureImpl(pts, layerRef.current, activeToolRef.current);
  }, []);

  // ابزار اندازه‌گیری طول و مساحت
  useEffect(() => {
    if (activeTool !== "measure-distance" && activeTool !== "measure-area") return;

    const onClick = (e: L.LeafletMouseEvent) => {
      pointsRef.current.push(e.latlng);
      drawMeasure(pointsRef.current);
    };
    const onDblClick = () => {
      // پایان — ابزار غیرفعال می‌شود
      const wasTool = activeToolRef.current;
      setTimeout(() => {
        // 5 ثانیه بعد نتیجه پاک شود
        layerRef.current?.clearLayers();
        pointsRef.current = [];
      }, 5000);
      onToolDone?.();
      void wasTool;
    };
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (pointsRef.current.length === 0) return;
      const preview = [...pointsRef.current, e.latlng];
      drawMeasure(preview);
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.on("mousemove", onMouseMove);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.off("mousemove", onMouseMove);
    };
  }, [activeTool, map, drawMeasure]);

  // ابزار موقعیت جغرافیایی
  useEffect(() => {
    if (activeTool !== "coordinates") {
      if (coordDivRef.current) {
        coordDivRef.current.remove();
        coordDivRef.current = null;
      }
      return;
    }
    const div = L.DomUtil.create("div", "map-coord-display");
    div.style.cssText = `
      position: absolute; bottom: 12px; right: 12px; z-index: 1000;
      background: rgba(255,255,255,0.96); border: 1px solid #cbd5e1;
      border-radius: 10px; padding: 6px 10px; font-size: 11px;
      color: #1e293b; pointer-events: none;
      box-shadow: 0 4px 14px rgba(0,0,0,0.15); font-weight: 600;
      min-width: 130px; text-align: center;
    `;
    div.innerHTML = "مختصات: —";
    map.getContainer().appendChild(div);
    coordDivRef.current = div;

    const onMove = (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat.toFixed(5);
      const lng = e.latlng.lng.toFixed(5);
      div.innerHTML = `<span dir="ltr">${lat}°, ${lng}°</span>`;
    };
    const onMoveOut = () => {
      div.innerHTML = "مختصات: —";
    };
    map.on("mousemove", onMove);
    map.on("mouseout", onMoveOut);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onMoveOut);
      div.remove();
      coordDivRef.current = null;
    };
  }, [activeTool, map]);

  // ابزار زوم به ناحیه (کشیدن مستطیل)
  useEffect(() => {
    if (activeTool !== "zoom-area") return;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      // با e.originalEvent بررسی می‌کنیم دکمه اصلی است
      startRef.current = e.latlng;
      if (boxRef.current) boxRef.current.remove();
      boxRef.current = L.rectangle(L.latLngBounds(e.latlng, e.latlng), {
        color: "#6366f1",
        weight: 2,
        fillColor: "#6366f1",
        fillOpacity: 0.15,
        interactive: false,
      });
      boxRef.current.addTo(layerRef.current!);
    };
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!startRef.current || !boxRef.current) return;
      boxRef.current.setBounds(L.latLngBounds(startRef.current, e.latlng));
    };
    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!startRef.current) return;
      const bounds = L.latLngBounds(startRef.current, e.latlng);
      if (boxRef.current) {
        boxRef.current.remove();
        boxRef.current = null;
      }
      startRef.current = null;
      if (bounds.isValid() && (bounds.getNorth() !== bounds.getSouth() || bounds.getEast() !== bounds.getWest())) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
      onToolDone?.();
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
    };
  }, [activeTool, map, onToolDone]);

  // ترایگرهای زوم این / اوت
  useEffect(() => {
    if (zoomInTrigger > 0) map.zoomIn();
  }, [zoomInTrigger]);
  useEffect(() => {
    if (zoomOutTrigger > 0) map.zoomOut();
  }, [zoomOutTrigger]);

  // ترایگر خانه — تنظیم روی محدوده همه خطوط (یا محدوده انتخاب فعلی)
  useEffect(() => {
    if (homeTrigger <= 0) return;
    const allPoints: [number, number][] = [];
    for (const g of routes.groups) {
      for (const part of g.parts) {
        for (const p of part.points) allPoints.push([p.lat, p.lng]);
      }
      for (const c of g.connectors) {
        allPoints.push([c.from.lat, c.from.lng]);
        allPoints.push([c.to.lat, c.to.lng]);
      }
    }
    if (allPoints.length === 0) {
      // اگر هیچ خطی انتخاب نشده، روی مرکز پیش‌فرض بمان
      return;
    }
    if (allPoints.length === 1) {
      map.setView(allPoints[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 15 });
    }
  }, [homeTrigger, map, routes]);

  return null;
}

// تابع خارجی رسم اندازه‌گیری — بدون دسترسی به state برای جلوگیری از lint
function drawMeasureImpl(
  pts: L.LatLng[],
  layer: L.LayerGroup | null,
  tool: MapTool
) {
  if (!layer) return;
  layer.clearLayers();
  if (pts.length === 0) return;

  if (tool === "measure-distance") {
    if (pts.length >= 2) {
      L.polyline(pts, { color: "#6366f1", weight: 3, fillColor: "#6366f1" }).addTo(layer);
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
      const midIdx = Math.max(1, Math.floor(pts.length / 2));
      const mid = L.latLng(
        (pts[midIdx - 1].lat + pts[midIdx].lat) / 2,
        (pts[midIdx - 1].lng + pts[midIdx].lng) / 2
      );
      const distText = total >= 1000
        ? `${(total / 1000).toFixed(2)} کیلومتر`
        : `${Math.round(total)} متر`;
      L.marker(mid, {
        icon: L.divIcon({
          className: "measure-label",
          html: `<div>${distText}</div>`,
          iconSize: [120, 24],
          iconAnchor: [60, 12],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    }
    pts.forEach((p) => {
      L.circleMarker(p, {
        radius: 4,
        color: "#6366f1",
        fillColor: "#fff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(layer);
    });
  } else if (tool === "measure-area") {
    if (pts.length >= 3) {
      L.polygon(pts, {
        color: "#6366f1",
        weight: 2,
        fillColor: "#6366f1",
        fillOpacity: 0.2,
      }).addTo(layer);
      const area = polygonArea(pts);
      const sumLat = pts.reduce((s, p) => s + p.lat, 0);
      const sumLng = pts.reduce((s, p) => s + p.lng, 0);
      const centroid = L.latLng(sumLat / pts.length, sumLng / pts.length);
      const areaText = area >= 10000
        ? `${(area / 10000).toFixed(2)} هکتار`
        : `${Math.round(area)} متر مربع`;
      L.marker(centroid, {
        icon: L.divIcon({
          className: "measure-label",
          html: `<div>${areaText}</div>`,
          iconSize: [120, 24],
          iconAnchor: [60, 12],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    }
    pts.forEach((p) => {
      L.circleMarker(p, {
        radius: 4,
        color: "#6366f1",
        fillColor: "#fff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(layer);
    });
  }
}

/* ────────────────────────────────────────────────────────────────
 * همگام‌سازی اندازه نقشه با تغییر ابعاد ظرف
 * ──────────────────────────────────────────────────────────────── */

function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const onChange = () => map.invalidateSize({ animate: false });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(onChange);
      ro.observe(container);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }, [map]);
  return null;
}

/**
 * نقطه‌ی میانی واقعی مسیر برای قرار دادن برچسب HTML.
 * از متن SVG/textPath استفاده نمی‌کنیم چون شکل‌دهی حروف فارسی/عربی
 * در textPath مرورگرها می‌تواند شکسته و ناخوانا شود.
 */
function routeMidpoint(latlngs: [number, number][]): [number, number] {
  if (latlngs.length === 1) return latlngs[0];
  const points = latlngs.map(([lat, lng]) => L.latLng(lat, lng));
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  if (!total) return latlngs[Math.floor(latlngs.length / 2)];

  const target = total / 2;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = points[i - 1].distanceTo(points[i]);
    if (walked + seg >= target) {
      const t = (target - walked) / seg;
      return [
        points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
      ];
    }
    walked += seg;
  }
  return latlngs[latlngs.length - 1];
}

function visiblePolylineMidpoint(
  map: L.Map,
  latlngs: [number, number][],
  viewport: { left: number; top: number; right: number; bottom: number }
): [number, number] | null {
  if (latlngs.length === 0) return null;
  if (latlngs.length === 1) {
    const p = map.latLngToContainerPoint(latlngs[0]);
    return p.x >= viewport.left && p.x <= viewport.right && p.y >= viewport.top && p.y <= viewport.bottom
      ? latlngs[0]
      : null;
  }

  type Pt = { x: number; y: number };
  const clipSegment = (a: Pt, b: Pt): [Pt, Pt] | null => {
    // Liang-Barsky clipping against the visible map rectangle.
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const checks: Array<[number, number]> = [
      [-dx, a.x - viewport.left],
      [dx, viewport.right - a.x],
      [-dy, a.y - viewport.top],
      [dy, viewport.bottom - a.y],
    ];
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) return null;
        continue;
      }
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
    return [
      { x: a.x + t0 * dx, y: a.y + t0 * dy },
      { x: a.x + t1 * dx, y: a.y + t1 * dy },
    ];
  };

  const visibleSegments: Array<{ a: Pt; b: Pt; length: number }> = [];
  let total = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const a = map.latLngToContainerPoint(latlngs[i - 1]);
    const b = map.latLngToContainerPoint(latlngs[i]);
    const clipped = clipSegment(a, b);
    if (!clipped) continue;
    const dx = clipped[1].x - clipped[0].x;
    const dy = clipped[1].y - clipped[0].y;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      visibleSegments.push({ a: clipped[0], b: clipped[1], length });
      total += length;
    }
  }

  // اگر بخش قابل مشاهده خیلی کوتاه است، برچسب را مخفی می‌کنیم تا روی نقشه مزاحم نشود.
  if (total < 45) return null;

  let target = total / 2;
  for (const seg of visibleSegments) {
    if (target <= seg.length) {
      const t = target / seg.length;
      const point = {
        x: seg.a.x + (seg.b.x - seg.a.x) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t,
      };
      const ll = map.containerPointToLatLng(point);
      return [ll.lat, ll.lng];
    }
    target -= seg.length;
  }
  return null;
}

function createRouteLabel(
  position: [number, number],
  text: string,
  color: string,
  dark: boolean
): L.Marker {
  const safeText = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const icon = L.divIcon({
    className: "powerline-route-label-icon",
    html: `<div class="powerline-route-label-box ${dark ? "is-dark" : "is-light"}" style="--route-color:${color}"><span dir="rtl" lang="fa">${safeText}</span></div>`,
    iconSize: undefined,
    iconAnchor: [0, 0],
  });

  return L.marker(position, {
    icon,
    interactive: false,
    keyboard: false,
    zIndexOffset: 500,
  });
}

/* ────────────────────────────────────────────────────────────────
 * کامپوننت اصلی نقشه
 * ──────────────────────────────────────────────────────────────── */

export interface TowerMapInnerProps {
  basemapId: BasemapId;
  routes: BuiltRoutes;
  towersById: Map<number, Tower>;
  linesById: Map<number, Line>;
  hoveredLineId?: number | null;
  onTowerClick?: (tower: Tower) => void;
  /** با افزایش این عدد، نقشه روی محدوده انتخاب فعلی تنظیم می‌شود */
  fitTrigger?: number;
  /** ابزار فعال نوار ابزار */
  activeTool?: MapTool;
  /** با افزایش، یک گام زوم این */
  zoomInTrigger?: number;
  /** با افزایش، یک گام زوم اوت */
  zoomOutTrigger?: number;
  /** با افزایش، نقشه روی محدوده همه خطوط (خانه) تنظیم می‌شود */
  homeTrigger?: number;
  /** نمایش/عدم نمایش نام خطوط روی نقشه */
  showLineLabels?: boolean;
  /** فاصله امن سمت چپ برای جلوگیری از قرار گرفتن برچسب زیر پنل انتخاب خطوط */
  labelSafeLeft?: number;
  /** هنگام اتمام یک ابزار (مثلاً بعد از زوم به ناحیه یا اندازه‌گیری) صدا زده می‌شود */
  onToolDone?: () => void;
}

export function TowerMapInner({
  basemapId,
  routes,
  towersById,
  linesById,
  hoveredLineId = null,
  onTowerClick,
  fitTrigger = 0,
  activeTool = null,
  zoomInTrigger = 0,
  zoomOutTrigger = 0,
  homeTrigger = 0,
  showLineLabels = true,
  labelSafeLeft = 12,
  onToolDone,
}: TowerMapInnerProps) {
  const bm = basemapById(basemapId);
  const isBlank = bm.id === "blank";
  // v4.2.0: رنگ متن نام خطوط — وارونه نسبت به پس‌زمینه نقشه (مشکی روی روشن، سفید روی تیره/ماهواره)
  const labelColor = useMemo(() => basemapLabelColor(bm), [bm]);

  // مرکز پیش‌فرض: منطقه کرمانشاه (محل خطوط واقعی داده)
  const center = useMemo<[number, number]>(() => [34.3, 47.0], []);

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${bm.dark ? "dark-basemap" : "light-basemap"}`}
      style={{ background: isBlank ? "#ffffff" : bm.dark ? "#0f172a" : "#e8eaed" }}
    >
      <MapContainer
        center={center}
        zoom={10}
        minZoom={5}
        maxZoom={bm.maxZoom ?? 19}
        style={{ height: "100%", width: "100%", background: isBlank ? "#ffffff" : "transparent" }}
        zoomControl={false}
        scrollWheelZoom
        preferCanvas
        attributionControl={!isBlank}
        doubleClickZoom={false}
      >
        {!isBlank && <ScaleControl position="bottomright" metric imperial={false} />}
        {!isBlank && (
          <TileLayer
            key={bm.id}
            url={basemapTileUrl(bm) ?? bm.url ?? ""}
            attribution={bm.attribution}
            maxZoom={bm.maxZoom ?? 19}
            {...(bm.subdomains ? { subdomains: bm.subdomains } : {})}
          />
        )}
        <AutoResize />
        <RoutesOverlay
          routes={routes}
          towersById={towersById}
          linesById={linesById}
          hoveredLineId={hoveredLineId}
          onTowerClick={onTowerClick}
          fitTrigger={fitTrigger}
          labelColor={labelColor}
          bmIsDark={!!bm.dark}
          showLineLabels={showLineLabels}
          labelSafeLeft={labelSafeLeft}
        />
        <MapTools
          activeTool={activeTool}
          zoomInTrigger={zoomInTrigger}
          zoomOutTrigger={zoomOutTrigger}
          homeTrigger={homeTrigger}
          routes={routes}
          onToolDone={onToolDone}
        />
      </MapContainer>
    </div>
  );
}
