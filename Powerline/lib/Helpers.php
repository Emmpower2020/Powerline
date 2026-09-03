<?php
/**
 * Helpers.php — توابع کمکی
 */

class Helpers
{
    // ─────────────────────────────────────────────────────────────
    // v4.3.78 — ابزارهای «امور بهره‌برداری» (districts)
    // همهٔ کوئری‌ها فقط وقتی ستون/جدول واقعاً موجود باشد ساخته می‌شوند تا
    // تا زمان اجرای migration روی دیتابیس، هیچ خطایی رخ ندهد.
    // ─────────────────────────────────────────────────────────────

    /** کش وجود ستون‌ها — هر جدول/ستون فقط یک‌بار از information_schema پرسیده می‌شود */
    private static array $colCache = [];

    /** آیا ستون در جدول وجود دارد؟ (بدون خطا — در نبود جدول false) */
    public static function columnExists(string $table, string $column): bool
    {
        $key = "$table.$column";
        if (!array_key_exists($key, self::$colCache)) {
            try {
                $pdo = Database::getInstance()->getConnection();
                $st = $pdo->prepare(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
                );
                $st->execute([$table, $column]);
                self::$colCache[$key] = ((int) $st->fetchColumn()) > 0;
            } catch (Throwable $e) {
                self::$colCache[$key] = false;
            }
        }
        return self::$colCache[$key];
    }

    /** آیا جدول «امور بهره‌برداری» ساخته شده است؟ */
    public static function districtsReady(): bool
    {
        static $ready = null;
        if ($ready === null) {
            try {
                $pdo = Database::getInstance()->getConnection();
                $st = $pdo->prepare(
                    "SELECT COUNT(*) FROM information_schema.TABLES
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'districts'"
                );
                $st->execute();
                $ready = ((int) $st->fetchColumn()) > 0;
            } catch (Throwable $e) {
                $ready = false;
            }
        }
        return $ready;
    }

    /**
     * امور کاربر جاری — null یعنی مدیر برنامه (دیدن همهٔ امور).
     * کاربر عادی فقط داده‌های امور خودش را می‌بیند.
     */
    public static function userDistrictId(): ?int
    {
        $user = Auth::getCurrentUser();
        $d = $user['district_id'] ?? null;
        return ($d === null || $d === '' || (int) $d <= 0) ? null : (int) $d;
    }

    /**
     * شرط SQL محدودسازی به امور کاربر — اگر کاربر مدیر بود یا ستون/جدول
     * هنوز ساخته نشده بود رشتهٔ خالی برمی‌گردد (بدون تغییر رفتار).
     * $params به‌صورت مرجع پر می‌شود.
     */
    public static function districtWhere(string $alias, string $table, array &$params): string
    {
        if (!self::districtsReady()) return '';
        $d = self::userDistrictId();
        if ($d === null) return '';
        if (!self::columnExists($table, 'district_id')) return '';
        $params[] = $d;
        return " AND `$alias`.`district_id` = ?";
    }

    /**
     * عبارت JOIN و SELECT نام امور برای endpoint های لیست —
     * 'دخل JOIN ...' فقط وقتی districts و district_id جدول موجود باشند.
     */
    public static function districtJoin(string $alias, string $table, string $joinAlias = 'dis'): string
    {
        if (!self::districtsReady()) return '';
        if (!self::columnExists($table, 'district_id')) return '';
        return " LEFT JOIN districts `$joinAlias` ON `$joinAlias`.id = `$alias`.`district_id`";
    }

    /** ستون SELECT نام امور: "، dis.name AS district_name" یا خالی */
    public static function districtSelect(string $joinAlias = 'dis'): string
    {
        if (!self::districtsReady()) return '';
        return ", `$joinAlias`.`name` AS `district_name`";
    }

    /**
     * دریافت district_id امن از بدنه درخواست — اگر migration اجرا نشده باشد
     * مقدار نادیده گرفته می‌شود.
     *
     * v4.3.81: امور رکورد جدید برای کاربر اموردار همیشه امور خودش است —
     * هر مقداری که کاربر ارسال کرده باشد نادیده گرفته می‌شود؛ فقط مدیر
     * (کاربر بدون امور) می‌تواند امور دلخواه ثبت کند.
     */
    public static function districtFromBody(array $body, string $table): ?int
    {
        if (!self::districtsReady() || !self::columnExists($table, 'district_id')) return null;
        // v4.3.81: قفل امور — کاربر اموردار همیشه امور خودش
        $own = self::userDistrictId();
        if ($own !== null) return $own;
        if (array_key_exists('district_id', $body)) {
            $v = $body['district_id'];
            return ($v === null || $v === '' || (int) $v <= 0) ? null : (int) $v;
        }
        return null;
    }

