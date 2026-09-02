<?php
/**
 * endpoints/defects.php — مدیریت عیوب (نسخه اصلاح‌شده با PDO مستقیم)
 */

function registerDefectRoutes(Router $router): void
{
    // لیست عیوب
    $router->get('defects', function () {
        Auth::authenticate();
        Auth::requirePermission('defects.view');

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $status = Helpers::query('status');
        $priority = Helpers::query('priority');
        $lineId = Helpers::queryInt('line_id');
        $towerId = Helpers::queryInt('tower_id');
        $contractId = Helpers::getContractId();

        $where = '1=1';
        $params = [];

        if ($contractId === 0) { $where .= ' AND d.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND d.contract_id = ?'; $params[] = $contractId; }

        if (!empty($search)) {
            $where .= ' AND (d.defect_code LIKE ? OR d.title LIKE ? OR d.description LIKE ?)';
            $searchParam = "%$search%";
            $params[] = $searchParam; $params[] = $searchParam; $params[] = $searchParam;
        }
        if ($status) { $where .= ' AND d.status = ?'; $params[] = $status; }
        if ($priority) { $where .= ' AND d.priority = ?'; $params[] = $priority; }
        if ($lineId) { $where .= ' AND d.line_id = ?'; $params[] = $lineId; }
        if ($towerId) { $where .= ' AND d.tower_id = ?'; $params[] = $towerId; }

        $countSql = "SELECT COUNT(*) FROM defects d WHERE $where";
        $stmt = $pdo->prepare($countSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        $sql = "SELECT d.*, c.title AS contract_title, l.line_code, l.name AS line_name, t.tower_code, t.tower_type,
                       p.first_name AS discoverer_first, p.last_name AS discoverer_last,
                       dd.title AS definition_title, dc.name AS category_name
                FROM defects d
                LEFT JOIN contracts c ON c.id = d.contract_id
                LEFT JOIN `lines` l ON l.id = d.line_id
                LEFT JOIN towers t ON t.id = d.tower_id
                LEFT JOIN personnel p ON p.id = d.discovered_by
                LEFT JOIN defect_definitions dd ON dd.id = d.defect_definition_id
                LEFT JOIN defect_categories dc ON dc.id = dd.category_id
                WHERE $where
                ORDER BY d.id DESC
                LIMIT $pageSize OFFSET $offset";
        $rows = $pdo->prepare($sql);
        $rows->execute($params);
        $data = array_map('formatDefectRow', $rows->fetchAll());

        Response::paginated($data, $page, $pageSize, $total);
    });

    // جزئیات یک عیب
    $router->get('defects/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('defects.view');

        $db = Database::getInstance();
        $row = $db->fetchOne(
            "SELECT d.*, c.title AS contract_title, l.line_code, l.name AS line_name, t.tower_code, t.tower_type,
                    p.first_name AS discoverer_first, p.last_name AS discoverer_last,
                    dd.title AS definition_title, dc.name AS category_name
             FROM defects d
             LEFT JOIN contracts c ON c.id = d.contract_id
             LEFT JOIN `lines` l ON l.id = d.line_id
             LEFT JOIN towers t ON t.id = d.tower_id
             LEFT JOIN personnel p ON p.id = d.discovered_by
             LEFT JOIN defect_definitions dd ON dd.id = d.defect_definition_id
             LEFT JOIN defect_categories dc ON dc.id = dd.category_id
             WHERE d.id = ?",
            [(int) $id]
        );
        if (!$row) Response::error(404, 'عیب پیدا نشد');
        Response::success(formatDefectRow($row));
    });

    // ثبت عیب جدید (با PDO مستقیم — مثل test_create_defect.php)
    $router->post('defects', function () {
        try {
            $user = Auth::authenticate();
            Auth::requirePermission('defects.create');

            $body = Helpers::getJsonBody();
            if (empty($body['title'])) {
                Response::error(400, 'عنوان عیب الزامی است');
            }

            $db = Database::getInstance();
            $pdo = $db->getConnection();

            // اعتبارسنجی line_id و tower_id — اگه وجود نداشته باشن، NULL کن
            $lineId = null;
            $rawLineId = $body['line_id'] ?? null;
            if ($rawLineId !== null && $rawLineId !== '' && $rawLineId !== 0 && $rawLineId !== '0') {
                $checkStmt = $pdo->prepare("SELECT id FROM `lines` WHERE id = ? LIMIT 1");
                $checkStmt->execute([(int) $rawLineId]);
                if ($checkStmt->fetch()) {
                    $lineId = (int) $rawLineId;
                }
            }

            $towerId = null;
            $rawTowerId = $body['tower_id'] ?? null;
            if ($rawTowerId !== null && $rawTowerId !== '' && $rawTowerId !== 0 && $rawTowerId !== '0') {
                $checkStmt = $pdo->prepare("SELECT id FROM towers WHERE id = ? LIMIT 1");
                $checkStmt->execute([(int) $rawTowerId]);
                if ($checkStmt->fetch()) {
                    $towerId = (int) $rawTowerId;
                }
            }

            // تولید کد رهگیری
            $defectCode = 'DEF-' . date('Y') . '-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            // پیدا کردن personnel_id کاربر فعلی
            $stmt = $pdo->prepare("SELECT id FROM personnel WHERE user_id = ? LIMIT 1");
            $stmt->execute([$user['id']]);
            $personnelRow = $stmt->fetch();

            if (!$personnelRow) {
                $stmt = $pdo->prepare("INSERT INTO personnel (organization_id, user_id, personnel_code, first_name, last_name, position, status, hire_date, created_at) VALUES (?, ?, ?, ?, '', 'کاربر', 'active', CURDATE(), NOW())");
                $stmt->execute([
                    $user['organization_id'] ?? 1,
                    $user['id'],
                    'P-' . $user['id'],
                    $user['full_name'] ?? 'کاربر'
                ]);
                $personnelId = (int) $pdo->lastInsertId();
            } else {
                $personnelId = (int) $personnelRow['id'];
            }

            // درج عیب با PDO مستقیم
            $sql = "INSERT INTO defects
                    (defect_code, defect_definition_id, line_id, tower_id, contract_id, equipment_id,
                     title, description, defect_type, severity, priority, safety_risk,
                     status, discovered_by, gps_lat, gps_lng, location_desc, notes, created_at)
                    VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, NOW())";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $defectCode,
                $body['defect_definition_id'] ?? null,
                $lineId,
                $towerId,
                $body['contract_id'] ?? null,
                $body['equipment_id'] ?? null,
                $body['title'],
                $body['description'] ?? null,
                $body['defect_type'] ?? null,
                $body['severity'] ?? 'minor',
                $body['priority'] ?? 'medium',
                $body['safety_risk'] ?? 'none',
                $personnelId,
                $body['gps_lat'] ?? null,
                $body['gps_lng'] ?? null,
                $body['location_desc'] ?? null,
                $body['notes'] ?? null,
            ]);

            $newId = (int) $pdo->lastInsertId();

            // ثبت در تاریخچه
            try {
                $pdo->prepare("INSERT INTO defect_status_history (defect_id, from_status, to_status, changed_by, comment, changed_at) VALUES (?, NULL, 'new', ?, ?, NOW())")
                    ->execute([$newId, $user['id'], 'عیب جدید ثبت شد']);
            } catch (Exception $e) {
                // اگه تاریخچه خطا داد، عیب ثبت شده رو نگه دار
            }

            Logger::info('Defect created', ['defect_id' => $newId, 'user_id' => $user['id']]);
            Response::success(['id' => $newId, 'defect_code' => $defectCode], 'عیب با موفقیت ثبت شد', 201);

        } catch (Exception $e) {
            // v3.5.1: جزئیات خطا فقط در api.log سرور — به کلاینت پیام عمومی می‌رسد (نشت مسیر/SQL نداشته باشیم)
            Logger::error('Defect create failed: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
            Response::error(500, DEBUG_MODE ? ('خطا: ' . $e->getMessage()) : 'خطای داخلی سرور در ثبت عیب');
        }
    });

    // ویرایش عیب
    $router->put('defects/{id}', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('defects.update');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();
        $existing = $db->fetchOne("SELECT id, status FROM defects WHERE id = ?", [(int) $id]);
        if (!$existing) Response::error(404, 'عیب پیدا نشد');

        $allowedFields = ['title', 'description', 'defect_type', 'severity', 'priority', 'safety_risk', 'contract_id', 'gps_lat', 'gps_lng', 'location_desc', 'notes'];
        $updates = []; $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $body)) { $updates[] = "`$field` = ?"; $params[] = $body[$field]; }
        }
        if (empty($updates)) Response::error(400, 'هیچ فیلدی برای ویرایش ارسال نشده');
        $updates[] = 'updated_at = NOW()'; $params[] = (int) $id;
        $db->execute("UPDATE defects SET " . implode(', ', $updates) . " WHERE id = ?", $params);
        Response::success(null, 'عیب ویرایش شد');
    });

    // تأیید عیب
    $router->post('defects/{id}/approve', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('defects.approve');
        $db = Database::getInstance();
        $existing = $db->fetchOne("SELECT id, status FROM defects WHERE id = ?", [(int) $id]);
        if (!$existing) Response::error(404, 'عیب پیدا نشد');
        if ($existing['status'] !== 'new') Response::error(400, 'فقط عیوب با وضعیت new قابل تأیید هستند');
        $db->execute("UPDATE defects SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", [$user['id'], (int) $id]);
        Response::success(null, 'عیب تأیید شد');
    });

    // راستی‌آزمایی رفع عیب
    $router->post('defects/{id}/verify', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('defects.verify');
        $db = Database::getInstance();
        $existing = $db->fetchOne("SELECT id, status FROM defects WHERE id = ?", [(int) $id]);
        if (!$existing) Response::error(404, 'عیب پیدا نشد');
        if ($existing['status'] !== 'repaired') Response::error(400, 'فقط عیوب با وضعیت repaired قابل راستی‌آزمایی هستند');
        $db->execute("UPDATE defects SET status = 'verified', verified_by = ?, verified_at = NOW() WHERE id = ?", [$user['id'], (int) $id]);
        Response::success(null, 'عیب راستی‌آزمایی شد');
    });

    // حذف عیب
    $router->delete('defects/{id}', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('defects.delete');
        $db = Database::getInstance();
        $count = $db->execute("DELETE FROM defects WHERE id = ?", [(int) $id]);
        if ($count === 0) Response::error(404, 'عیب پیدا نشد');
        Response::success(null, 'عیب حذف شد');
    });

    // حذف انبوه عیوب — v3.2.0: همان روش دکل‌ها/خطوط (یک تراکنش، حداکثر ۵۰۰۰ ردیف)
    // نکته FK: defect_status_history خودکار CASCADE؛ work_orders.defect_id خودکار SET NULL
    $router->post('defects/bulk-delete', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('defects.delete');
        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 5000) Response::error(400, 'حداکثر ۵۰۰۰ ردیف در هر درخواست');
        $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));

        $pdo = Database::getInstance()->getConnection();
        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("DELETE FROM defects WHERE id IN ($idPlaceholders)");
            $stmt->execute($ids);
            $deleted = $stmt->rowCount();
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error("Defects bulk-delete failed", ['error' => $e->getMessage()]);
            Response::error(500, 'حذف انبوه عیوب ناموفق بود: ' . fa_db_error($e));
        }
        Logger::info('Defects bulk-deleted', ['count' => $deleted, 'user_id' => $user['id']]);
        Response::success(['deleted' => $deleted], "{$deleted} عیب حذف شد");
    });

    // ورود انبوه عیوب — v3.1.0: عنوان + اختیاری کد خط/کد دکل/شدت/اولویت/توضیحات
    // ردیف‌ها به‌صورت 'new' با کد رهگیری خودکار ثبت می‌شوند
    $router->post('defects/bulk-import', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('defects.create');
        $body = Helpers::getJsonBody();
        $rows = $body['rows'] ?? [];
        if (!is_array($rows) || count($rows) === 0) Response::error(400, 'لیست ردیف‌ها ارسال نشده');
        if (count($rows) > 500) Response::error(400, 'حداکثر ۵۰۰ ردیف در هر درخواست');

        $pdo = Database::getInstance()->getConnection();
        $inserted = 0; $failed = 0; $firstError = '';
        $statuses = []; $errors = [];

        // کش خطوط/دکل‌ها برای resolve سریع
        $lineByCode = [];
        foreach ($pdo->query("SELECT id, line_code FROM `lines`")->fetchAll() as $r) {
            $lineByCode[trim((string) $r['line_code'])] = (int) $r['id'];
        }
        $towerByCode = [];
        foreach ($pdo->query("SELECT id, tower_code FROM towers")->fetchAll() as $r) {
            $towerByCode[trim((string) $r['tower_code'])] = (int) $r['id'];
        }

        // ثبت‌کننده: personnel کاربر فعلی
        $stmt = $pdo->prepare("SELECT id FROM personnel WHERE user_id = ? LIMIT 1");
        $stmt->execute([$user['id']]);
        $personnelRow = $stmt->fetch();
        if (!$personnelRow) {
            $pdo->prepare("INSERT INTO personnel (organization_id, user_id, personnel_code, first_name, last_name, position, status, created_at) VALUES (?, ?, ?, ?, '', 'کاربر', 'active', NOW())")
                ->execute([$user['organization_id'] ?? 1, $user['id'], 'P-' . $user['id'], $user['full_name'] ?? 'کاربر']);
            $personnelId = (int) $pdo->lastInsertId();
        } else {
            $personnelId = (int) $personnelRow['id'];
        }

        $validSev = ['minor', 'major', 'critical'];
        $validPri = ['low', 'medium', 'high', 'critical'];
        $validRisk = ['none', 'low', 'medium', 'high'];

        try {
            $pdo->beginTransaction();
            $ins = $pdo->prepare("INSERT INTO defects (defect_code, defect_definition_id, line_id, tower_id, title, description, defect_type, severity, priority, safety_risk, status, discovered_by, location_desc, notes, created_at)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, NOW())");

            foreach ($rows as $i => $r) {
                try {
                    $title = trim((string) ($r['title'] ?? ''));
                    if ($title === '') throw new Exception('عنوان عیب الزامی است');

                    // resolve خط و دکل از کد
                    $lineId = null;
                    $rawLine = trim((string) ($r['line_code'] ?? $r['line_id'] ?? ''));
                    if ($rawLine !== '') {
                        $lineId = $lineByCode[$rawLine] ?? (is_numeric($rawLine) ? (int) $rawLine : null);
                        if ($lineId === null) throw new Exception("خط «{$rawLine}» پیدا نشد");
                    }
                    $towerId = null;
                    $rawTower = trim((string) ($r['tower_code'] ?? $r['tower_id'] ?? ''));
                    if ($rawTower !== '') {
                        $towerId = $towerByCode[$rawTower] ?? (is_numeric($rawTower) ? (int) $rawTower : null);
                        if ($towerId === null) throw new Exception("دکل «{$rawTower}» پیدا نشد");
                    }

                    $severity = in_array($r['severity'] ?? '', $validSev, true) ? $r['severity'] : 'minor';
                    $priority = in_array($r['priority'] ?? '', $validPri, true) ? $r['priority'] : 'medium';
                    $risk = in_array($r['safety_risk'] ?? '', $validRisk, true) ? $r['safety_risk'] : 'none';

                    $defCode = 'DEF-' . date('Y') . '-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                    $ins->execute([
                        $defCode,
                        !empty($r['defect_definition_id']) ? (int) $r['defect_definition_id'] : null,
                        $lineId, $towerId, $title,
                        $r['description'] ?? null,
                        $r['defect_type'] ?? null,
                        $severity, $priority, $risk,
                        $personnelId,
                        $r['location_desc'] ?? null,
                        $r['notes'] ?? null,
                    ]);
                    $inserted++; $statuses[] = 'inserted'; $errors[] = null;
                } catch (Exception $e) {
                    $failed++; $statuses[] = 'failed';
                    $errors[] = $e->getMessage();
                    if ($firstError === '') $firstError = $e->getMessage();
                }
            }
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Response::error(500, 'ورود انبوه عیوب ناموفق بود: ' . fa_db_error($e));
        }

        Response::success([
            'inserted' => $inserted, 'updated' => 0, 'failed' => $failed,
            'first_error' => $firstError, 'statuses' => $statuses, 'errors' => $errors,
        ], "درج: {$inserted} | خطا: {$failed}");
    });

    // لیست دسته‌بندی عیوب
    $router->get('defect-categories', function () {
        Auth::authenticate();
        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $rows = $pdo->query("SELECT dc.*, COUNT(dd.id) AS defect_count FROM defect_categories dc LEFT JOIN defect_definitions dd ON dd.category_id = dc.id WHERE dc.status = 'active' GROUP BY dc.id ORDER BY dc.id")->fetchAll();
        $data = array_map(fn($r) => [
            'id' => (int) $r['id'], 'name' => $r['name'], 'applies_to' => $r['applies_to'],
            'tower_type' => $r['tower_type'], 'status' => (string) $r['status'], 'defect_count' => (int) $r['defect_count'],
        ], $rows);
        Response::success($data);
    });

    // لیست تعاریف عیوب
    $router->get('defect-definitions', function () {
        Auth::authenticate();
        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $categoryId = Helpers::queryInt('category_id');
        $where = '1=1'; $params = [];
        if ($categoryId) { $where = 'dd.category_id = ?'; $params[] = $categoryId; }
        $stmt = $pdo->prepare("SELECT dd.id, dd.category_id, dd.defect_code, dd.title, dd.default_priority, dd.default_severity, dd.safety_risk, dd.status, dc.name AS category_name FROM defect_definitions dd LEFT JOIN defect_categories dc ON dc.id = dd.category_id WHERE $where ORDER BY dd.category_id, dd.defect_code LIMIT 1000");
        $stmt->execute($params);
        $data = array_map(fn($r) => [
            'id' => (int) $r['id'], 'category_id' => (int) $r['category_id'], 'category_name' => $r['category_name'],
            'defect_code' => (int) $r['defect_code'], 'title' => $r['title'], 'default_priority' => $r['default_priority'],
            'default_severity' => $r['default_severity'], 'safety_risk' => $r['safety_risk'], 'status' => (string) $r['status'],
        ], $stmt->fetchAll());
        Response::success($data);
    });

    // =============== /users endpoint ===============
    $router->get('users', function () {
        Auth::authenticate();
        Auth::requireRole('super_admin');

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $search = Helpers::getSearch();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();

        $where = '1=1'; $params = [];
        if (!empty($search)) {
            $where .= ' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
            $sp = "%$search%"; $params[] = $sp; $params[] = $sp; $params[] = $sp;
        }

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM users u WHERE $where");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sql = "SELECT u.id, u.username, u.full_name, u.email, u.status, u.organization_id,
                       u.created_at, u.last_login_at,
                       GROUP_CONCAT(r.display_name SEPARATOR '، ') AS roles
                FROM users u
                LEFT JOIN user_roles ur ON ur.user_id = u.id
                LEFT JOIN roles r ON r.id = ur.role_id
                WHERE $where
                GROUP BY u.id
                ORDER BY u.id DESC
                LIMIT $pageSize OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $data = array_map(fn($r) => [
            'id' => (int) $r['id'], 'username' => $r['username'], 'full_name' => $r['full_name'],
            'email' => $r['email'], 'status' => (string) $r['status'],
            'organization_id' => $r['organization_id'] ? (int) $r['organization_id'] : null,
            'roles' => $r['roles'], 'created_at' => $r['created_at'], 'last_login_at' => $r['last_login_at'],
        ], $stmt->fetchAll());

        Response::paginated($data, $page, $pageSize, $total);
    });
}

