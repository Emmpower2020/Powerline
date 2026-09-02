import { NextRequest, NextResponse } from "next/server";

/**
 * مسیر پروکسی کاشی نقشه — v4.2.2
 *
 * این مسیر برای دور زدن محدودیت CORS یا مسدودسازی برخی سرورهای کاشی (مثل Esri)
 * روی مرورگر کاربر استفاده می‌شود. کاشی از سرور اصلی گرفته و به کاربر پاس داده می‌شود.
 *
 * فرمت URL: /api/tile/<provider>/<z>/<x>/<y>
 * - provider: osm | osm-hot | carto-light | carto-dark | esri-satellite | esri-street | esri-topo | opentopo
 * - z, x, y: مختصات کاشی
 *
 * مثال: /api/tile/esri-satellite/12/2582/1632
 */

const TILE_PROVIDERS: Record<string, (z: string, x: string, y: string) => string> = {
  // OSM — z/x/y
  "osm": (z, x, y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
  "osm-hot": (z, x, y) => `https://a.tile.openstreetmap.fr/hot/${z}/${x}/${y}.png`,
  // Carto — z/x/y (بدون {r} — نسخه ساده)
  "carto-light": (z, x, y) => `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
  "carto-dark": (z, x, y) => `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
  // Esri — z/y/x (ترتیب متفاوت!)
  "esri-satellite": (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  "esri-street": (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
  "esri-topo": (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`,
  // OpenTopoMap — z/x/y
  "opentopo": (z, x, y) => `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`,
};

const CACHE_MAX_AGE = 7 * 24 * 60 * 60; // ۷ روز

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length < 4) {
    return NextResponse.json(
      { error: "Invalid tile path. Expected /api/tile/<provider>/<z>/<x>/<y>" },
      { status: 400 }
    );
  }

  const [provider, z, x, yWithExt] = path;
  const fn = TILE_PROVIDERS[provider];
  if (!fn) {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 }
    );
  }

  // حذف پسوند فایل از y (مثلاً 1632.png → 1632)
  const y = yWithExt.replace(/\.\w+$/, "");
  if (!z || !x || !y) {
    return NextResponse.json(
      { error: "Missing z, x, or y parameters" },
      { status: 400 }
    );
  }

  // اعتبارسنجی اعداد
  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return NextResponse.json(
      { error: "z, x, y must be non-negative integers" },
      { status: 400 }
    );
  }

  const tileUrl = fn(z, x, y);

  try {
    const upstream = await fetch(tileUrl, {
      headers: {
        // اضافه کردن User-Agent برای سرورهایی که نیاز دارند (OSM)
        "User-Agent": "Powerline-Map/4.2 (https://jibimarket.com)",
        "Accept": "image/*,*/*;q=0.8",
      },
      // زمان‌برندگی منطقی برای کاشی
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream tile server returned ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, immutable`,
        // CORS باز برای همه
        "Access-Control-Allow-Origin": "*",
        // غیرقابل ذخیره در محلی کاربر برای جلوگیری از کش ناقص
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error(`Tile proxy error for ${tileUrl}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch tile from upstream" },
      { status: 502 }
    );
  }
}