    /**
     * v4.3.81: آیا کاربر جاری اجازهٔ تغییر «امور بهره‌برداری» رکوردها را دارد؟
     * فقط مدیران (کاربر بدون امور) — کارشناس امور نمی‌تواند ردیفی را به امور دیگر منتقل کند.
     */
    public static function userCanChangeDistrict(): bool
    {
        return self::userDistrictId() === null;
    }

    /**
     * v4.3.81: حذف district_id از بدنه/وصله برای کاربر غیرمدیر —
     * در PUT/bulk-update صدا زده می‌شود تا فیلتر فیلدهای مجاز، امور را تغییر ندهد.
     */
    public static function stripDistrictForNonAdmin(array $data): array
    {
        if (self::userCanChangeDistrict()) return $data;
        unset($data['district_id']);
        return $data;
    }

    /**
     * v4.3.81: اعمال امور خودکار روی ردیف‌های import برای کاربر اموردار —
     * جلوگیری از رفتن بی‌امورِ داده‌های ایمپورت‌شدهٔ کارشناس امور.
     */
    public static function forceDistrictOnRows(array $rows): array
    {
        $own = self::userDistrictId();
        if ($own === null) return $rows;
        foreach ($rows as &$r) {
            if (is_array($r)) $r['district_id'] = $own;
        }
        unset($r);
        return $rows;
    }

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

    // ─────────────────────────────────────────────────────────────
    // v4.3.83 — RBAC: نقش‌محور شدن دسترسی‌ها
    // همان ماتریس دسترسی، این‌بار روی «نقش» تعریف می‌شود (roles.module_permissions)
    // و به کاربران نقش اختصاص می‌یابد (user_roles). مجوز شخصی users.module_permissions
    // به‌عنوان پشتیبان برای کاربران بدون نقش باقی می‌ماند.

    /**
     * v4.3.83: نقش فعلی کاربر — آخرین تخصیص user_roles (مدل تک‌نقشی).
     * خروجی: ['id' => int, 'display_name' => string] یا null.
     */
    public static function userPrimaryRole(int $userId): ?array
    {
        try {
            $row = Database::getInstance()->fetchOne(
                'SELECT r.id, r.display_name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = ? ORDER BY ur.assigned_at DESC, ur.role_id DESC LIMIT 1',
                [$userId]
            );
            return $row ? ['id' => (int) $row['id'], 'display_name' => (string) $row['display_name']] : null;
        } catch (Throwable $e) {
            return null; // جدول نقش‌ها هنوز ساخته نشده
        }
    }

    /**
     * v4.3.83: نقشهٔ دسترسی مؤثر کاربر — ماتریس «نقش» مقدم است؛
     * اگر نقش ماتریس تعریف‌شده داشته باشد همان ملاک است، وگرنه مجوز شخصی
     * (users.module_permissions از 4.3.81/82) به‌عنوان پشتیبان. null = فقط‌خوانده.
     */
    public static function effectiveModulePermissions(int $userId): ?array
    {
        $db = Database::getInstance();
        // ۱) ماتریس نقش اختصاص‌یافته
        if (self::columnExists('roles', 'module_permissions')) {
            try {
                $row = $db->fetchOne(
                    'SELECT r.module_permissions FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                     WHERE ur.user_id = ? ORDER BY ur.assigned_at DESC, ur.role_id DESC LIMIT 1',
                    [$userId]
                );
                $raw = $row['module_permissions'] ?? null;
                if (is_string($raw) && $raw !== '') {
                    $decoded = json_decode($raw, true);
                    if (is_array($decoded) && $decoded) return $decoded; // خالی = تعریف‌نشده → پشتیبان
                }
            } catch (Throwable $e) { /* ناقص */ }
        }
        // ۲) مجوز شخصی کاربر (پشتیبان سازگار)
        if (self::columnExists('users', 'module_permissions')) {
            try {
                $row = $db->fetchOne('SELECT module_permissions FROM users WHERE id = ?', [$userId]);
                $raw = $row['module_permissions'] ?? null;
                if (is_string($raw) && $raw !== '') {
                    $decoded = json_decode($raw, true);
                    if (is_array($decoded)) return $decoded;
                }
            } catch (Throwable $e) { /* ستون ناقص */ }
        }
        return null;
    }

