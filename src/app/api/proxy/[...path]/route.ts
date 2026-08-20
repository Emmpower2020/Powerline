/**
 * API Proxy Route — تمام درخواست‌های API رو از طریق Next.js به سرور اصلی می‌فرسته
 *
 * این روش مشکل CORS رو حل می‌کنه چون مرورگر فقط با همون دامنه‌ای که اپ روش اجرا میشه
 * صحبت می‌کنه و Next.js به API سرور وصل می‌شه (بدون محدودیت CORS).
 *
 * مسیرها:
 *   /api/proxy/auth/login → POST به https://sabadgame.com/.../auth/login
 *   /api/proxy/lines      → GET  به https://sabadgame.com/.../lines
 *   و...
 */

import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://sabadgame.com/Powerline/api_powerline/api.php";

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function PUT(request: NextRequest) {
  return handleRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "3600",
    },
  });
}

async function handleRequest(request: NextRequest) {
  // استخراج مسیر از URL
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/proxy/, "");

  // بازسازی query string
  const search = url.search;

  // ساخت URL نهایی
  const targetUrl = `${API_BASE_URL}${path}${search}`;

  // استخراج هدرها
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }

  // استخراج body (اگه باشه)
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      // body خالی
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    // دریافت پاسخ
    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "application/json";

    // ساخت پاسخ برای کلاینت
    const nextResponse = new NextResponse(responseText, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    return nextResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 500,
          message: `Proxy error: ${message}`,
        },
      },
      { status: 500 }
    );
  }
}
