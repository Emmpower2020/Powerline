<?php
/**
 * endpoints/lines.php — مدیریت خطوط انتقال
 *
 * Endpoints:
 *   GET    /lines          - لیست خطوط (با صفحه‌بندی)
 *   GET    /lines/{id}     - جزئیات یک خط
 *   POST   /lines          - ایجاد خط
 *   PUT    /lines/{id}     - ویرایش خط
 *   DELETE /lines/{id}     - حذف خط (soft delete)
 *   GET    /lines/{id}/towers - لیست دکل‌های یک خط
 */

function registerLineRoutes(Router $router): void
{
    // لیست خطوط
    $router->get('lines', function () {
        Auth::authenticate();
        Auth::requirePermission('lines.view');

        $db = Database::getInstance();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $lineType = Helpers::query('line_type');
        $isActive = Helpers::query('is_active');

        $where = '1=1';
        $params = [];

        // فیلتر is_active: پیش‌فرض فقط فعال‌ها نمایش داده می‌شوند
        // کاربر می‌تواند با ?is_active=all همه را ببیند یا با ?is_active=0 غیرفعال‌ها را
        if ($isActive !== null && $isActive !== '' && $isActive !== 'all') {
            $where .= ' AND l.is_active = ?';
            $params[] = (int) $isActive;
        } elseif ($isActive === null || $isActive === '') {
            $where .= ' AND l.is_active = 1';
        }

        if (!empty($search)) {
            $where .= ' AND (l.line_code LIKE ? OR l.name LIKE ? OR l.conductor_type LIKE ?)';
            $searchParam = "%$search%";
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
        }

        if ($lineType) {
            $where .= ' AND l.line_type = ?';
            $params[] = $lineType;
        }

        // شمارش کل
        $total = $db->count('lines l', $where, $params);

        // دریافت داده‌ها
        $sql = "SELECT l.*, o.name AS owner_org_name, c.name AS contractor_name
                FROM `lines` l
                LEFT JOIN organization o ON o.id = l.owner_org_id
                LEFT JOIN contractors c ON c.id = l.contractor_id
                WHERE $where
                ORDER BY l.id DESC
                LIMIT $pageSize OFFSET $offset";

        $rows = $db->fetchAll($sql, $params);

        // تبدیل GPS به فرمت قابل خواندن
        $data = array_map(function ($row) {
            return formatLineRow($row);
        }, $rows);

        Response::paginated($data, $page, $pageSize, $total);
    });

    // جزئیات یک خط
    $router->get('lines/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('lines.view');

        $db = Database::getInstance();
        $row = $db->fetchOne(
            "SELECT l.*, o.name AS owner_org_name, c.name AS contractor_name
             FROM `lines` l
             LEFT JOIN organization o ON o.id = l.owner_org_id
             LEFT JOIN contractors c ON c.id = l.contractor_id
             WHERE l.id = ?",
            [(int) $id]
        );

        if (!$row) {
            Response::error(404, 'خط پیدا نشد');
        }

        Response::success(formatLineRow($row));
    });

    // ایجاد خط
    $router->post('lines', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('lines.create');

        $body = Helpers::getJsonBody();

        // اعتبارسنجی فیلدهای اجباری
        $required = ['line_code', 'name', 'line_type'];
        foreach ($required as $field) {
            if (empty($body[$field])) {
                Response::error(400, "فیلد '$field' الزامی است");
            }
        }

        // بررسی تکراری نبودن کد
        $db = Database::getInstance();
        if ($db->exists('lines', 'line_code = ?', [$body['line_code']])) {
            Response::error(409, 'کد خط قبلاً ثبت شده');
        }

        // اعتبارسنجی نوع
        $validTypes = ['transmission', 'sub_transmission', 'distribution', 'sub_distribution'];
        if (!in_array($body['line_type'], $validTypes)) {
            Response::error(400, 'نوع خط نامعتبر است');
        }

        // توجه: dispatch_code UNIQUE نیست — چند خط می‌توانند dispatch_code مشترک داشته باشند (مدار مشترک)
        // فقط line_code یکتا است (در سطح دیتابیس با UNIQUE INDEX بررسی می‌شود)

        // ساخت.geom از LINESTRING اگه مسیری داده شده
        $geomWkt = null;
        if (!empty($body['path']) && is_array($body['path'])) {
            $points = [];
            foreach ($body['path'] as $p) {
                if (isset($p['lng'], $p['lat']) && Helpers::isValidGPS($p['lat'], $p['lng'])) {
                    $points[] = $p['lng'] . ' ' . $p['lat'];
                }
            }
            if (count($points) >= 2) {
                $geomWkt = 'LINESTRING(' . implode(', ', $points) . ')';
            }
        }

        // درج در دیتابیس (بدون construction_date و commission_date — حذف شدند)
        $sql = "INSERT INTO `lines`
                (line_code, dispatch_code, name, group_name, line_type, voltage_kv, voltage,
                 circuit_count, bundle_count, conductor_type, tower_structure_type,
                 length_km, circuit_length_km, total_towers, tension_towers, suspension_towers,
                 plain_terrain, semi_mountainous, mountainous,
                 commission_year, line_supervisor, line_expert,
                 owner_org_id, contractor_id, geom, is_active, created_at)
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 " . ($geomWkt ? "ST_GeomFromText(?)" : "NULL") . ", 1, NOW())";

        $params = [
            $body['line_code'],
            $body['dispatch_code'] ?? null,
            $body['name'],
            $body['group_name'] ?? null,
            $body['line_type'],
            $body['voltage_kv'] ?? null,
            $body['voltage'] ?? ($body['voltage_kv'] ?? null),
            $body['circuit_count'] ?? 1,
            $body['bundle_count'] ?? null,
            $body['conductor_type'] ?? null,
            $body['tower_structure_type'] ?? null,
            $body['length_km'] ?? null,
            $body['circuit_length_km'] ?? null,
            $body['total_towers'] ?? null,
            $body['tension_towers'] ?? null,
            $body['suspension_towers'] ?? null,
            $body['plain_terrain'] ?? null,
            $body['semi_mountainous'] ?? null,
            $body['mountainous'] ?? null,
            $body['commission_year'] ?? null,
            $body['line_supervisor'] ?? null,
            $body['line_expert'] ?? null,
            $body['owner_org_id'] ?? null,
            $body['contractor_id'] ?? null,
        ];
        if ($geomWkt) $params[] = $geomWkt;

        try {
            $db->execute($sql, $params);
        } catch (\PDOException $e) {
            // اگر خطای Unique Constraint بود، پیام واضح نمایش بده
            if ($e->getCode() === '23000' || strpos((string)$e->getCode(), '23') === 0) {
                $msg = $e->getMessage();
                if (strpos($msg, 'idx_lines_dispatch_code_unique') !== false || strpos($msg, 'dispatch_code') !== false) {
                    Response::error(409, 'کد دیسپاچینگ تکراری است. لطفاً migration_v1.2.2.sql را روی دیتابیس اعمال کنید تا UNIQUE INDEX از dispatch_code حذف شود.');
                }
                if (strpos($msg, 'line_code') !== false) {
                    Response::error(409, 'کد خط تکراری است. هر خط باید کد منحصر به فردی داشته باشد.');
                }
                Response::error(409, 'داده تکراری: ' . $msg);
            }
            Response::error(500, 'خطای دیتابیس: ' . $e->getMessage());
        }

        $newId = (int) $db->lastInsertId();

        Logger::info('Line created', ['line_id' => $newId, 'user_id' => $user['id']]);
        Response::success(['id' => $newId, 'line_code' => $body['line_code']], 'خط با موفقیت ایجاد شد', 201);
    });

    // ویرایش خط
    $router->put('lines/{id}', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('lines.update');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        // بررسی وجود خط
        $existing = $db->fetchOne("SELECT id FROM `lines` WHERE id = ?", [(int) $id]);
        if (!$existing) {
            Response::error(404, 'خط پیدا نشد');
        }

        // فیلدهای قابل ویرایش (بدون construction_date و commission_date — حذف شدند)
        $allowedFields = [
            'dispatch_code', 'name', 'group_name', 'line_type',
            'voltage_kv', 'voltage', 'circuit_count', 'bundle_count',
            'conductor_type', 'tower_structure_type', 'length_km', 'circuit_length_km',
            'total_towers', 'tension_towers', 'suspension_towers',
            'plain_terrain', 'semi_mountainous', 'mountainous',
            'commission_year', 'line_supervisor', 'line_expert',
            'owner_org_id', 'contractor_id', 'is_active',
        ];

        // توجه: dispatch_code UNIQUE نیست و نیازی به اعتبارسنجی یکتایی نیست (چند خط می‌توانند مشترک باشند)

        $updates = [];
        $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $body)) {
                $updates[] = "`$field` = ?";
                $params[] = $body[$field];
            }
        }

        // اگه مسیر جدید داده شده
        if (!empty($body['path']) && is_array($body['path'])) {
            $points = [];
            foreach ($body['path'] as $p) {
                if (isset($p['lng'], $p['lat']) && Helpers::isValidGPS($p['lat'], $p['lng'])) {
                    $points[] = $p['lng'] . ' ' . $p['lat'];
                }
            }
            if (count($points) >= 2) {
                $updates[] = "geom = ST_GeomFromText(?)";
                $params[] = 'LINESTRING(' . implode(', ', $points) . ')';
            }
        }

        if (empty($updates)) {
            Response::error(400, 'هیچ فیلدی برای ویرایش ارسال نشده');
        }

        $updates[] = 'updated_at = NOW()';
        $params[] = (int) $id;

        $sql = "UPDATE `lines` SET " . implode(', ', $updates) . " WHERE id = ?";
        $db->execute($sql, $params);

        Logger::info('Line updated', ['line_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'خط با موفقیت ویرایش شد');
    });

    // حذف خط (HARD DELETE - حذف کامل از دیتابیس)
    $router->delete('lines/{id}', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('lines.delete');

        $db = Database::getInstance();

        // ابتدا فیلدهای foreign key را در جداول مرتبط null کن (اگر CASCADE تنظیم نشده)
        // مثل towers.line_id، defects.line_id، inspections.line_id و غیره
        // این کار به‌صورت صریح انجام می‌شود تا خطا نشود

        // حذف دکل‌های مرتبط با این خط
        $db->execute("DELETE FROM towers WHERE line_id = ?", [(int) $id]);

        // حذف رکورد خط از دیتابیس (HARD DELETE)
        $count = $db->execute("DELETE FROM `lines` WHERE id = ?", [(int) $id]);

        if ($count === 0) {
            Response::error(404, 'خط پیدا نشد');
        }

        Logger::info('Line hard-deleted', ['line_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'خط با موفقیت از دیتابیس حذف شد');
    });

    // لیست دکل‌های یک خط
    $router->get('lines/{id}/towers', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('towers.view');

        $db = Database::getInstance();
        $rows = $db->fetchAll(
            "SELECT * FROM towers WHERE line_id = ? AND is_active = 1 ORDER BY tower_number",
            [(int) $id]
        );

        $data = array_map(function ($row) {
            return formatTowerRow($row);
        }, $rows);

        Response::success($data);
    });
}

