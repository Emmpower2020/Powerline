"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { Tower, PaginatedResponse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TowerMap } from "@/components/tower-map";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus, Radio, Loader2, Map as MapIcon, List } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "list" | "map";

export function TowersPage() {
  const [data, setData] = useState<PaginatedResponse<Tower> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("map");
  const [allTowers, setAllTowers] = useState<Tower[]>([]);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);

  // Load all towers for map view
  useEffect(() => {
    const loadAll = async () => {
      try {
        const result = await apiClient.get<PaginatedResponse<Tower>>(API_ENDPOINTS.towers, {
          page: 1,
          page_size: 100,
        });
        setAllTowers(result.data || []);
      } catch (err) {
        console.error("خطا:", err);
      }
    };
    loadAll();
  }, []);

  // Load paginated for list view
  useEffect(() => {
    if (view !== "list") return;

    const load = async () => {
      setLoading(true);
      try {
        const result = await apiClient.get<PaginatedResponse<Tower>>(API_ENDPOINTS.towers, {
          page, page_size: 20, search: search || undefined,
        });
        setData(result);
      } catch (err) {
        console.error("خطا:", err);
      } finally { setLoading(false); }
    };
    const d = setTimeout(load, 300);
    return () => clearTimeout(d);
  }, [page, search, view]);

  const towerTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      lattice_steel: "فلزی مشبک",
      wood: "تیر چوبی",
      concrete: "تیر بتنی",
      concrete_tele: "تلسکوپی بتنی",
      steel_tele: "تلسکوپی فلزی",
      other: "سایر",
    };
    const colors: Record<string, string> = {
      lattice_steel: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
      wood: "bg-purple-100 text-purple-700 hover:bg-purple-100",
      concrete: "bg-slate-100 text-slate-700 hover:bg-slate-100",
      concrete_tele: "bg-amber-100 text-amber-700 hover:bg-amber-100",
      steel_tele: "bg-blue-100 text-blue-700 hover:bg-blue-100",
      other: "bg-slate-100 text-slate-500 hover:bg-slate-100",
    };
    return (
      <Badge className={colors[type] || "bg-slate-100 text-slate-700"} variant="secondary">
        {labels[type] || type}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setView("map")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                view === "map"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-300"
              )}
            >
              <MapIcon className="w-4 h-4" />
              نقشه
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                view === "list"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-300"
              )}
            >
              <List className="w-4 h-4" />
              لیست
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {view === "list" && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="جستجوی دکل..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pr-9"
              />
            </div>
          )}
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 ml-2" />
            افزودن دکل
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">مجموع دکل‌ها</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100 nums-fa">
              {allTowers.length.toLocaleString("fa-IR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">با GPS</p>
            <p className="text-xl font-bold text-green-600 nums-fa">
              {allTowers.filter(t => t.gps_lat !== null).length.toLocaleString("fa-IR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">بدون GPS</p>
            <p className="text-xl font-bold text-amber-600 nums-fa">
              {allTowers.filter(t => t.gps_lat === null).length.toLocaleString("fa-IR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-slate-500">نوع‌های مختلف</p>
            <p className="text-xl font-bold text-indigo-600 nums-fa">
              {new Set(allTowers.map(t => t.tower_type)).size.toLocaleString("fa-IR")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      {view === "map" ? (
        <Card>
          <CardContent className="p-0">
            <TowerMap
              towers={allTowers}
              onTowerClick={(t) => setSelectedTower(t)}
              height="600px"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : data && data.data && data.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <TableHead className="text-right">کد دکل</TableHead>
                    <TableHead className="text-right">شماره</TableHead>
                    <TableHead className="text-right">نوع</TableHead>
                    <TableHead className="text-right">خط</TableHead>
                    <TableHead className="text-right">GPS</TableHead>
                    <TableHead className="text-right">ارتفاع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((tower) => (
                    <TableRow key={tower.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <TableCell className="font-mono text-sm">{tower.tower_code}</TableCell>
                      <TableCell className="nums-fa">{tower.tower_number || "—"}</TableCell>
                      <TableCell>{towerTypeBadge(tower.tower_type)}</TableCell>
                      <TableCell className="text-sm">
                        {tower.line_code || "—"}
                        {tower.line_name && (
                          <div className="text-xs text-slate-400">{tower.line_name}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs nums-fa">
                        {tower.gps_lat !== null ? (
                          <>
                            {tower.gps_lat?.toFixed(5)}<br />
                            {tower.gps_lng?.toFixed(5)}
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="nums-fa">
                        {tower.altitude_m ? `${tower.altitude_m} m` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Radio className="w-12 h-12 mb-3 opacity-50" />
                <p>هیچ دکلی یافت نشد</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination (only in list view) */}
      {view === "list" && data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 nums-fa">
            نمایش {((page - 1) * 20) + 1} تا {Math.min(page * 20, data.pagination.total)} از{" "}
            {data.pagination.total} دکل
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data.pagination.has_prev} onClick={() => setPage(page - 1)}>
              قبلی
            </Button>
            <span className="flex items-center px-3 text-sm nums-fa">
              {page} / {data.pagination.total_pages}
            </span>
            <Button variant="outline" size="sm" disabled={!data.pagination.has_next} onClick={() => setPage(page + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
