<?php
/**
 * Helpers.php — توابع کمکی
 */

class Helpers
{
    /**
     * دریافت بدنه JSON از درخواست
     */
    public static function getJsonBody(): array
    {
        $raw = file_get_contents('php://input');
        if (empty($raw)) return [];

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            // fallback به $_POST
            $data = $_POST;
        }
        return $data;
    }

    /**
     * دریافت پارامتر از query string
     */
    public static function query(string $key, $default = null)
    {
        return $_GET[$key] ?? $default;
    }

    /**
     * دریافت پارامتر int از query
     */
    public static function queryInt(string $key, ?int $default = null): ?int
    {
        $val = $_GET[$key] ?? null;
        if ($val === null || $val === '') return $default;
        return (int) $val;
    }

    /** شناسه قرارداد انتخاب‌شده در Scope سراسری برنامه */
    public static function getContractId(): ?int
    {
        return self::queryInt('contract_id');
    }

    /**
     * دریافت صفحه فعلی از query
     */
    public static function getPage(): int
    {
        $page = (int) ($_GET['page'] ?? 1);
        return max(1, $page);
    }

    /**
     * دریافت اندازه صفحه از query
     */
    public static function getPageSize(): int
    {
        $size = (int) ($_GET['page_size'] ?? DEFAULT_PAGE_SIZE);
        return min(MAX_PAGE_SIZE, max(1, $size));
    }

    /**
     * دریافت محدوده offset برای صفحه‌بندی
     */
    public static function getOffset(): int
    {
        return (self::getPage() - 1) * self::getPageSize();
    }

    /**
     * دریافت فیلد جستجو
     */
    public static function getSearch(): string
    {
        return trim($_GET['search'] ?? '');
    }

    /**
     * دریافت مرتب‌سازی
     */
    public static function getSort(string $default = 'id DESC'): string
    {
        $sort = $_GET['sort'] ?? $default;
        // whitelist برای جلوگیری از SQL injection
        $allowedColumns = ['id', 'name', 'code', 'created_at', 'updated_at', 'line_code', 'tower_code', 'defect_code', 'inspection_date', 'priority', 'severity'];
        $allowedDirections = ['ASC', 'DESC'];

        $parts = explode(' ', trim($sort));
        if (count($parts) === 2 &&
            in_array($parts[0], $allowedColumns) &&
            in_array(strtoupper($parts[1]), $allowedDirections)) {
            return $parts[0] . ' ' . strtoupper($parts[1]);
        }

        return $default;
    }

    /**
     * پاک‌سازی ورودی متنی
     */
    public static function sanitizeString(?string $value): ?string
    {
        if ($value === null) return null;
        return trim(strip_tags($value));
    }

    /**
     * بررسی معتبر بودن ایمیل
     */
    public static function isValidEmail(string $email): bool
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * تولید UUID v4
     */
    public static function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    /**
     * تولید کد تصادفی
     */
    public static function generateCode(string $prefix, int $length = 6): string
    {
        $number = str_pad((string) random_int(0, pow(10, $length) - 1), $length, '0', STR_PAD_LEFT);
        return $prefix . '-' . date('Y') . '-' . $number;
    }

    /**
     * تبدیل تاریخ شمسی به میلادی (ساده)
     * ورودی: 1404/05/24
     * خروجی: 2025-08-15
     *
     * نکته: این پیاده‌سازی ساده است. برای دقت بالا از کتابخانه‌های تخصصی استفاده کنید.
     */
    public static function jalaliToGregorian(string $jalali): ?string
    {
        if (empty($jalali)) return null;
        $parts = explode('/', $jalali);
        if (count($parts) !== 3) return null;

        list($jy, $jm, $jd) = array_map('intval', $parts);

        // الگوریتم تبدیل ساده (Jalali to Gregorian)
        $jy = ($jy <= 980000) ? $jy : $jy - 980000;
        $jy -= 979;

        $jdm = ($jm <= 6) ? (31 * ($jm - 1)) + $jd : (6 * 31) + (($jm - 7) * 30) + $jd;

        $gy = $jy + 1595;
        $g_days = (365 * $gy) + (intdiv($gy + 3, 4)) - (intdiv($gy + 99, 100)) + (intdiv($gy + 399, 400));
        $g_days += $jdm;

        // محاسبه تاریخ میلادی
        $g_days_total = $g_days - 1;
        $gy2 = (intdiv($g_days_total, 365));
        $g_days_total -= ($gy2 * 365);
        $g_days_total -= (intdiv($gy2, 4));
        $g_days_total -= (intdiv($gy2, 100));
        $g_days_total += (intdiv($gy2, 400));
        $gy += $gy2;

        $sal = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (($gy % 4 === 0 && $gy % 100 !== 0) || ($gy % 400 === 0)) {
            $sal[1] = 29;
        }

        $gm = 0;
        while ($g_days_total >= $sal[$gm]) {
            $g_days_total -= $sal[$gm];
            $gm++;
        }
        $gm++;
        $gd = $g_days_total + 1;

        return sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
    }

    /**
     * دریافت IP کاربر
     */
    public static function getClientIP(): string
    {
        $ipKeys = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'];
        foreach ($ipKeys as $key) {
            if (!empty($_SERVER[$key])) {
                $ip = trim(explode(',', $_SERVER[$key])[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return '0.0.0.0';
    }

    /**
     * اعتبارسنجی GPS
     */
    public static function isValidGPS(float $lat, float $lng): bool
    {
        return ($lat >= -90 && $lat <= 90) && ($lng >= -180 && $lng <= 180);
    }

    /**
     * ساخت پاسخ تاریخچه
     */
    public static function buildHistoryResponse(array $row): array
    {
        return [
            'id'         => (int) $row['id'],
            'changed_at' => $row['changed_at'],
            'changed_by' => $row['changed_by'] ?? null,
            'comment'    => $row['comment'] ?? null,
        ];
    }
}
