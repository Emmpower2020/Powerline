<?php
/**
 * Auth.php — کلاس احراز هویت (JWT + RBAC)
 *
 * روش استفاده:
 *   // احراز هویت کاربر
 *   $user = Auth::authenticate();  // اگه توکن معتبر نباشه، خطای 401 میده
 *
 *   // بررسی دسترسی
 *   Auth::requirePermission('lines.create');
 *
 *   // دریافت ID کاربر فعلی
 *   $userId = Auth::getCurrentUserId();
 */

class Auth
{
    private static $currentUser = null;

    /**
     * احراز هویت — اگه توکن معتبر نباشه خطا میده
     * v3.5.1: فقط توکن از نوع access پذیرفته می‌شود — توکن refresh (۳۰ روزه) دیگر
     * به‌عنوان access token کار نمی‌کند و انقضای ۱ ساعته واقعی می‌شود
     */
    public static function authenticate(): array
    {
        $token = self::extractBearerToken();
        if (!$token) {
            Response::error(401, 'توکن احراز هویت ارسال نشده');
        }

        $payload = self::verifyJWT($token, 'access');
        if (!$payload) {
            Response::error(401, 'توکن نامعتبر یا منقضی شده');
        }

        // بارگذاری کاربر از دیتابیس
        $db = Database::getInstance();
        $user = $db->fetchOne(
            "SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.organization_id
             FROM users u
             WHERE u.id = ? AND u.is_active = 1",
            [$payload['sub']]
        );

        if (!$user) {
            Response::error(401, 'کاربر غیرفعال یا حذف شده');
        }

        self::$currentUser = $user;
        return $user;
    }

    /**
     * احراز هویت اختیاری — اگه توکن باشه، کاربر رو برمی‌گردونه؛ اگه نباشه، null
     */
    public static function authenticateOptional(): ?array
    {
        $token = self::extractBearerToken();
        if (!$token) return null;

        $payload = self::verifyJWT($token, 'access');
        if (!$payload) return null;

        $db = Database::getInstance();
        $user = $db->fetchOne(
            "SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.organization_id
             FROM users u
             WHERE u.id = ? AND u.is_active = 1",
            [$payload['sub']]
        );

        if (!$user) return null;

        self::$currentUser = $user;
        return $user;
    }

    /**
     * دریافت کاربر فعلی
     */
    public static function getCurrentUser(): ?array
    {
        return self::$currentUser;
    }

    /**
     * دریافت ID کاربر فعلی
     */
    public static function getCurrentUserId(): ?int
    {
        return self::$currentUser['id'] ?? null;
    }

    /**
     * بررسی دسترسی نرم بدون خطا (v3.5.2) — برای endpoint تجمیعی /bootstrap:
     * هر بخش فقط در صورت مجاز بودن ساخته می‌شود؛ نبودِ دسترسی یعنی کلید آن بخش
     * در پاسخ نمی‌آید (نه خطای 403 برای کل درخواست)
     */
    public static function canAccess(string $permission): bool
    {
        if (self::hasPermission($permission)) {
            return true; // super_admin یا دارای دسترسی صریح
        }
        // permission تعریف‌نشده → ماژول هنوز تحت RBAC نیست؛ اجازه بده
        return !self::permissionExists($permission);
    }

    /**
     * بررسی دسترسی نرم (v3.5.1) — برای ماژول‌هایی که هنوز در جدول permissions تعریف نشده‌اند:
     *  - super_admin همیشه اجازه دارد
     *  - اگر permission در جدول permissions اصلاً تعریف نشده باشد، اجازه داده می‌شود
     *    (ماژول هنوز تحت RBAC نیست — تا زمانی که ادمین آن را تعریف کند)
     *  - اگر تعریف شده باشد، مثل requirePermission سخت‌گیرانه اعمال می‌شود
     * این روش جلوی دسترسی همه‌کاربران به همه‌چیز را می‌گیرد بدون شکستن ماژول‌های قدیمی
     */
    public static function requirePermissionSoft(string $permission): void
    {
        if (self::canAccess($permission)) {
            return; // مجاز
        }

        Logger::warning("Permission denied", [
            'user_id' => self::getCurrentUserId(),
            'required_permission' => $permission,
        ]);
        Response::error(403, "دسترسی لازم ندارید: $permission");
    }