    /**
     * v4.3.83: پاک‌سازی ماتریس دسترسی دریافتی از کلاینت → JSON آمادهٔ ذخیره.
     * مقدار هر ماژول: true | false | {view,create,edit,delete,import,export}
     */
    public static function cleanModulePermissions(array $mp): string
    {
        $clean = [];
        $allowedTools = ['view', 'create', 'edit', 'delete', 'import', 'export'];
        foreach ($mp as $k => $v) {
            if (!is_string($k) || $k === '' || $k === 'id') continue;
            if ($v === true) { $clean[$k] = true; continue; }
            if (is_array($v)) {
                if (($v['view'] ?? true) === false) { $clean[$k] = false; continue; }
                $tools = ['view' => true];
                foreach ($allowedTools as $t) {
                    if ($t !== 'view' && !empty($v[$t])) $tools[$t] = true;
                }
                $clean[$k] = $tools;
            } else {
                $clean[$k] = false;
            }
        }
        return json_encode($clean, JSON_UNESCAPED_UNICODE);
    }

    // v4.3.82 — گارد مرکزی دسترسی ابزارها (module × tool) — v4.3.83: نقش مقدم است
    // همان ماتریس دسترسی تب «کاربران ← دسترسی‌ها» اینجا روی سرور اعمال می‌شود:
    // POST→ایجاد، PUT→ویرایش، DELETE→حذف، bulk-import→ایمپورت و ...
    // مدیر سیستم (بدون امور) همیشه مجاز است؛ کاربر بدون نقشه فقط‌خواننده است.
    // ─────────────────────────────────────────────────────────────

    /** نقشهٔ مسیر اول → کلید ماژول دسترسی (MODULE_ACCESS فرانت) */
    private static array $routeModuleMap = [
        'lines' => 'lines',
        'towers' => 'towers',
        'circuits' => 'circuits',
        'personnel' => 'personnel',
        'defects' => 'defects',
        'defect-categories' => 'defects',
        'defect-definitions' => 'defects',
        'inspections' => 'inspections',
        'work-orders' => 'work-orders',
        'contracts' => 'contracts',
        'invoices' => 'invoices',
        'safety-incidents' => 'safety',
        'contractors' => 'contractors',
        'equipment' => 'equipment',
        'price-lists' => 'price-lists',
        'price-list-items' => 'price-lists',
        'conductors' => 'conductors',
        'tower-structures' => 'tower-structures',
        'tower-type-codes' => 'tower-type-codes',
        'districts' => 'districts',
        'users' => 'users',
    ];

    /** مسیرهایی که گارد ابزار روی آنها اعمال نمی‌شود */
    private static array $guardSkipSegments = [
        'auth', 'backend-version', 'dashboard', 'organization', 'crews',
        'checklist-templates', 'audit-log', 'files', 'upload',
    ];

    /** برچسب فارسی ماژول‌ها برای پیام 403 */
    private static array $moduleLabelsFa = [
        'lines' => 'خطوط انتقال', 'towers' => 'دکل‌ها', 'circuits' => 'مدارها',
        'personnel' => 'پرسنل پیمانکار', 'defects' => 'عیوب',
        'inspections' => 'بازدیدها', 'work-orders' => 'دستورکارها',
        'contracts' => 'قراردادها', 'invoices' => 'صورت‌وضعیت‌ها',
        'safety' => 'حوادث ایمنی', 'contractors' => 'پیمانکاران',
        'equipment' => 'تجهیزات', 'price-lists' => 'فهرست بها',
        'conductors' => 'انواع سیم‌ها', 'tower-structures' => 'انواع ساختار دکل',
        'tower-type-codes' => 'انواع کد دکل', 'districts' => 'امور بهره‌برداری',
        'users' => 'کاربران',
    ];

