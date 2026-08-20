"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { Tower } from "@/lib/types";

// Fix for default markers in Leaflet with bundlers
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom marker icons by tower type
const towerIcons: Record<string, L.DivIcon> = {
  lattice_steel: L.divIcon({
    className: "custom-tower-marker",
    html: `<div style="background: #6366F1; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">⌬</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  }),
  wood: L.divIcon({
    className: "custom-tower-marker",
    html: `<div style="background: #8B5CF6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px;">▼</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  }),
  concrete: L.divIcon({
    className: "custom-tower-marker",
    html: `<div style="background: #64748B; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px;">■</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  }),
  default: L.divIcon({
    className: "custom-tower-marker",
    html: `<div style="background: #EF4444; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">T</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  }),
};

function getTowerIcon(towerType: string): L.DivIcon {
  return towerIcons[towerType] || towerIcons.default;
}

// Component to fit map bounds to markers
function FitBounds({ towers }: { towers: Tower[] }) {
  const map = useMap();

  useEffect(() => {
    if (towers.length === 0) return;

    const validTowers = towers.filter(
      (t) => t.gps_lat !== null && t.gps_lng !== null
    );

    if (validTowers.length === 0) return;

    if (validTowers.length === 1) {
      map.setView(
        [validTowers[0].gps_lat!, validTowers[0].gps_lng!],
        15
      );
    } else {
      const bounds = L.latLngBounds(
        validTowers.map((t) => [t.gps_lat!, t.gps_lng!])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [towers, map]);

  return null;
}

interface TowerMapProps {
  towers: Tower[];
  onTowerClick?: (tower: Tower) => void;
  height?: string;
  center?: [number, number];
  zoom?: number;
}

export function TowerMapInner({
  towers,
  onTowerClick,
  height = "500px",
  center = [35.6892, 51.389],
  zoom = 7,
}: TowerMapProps) {
  const validTowers = towers.filter(
    (t) => t.gps_lat !== null && t.gps_lng !== null
  );

  return (
    <div style={{ height, width: "100%" }} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {validTowers.map((tower) => (
          <Marker
            key={tower.id}
            position={[tower.gps_lat!, tower.gps_lng!]}
            icon={getTowerIcon(tower.tower_type)}
            eventHandlers={{
              click: () => onTowerClick?.(tower),
            }}
          >
            <Popup>
              <div className="text-sm" dir="rtl">
                <div className="font-bold mb-1">{tower.tower_code}</div>
                {tower.line_code && (
                  <div className="text-xs text-slate-600">
                    خط: {tower.line_code}
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-1">
                  نوع: {towerTypeLabel(tower.tower_type)}
                </div>
                {tower.tower_number && (
                  <div className="text-xs text-slate-500">
                    شماره: {tower.tower_number}
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-1">
                  {tower.gps_lat?.toFixed(5)}, {tower.gps_lng?.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <FitBounds towers={validTowers} />
      </MapContainer>
    </div>
  );
}

function towerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    lattice_steel: "فلزی مشبک",
    wood: "تیر چوبی",
    concrete: "تیر بتنی",
    concrete_tele: "تلسکوپی بتنی",
    steel_tele: "تلسکوپی فلزی",
    other: "سایر",
  };
  return labels[type] || type;
}
