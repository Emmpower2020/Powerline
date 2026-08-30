<?php
/**
 * config.php — تنظیمات API پلتفرم مدیریت خطوط انتقال برق
 *
 * این فایل رو در فولدر Powerline/api روی سرور قرار بده.
 * همه اطلاعات حساس (مثل پسورد دیتابیس) در همین فایل هست.
 */

// ============================================================================
//  تنظیمات دیتابیس
// ============================================================================
define('DB_HOST', 'localhost');
define('DB_NAME', 'jibimar1_Powerline');
define('DB_USER', 'jibimar1_Powerline');
define('DB_PASS', 'URmxPYq7nUrvUVRFfdrw');
define('DB_CHARSET', 'utf8mb4');

// ============================================================================
//  تنظیمات امنیتی
// ============================================================================

// کلید امضای JWT — ۶۴ کاراکتر تصادفی (تولید شده در v1.8.0)
// نکته ۱: با تغییر این کلید همه توکن‌های قبلی باطل می‌شوند (کاربران باید دوباره وارد شوند)
// نکته ۲: اگر هاست شما امکان متغیر محیطی می‌دهد، ترجیحاً کلید را در environment بگذارید
//         و این مقدار پیش‌فرض کنار گذاشته شود
define('JWT_SECRET', getenv('JWT_SECRET') ?: '4265cf19c9bbb173b207e96c0b21960a0e515315790938a1853177c7c4d16445');

// مدت اعتبار توکن دسترسی (به ثانیه) — پیش‌فرض: ۱ ساعت
define('JWT_ACCESS_TTL', 3600);

// مدت اعتبار توکن رفرش (به ثانیه) — پیش‌فرض: ۳۰ روز
define('JWT_REFRESH_TTL', 30 * 24 * 3600);

// الگوریتم امضای JWT
define('JWT_ALGO', 'HS256');

// ============================================================================
//  تنظیمات CORS (برای اپلیکیشن موبایل و وب)
// ============================================================================

// آدرس‌های مجاز برای CORS (برای تست: * — در تولید: فقط دامنه‌های مجاز)
define('CORS_ALLOW_ORIGIN', '*');

// هدرهای مجاز
define('CORS_ALLOW_HEADERS', 'Content-Type, Authorization, X-Requested-With');

// متدهای مجاز
define('CORS_ALLOW_METHODS', 'GET, POST, PUT, DELETE, OPTIONS');

// ============================================================================
//  تنظیمات آپلود فایل
// ============================================================================

// حداکثر حجم فایل آپلودی (به بایت) — پیش‌فرض: ۲۰MB
define('UPLOAD_MAX_SIZE', 20 * 1024 * 1024);

// فرمت‌های مجاز تصویر
define('UPLOAD_IMAGE_TYPES', ['jpg', 'jpeg', 'png', 'webp']);

// فرمت‌های مجاز سند
define('UPLOAD_DOC_TYPES', ['pdf', 'doc', 'docx', 'xls', 'xlsx']);

// مسیر ذخیره فایل‌ها
define('UPLOAD_DIR', __DIR__ . '/uploads');

// URL پایه برای دسترسی به فایل‌ها
define('UPLOAD_URL', '/Powerline/api/uploads');

// ============================================================================
//  تنظیمات کلی
// ============================================================================

// منطقه زمانی
date_default_timezone_set('Asia/Tehran');

// نمایش خطاها (در تولید: 0 — در توسعه: 1)
// نکته: display_errors همیشه 0 می‌مونه تا JSON خراب نشه
// خطاها در فایل api.log و در قسمت error.details پاسخ JSON نمایش داده می‌شن
// v1.8.0: برای محیط تولید خاموش شد — جزئیات خطا فقط در api.log سرور ثبت می‌شود
define('DEBUG_MODE', 0);

// خطاها همیشه در فایل لاگ ثبت بشن
error_reporting(E_ALL);
ini_set('display_errors', 0); // مهم: هرگز 1 نباشه — باعث خراب شدن JSON میشه
ini_set('log_errors', 1);

// نام برنامه و نسخه
define('APP_NAME', 'Powerline Management API');
define('APP_VERSION', '1.0.0');

// صفحه‌بندی پیش‌فرض
define('DEFAULT_PAGE_SIZE', 20);
// v2.0.0: سقف بالا رفت — دکل‌ها (~۲۶۰۰ رکورد) یکجا برای جدول سمت کلاینت بارگذاری می‌شوند
define('MAX_PAGE_SIZE', 100000);

// ============================================================================
//  تنظیمات لاگ
// ============================================================================

// مسیر فایل لاگ
define('LOG_FILE', __DIR__ . '/api.log');

// سطح لاگ (DEBUG, INFO, WARNING, ERROR)
define('LOG_LEVEL', DEBUG_MODE ? 'DEBUG' : 'INFO');

// ============================================================================
//  خطایابی
// ============================================================================
// display_errors همیشه خاموشه — خطاها در api.log و JSON ثبت می‌شن
ini_set('display_errors', 0);

// تنظیم هندلر خطا
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return;
    Logger::log('ERROR', "$message in $file:$line");
    if (DEBUG_MODE) {
        Response::error(500, "PHP Error: $message");
    }
});

set_exception_handler(function ($exception) {
    Logger::log('ERROR', "Uncaught exception: " . $exception->getMessage() . "\n" . $exception->getTraceAsString());
    Response::error(500, DEBUG_MODE ? $exception->getMessage() : 'Internal server error');
});
