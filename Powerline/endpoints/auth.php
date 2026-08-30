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

        Response::success([
            'user' => [
                'id'              => (int) $user['id'],
                'username'        => $user['username'],
                'full_name'       => $user['full_name'],
                'email'           => $user['email'],
                'organization_id' => $user['organization_id'] ? (int) $user['organization_id'] : null,
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
