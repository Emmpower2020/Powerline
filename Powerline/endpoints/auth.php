<?php
/**
 * endpoints/auth.php — احراز هویت
 *
 * Endpoints:
 *   POST /auth/login          - ورود کاربر
 *   POST /auth/logout         - خروج کاربر
 *   POST /auth/refresh        - رفرش توکن
 *   GET  /auth/me             - اطلاعات کاربر فعلی
 *   POST /auth/change-password - تغییر رمز عبور
 */

function registerAuthRoutes(Router $router): void
{
    // ورود کاربر
    $router->post('auth/login', function () {
        $body = Helpers::getJsonBody();

        $username = $body['username'] ?? '';
        $password = $body['password'] ?? '';

        if (empty($username) || empty($password)) {
            Response::error(400, 'نام کاربری و رمز عبور الزامی است');
        }

        $result = Auth::login($username, $password);

        if (!$result['success']) {
            Response::error(401, $result['error']);
        }

        Response::success([
            'user'   => $result['user'],
            'tokens' => $result['tokens'],
        ], 'ورود موفق');
    });

    // خروج کاربر
    $router->post('auth/logout', function () {
        Auth::authenticate();
        // v3.5.1: refresh_token از body خوانده می‌شود تا فقط توکن همین دستگاه ابطال شود
        $body = Helpers::getJsonBody();
        Auth::logout(is_string($body['refresh_token'] ?? null) ? $body['refresh_token'] : null);
        Response::success(null, 'خروج موفق');
    });

    // رفرش توکن
    $router->post('auth/refresh', function () {
        $body = Helpers::getJsonBody();
        $refreshToken = $body['refresh_token'] ?? '';

        if (empty($refreshToken)) {
            Response::error(400, 'رفرش توکن الزامی است');
        }

        $result = Auth::refresh($refreshToken);

        if (!$result['success']) {
            Response::error(401, $result['error']);
        }

        Response::success($result['tokens'], 'توکن جدید صادر شد');
    });

    // اطلاعات کاربر فعلی
    $router->get('auth/me', function () {
        $user = Auth::authenticate();

        $roles = Auth::getCurrentUserRoles();
        $permissions = Auth::getCurrentUserPermissions();

        // v4.3.78: امور بهره‌برداری کاربر + نام امور (اگر migration اجرا شده باشد)
        // v4.3.85: چند-اموری — لیست امورهای قابل‌مشاهده + نام‌ها؛ [] یعنی همهٔ امور (مدیر)
        $districtIds = []; // [] = همهٔ امور (مدیر سیستم)
        if (!empty($user['district_ids'])) {
            $districtIds = Helpers::normalizeDistrictIds($user['district_ids'])['ids'];
        } elseif (!empty($user['district_id'])) {
            $districtIds = [(int) $user['district_id']];
        }
        $districtId = $districtIds ? (int) $districtIds[0] : null; // امور اصلی (سازگار قبلی)
        $districtNames = [];
        $districtName = null;
        if ($districtIds && Helpers::districtsReady()) {
            try {
                $ph = implode(', ', array_fill(0, count($districtIds), '?'));
                $stmt = Database::getInstance()->getConnection()->prepare("SELECT id, name FROM districts WHERE id IN ($ph)");
                $stmt->execute(array_map('intval', $districtIds));
                $nameMap = [];
                foreach ($stmt->fetchAll() as $d) $nameMap[(int) $d['id']] = (string) $d['name'];
                foreach ($districtIds as $i) {
                    $districtNames[] = $nameMap[(int) $i] ?? null;
                }
                $districtName = $nameMap[$districtId] ?? null;
            } catch (Throwable $e) { /* جدول امور هنوز ساخته نشده */ }
        }

        // v4.3.83 (RBAC): نقش کاربر + دسترسی مؤثر — ماتریس نقش مقدم بر مجوز شخصی
        // کاربر بدون نقش → مجوز شخصی قبلی را حمل می‌کند (null = فقط‌خوانده)
        $primaryRole = Helpers::userPrimaryRole((int) $user['id']);
        $roleId = $primaryRole['id'] ?? null;
        $roleName = $primaryRole['display_name'] ?? null;
        $modulePermissions = null;
        if ($districtId !== null) {
            $modulePermissions = Helpers::effectiveModulePermissions((int) $user['id']);
        }

        Response::success([
            'user' => [
                'id'              => (int) $user['id'],
                'username'        => $user['username'],
                'full_name'       => $user['full_name'],
                'email'           => $user['email'],
                'organization_id' => $user['organization_id'] ? (int) $user['organization_id'] : null,
                // null = مدیر برنامه (دیدن همهٔ امور) | شماره = امور اصلی (اولین لیست)
                'district_id'     => $districtId,
                'district_name'   => $districtName,
                // v4.3.85: لیست امورهای قابل‌مشاهده — [] یعنی همهٔ امور (مدیر سیستم)
                'district_ids'    => $districtIds,
                'district_names'  => $districtNames,
                // v4.3.81: دسترسی ماژول‌ها — null یعنی همه (مدیرها همیشه null می‌مانند)
                'module_permissions' => $modulePermissions,
                // v4.3.83: نقش اختصاصیافته — دسترسی مؤثر از ماتریس همین نقش می‌آید
                'role_id' => $roleId,
                'role_name' => $roleName,
            ],
            'roles'       => $roles,
            'permissions' => $permissions,
        ]);
    });

    // تغییر رمز عبور
    $router->post('auth/change-password', function () {
        $user = Auth::authenticate();
        $body = Helpers::getJsonBody();

        $oldPassword = $body['old_password'] ?? '';
        $newPassword = $body['new_password'] ?? '';

        if (empty($oldPassword) || empty($newPassword)) {
            Response::error(400, 'رمز قدیمی و جدید الزامی است');
        }

        if (strlen($newPassword) < 8) {
            Response::error(400, 'رمز جدید باید حداقل ۸ کاراکتر باشد');
        }

        $db = Database::getInstance();

        // بررسی رمز قدیمی
        $row = $db->fetchOne(
            "SELECT password_hash FROM users WHERE id = ?",
            [$user['id']]
        );

        if (!password_verify($oldPassword, $row['password_hash'])) {
            Response::error(401, 'رمز قدیمی اشتباه است');
        }

        // به‌روزرسانی رمز
        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $db->update('users', ['password_hash' => $newHash], 'id = ?', [$user['id']]);

        // ابطال همه رفرش توکن‌های کاربر
        // توجه: جدول auth_tokens فقط هش refresh token را نگه می‌دارد؛ access token فعلی تا پایان اعتبارش (۱ ساعت) کار می‌کند
        // و بعد از آن کاربر باید با رمز جدید وارد شود. سایر دستگاه‌ها بلافاصله بعد از انقضای access token خارج می‌شوند.
        $db->execute("UPDATE auth_tokens SET revoked = 1 WHERE user_id = ?", [$user['id']]);

        Logger::info('User changed password', ['user_id' => $user['id']]);
        Response::success(null, 'رمز عبور با موفقیت تغییر کرد');
    });
}
