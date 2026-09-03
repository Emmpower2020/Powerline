<?php
/**
 * api.php — نقطه ورود اصلی API پلتفرم مدیریت خطوط انتقال برق
 *
 * محل قرارگیری: در فولدر Powerline روی سرور
 * مثال: https://jibimarket.com/Powerline/api.php
 *
 * مسیریابی:
 *   https://jibimarket.com/Powerline/api.php/auth/login
 *   https://jibimarket.com/Powerline/api.php/lines
 *   https://jibimarket.com/Powerline/api.php/towers/5
 *   و...
 *
 * روش استفاده از Apache:
 *   اگه می‌خوای مسیر تمیزتر داشته باشی (مثلاً /Powerline/api/lines به‌جای api.php/lines)
 *   این کد رو در فایل .htaccess در فولدر Powerline قرار بده:
 *
 *   RewriteEngine On
 *   RewriteCond %{REQUEST_FILENAME} !-f
 *   RewriteCond %{REQUEST_FILENAME} !-d
 *   RewriteRule ^api/(.*)$ api.php/$1 [QSA,L]
 */

// ============================================================================
//  بارگذاری تنظیمات و کلاس‌ها
// ============================================================================

require_once __DIR__ . '/config.php';

// کلاس‌های پایه
require_once __DIR__ . '/lib/Logger.php';
require_once __DIR__ . '/lib/Response.php';
require_once __DIR__ . '/lib/Database.php';
require_once __DIR__ . '/lib/Auth.php';
require_once __DIR__ . '/lib/Helpers.php';
require_once __DIR__ . '/lib/Router.php';

// endpoint ها
require_once __DIR__ . '/endpoints/auth.php';
require_once __DIR__ . '/endpoints/lines.php';
require_once __DIR__ . '/endpoints/towers.php';
require_once __DIR__ . '/endpoints/defects.php';
require_once __DIR__ . '/endpoints/inspections.php';
require_once __DIR__ . '/endpoints/work_orders.php';
require_once __DIR__ . '/endpoints/dashboard.php';
require_once __DIR__ . '/endpoints/modules.php';

// ============================================================================
//  تنظیم هدرهای پایه
// ============================================================================

// CORS
Response::setCORSHeaders();

// Content-Type پیش‌فرض
header('Content-Type: application/json; charset=utf-8');

// عدم کش
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// ============================================================================
//  ثبت مسیرها
// ============================================================================

$router = new Router();

// احراز هویت
registerAuthRoutes($router);

// خطوط
registerLineRoutes($router);

// دکل‌ها
registerTowerRoutes($router);

// عیوب
registerDefectRoutes($router);

// بازدیدها
registerInspectionRoutes($router);

// دستورکارها
registerWorkOrderRoutes($router);

// داشبورد
registerDashboardRoutes($router);

// ماژول‌های اضافی
registerModuleRoutes($router);

// ============================================================================
//  اجرای مسیریاب
// ============================================================================

Logger::info('API request', [
    'method' => $_SERVER['REQUEST_METHOD'] ?? '',
    'uri'    => $_SERVER['REQUEST_URI'] ?? '',
]);

// v4.3.82: گارد مرکزی دسترسی ابزارها — قبل از dispatch همهٔ نوشتن‌ها
// (POST/PUT/DELETE) بر اساس ماتریس «کاربران ← دسترسی‌ها» کنترل می‌شوند.
// مدیر سیستم همیشه مجاز است؛ نقشهٔ null یعنی فقط‌خواننده.
Helpers::guardModuleWrite(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $_SERVER['REQUEST_URI'] ?? '/',
    $_SERVER['SCRIPT_NAME'] ?? ''
);

$router->dispatch();