/**
 * فرمت‌بندی ردیف خط
 * همه فیلدهای جدول lines برمی‌گردند تا فرانت‌اند به آن‌ها دسترسی داشته باشد
 */
function formatLineRow(array $row): array
{
    return [
        'id'                 => (int) $row['id'],
        'line_code'          => $row['line_code'],
        'dispatch_code'      => $row['dispatch_code'] ?? null,
        'name'               => $row['name'],
        'group_name'         => $row['group_name'] ?? null,
        'line_type'          => $row['line_type'],
        'voltage_kv'         => $row['voltage_kv'] !== null ? (float) $row['voltage_kv'] : null,
        'voltage'            => $row['voltage'] !== null ? (int) $row['voltage'] : null,
        'circuit_count'      => (int) ($row['circuit_count'] ?? 1),
        'bundle_count'       => $row['bundle_count'] !== null ? (int) $row['bundle_count'] : null,
        'conductor_type'     => $row['conductor_type'] ?? null,
        'tower_structure_type' => $row['tower_structure_type'] ?? null,
        'length_km'          => $row['length_km'] !== null ? (float) $row['length_km'] : null,
        'circuit_length_km'  => $row['circuit_length_km'] !== null ? (float) $row['circuit_length_km'] : null,
        'total_towers'       => $row['total_towers'] !== null ? (int) $row['total_towers'] : null,
        'tension_towers'     => $row['tension_towers'] !== null ? (int) $row['tension_towers'] : null,
        'suspension_towers'  => $row['suspension_towers'] !== null ? (int) $row['suspension_towers'] : null,
        'plain_terrain'      => $row['plain_terrain'] !== null ? (int) $row['plain_terrain'] : null,
        'semi_mountainous'   => $row['semi_mountainous'] !== null ? (int) $row['semi_mountainous'] : null,
        'mountainous'        => $row['mountainous'] !== null ? (int) $row['mountainous'] : null,
        'origin_substation_id' => $row['origin_substation_id'] ? (int) $row['origin_substation_id'] : null,
        'dest_substation_id' => $row['dest_substation_id'] ? (int) $row['dest_substation_id'] : null,
        'owner_org_id'       => $row['owner_org_id'] ? (int) $row['owner_org_id'] : null,
        'owner_org_name'     => $row['owner_org_name'] ?? null,
        'contractor_id'      => $row['contractor_id'] ? (int) $row['contractor_id'] : null,
        'contractor_name'    => $row['contractor_name'] ?? null,
        'commission_year'    => $row['commission_year'] !== null ? (int) $row['commission_year'] : null,
        'line_supervisor'    => $row['line_supervisor'] ?? null,
        'line_expert'        => $row['line_expert'] ?? null,
        'is_active'          => (bool) ($row['is_active'] ?? 1),
        'created_at'         => $row['created_at'] ?? null,
        'updated_at'         => $row['updated_at'] ?? null,
    ];
}
