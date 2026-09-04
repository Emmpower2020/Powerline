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
        // v4.3.78: کاربر اموردار فقط عیوب امور خودش را می‌بیند
        $where .= Helpers::districtWhere('d', 'defects', $params);

        $countSql = "SELECT COUNT(*) FROM defects d WHERE $where";
        $stmt = $pdo->prepare($countSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        // v4.3.78: نام امور بهره‌برداری عیب
        $disJoin = Helpers::districtJoin('d', 'defects');
        $disSel = Helpers::districtSelect();
        $sql = "SELECT d.*, c.title AS contract_title, l.line_code, l.name AS line_name, t.tower_code, t.tower_type$disSel,
                       p.first_name AS discoverer_first, p.last_name AS discoverer_last,
                       dd.title AS definition_title, dc.name AS category_name
                FROM defects d
                LEFT JOIN contracts c ON c.id = d.contract_id
                LEFT JOIN `lines` l ON l.id = d.line_id
                LEFT JOIN towers t ON t.id = d.tower_id
                LEFT JOIN personnel p ON p.id = d.discovered_by
                LEFT JOIN defect_definitions dd ON dd.id = d.defect_definition_id
                LEFT JOIN defect_categories dc ON dc.id = dd.category_id
                $disJoin
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
                // v4.3.78: پرسنل خودکارِ ساخته‌شده نیز طبق سیاست برنامه پیش‌فرض «غیرفعال» است
                $stmt = $pdo->prepare("INSERT INTO personnel (organization_id, user_id, personnel_code, first_name, last_name, position, status, hire_date, created_at) VALUES (?, ?, ?, ?, '', 'کاربر', 'inactive', CURDATE(), NOW())");
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
            // v4.3.78: امور بهره‌برداری + وضعیت پیش‌فرض «غیرفعال» (activity_status) —
            // ستون‌ها فقط در صورت وجود در دیتابیس (بعد از migration) اضافه می‌شوند
            $insCols = ['defect_code', 'defect_definition_id', 'line_id', 'tower_id', 'contract_id', 'equipment_id',
                        'title', 'description', 'defect_type', 'severity', 'priority', 'safety_risk',
                        'status', 'discovered_by', 'gps_lat', 'gps_lng', 'location_desc', 'notes', 'created_at'];
            $insVals = ['?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', "'new'", '?', '?', '?', '?', '?', 'NOW()'];
            $insParams = [
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
            ];
            if (Helpers::columnExists('defects', 'activity_status')) { $insCols[] = 'activity_status'; $insVals[] = "'inactive'"; }
            if (Helpers::columnExists('defects', 'district_id')) { $insCols[] = 'district_id'; $insVals[] = '?'; $insParams[] = Helpers::districtFromBody($body, 'defects'); }
            $sql = "INSERT INTO defects (" . implode(', ', $insCols) . ") VALUES (" . implode(', ', $insVals) . ")";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($insParams);

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
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);

        $db = Database::getInstance();
        $existing = $db->fetchOne("SELECT id, status FROM defects WHERE id = ?", [(int) $id]);
        if (!$existing) Response::error(404, 'عیب پیدا نشد');

        $allowedFields = ['title', 'description', 'defect_type', 'severity', 'priority', 'safety_risk', 'contract_id', 'gps_lat', 'gps_lng', 'location_desc', 'notes'];
        // v4.3.78: ویرایش امور بهره‌برداری و وضعیت فعال/غیرفعال عیب
        if (Helpers::columnExists('defects', 'district_id')) $allowedFields[] = 'district_id';
        if (Helpers::columnExists('defects', 'activity_status')) $allowedFields[] = 'activity_status';
        $updates = []; $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $body)) { $updates[] = "`$field` = ?"; $params[] = ($body[$field] === '' ? null : $body[$field]); }
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
        // v4.3.78: عیبِ فعال قابل حذف نیست — ابتدا باید غیرفعال شود (امنیت داده)
        $row = $db->fetchOne("SELECT * FROM defects WHERE id = ?", [(int) $id]);
        if (!$row) Response::error(404, 'عیب پیدا نشد');
        $rawStatus = array_key_exists('activity_status', $row) ? ($row['activity_status'] ?? '') : ($row['status'] ?? '');
        if (in_array(strtolower(trim((string)$rawStatus)), ['active', '1', 'true'], true)) {
            Response::error(409, "حذف عیب انجام نشد.\n\nاین عیب فعال است — برای امنیت داده، ابتدا وضعیت آن را به «غیرفعال» تغییر دهید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }
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
        // v4.3.78: عیوب «فعال» قابل حذف نیستند — ابتدا باید غیرفعال شوند (امنیت داده)
        if (Helpers::columnExists('defects', 'activity_status')) {
            $activeStmt = $pdo->prepare("SELECT COUNT(*) FROM defects WHERE id IN ($idPlaceholders) AND LOWER(TRIM(COALESCE(activity_status, ''))) IN ('active', '1', 'true')");
            $activeStmt->execute($ids);
            $activeCount = (int) $activeStmt->fetchColumn();
            if ($activeCount > 0) {
                Response::error(409, "حذف انجام نشد.\n\n$activeCount عیب انتخاب‌شده وضعیت «فعال» دارد — برای امنیت داده، ابتدا وضعیت را «غیرفعال» کنید؛ رکوردهای غیرفعال قابل حذف هستند.");
            }
        }
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
        // v4.3.81: امورِ ایمپورت برای کاربر اموردار خودکار
        $rows = Helpers::forceDistrictOnRows($body['rows'] ?? []);
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

        // v4.3.78: امور بهره‌برداری کاربر — v4.3.85: ستون district_ids (چند-اموری) هم خوانده می‌شود
        $districtColSel = (Helpers::districtsReady() && Helpers::columnExists('users', 'district_id')) ? ', u.district_id' : '';
        $districtIdsColSel = Helpers::columnExists('users', 'district_ids') ? ', u.district_ids' : '';
        // v4.3.81: نقشهٔ دسترسی ماژول‌ها (اگر ستون وجود داشته باشد)
        $permColSel = Helpers::columnExists('users', 'module_permissions') ? ', u.module_permissions' : '';
        $sql = "SELECT u.id, u.username, u.full_name, u.email, u.status, u.organization_id$districtColSel$districtIdsColSel$permColSel,
                       u.created_at, u.last_login_at,
                       MAX(r.id) AS role_id,
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
        $rows = $stmt->fetchAll();

        // v4.3.78/85: نقشهٔ نام امورها — یک کوئری سبک برای همهٔ کاربران صفحه
        $disMap = [];
        if (Helpers::districtsReady() && $rows) {
            try {
                foreach ($pdo->query('SELECT id, name FROM districts')->fetchAll() as $d) {
                    $disMap[(int) $d['id']] = (string) $d['name'];
                }
            } catch (Throwable $e) { /* جدول امور هنوز ساخته نشده — نامش بدون نام امور */ }
        }

        // v4.3.85: هر کاربر می‌تواند چند امور داشته باشد — district_ids (JSON) مقدم،
        // تک‌امور قدیمی district_id پشتیبان؛ [] یعنی همهٔ امور (مدیر سیستم)
        $data = array_map(function ($r) use ($disMap) {
            $ids = [];
            $rawIds = $r['district_ids'] ?? null;
            if (is_string($rawIds) && $rawIds !== '') {
                $decoded = json_decode($rawIds, true);
                if (is_array($decoded)) {
                    foreach ($decoded as $one) { $i = (int) $one; if ($i > 0) $ids[$i] = true; }
                    $ids = array_keys($ids);
                }
            }
            if (!$ids && !empty($r['district_id'])) $ids = [(int) $r['district_id']];
            $names = [];
            foreach ($ids as $i) $names[] = $disMap[$i] ?? null;
            return [
            'id' => (int) $r['id'], 'username' => $r['username'], 'full_name' => $r['full_name'],
            'email' => $r['email'], 'status' => (string) $r['status'],
            'organization_id' => $r['organization_id'] ? (int) $r['organization_id'] : null,
            // v4.3.85: امور اصلی (اولین لیست) + نامش — سازگار با کلاینت‌های قبلی
            'district_id' => $ids ? (int) $ids[0] : null,
            'district_name' => $ids ? ($disMap[$ids[0]] ?? null) : null,
            // v4.3.85: لیست کامل — [] = همهٔ امور (مدیر سیستم)
            'district_ids' => $ids,
            'district_names' => $names,
            // v4.3.81: نقشهٔ دسترسی ماژول‌ها — null یعنی همهٔ بخش‌ها مجاز
            'module_permissions' => (function () use ($r) {
                $raw = $r['module_permissions'] ?? null;
                if (is_string($raw) && $raw !== '') {
                    $decoded = json_decode($raw, true);
                    if (is_array($decoded)) return $decoded;
                }
                return null;
            })(),
            // v4.3.83: نقش اختصاصیافته (RBAC) — تک‌نقشی
            'role_id' => !empty($r['role_id']) ? (int) $r['role_id'] : null,
            'role_name' => $r['roles'],
            'roles' => $r['roles'], 'created_at' => $r['created_at'], 'last_login_at' => $r['last_login_at'],
            ];
        }, $rows);

        Response::paginated($data, $page, $pageSize, $total);
    });

    // v4.3.78: ویرایش کاربر — امور بهره‌برداری، وضعیت، مشخصات، رمز و ماتریس دسترسی
    // کاربرِ بدون امور (NULL) همهٔ داده‌ها را می‌بیند؛ برای محدود کردن، امور اختصاص دهید
    $router->put('users/{id}', function ($id) {
        Auth::authenticate();
        Auth::requireRole('super_admin');
        $body = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();

        $existing = $pdo->prepare('SELECT id, username, status, district_id FROM users WHERE id = ?');
        $existing->execute([(int) $id]);
        $current = $existing->fetch();
        if (!$current) Response::error(404, 'کاربر پیدا نشد');
        $selfId = (int) (Auth::getCurrentUserId() ?? 0);

        // v4.3.82: محافظ حساب خود کاربر — مدیر نمی‌تواند ناخواسته دسترسی مدیر خود را ببندد
        if ((int) $id === $selfId) {
            if (array_key_exists('district_id', $body) && $body['district_id'] !== null && (int) $body['district_id'] > 0) {
                Response::error(403, 'امور بهره‌برداری حساب خودتان قابل محدودکردن نیست — دسترسی مدیر سیستم از بین می‌رود');
            }
            // v4.3.85: چند-اموری — لیست پر یعنی محدودکردن حساب خود
            if (array_key_exists('district_ids', $body) && !empty(Helpers::normalizeDistrictIds($body['district_ids'])['ids'])) {
                Response::error(403, 'امورهای بهره‌برداری حساب خودتان قابل محدودکردن نیست — دسترسی مدیر سیستم از بین می‌رود');
            }
            if (array_key_exists('status', $body) && in_array((string) $body['status'], ['inactive', '0'], true)) {
                Response::error(403, 'حساب کاربری خودتان را نمی‌توانید غیرفعال کنید');
            }
            if (array_key_exists('module_permissions', $body) && $body['module_permissions'] !== null) {
                Response::error(403, 'ماتریس دسترسی حساب مدیر خودتان قابل تغییر نیست');
            }
            // v4.3.83: نقش حساب خودتان قابل تغییر نیست (حذف super_admin = قفل شدن مدیریت)
            if (array_key_exists('role_id', $body)) {
                Response::error(403, 'نقش حساب کاربری خودتان قابل تغییر نیست');
            }
        }

        $updates = []; $params = [];
        // v4.3.85: لیست چند-اموری — district_ids (آرایه/JSON)؛ district_id همگام با امور اصلی می‌ماند
        // لیست خالی = همهٔ امور (مدیر سیستم) → هر دو ستون NULL
        $districtIdsProvided = false;
        if (array_key_exists('district_ids', $body) && Helpers::columnExists('users', 'district_ids')) {
            $districtIdsProvided = true;
            $norm = Helpers::normalizeDistrictIds($body['district_ids']);
            if (!empty($norm['ids'])) {
                $updates[] = '`district_ids` = ?';
                $params[] = $norm['json'];
                if (Helpers::columnExists('users', 'district_id')) {
                    $updates[] = '`district_id` = ?';
                    $params[] = (int) $norm['ids'][0]; // امور اصلی — سازگار کدهای قبلی
                }
            } else {
                $updates[] = '`district_ids` = NULL';
                if (Helpers::columnExists('users', 'district_id')) {
                    $updates[] = '`district_id` = NULL';
                }
            }
        }
        if (array_key_exists('district_id', $body) && Helpers::columnExists('users', 'district_id')) {
            $v = $body['district_id'];
            $updates[] = '`district_id` = ?';
            $params[] = ($v === null || $v === '' || (int) $v <= 0) ? null : (int) $v;
            // v4.3.85: همگام‌سازی لیست با تک‌امور قدیمی (ایمپورت/کلاینت قدیمی)
            if (!$districtIdsProvided && Helpers::columnExists('users', 'district_ids')) {
                $sv = ($v === null || $v === '' || (int) $v <= 0) ? null : (int) $v;
                $updates[] = '`district_ids` = ?';
                $params[] = $sv === null ? null : json_encode([$sv]);
            }
        }
        if (array_key_exists('status', $body)) {
            $sv = (string) $body['status'];
            $updates[] = '`status` = ?';
            $params[] = ($sv === 'inactive' || $sv === '0') ? 'inactive' : 'active';
        }
        if (array_key_exists('full_name', $body) && trim((string) $body['full_name']) !== '') {
            $updates[] = '`full_name` = ?';
            $params[] = trim((string) $body['full_name']);
        }
        if (array_key_exists('email', $body)) {
            $updates[] = '`email` = ?';
            $params[] = trim((string) $body['email']) === '' ? null : trim((string) $body['email']);
        }
        // v4.3.82: تغییر رمز عبور — با bcrypt، حداقل ۴ کاراکتر
        if (array_key_exists('password', $body)) {
            $pw = (string) $body['password'];
            if ($pw !== '') {
                if (strlen($pw) < 4) Response::error(400, 'رمز عبور باید حداقل ۴ کاراکتر باشد');
                $updates[] = '`password_hash` = ?';
                $params[] = password_hash($pw, PASSWORD_BCRYPT);
            }
        }
        // v4.3.81/82: ماتریس دسترسی — مقدار هر ماژول true | false | {view,create,edit,delete,import,export}
        if (array_key_exists('module_permissions', $body) && Helpers::columnExists('users', 'module_permissions')) {
            $mp = $body['module_permissions'];
            if ($mp === null) {
                $updates[] = '`module_permissions` = NULL';
            } elseif (is_array($mp)) {
                // v4.3.83: پاک‌سازی متمرکز در Helpers
                $updates[] = '`module_permissions` = ?';
                $params[] = Helpers::cleanModulePermissions($mp);
            }
        }
        if (!$updates && !array_key_exists('role_id', $body)) Response::error(400, 'هیچ فیلدی برای ویرایش ارسال نشده');
        if ($updates) {
            $updates[] = 'updated_at = NOW()';
            $params[] = (int) $id;
            $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
        }

        // v4.3.83 (RBAC): تخصیص نقش — تک‌نقشی؛ null = حذف نقش (فقط‌مشاهده)
        if (array_key_exists('role_id', $body)) {
            $assignRoleId = null;
            $rv = $body['role_id'];
            if ($rv !== null && $rv !== '' && (int) $rv > 0) {
                $roleStmt = $pdo->prepare('SELECT id, display_name, status FROM roles WHERE id = ?');
                $roleStmt->execute([(int) $rv]);
                $roleRow = $roleStmt->fetch();
                if (!$roleRow) Response::error(404, 'نقش انتخاب‌شده پیدا نشد');
                $assignRoleId = (int) $roleRow['id'];
            }

            // آیا این حساب بعد از همین ویرایش هم مدیر سیستم می‌ماند؟
            $remainsAdmin = true;
            if (array_key_exists('district_ids', $body) && Helpers::columnExists('users', 'district_ids')) {
                // v4.3.85: لیست خالی = مدیر سیستم (همهٔ امور)
                $remainsAdmin = empty(Helpers::normalizeDistrictIds($body['district_ids'])['ids']);
            } elseif (array_key_exists('district_id', $body)) {
                $v = $body['district_id'];
                $remainsAdmin = ($v === null || $v === '' || (int) $v <= 0);
            } else {
                $remainsAdmin = ($current['district_id'] === null || (int) $current['district_id'] <= 0);
            }
            if ($remainsAdmin) {
                // مدیر سیستم همیشه نقش super_admin را نگه می‌دارد (سطح دسترسی واقعی از «امور» می‌آید)
                $superStmt = $pdo->prepare("SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1");
                $superStmt->execute();
                $superId = $superStmt->fetchColumn();
                if ($assignRoleId !== null && $superId && (int) $assignRoleId !== (int) $superId) {
                    Response::error(403, 'این حساب مدیر سیستم است — نقش مدیر همیشه «مدیر ارشد سیستم» است؛ برای نقش دلخواه ابتدا امور بهره‌برداری اختصاص دهید');
                }
                $assignRoleId = $superId ? (int) $superId : null;
            }

            try {
                $pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([(int) $id]);
                if ($assignRoleId !== null) {
                    $pdo->prepare('INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())')->execute([(int) $id, $assignRoleId]);
                }
            } catch (Throwable $e) {
                Response::error(500, 'تخصیص نقش انجام نشد — جداول roles/user_roles در دسترس نیستند');
            }
        }
        Response::success(null, 'کاربر ویرایش شد');
    });

    // v4.3.82: ایجاد کاربر جدید — از تب «اطلاعات کاربران»
    // رمز پیش‌فرض 123456، نقش بر اساس امور (کاربر امور / مدیر سیستم)
    $router->post('users', function () {
        Auth::authenticate();
        Auth::requireRole('super_admin');
        $b = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();

        $username = trim((string) ($b['username'] ?? ''));
        $fullName = trim((string) ($b['full_name'] ?? ''));
        $password = (string) ($b['password'] ?? '');
        if ($username === '') Response::error(400, 'نام کاربری الزامی است');
        if ($fullName === '') Response::error(400, 'نام و نام خانوادگی الزامی است');
        if (strlen($password) < 4) $password = '123456';

        $dup = $pdo->prepare('SELECT id FROM users WHERE username = ?');
        $dup->execute([$username]);
        if ($dup->fetch()) Response::error(409, 'این نام کاربری قبلاً ثبت شده است');

        // v4.3.85: چند-اموری — district_ids (آرایه) مقدم؛ district_id تک‌امور پشتیبان
        $hasDistrictIdsCol = Helpers::columnExists('users', 'district_ids');
        $districtIds = [];
        if (array_key_exists('district_ids', $b) && $b['district_ids'] !== null) {
            $districtIds = Helpers::normalizeDistrictIds($b['district_ids'])['ids'];
        } elseif (array_key_exists('district_id', $b) && $b['district_id'] !== null && (int) $b['district_id'] > 0) {
            if (Helpers::districtsReady() && Helpers::columnExists('users', 'district_id')) {
                $districtIds = [(int) $b['district_id']];
            }
        }
        if (!$hasDistrictIdsCol) {
            // بدون SQL 4.3.85 — فقط امور اصلی روی ستون قدیمی می‌نشیند
            $districtIds = $districtIds ? [(int) $districtIds[0]] : [];
        }
        $districtId = $districtIds ? (int) $districtIds[0] : null; // خالی = همهٔ امور (مدیر سیستم)

        $status = in_array((string) ($b['status'] ?? 'active'), ['inactive', '0'], true) ? 'inactive' : 'active';

        // ماتریس دسترسی اولیه (اختیاری — سازگار با ایمپورت) — v4.3.83: پاک‌سازی متمرکز
        $mpJson = null;
        if (isset($b['module_permissions']) && is_array($b['module_permissions']) && Helpers::columnExists('users', 'module_permissions')) {
            $mpJson = Helpers::cleanModulePermissions($b['module_permissions']);
        }

        // v4.3.83 (RBAC): نقش اولیه — انتخابی؛ مدیر سیستم همیشه super_admin
        $assignRoleId = null;
        if ($districtId === null) {
            try {
                $superStmt = $pdo->prepare("SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1");
                $superStmt->execute();
                $superId = $superStmt->fetchColumn();
                $assignRoleId = $superId ? (int) $superId : null;
            } catch (Throwable $e) { /* بدون نقش مدیر */ }
        } elseif (array_key_exists('role_id', $b) && $b['role_id'] !== null && $b['role_id'] !== '' && (int) $b['role_id'] > 0) {
            $roleStmt = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
            $roleStmt->execute([(int) $b['role_id']]);
            $roleHit = $roleStmt->fetchColumn();
            if (!$roleHit) Response::error(404, 'نقش انتخاب‌شده پیدا نشد');
            $assignRoleId = (int) $roleHit;
        }

        $cols = ['username', 'full_name', 'password_hash', 'status'];
        $vals = [$username, $fullName, password_hash($password, PASSWORD_BCRYPT), $status];
        if (Helpers::columnExists('users', 'email')) {
            $email = trim((string) ($b['email'] ?? ''));
            $cols[] = 'email';
            $vals[] = $email === '' ? null : $email;
        }
        if ($districtId !== null) { $cols[] = 'district_id'; $vals[] = $districtId; }
        // v4.3.85: لیست کامل امورها — کاربر داده‌های همهٔ این امورها را می‌بیند
        if ($districtIds && $hasDistrictIdsCol) { $cols[] = 'district_ids'; $vals[] = json_encode($districtIds); }
        if ($mpJson !== null) { $cols[] = 'module_permissions'; $vals[] = $mpJson; }

        $sql = 'INSERT INTO users (`' . implode('`, `', $cols) . '`, created_at) VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ', NOW())';
        $pdo->prepare($sql)->execute($vals);
        $newId = (int) $pdo->lastInsertId();

        // v4.3.83: تخصیص نقش — تک‌نقشی؛ کاربر بدون نقش = فقط‌مشاهده (fallback مجوز شخصی)
        if ($assignRoleId !== null) {
            try {
                $pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$newId]);
                $pdo->prepare('INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())')->execute([$newId, $assignRoleId]);
            } catch (Throwable $e) { /* نقش تخصیص نشد — کاربر با محدودیت امور/ماتریس کار می‌کند */ }
        }

        Response::success(['id' => $newId], 'کاربر ایجاد شد' . ($password === '123456' ? ' — رمز پیش‌فرض 123456' : ''), 201);
    });

    // v4.3.82: حذف کاربر — با محافظ خود و آخرین مدیر سیستم
    $router->delete('users/{id}', function ($id) {
        Auth::authenticate();
        Auth::requireRole('super_admin');
        $pdo = Database::getInstance()->getConnection();

        $selfId = (int) (Auth::getCurrentUserId() ?? 0);
        if ((int) $id === $selfId) Response::error(403, 'حساب کاربری خودتان قابل حذف نیست');

        $stmt = $pdo->prepare('SELECT id, username, district_id FROM users WHERE id = ?');
        $stmt->execute([(int) $id]);
        $user = $stmt->fetch();
        if (!$user) Response::error(404, 'کاربر پیدا نشد');

        // آخرین مدیر سیستم حذف نمی‌شود
        if ($user['district_id'] === null) {
            $superCount = $pdo->query(
                "SELECT COUNT(DISTINCT u.id) FROM users u
                 JOIN user_roles ur ON ur.user_id = u.id
                 JOIN roles r ON r.id = ur.role_id
                 WHERE r.name = 'super_admin'"
            )->fetchColumn();
            if ((int) $superCount <= 1) Response::error(403, 'آخرین مدیر سیستم حذف نمی‌شود — ابتدا مدیر دیگری بسازید');
        }

        // قطع اتصال پرسنل به این حساب (رکورد پرسنل باقی می‌ماند)
        if (Helpers::columnExists('personnel', 'user_id')) {
            try { $pdo->prepare('UPDATE personnel SET user_id = NULL WHERE user_id = ?')->execute([(int) $id]); } catch (Throwable $e) { /* بدون ستون user_id */ }
        }
        // پاک‌سازی نقش‌ها
        try { $pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([(int) $id]); } catch (Throwable $e) { /* بدون جدول */ }

        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([(int) $id]);
        Response::success(null, 'کاربر حذف شد');
    });

    // =============== /roles endpoints — v4.3.83 (RBAC) ===============
    // دسترسی‌ها روی نقش تعریف و در تب کاربران به هر نفر یک نقش اختصاص می‌یابد.
    // پیش از اجرای SQL 4.3.83 فقط فهرست/توضیحات قابل استفاده است (ماتریس = NULL).

    $router->get('roles', function () {
        Auth::authenticate();
        Auth::requireRole('super_admin');

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $search = Helpers::getSearch();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();

        $permSel = Helpers::columnExists('roles', 'module_permissions') ? 'r.module_permissions' : 'NULL AS module_permissions';
        $statusSel = Helpers::columnExists('roles', 'status') ? 'r.status' : "'active' AS status";

        $where = '1=1'; $params = [];
        if (!empty($search)) {
            $where = '(r.display_name LIKE ? OR r.name LIKE ? OR r.description LIKE ?)';
            $sp = "%$search%"; $params = [$sp, $sp, $sp];
        }

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM roles r WHERE $where");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sql = "SELECT r.id, r.name, r.display_name, r.description, r.is_system, $statusSel, $permSel, r.created_at,
                       (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS users_count
                FROM roles r
                WHERE $where
                ORDER BY r.is_system DESC, r.id ASC
                LIMIT $pageSize OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $data = array_map(fn($r) => [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'display_name' => $r['display_name'],
            'description' => $r['description'],
            'is_system' => (int) $r['is_system'],
            'status' => (string) $r['status'],
            'module_permissions' => (function () use ($r) {
                $raw = $r['module_permissions'] ?? null;
                if (is_string($raw) && $raw !== '') {
                    $decoded = json_decode($raw, true);
                    if (is_array($decoded) && $decoded) return $decoded;
                }
                return null;
            })(),
            'users_count' => (int) $r['users_count'],
            'created_at' => $r['created_at'],
        ], $rows);

        Response::paginated($data, $page, $pageSize, $total);
    });

    // v4.3.83: ثبت نقش جدید — ماتریس دسترسی بعداً از تب «دسترسی‌ها»
    $router->post('roles', function () {
        Auth::authenticate();
        Auth::requireRole('super_admin');
        $b = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();

        $displayName = trim((string) ($b['display_name'] ?? ''));
        if ($displayName === '') Response::error(400, 'نام نقش الزامی است');
        if (mb_strlen($displayName) > 200) Response::error(400, 'نام نقش حداکثر ۲۰۰ کاراکتر است');

        $dup = $pdo->prepare('SELECT id FROM roles WHERE display_name = ? LIMIT 1');
        $dup->execute([$displayName]);
        if ($dup->fetch()) Response::error(409, 'نقشی با همین نام قبلاً ثبت شده است');

        $description = trim((string) ($b['description'] ?? ''));
        $description = $description === '' ? null : $description;
        $status = in_array((string) ($b['status'] ?? 'active'), ['inactive', '0'], true) ? 'inactive' : 'active';

        // ماتریس دسترسی (اختیاری — برای «کپی نقش» از فرانت می‌آید)
        $mpJson = null;
        if (isset($b['module_permissions']) && is_array($b['module_permissions']) && Helpers::columnExists('roles', 'module_permissions')) {
            $mpJson = Helpers::cleanModulePermissions($b['module_permissions']);
        }

        $cols = ['name', 'display_name', 'is_system'];
        $vals = [$displayName, $displayName, 0];
        if (Helpers::columnExists('roles', 'description')) { $cols[] = 'description'; $vals[] = $description; }
        if (Helpers::columnExists('roles', 'status')) { $cols[] = 'status'; $vals[] = $status; }
        if ($mpJson !== null && Helpers::columnExists('roles', 'module_permissions')) { $cols[] = 'module_permissions'; $vals[] = $mpJson; }

        $sql = 'INSERT INTO roles (`' . implode('`, `', $cols) . '`, created_at) VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ', NOW())';
        $pdo->prepare($sql)->execute($vals);
        $newId = (int) $pdo->lastInsertId();

        Response::success(['id' => $newId], 'نقش ایجاد شد', 201);
    });

    // v4.3.83: ویرایش نقش — مشخصات + ماتریس دسترسی (از دیالوگ دسترسی‌ها)
    $router->put('roles/{id}', function ($id) {
        Auth::authenticate();
        Auth::requireRole('super_admin');
        $body = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();

        $stmt = $pdo->prepare('SELECT id, name, display_name, is_system FROM roles WHERE id = ?');
        $stmt->execute([(int) $id]);
        $role = $stmt->fetch();
        if (!$role) Response::error(404, 'نقش پیدا نشد');

        $updates = []; $params = [];
        if (array_key_exists('display_name', $body)) {
            $dn = trim((string) $body['display_name']);
            if ($dn === '') Response::error(400, 'نام نقش خالی نمی‌تواند');
            if ((int) $role['is_system'] === 1 && $dn !== (string) $role['display_name']) {
                Response::error(403, 'نام نقش سیستمی قابل تغییر نیست');
            }
            $dup = $pdo->prepare('SELECT id FROM roles WHERE display_name = ? AND id != ? LIMIT 1');
            $dup->execute([$dn, (int) $id]);
            if ($dup->fetch()) Response::error(409, 'نقشی با همین نام قبلاً ثبت شده است');
            $updates[] = '`display_name` = ?'; $params[] = $dn;
            if ((int) $role['is_system'] === 0) { $updates[] = '`name` = ?'; $params[] = $dn; }
        }
        if (array_key_exists('description', $body) && Helpers::columnExists('roles', 'description')) {
            $d = trim((string) $body['description']);
            $updates[] = '`description` = ?';
            $params[] = $d === '' ? null : $d;
        }
        if (array_key_exists('status', $body) && Helpers::columnExists('roles', 'status')) {
            $sv = (string) $body['status'];
            $updates[] = '`status` = ?';
            $params[] = ($sv === 'inactive' || $sv === '0') ? 'inactive' : 'active';
        }
        // ماتریس دسترسی نقش — قلب تب «دسترسی‌ها»
        if (array_key_exists('module_permissions', $body) && Helpers::columnExists('roles', 'module_permissions')) {
            $mp = $body['module_permissions'];
            if ($mp === null) {
                $updates[] = '`module_permissions` = NULL';
            } elseif (is_array($mp)) {
                $updates[] = '`module_permissions` = ?';
                $params[] = Helpers::cleanModulePermissions($mp);
            } else {
                Response::error(400, 'فرمت ماتریس دسترسی معتبر نیست');
            }
        }
        if (!$updates) Response::error(400, 'هیچ فیلدی برای ویرایش ارسال نشده');
        $updates[] = 'updated_at = NOW()';
        $params[] = (int) $id;
        $pdo->prepare('UPDATE roles SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
        Response::success(null, 'نقش ویرایش شد');
    });

    // v4.3.83: حذف نقش — نقش سیستمی/درحال‌استفاده حذف نمی‌شود
    $router->delete('roles/{id}', function ($id) {
        Auth::authenticate();
        Auth::requireRole('super_admin');
        $pdo = Database::getInstance()->getConnection();

        $stmt = $pdo->prepare('SELECT id, display_name, is_system FROM roles WHERE id = ?');
        $stmt->execute([(int) $id]);
        $role = $stmt->fetch();
        if (!$role) Response::error(404, 'نقش پیدا نشد');
        if ((int) $role['is_system'] === 1) Response::error(403, 'نقش سیستمی حذف نمی‌شود');

        $cnt = $pdo->prepare('SELECT COUNT(*) FROM user_roles WHERE role_id = ?');
        $cnt->execute([(int) $id]);
        $usersCount = (int) $cnt->fetchColumn();
        if ($usersCount > 0) {
            Response::error(409, "این نقش به {$usersCount} کاربر اختصاص دارد — ابتدا از تب «اطلاعات کاربران» نقش آن‌ها را تغییر دهید");
        }

        $pdo->prepare('DELETE FROM roles WHERE id = ?')->execute([(int) $id]);
        Response::success(null, 'نقش حذف شد');
    });
}

function formatDefectRow(array $row): array
{
    return [
        'id' => (int) $row['id'], 'defect_code' => $row['defect_code'], 'title' => $row['title'],
        'description' => $row['description'], 'defect_type' => $row['defect_type'],
        'severity' => $row['severity'], 'priority' => $row['priority'], 'safety_risk' => $row['safety_risk'],
        'status' => $row['status'],
        // v4.3.78: وضعیت فعال/غیرفعال + امور بهره‌برداری (بعد از migration)
        'activity_status' => $row['activity_status'] ?? null,
        'district_id' => !empty($row['district_id']) ? (int) $row['district_id'] : null,
        'district_name' => $row['district_name'] ?? null,
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
