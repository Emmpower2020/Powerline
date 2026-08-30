<?php
/**
 * Logger.php — کلاس لاگ‌گیری API
 *
 * سطح‌بندی: DEBUG < INFO < WARNING < ERROR
 *
 * روش استفاده:
 *   Logger::info('User logged in', ['user_id' => 1]);
 *   Logger::error('Database error', ['error' => $e->getMessage()]);
 */

class Logger
{
    private static $levels = [
        'DEBUG'   => 1,
        'INFO'    => 2,
        'WARNING' => 3,
        'ERROR'   => 4,
    ];

    /**
     * لاگ DEBUG
     */
    public static function debug(string $message, array $context = []): void
    {
        self::log('DEBUG', $message, $context);
    }

    /**
     * لاگ INFO
     */
    public static function info(string $message, array $context = []): void
    {
        self::log('INFO', $message, $context);
    }

    /**
     * لاگ WARNING
     */
    public static function warning(string $message, array $context = []): void
    {
        self::log('WARNING', $message, $context);
    }

    /**
     * لاگ ERROR
     */
    public static function error(string $message, array $context = []): void
    {
        self::log('ERROR', $message, $context);
    }

    /**
     * لاگ اصلی
     */
    public static function log(string $level, string $message, array $context = []): void
    {
        // بررسی سطح لاگ
        $configuredLevel = LOG_LEVEL;
        if (!isset(self::$levels[$level]) || !isset(self::$levels[$configuredLevel])) {
            return;
        }
        if (self::$levels[$level] < self::$levels[$configuredLevel]) {
            return;
        }

        // ساخت خط لاگ
        $timestamp = date('Y-m-d H:i:s');
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
        $method = $_SERVER['REQUEST_METHOD'] ?? '';
        $uri = $_SERVER['REQUEST_URI'] ?? '';

        $line = "[$timestamp] [$level] [IP:$ip] [$method $uri] $message";

        if (!empty($context)) {
            $contextStr = json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $line .= " Context: $contextStr";
        }

        $line .= "\n";

        // نوشتن در فایل — با try/catch برای جلوگیری از خراب شدن JSON
        // اگه فایل لاگ پر شده یا قابل نوشتن نیست، خطا رو نادیده بگیر
        @file_put_contents(LOG_FILE, $line, FILE_APPEND | LOCK_EX);

        // چک کردن حجم فایل لاگ — اگه بیشتر از ۵MB شد، خالی کن
        if (file_exists(LOG_FILE) && filesize(LOG_FILE) > 5 * 1024 * 1024) {
            // نگه داشتن آخرین ۱۰۰ خط و پاک کردن بقیه
            $lines = file(LOG_FILE);
            if ($lines && count($lines) > 100) {
                $lastLines = array_slice($lines, -100);
                @file_put_contents(LOG_FILE, implode('', $lastLines));
            } else {
                @file_put_contents(LOG_FILE, '');
            }
        }
    }

    /**
     * لاگ دسترسی API
     */
    public static function access(string $endpoint, array $params = []): void
    {
        $userId = Auth::getCurrentUserId() ?? 'anonymous';
        $message = "Access: $endpoint by user:$userId";
        self::info($message, ['params' => $params]);
    }
}