function formatDefectRow(array $row): array
{
    return [
        'id' => (int) $row['id'], 'defect_code' => $row['defect_code'], 'title' => $row['title'],
        'description' => $row['description'], 'defect_type' => $row['defect_type'],
        'severity' => $row['severity'], 'priority' => $row['priority'], 'safety_risk' => $row['safety_risk'],
        'status' => $row['status'],
        // v3.1.0: عنوان عیب استاندارد و نام دسته از JOIN با defect_definitions/defect_categories
        'category_name' => $row['category_name'] ?? null,
        'definition_title' => $row['definition_title'] ?? null,
        'defect_definition_id' => $row['defect_definition_id'] !== null ? (int) $row['defect_definition_id'] : null,
        'line_id' => $row['line_id'] ? (int) $row['line_id'] : null, 'line_code' => $row['line_code'] ?? null,
        'line_name' => $row['line_name'] ?? null, 'tower_id' => $row['tower_id'] ? (int) $row['tower_id'] : null,
        'contract_id' => $row['contract_id'] ? (int) $row['contract_id'] : null, 'contract_title' => $row['contract_title'] ?? null,
        'tower_code' => $row['tower_code'] ?? null, 'tower_type' => $row['tower_type'] ?? null,
        'discovered_by_name' => trim(($row['discoverer_first'] ?? '') . ' ' . ($row['discoverer_last'] ?? '')),
        'discovered_at' => $row['discovered_at'],
        'gps_lat' => $row['gps_lat'] !== null ? (float) $row['gps_lat'] : null,
        'gps_lng' => $row['gps_lng'] !== null ? (float) $row['gps_lng'] : null,
        'location_desc' => $row['location_desc'], 'notes' => $row['notes'],
        'created_at' => $row['created_at'], 'updated_at' => $row['updated_at'],
    ];
}
