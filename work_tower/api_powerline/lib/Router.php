<?php
/**
 * Router.php — مسیریاب API
 *
 * روش استفاده:
 *   $router = new Router();
 *   $router->get('/users', function() { ... });
 *   $router->post('/users', function() { ... });
 *   $router->put('/users/{id}', function($id) { ... });
 *   $router->dispatch();
 */

class Router
{
    private $routes = [];

    /**
     * ثبت مسیر GET
     */
    public function get(string $path, callable $handler, array $middleware = []): void
    {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    /**
     * ثبت مسیر POST
     */
    public function post(string $path, callable $handler, array $middleware = []): void
    {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    /**
     * ثبت مسیر PUT
     */
    public function put(string $path, callable $handler, array $middleware = []): void
    {
        $this->addRoute('PUT', $path, $handler, $middleware);
    }

    /**
     * ثبت مسیر DELETE
     */
    public function delete(string $path, callable $handler, array $middleware = []): void
    {
        $this->addRoute('DELETE', $path, $handler, $middleware);
    }

    /**
     * ثبت مسیر برای همه متدها
     */
    public function any(string $path, callable $handler, array $middleware = []): void
    {
        foreach (['GET', 'POST', 'PUT', 'DELETE'] as $method) {
            $this->addRoute($method, $path, $handler, $middleware);
        }
    }

    /**
     * افزودن مسیر
     */
    private function addRoute(string $method, string $path, callable $handler, array $middleware): void
    {
        $this->routes[] = [
            'method'    => $method,
            'path'      => $path,
            'handler'   => $handler,
            'middleware'=> $middleware,
        ];
    }

    /**
     * اجرای مسیریاب
     */
    public function dispatch(): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

        // 🔧 اصلاح مهم: حذف کل مسیر قبل از api.php
        // مثال: /Powerline/api_powerline/api.php/auth/login → auth/login
        // مثال: /Powerline/api_powerline/api.php → (خالی، صفحه اصلی)
        $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';  // مثلاً /Powerline/api_powerline/api.php

        if (!empty($scriptName) && strpos($path, $scriptName) === 0) {
            // حذف کل مسیر script از ابتدای path
            $path = substr($path, strlen($scriptName));
        } else {
            // fallback: فقط basename رو حذف کن
            $scriptBase = basename($scriptName);
            if (!empty($scriptBase) && strpos($path, $scriptBase) !== false) {
                $pos = strpos($path, $scriptBase);
                $path = substr($path, $pos + strlen($scriptBase));
            }
        }

        $path = trim($path, '/');

        // اگه خالی بود، route پیش‌فرض (صفحه اصلی)
        if (empty($path)) {
            $this->handleDefaultRoute();
            return;
        }

        // جستجوی مسیر مطابق
        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) continue;

            $params = $this->matchRoute($route['path'], $path);
            if ($params !== false) {
                // اجرای middleware ها
                foreach ($route['middleware'] as $middleware) {
                    if (is_callable($middleware)) {
                        $middleware();
                    }
                }

                // اجرای handler
                try {
                    call_user_func_array($route['handler'], $params);
                } catch (Exception $e) {
                    Logger::error("Route handler error: " . $e->getMessage(), [
                        'path' => $path,
                        'trace' => $e->getTraceAsString(),
                    ]);
                    Response::error(500, DEBUG_MODE ? $e->getMessage() : 'Internal server error');
                }
                return;
            }
        }

        // مسیر پیدا نشد
        Response::error(404, "مسیر پیدا نشد: $method /$path", [
            'available_methods' => array_unique(array_column($this->routes, 'method')),
        ]);
    }

    /**
     * تطبیق مسیر با پارامترها
     */
    private function matchRoute(string $routePath, string $requestPath): array|false
    {
        $routePath = trim($routePath, '/');
        $routeParts = explode('/', $routePath);
        $requestParts = explode('/', $requestPath);

        if (count($routeParts) !== count($requestParts)) {
            return false;
        }

        $params = [];
        for ($i = 0; $i < count($routeParts); $i++) {
            $routePart = $routeParts[$i];
            $requestPart = $requestParts[$i];

            // پارامتر {id}
            if (preg_match('/^\{(\w+)\}$/', $routePart, $m)) {
                $params[$m[1]] = $requestPart;
            }
            // پارامتر اختیاری {id?}
            elseif (preg_match('/^\{(\w+)\?\}$/', $routePart, $m)) {
                $params[$m[1]] = $requestPart;
            }
            // تطبیق دقیق
            elseif ($routePart !== $requestPart) {
                return false;
            }
        }

        return $params;
    }

    /**
     * مدیریت مسیر پیش‌فرض (صفحه اصلی)
     */
    private function handleDefaultRoute(): void
    {
        Response::success([
            'name'    => APP_NAME,
            'version' => APP_VERSION,
            'time'    => date('Y-m-d H:i:s'),
            'docs'    => '/Powerline/api/docs',
            'endpoints' => [
                'auth' => [
                    'POST /auth/login'    => 'ورود کاربر',
                    'POST /auth/logout'   => 'خروج کاربر',
                    'POST /auth/refresh'  => 'رفرش توکن',
                    'GET /auth/me'        => 'اطلاعات کاربر فعلی',
                ],
                'lines' => [
                    'GET /lines'          => 'لیست خطوط',
                    'GET /lines/{id}'     => 'جزئیات یک خط',
                    'POST /lines'         => 'ایجاد خط',
                    'PUT /lines/{id}'     => 'ویرایش خط',
                    'DELETE /lines/{id}'  => 'حذف خط',
                ],
                'towers' => [
                    'GET /towers'         => 'لیست دکل‌ها',
                    'GET /towers/{id}'    => 'جزئیات یک دکل',
                    'POST /towers'        => 'ایجاد دکل',
                    'PUT /towers/{id}'    => 'ویرایش دکل',
                    'DELETE /towers/{id}' => 'حذف دکل',
                ],
                'defects' => [
                    'GET /defects'        => 'لیست عیوب',
                    'GET /defects/{id}'   => 'جزئیات یک عیب',
                    'POST /defects'       => 'ثبت عیب',
                    'PUT /defects/{id}'   => 'ویرایش عیب',
                    'POST /defects/{id}/approve' => 'تأیید عیب',
                    'POST /defects/{id}/verify'  => 'راستی‌آزمایی رفع عیب',
                ],
                'dashboard' => [
                    'GET /dashboard/stats' => 'آمار کلی داشبورد',
                ],
            ],
        ], 'به API پلتفرم مدیریت خطوط انتقال برق خوش آمدید');
    }
}
