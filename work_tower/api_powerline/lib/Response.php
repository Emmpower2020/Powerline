<?php
/**
 * Response.php — کلاس پاسخ JSON API
 *
 * روش استفاده:
 *   Response::success(['id' => 1, 'name' => 'علی'], 'کاربر پیدا شد');
 *   Response::error(404, 'کاربر پیدا نشد');
 *   Response::paginated($data, $page, $pageSize, $total);
 */

class Response
{
    /**
     * پاسخ موفق
     */
    public static function success($data = null, string $message = '', int $code = 200): void
    {
        self::send([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ], $code);
    }

    /**
     * پاسخ خطا
     */
    public static function error(int $code, string $message, $details = null): void
    {
        $body = [
            'success' => false,
            'error'   => [
                'code'    => $code,
                'message' => $message,
            ],
        ];

        if ($details !== null) {
            $body['error']['details'] = $details;
        }

        self::send($body, $code);
    }

    /**
     * پاسخ صفحه‌بندی‌شده
     */
    public static function paginated(array $data, int $page, int $pageSize, int $total, string $message = ''): void
    {
        $totalPages = $pageSize > 0 ? (int) ceil($total / $pageSize) : 0;

        self::send([
            'success'    => true,
            'message'    => $message,
            'data'       => $data,
            'pagination' => [
                'page'        => $page,
                'page_size'   => $pageSize,
                'total'       => $total,
                'total_pages' => $totalPages,
                'has_next'    => $page < $totalPages,
                'has_prev'    => $page > 1,
            ],
        ], 200);
    }

    /**
     * ارسال پاسخ نهایی
     */
    public static function send(array $body, int $code = 200): void
    {
        // تنظیم هدرهای CORS
        self::setCORSHeaders();

        // تنظیم کد HTTP
        http_response_code($code);

        // تنظیم Content-Type
        header('Content-Type: application/json; charset=utf-8');

        // ارسال پاسخ
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        exit;
    }

    /**
     * تنظیم هدرهای CORS
     * توجه: ترکیب Access-Control-Allow-Origin: * با Allow-Credentials: true طبق استاندارد نامعتبر است
     * و مرورگرها در درخواست‌های دارای credential آن را رد می‌کنند. این اپ از هدر Authorization
     * (نه کوکی) استفاده می‌کند، بنابراین credential فقط وقتی origin مشخص شده ارسال می‌شود.
     */
    public static function setCORSHeaders(): void
    {
        header('Access-Control-Allow-Origin: ' . CORS_ALLOW_ORIGIN);
        header('Access-Control-Allow-Headers: ' . CORS_ALLOW_HEADERS);
        header('Access-Control-Allow-Methods: ' . CORS_ALLOW_METHODS);
        if (CORS_ALLOW_ORIGIN !== '*') {
            header('Access-Control-Allow-Credentials: true');
        }
        header('Access-Control-Max-Age: 3600');

        // پاسخ به درخواست‌های preflight OPTIONS
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
