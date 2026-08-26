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
        $required = ['line_code', 'name'];
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

        // توجه: dispatch_code UNIQUE نیست — چند خط می‌توانند dispatch_code مشترک داشته باشند (مدار مشترک)
        // فقط line_code یکتا است (در سطح دیتابیس با UNIQUE INDEX بررسی می‌شود)

        // ساخت.geom از LINESTRING اگه مسیری داده شده
        // geom در دیتابیس NOT NULL است؛ خط جدید ممکن است هنوز مسیر GIS نداشته باشد.
        // در این حالت یک LINESTRING خالی ذخیره می‌کنیم تا ثبت خط بدون مسیر هم معتبر باشد.
        $geomWkt = 'LINESTRING EMPTY';
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
                (line_code, dispatch_code, name, group_name, voltage_kv,
                 circuit_count, bundle_count, conductor_type, tower_structure_type,
                 length_km, circuit_length_km, total_towers, tension_towers, suspension_towers,
                 plain_terrain, semi_mountainous, mountainous,
                 commission_year, line_supervisor, line_expert,
                 owner_org_id, contractor_id, geom, is_active, created_at)
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ST_GeomFromText(?), 1, NOW())";

        $params = [
            $body['line_code'],
            $body['dispatch_code'] ?? null,
            $body['name'],
            $body['group_name'] ?? null,
            $body['voltage_kv'] ?? null,
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
        // geom همیشه باید ارسال شود چون ستون در دیتابیس NOT NULL است.
        $params[] = $geomWkt;

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
            'dispatch_code', 'name', 'group_name',
            'voltage_kv', 'circuit_count', 'bundle_count',
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
        $pdo = $db->getConnection();
        $lineId = (int) $id;

        // بررسی وجود خط قبل از شروع تراکنش
        $existing = $db->fetchOne("SELECT id FROM `lines` WHERE id = ?", [$lineId]);
        if (!$existing) {
            Response::error(404, 'خط پیدا نشد');
        }

        try {
            $pdo->beginTransaction();

            // دکل‌های این خط حذف می‌شوند (HARD DELETE مطابق رفتار تعریف‌شده)
            $pdo->prepare("DELETE FROM towers WHERE line_id = ?")->execute([$lineId]);

            // در سایر جداول، رکوردها مستقل از خط هستند (سابقه بازدید/عیب/...) — فقط ارجاعشان null می‌شود
            foreach (['defects', 'inspections', 'work_orders', 'safety_incidents', 'circuits', 'equipment'] as $tbl) {
                $pdo->prepare("UPDATE `$tbl` SET line_id = NULL WHERE line_id = ?")->execute([$lineId]);
            }

            $stmt = $pdo->prepare("DELETE FROM `lines` WHERE id = ?");
            $stmt->execute([$lineId]);

            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Logger::error("Line delete failed", ['line_id' => $lineId, 'error' => $e->getMessage()]);
            Response::error(500, 'حذف خط ناموفق بود: ' . $e->getMessage());
        }

        Logger::info('Line hard-deleted', ['line_id' => $lineId, 'user_id' => $user['id']]);
        Response::success(null, 'خط با موفقیت از دیتابیس حذف شد');
    });

    // ورود انبوه خطوط — v2.3.0: آرایه‌ای از ردیف‌ها در یک تراکنش
    // بدنه: {"rows": [{...فیلدهای خط...}]} — اگر line_code تکراری باشد خطا ثبت می‌شود (fail)
    $router->post('lines/bulk-import', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('lines.create');

        $body = Helpers::getJsonBody();
        $rows = $body['rows'] ?? [];

        if (!is_array($rows) || count($rows) === 0) {
            Response::error(400, 'لیست ردیف‌ها ارسال نشده');
        }
        if (count($rows) > 500) {
            Response::error(400, 'حداکثر ۵۰۰ ردیف در هر درخواست');
        }

        $db = Database::getInstance();
        $pdo = $db->getConnection();

        $allowed = [
            'dispatch_code', 'name', 'group_name', 'voltage_kv',
            'circuit_count', 'bundle_count', 'conductor_type', 'tower_structure_type',
            'length_km', 'circuit_length_km', 'total_towers', 'tension_towers', 'suspension_towers',
            'plain_terrain', 'semi_mountainous', 'mountainous', 'commission_year',
            'line_supervisor', 'line_expert', 'owner_org_id', 'contractor_id', 'is_active',
        ];
        $inserted = 0; $failed = 0; $firstError = ''; $failIndexes = [];
        $statuses = [];
        $errors = [];

        try {
            $pdo->beginTransaction();

            foreach ($rows as $i => $r) {
                try {
                    if (empty($r['line_code']) || empty($r['name'])) {
                        throw new Exception('کد خط و نام الزامی است');
                    }
                    if ($db->exists('lines', 'line_code = ?', [$r['line_code']])) {
                        throw new Exception("کد خط {$r['line_code']} تکراری است");
                    }

                    $cols = ['line_code', 'created_at'];
                    $marks = ['?', 'NOW()'];
                    $params = [$r['line_code']];
                    foreach ($allowed as $f) {
                        if (array_key_exists($f, $r)) {
                            $cols[] = "`$f`";
                            $marks[] = '?';
                            $params[] = ($f === 'is_active') ? (($r[$f] === false || $r[$f] === 0 || $r[$f] === '0') ? 0 : 1) : $r[$f];
                        }
                    }
                    $pdo->prepare("INSERT INTO `lines` (" . implode(',', $cols) . ") VALUES (" . implode(',', $marks) . ")")->execute($params);
                    $inserted++; $statuses[] = 'inserted'; $errors[] = null;
                } catch (Exception $e) {
                    $failed++;
                    $failIndexes[] = $i; $statuses[] = 'failed';
                    $errors[] = $e->getMessage();
                    if ($firstError === '') $firstError = $e->getMessage();
                }
            }

            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error("Lines bulk-import failed", ['error' => $e->getMessage()]);
            Response::error(500, 'ورود انبوه ناموفق بود: ' . $e->getMessage());
        }

        Logger::info('Lines bulk-import', ['inserted' => $inserted, 'failed' => $failed, 'user_id' => $user['id']]);
        Response::success([
            'inserted' => $inserted, 'failed' => $failed,
            'first_error' => $firstError, 'fail_indexes' => $failIndexes, 'errors' => $errors,
            'statuses' => $statuses,
        ], "درج: {$inserted} | خطا: {$failed}");
    });

    // حذف انبوه خطوط — v2.2.0: یک درخواست برای هر تعداد ردیف (به‌جای صدها درخواست جدا)
    // بدنه: {"ids": [1, 2, 3, ...]} — خروجی: تعداد حذف‌شده‌ها
    $router->post('lines/bulk-delete', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('lines.delete');

        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];

        if (!is_array($ids) || count($ids) === 0) {
            Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        }
        if (count($ids) > 5000) {
            Response::error(400, 'حداکثر ۵۰۰۰ ردیف در هر درخواست');
        }

        // فقط اعداد صحیح معتبر
        $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));

        $db = Database::getInstance();
        $pdo = $db->getConnection();

        try {
            $pdo->beginTransaction();

            // دکل‌های این خطوط حذف، ارجاع سایر جداول null می‌شود (مطابق حذف تکی)
            $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));

            $pdo->prepare("DELETE FROM towers WHERE line_id IN ($idPlaceholders)")->execute($ids);

            foreach (['defects', 'inspections', 'work_orders', 'safety_incidents', 'circuits', 'equipment'] as $tbl) {
                $pdo->prepare("UPDATE `$tbl` SET line_id = NULL WHERE line_id IN ($idPlaceholders)")->execute($ids);
            }

            $stmt = $pdo->prepare("DELETE FROM `lines` WHERE id IN ($idPlaceholders)");
            $stmt->execute($ids);
            $deleted = $stmt->rowCount();

            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Logger::error("Lines bulk-delete failed", ['error' => $e->getMessage()]);
            Response::error(500, 'حذف انبوه ناموفق بود: ' . $e->getMessage());
        }

        Logger::info('Lines bulk-deleted', ['count' => $deleted, 'user_id' => $user['id']]);
        Response::success(['deleted' => $deleted], "{$deleted} خط حذف شد");
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
        'voltage_kv'         => $row['voltage_kv'] !== null ? (float) $row['voltage_kv'] : null,
        'voltage'            => $row['voltage_kv'] !== null ? (float) $row['voltage_kv'] : null,
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