    /** آیا permission در جدول permissions تعریف شده؟ (کش هر درخواست) */
    private static ?bool $permissionsLoaded = null;
    private static array $existingPermissions = [];

    private static function permissionExists(string $permission): bool
    {
        if (self::$permissionsLoaded === null) {
            self::$permissionsLoaded = true;
            try {
                $db = Database::getInstance();
                $rows = $db->fetchAll("SELECT name FROM permissions");
                self::$existingPermissions = array_column($rows, 'name');
            } catch (Exception $e) {
                // خطای دیتابیس → محافظت نکن (اجازه بده) تا اپ بی‌دلیل از کار نیفتد
                self::$existingPermissions = [];
            }
        }
        return in_array($permission, self::$existingPermissions, true);
    }

    /**
     * بررسی داشتن دسترسی — اگه نداشته باشه، خطای 403 میده
     */
    public static function requirePermission(string $permission): void
    {
        if (!self::hasPermission($permission)) {
            Logger::warning("Permission denied", [
                'user_id' => self::getCurrentUserId(),
                'required_permission' => $permission,
            ]);
            Response::error(403, "دسترسی لازم ندارید: $permission");
        }
    }

    /**
     * بررسی داشتن دسترسی (بدون خطا)
     * نقش super_admin همیشه همه دسترسی‌ها را دارد (تا با افزودن permission جدید نیاز به دسترسی دستی نباشد)
     */
    public static function hasPermission(string $permission): bool
    {
        $userId = self::getCurrentUserId();
        if (!$userId) return false;

        if (self::hasRole('super_admin')) {
            return true;
        }

        $db = Database::getInstance();
        $has = $db->fetchOne(
            "SELECT 1
             FROM user_roles ur
             JOIN role_permissions rp ON rp.role_id = ur.role_id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE ur.user_id = ? AND p.name = ?
             LIMIT 1",
            [$userId, $permission]
        );

        return $has !== null;
    }

    /**
     * بررسی داشتن نقش — اگه نداشته باشه، خطای 403 میده
     */
    public static function requireRole(string $roleName): void
    {
        if (!self::hasRole($roleName)) {
            Response::error(403, "نقش لازم ندارید: $roleName");
        }
    }

    /**
     * بررسی داشتن نقش (بدون خطا)
     */
    public static function hasRole(string $roleName): bool
    {
        $userId = self::getCurrentUserId();
        if (!$userId) return false;

        $db = Database::getInstance();
        $has = $db->fetchOne(
            "SELECT 1
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ? AND r.name = ?
             LIMIT 1",
            [$userId, $roleName]
        );

        return $has !== null;
    }

    /**
     * دریافت تمام نقش‌های کاربر فعلی
     */
    public static function getCurrentUserRoles(): array
    {
        $userId = self::getCurrentUserId();
        if (!$userId) return [];

        $db = Database::getInstance();
        return $db->fetchAll(
            "SELECT r.name, r.display_name
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ?",
            [$userId]
        );
    }

    /**
     * دریافت تمام دسترسی‌های کاربر فعلی
     */
    public static function getCurrentUserPermissions(): array
    {
        $userId = self::getCurrentUserId();
        if (!$userId) return [];

        $db = Database::getInstance();
        $rows = $db->fetchAll(
            "SELECT DISTINCT p.name
             FROM user_roles ur
             JOIN role_permissions rp ON rp.role_id = ur.role_id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE ur.user_id = ?",
            [$userId]
        );

        return array_column($rows, 'name');
    }

    // ========================================================================
    //  توابع ورود و ساخت توکن
    // ========================================================================