    /** برچسب فارسی ابزارها */
    private static array $toolLabelsFa = [
        'create' => 'ایجاد', 'edit' => 'ویرایش', 'delete' => 'حذف',
        'import' => 'ایمپورت', 'export' => 'اکسپورت',
    ];

    /**
     * آیا کاربر (غیرمدیر) به ابزار مشخصی از ماژول دسترسی دارد؟
     * $entry مقدار users.module_permissions[module] است:
     *   true → دسترسی کامل | false/غایب → فقط‌خواننده | آرایه → view + کلیدهای true
     */
    public static function moduleToolAllowed(?array $entry, string $tool): bool
    {
        if ($entry === true) return true;
        if (!is_array($entry)) return false; // false یا null
        if (($entry['view'] ?? true) === false) return false;
        return !empty($entry[$tool]);
    }

    /** پیام رد دسترسی و توقف درخواست */
    private static function denyTool(string $module, string $tool): void
    {
        $m = self::$moduleLabelsFa[$module] ?? $module;
        $t = self::$toolLabelsFa[$tool] ?? $tool;
        Response::error(403, "دسترسی «{$t}» در بخش «{$m}» برای حساب شما فعال نیست — از مدیر سیستم بخواهید در بخش کاربران ← دسترسی‌ها این ابزار را فعال کند");
    }

    /**
     * گارد مرکزی — قبل از dispatch در api.php صدا زده می‌شود.
     * مسیر و روش درخواست را به (ماژول، ابزار) تبدیل و برای کاربرِ اموردار
     * مجاز بودن را از users.module_permissions می‌خواند.
     */
    public static function guardModuleWrite(string $method, string $requestUri, string $scriptName = ''): void
    {
        $method = strtoupper($method);
        if (!in_array($method, ['POST', 'PUT', 'DELETE', 'PATCH'], true)) return;

        $path = parse_url($requestUri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') return;
        if ($scriptName !== '' && strpos($path, $scriptName) === 0) {
            $path = substr($path, strlen($scriptName));
        } elseif ($scriptName !== '' && ($pos = strpos($path, basename($scriptName))) !== false) {
            $path = substr($path, $pos + strlen(basename($scriptName)));
        }
        $path = trim($path, '/');
        if ($path === '') return;

        $segments = explode('/', $path);
        $first = $segments[0];
        if (in_array($first, self::$guardSkipSegments, true)) return;

        $module = self::$routeModuleMap[$first] ?? null;
        if ($module === null) return; // مسیر ناشناخته — گارد اینجا مسئول نیست

        // تعیین ابزار از روش/پسوند مسیر
        if ($method === 'PUT' || $method === 'PATCH') {
            $tool = 'edit';
        } elseif ($method === 'DELETE') {
            $tool = 'delete';
        } elseif (preg_match('~/bulk-import$~', $path)) {
            $tool = 'import';
        } elseif (preg_match('~/bulk-delete$~', $path)) {
            $tool = 'delete';
        } elseif (preg_match('~/bulk-update$~', $path)) {
            $tool = 'edit';
        } elseif (preg_match('~/[0-9]+/(approve|pay|verify|assign|close|complete|start|status|reset)(/[a-z0-9_-]+)?$~', $path)) {
            $tool = 'edit';
        } else {
            $tool = 'create';
        }

        // احراز هویت (بدون توکن → 401 مثل بقیه endpointها)
        $user = Auth::authenticate();
        $district = $user['district_id'] ?? null;
        if ($district === null || $district === '' || (int) $district <= 0) return; // مدیر سیستم

        // پیش از اجرای migration 4.3.81/83 → ستونی وجود ندارد؛ محدودیتی اعمال نمی‌شود
        if (!self::columnExists('users', 'module_permissions') && !self::columnExists('roles', 'module_permissions')) return;

        // v4.3.83: دسترسی مؤثر — ماتریس نقش مقدم؛ مجوز شخصی پشتیبان؛ null = فقط‌خواننده
        $decoded = self::effectiveModulePermissions((int) $user['id']);
        if (is_array($decoded)) {
            $entry = $decoded[$module] ?? null;
            if (self::moduleToolAllowed($entry, $tool)) return;
            self::denyTool($module, $tool);
        }
        // نقشهٔ null / نامعتبر → فقط‌خوانده (هماهنگ با فرانت v4.3.82+)
        self::denyTool($module, $tool);
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