    /**
     * ورود کاربر با نام کاربری و رمز عبور
     */
    public static function login(string $username, string $password): array
    {
        $db = Database::getInstance();

        // پیدا کردن کاربر
        $user = $db->fetchOne(
            "SELECT id, username, password_hash, full_name, email, is_active, failed_attempts, locked_until
             FROM users
             WHERE username = ?",
            [$username]
        );

        if (!$user) {
            Logger::warning("Login failed - user not found", ['username' => $username]);
            return ['success' => false, 'error' => 'نام کاربری یا رمز عبور اشتباه است'];
        }

        // بررسی فعال بودن
        if (!$user['is_active']) {
            return ['success' => false, 'error' => 'حساب کاربری غیرفعال است'];
        }

        // بررسی قفل بودن
        if ($user['locked_until'] && strtotime($user['locked_until']) > time()) {
            $remaining = strtotime($user['locked_until']) - time();
            return ['success' => false, 'error' => "حساب قفل شده. {$remaining} ثانیه صبر کنید"];
        }

        // بررسی رمز عبور
        if (!password_verify($password, $user['password_hash'])) {
            // افزایش شمارنده تلاش‌های ناموفق
            $newAttempts = $user['failed_attempts'] + 1;
            $lockedUntil = null;
            if ($newAttempts >= 5) {
                $lockedUntil = date('Y-m-d H:i:s', time() + 900); // ۱۵ دقیقه قفل
            }

            $db->update('users',
                ['failed_attempts' => $newAttempts, 'locked_until' => $lockedUntil],
                'id = ?',
                [$user['id']]
            );

            Logger::warning("Login failed - wrong password", [
                'user_id' => $user['id'],
                'attempts' => $newAttempts,
            ]);

            return ['success' => false, 'error' => 'نام کاربری یا رمز عبور اشتباه است'];
        }

        // ورود موفق — ریست شمارنده
        $db->update('users',
            ['failed_attempts' => 0, 'locked_until' => null, 'last_login_at' => date('Y-m-d H:i:s')],
            'id = ?',
            [$user['id']]
        );

        // ساخت توکن‌ها
        $accessToken = self::generateAccessToken($user['id']);
        $refreshToken = self::generateRefreshToken($user['id']);

        Logger::info("User logged in", ['user_id' => $user['id']]);

        return [
            'success' => true,
            'user' => [
                'id'       => (int) $user['id'],
                'username' => $user['username'],
                'full_name'=> $user['full_name'],
                'email'    => $user['email'],
            ],
            'tokens' => [
                'access_token'  => $accessToken,
                'refresh_token' => $refreshToken,
                'token_type'    => 'Bearer',
                'expires_in'    => JWT_ACCESS_TTL,
            ],
        ];
    }

    /**
     * رفرش توکن
     */
    public static function refresh(string $refreshToken): array
    {
        $payload = self::verifyJWT($refreshToken);
        if (!$payload || $payload['type'] !== 'refresh') {
            return ['success' => false, 'error' => 'رفرش توکن نامعتبر'];
        }

        // بررسی در دیتابیس
        $db = Database::getInstance();
        $tokenHash = hash('sha256', $refreshToken);
        $tokenRow = $db->fetchOne(
            "SELECT * FROM auth_tokens
             WHERE user_id = ? AND token_hash = ? AND revoked = 0 AND expires_at > NOW()
             LIMIT 1",
            [$payload['sub'], $tokenHash]
        );

        if (!$tokenRow) {
            return ['success' => false, 'error' => 'رفرش توکن منقضی یا باطل شده'];
        }

        // ابطال توکن قدیمی
        $db->execute("UPDATE auth_tokens SET revoked = 1 WHERE id = ?", [$tokenRow['id']]);

        // ساخت توکن‌های جدید
        $accessToken = self::generateAccessToken($payload['sub']);
        $newRefreshToken = self::generateRefreshToken($payload['sub']);

        return [
            'success' => true,
            'tokens' => [
                'access_token'  => $accessToken,
                'refresh_token' => $newRefreshToken,
                'token_type'    => 'Bearer',
                'expires_in'    => JWT_ACCESS_TTL,
            ],
        ];
    }

    /**
     * خروج — ابطال توکن‌های نشست فعلی
     * v3.5.1: قبلاً هش access token با ردیف‌های auth_tokens (که فقط هش refresh را
     * نگه می‌دارند) مقایسه می‌شد و هیچ‌وقت چیزی ابطال نمی‌شد. حالا:
     *  ۱) اگر client در body مقدار refresh_token فرستاده باشد، همان ابطال می‌شود (صحیح‌ترین حالت)
     *  ۲) در غیر این صورت همه refresh token های فعال کاربر فعلی ابطال می‌شود (خروج از همه دستگاه‌ها)
     */
    public static function logout(?string $refreshToken = null): void
    {
        $userId = self::getCurrentUserId();
        if (!$userId) return;

        $db = Database::getInstance();

        if ($refreshToken !== null && $refreshToken !== '') {
            // فقط refresh token همین دستگاه ابطال شود
            $db->execute(
                "UPDATE auth_tokens SET revoked = 1 WHERE user_id = ? AND token_hash = ?",
                [$userId, hash('sha256', $refreshToken)]
            );
        } else {
            // بدون refresh_token مشخص → خروج کامل: همه توکن‌های فعال کاربر
            $db->execute(
                "UPDATE auth_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0",
                [$userId]
            );
        }

        Logger::info("User logged out", ['user_id' => $userId]);
    }

    // ========================================================================
    //  توابع JWT
    // ========================================================================

    /**
     * استخراج Bearer token از هدر Authorization
     */
    private static function extractBearerToken(): ?string
    {
        $headers = self::getAllHeaders();
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            return trim($m[1]);
        }

        // توجه: پشتیبانی از ?token= در query string حذف شد — توکن در لاگ سرور و تاریخچه مرورگر باقی می‌ماند
        return null;
    }

    /**
     * دریافت همه هدرها
     */
    private static function getAllHeaders(): array
    {
        if (function_exists('getallheaders')) {
            return getallheaders();
        }

        // fallback برای سرورهای غیر Apache
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (strpos($key, 'HTTP_') === 0) {
                $header = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$header] = $value;
            }
        }
        return $headers;
    }

    /**
     * تولید توکن دسترسی (Access Token)
     */
    private static function generateAccessToken(int $userId): string
    {
        $payload = [
            'sub'   => $userId,
            'type'  => 'access',
            'iat'   => time(),
            'exp'   => time() + JWT_ACCESS_TTL,
        ];
        return self::encodeJWT($payload);
    }

    /**
     * تولید توکن رفرش (Refresh Token)
     */
    private static function generateRefreshToken(int $userId): string
    {
        $payload = [
            'sub'   => $userId,
            'type'  => 'refresh',
            'iat'   => time(),
            'exp'   => time() + JWT_REFRESH_TTL,
            'jti'   => bin2hex(random_bytes(16)),  // شناسه یکتا
        ];

        $token = self::encodeJWT($payload);

        // ذخیره در دیتابیس
        $db = Database::getInstance();
        $db->insert('auth_tokens', [
            'user_id'     => $userId,
            'token_hash'  => hash('sha256', $token),
            'device_info' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'ip_address'  => $_SERVER['REMOTE_ADDR'] ?? null,
            'expires_at'  => date('Y-m-d H:i:s', $payload['exp']),
            'revoked'     => 0,
        ]);

        return $token;
    }

    /**
     * ساخت JWT
     */
    private static function encodeJWT(array $payload): string
    {
        $header = ['typ' => 'JWT', 'alg' => JWT_ALGO];

        $base64Header  = self::base64UrlEncode(json_encode($header));
        $base64Payload = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', "$base64Header.$base64Payload", JWT_SECRET, true);
        $base64Signature = self::base64UrlEncode($signature);

        return "$base64Header.$base64Payload.$base64Signature";
    }

    /**
     * بررسی و دیکد JWT
     * v3.5.1: پارامتر expectedType — از mixing توکن refresh و access جلوگیری می‌کند
     */
    private static function verifyJWT(string $token, ?string $expectedType = null): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $payload, $signature] = $parts;

        // بررسی امضا
        $expectedSignature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", JWT_SECRET, true)
        );

        if (!hash_equals($expectedSignature, $signature)) {
            return null;
        }

        // دیکد payload
        $payloadData = json_decode(self::base64UrlDecode($payload), true);
        if (!$payloadData) return null;

        // بررسی انقضا
        if (isset($payloadData['exp']) && $payloadData['exp'] < time()) {
            return null;
        }

        // v3.5.1: بررسی نوع توکن (access/refresh) در صورت درخواست
        if ($expectedType !== null && ($payloadData['type'] ?? null) !== $expectedType) {
            return null;
        }

        return $payloadData;
    }

    /**
     * Base64 URL-safe encode
     */
    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64 URL-safe decode
     */
    private static function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
