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
        $isActive = Helpers::query('status');
        $contractId = Helpers::getContractId();

        $where = '1=1';
        $params = [];

        // فیلتر status اختیاری است؛ در حالت عادی همه وضعیت‌ها نمایش داده می‌شوند
        // تا رکوردهای غیرفعال نیز برای فعال‌سازی مجدد در دسترس باشند.
        if ($isActive !== null && $isActive !== '' && $isActive !== 'all') {
            $where .= ' AND l.status = ?';
            $params[] = ((string)$isActive === '0' || (string)$isActive === 'inactive') ? 'inactive' : 'active';
        }

        if ($contractId === 0) { $where .= ' AND l.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND l.contract_id = ?'; $params[] = $contractId; }

        if (!empty($search)) {
            $where .= ' AND (l.line_code LIKE ? OR l.name LIKE ? OR l.conductor_type LIKE ?)';
            $searchParam = "%$search%";
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
        }

        // v4.3.78: کاربر اموردار فقط خطوط امور خودش را می‌بیند
        $where .= Helpers::districtWhere('l', 'lines', $params);

        // شمارش کل
        $total = $db->count('lines l', $where, $params);

        // دریافت داده‌ها + تعداد دکل و ساختار غالب برای قفل کردن ساختار خط
        $lineColumns = [];
        foreach ($db->fetchAll("SHOW COLUMNS FROM `lines`") as $cr) if (isset($cr['Field'])) $lineColumns[(string)$cr['Field']] = true;
        $resolvedStructure = isset($lineColumns['tower_structure']) ? 'l.tower_structure' : 'NULL';
        // v4.3.78: نام امور بهره‌برداری خط
        $disJoin = Helpers::districtJoin('l', 'lines');
        $disSel = Helpers::districtSelect();
        $sql = "SELECT l.*, o.name AS owner_org_name, c.contractor_name AS contractor_name, ct.title AS contract_title$disSel,
                       (SELECT COUNT(*) FROM towers tt WHERE tt.line_id = l.id AND tt.status = 'active') AS tower_count,
                       $resolvedStructure AS resolved_tower_structure
                FROM `lines` l
                LEFT JOIN organization o ON o.id = l.owner_org_id
                LEFT JOIN contractors c ON c.id = l.contractor_id
                LEFT JOIN contracts ct ON ct.id = l.contract_id
                $disJoin
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
        $lineColumns = [];
        foreach ($db->fetchAll("SHOW COLUMNS FROM `lines`") as $cr) if (isset($cr['Field'])) $lineColumns[(string)$cr['Field']] = true;
        $resolvedStructure = isset($lineColumns['tower_structure']) ? 'l.tower_structure' : 'NULL';
        $row = $db->fetchOne(
            "SELECT l.*, o.name AS owner_org_name, c.contractor_name AS contractor_name, ct.title AS contract_title,
                    (SELECT COUNT(*) FROM towers tt WHERE tt.line_id = l.id AND tt.status = 'active') AS tower_count,
                    $resolvedStructure AS resolved_tower_structure
             FROM `lines` l
             LEFT JOIN organization o ON o.id = l.owner_org_id
             LEFT JOIN contractors c ON c.id = l.contractor_id
             LEFT JOIN contracts ct ON ct.id = l.contract_id
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

        // محافظ قطعی سازگاری با schema واقعی جدول lines:
        // ستون voltage در lines وجود ندارد و هرگز نباید وارد Query شود.
        unset($body['voltage']);

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

        // درج در دیتابیس — فقط ستون‌های واقعی جدول `lines` استفاده می‌شوند.
        // این لیست عمداً شامل `voltage` نیست؛ نام صحیح ستون ولتاژ `voltage_kv` است.
        $lineColumns = [
            'line_code','dispatch_code','name','group_name','voltage_kv',
            'circuit_count','bundle_count','conductor_type','tower_structure',
            'length_km','circuit_length_km','total_towers','tension_towers','suspension_towers',
            'plain_terrain','semi_mountainous','mountainous',
            'commission_year','line_supervisor','line_expert','owner_org_id','contractor_id','contract_id',
            'geom','status'
        ];
        // v4.3.78: امور بهره‌برداری خط
        $lineColumns[] = 'district_id';

        // در برابر نسخه‌های قدیمی دیتابیس/کد هم مقاوم باشد: فقط ستون‌هایی که واقعاً در جدول وجود دارند وارد INSERT شوند.
        $schemaRows = $db->fetchAll("SHOW COLUMNS FROM `lines`");
        $actualColumns = [];
        foreach ($schemaRows as $schemaRow) {
            if (isset($schemaRow['Field'])) $actualColumns[(string)$schemaRow['Field']] = true;
        }
        $insertColumns = array_values(array_filter($lineColumns, fn($c) => isset($actualColumns[$c])));

        if (!in_array('line_code', $insertColumns, true) || !in_array('name', $insertColumns, true)) {
            Response::error(500, 'ساختار جدول lines با نسخه برنامه سازگار نیست.');
        }

        $insertValues = [];
        $params = [];
        foreach ($insertColumns as $column) {
            if ($column === 'geom') {
                $insertValues[] = 'ST_GeomFromText(?)';
                $params[] = $geomWkt;
            } elseif ($column === 'status') {
                // v4.3.78: طبق سیاست امنیت داده، ثبت جدید پیش‌فرض «غیرفعال» است —
                // فعال‌سازی از طریق ویرایش گروهی انجام می‌شود
                $insertValues[] = "'inactive'";
            } elseif ($column === 'district_id') {
                $insertValues[] = '?';
                $params[] = Helpers::districtFromBody($body, 'lines');
            } else {
                $insertValues[] = '?';
                $params[] = $body[$column] ?? null;
            }
        }

        $insertColumnsSql = implode(', ', array_map(fn($c) => "`$c`", $insertColumns));
        $sql = "INSERT INTO `lines` (" . $insertColumnsSql . ") VALUES (" . implode(', ', $insertValues) . ")";

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
            Response::error(500, 'خطای دیتابیس: ' . fa_db_error($e));
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
            'conductor_type', 'length_km', 'circuit_length_km',
            'total_towers', 'tension_towers', 'suspension_towers',
            'plain_terrain', 'semi_mountainous', 'mountainous',
            'commission_year', 'line_supervisor', 'line_expert',
            'owner_org_id', 'contractor_id', 'contract_id', 'status',
        ];

        $towerCountRow = $db->fetchOne("SELECT COUNT(*) AS cnt FROM towers WHERE line_id = ? AND status = 'active'", [(int)$id]);
        $structureLocked = (int)($towerCountRow['cnt'] ?? 0) > 0;
        $lineColumns = [];
        foreach ($db->fetchAll("SHOW COLUMNS FROM `lines`") as $cr) if (isset($cr['Field'])) $lineColumns[(string)$cr['Field']] = true;
        // v4.3.78: ویرایش امور بهره‌برداری خط — فقط اگر migration اجرا شده باشد
        if (isset($lineColumns['district_id'])) $allowedFields[] = 'district_id';
        if ($structureLocked) {
            // ساختار خط بعد از ثبت حداقل یک دکل فقط از روی دکل‌ها محاسبه می‌شود.
            unset($body['tower_structure']);
        }

        // توجه: dispatch_code UNIQUE نیست و نیازی به اعتبارسنجی یکتایی نیست (چند خط می‌توانند مشترک باشند)

        $updates = [];
        $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $body)) {
                $updates[] = "`$field` = ?";
                $params[] = $body[$field];
            }
        }

        if (!$structureLocked && isset($lineColumns['tower_structure']) && array_key_exists('tower_structure', $body)) {
            $updates[] = '`tower_structure` = ?';
            $params[] = $body['tower_structure'];
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

    // ویرایش گروهی خطوط — v4.3.53: حداکثر ۱۰۰ خط در هر درخواست با یک UPDATE تراکنشی
    // بدنه: {"ids":[...], "patch":{"voltage_kv":63, "contract_id":2, ...}}
    $router->post('lines/bulk-update', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('lines.update');

        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        $patch = $body['patch'] ?? [];

        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 100) Response::error(400, 'حداکثر ۱۰۰ خط در هر درخواست');
        if (!is_array($patch) || count($patch) === 0) Response::error(400, 'مقدار ویرایش ارسال نشده');

        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($v) => $v > 0)));
        if (count($ids) === 0) Response::error(400, 'شناسه معتبر ارسال نشده');

        $allowedFields = [
            'dispatch_code', 'name', 'group_name',
            'voltage_kv', 'circuit_count', 'bundle_count',
            'conductor_type', 'length_km', 'circuit_length_km',
            'total_towers', 'tension_towers', 'suspension_towers',
            'plain_terrain', 'semi_mountainous', 'mountainous',
            'commission_year', 'line_supervisor', 'line_expert',
            'owner_org_id', 'contractor_id', 'contract_id', 'status',
            'tower_structure',
        ];
        // v4.3.78: ویرایش گروهی امور بهره‌برداری خطوط (اگر migration اجرا شده باشد)
        if (Helpers::columnExists('lines', 'district_id')) $allowedFields[] = 'district_id';

        $updates = [];
        $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $patch)) {
                $updates[] = "`$field` = ?";
                $params[] = $patch[$field];
            }
        }
        if (!$updates) Response::error(400, 'هیچ فیلد مجازی برای ویرایش ارسال نشده');

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));

        try {
            $pdo->beginTransaction();
            $params = array_merge($params, $ids);
            $stmt = $pdo->prepare("UPDATE `lines` SET " . implode(', ', $updates) . ", updated_at = NOW() WHERE id IN ($idPlaceholders)");
            $stmt->execute($params);
            $updated = $stmt->rowCount();
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error('Lines bulk-update failed', ['error' => $e->getMessage(), 'count' => count($ids)]);
            Response::error(500, 'ویرایش گروهی خطوط ناموفق بود: ' . fa_db_error($e));
        }

        Logger::info('Lines bulk-updated', ['count' => $updated, 'user_id' => $user['id']]);
        Response::success(['updated' => $updated], "{$updated} خط ویرایش شد");
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
            Response::error(500, 'حذف خط ناموفق بود: ' . fa_db_error($e));
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
            'circuit_count', 'bundle_count', 'conductor_type', 'tower_structure',
            'length_km', 'circuit_length_km', 'total_towers', 'tension_towers', 'suspension_towers',
            'plain_terrain', 'semi_mountainous', 'mountainous', 'commission_year',
            'line_supervisor', 'line_expert', 'owner_org_id', 'contractor_id', 'contract_id', 'status',
        ];
        $inserted = 0; $failed = 0; $firstError = ''; $failIndexes = [];
        $statuses = [];
        $errors = [];

        try {
            $pdo->beginTransaction();

            $lineColsBulk = []; foreach ($db->fetchAll("SHOW COLUMNS FROM `lines`") as $cr) if (isset($cr['Field'])) $lineColsBulk[(string)$cr['Field']]=true;
            foreach ($rows as $i => $r) {
                try {
                    if (empty($r['line_code']) || empty($r['name'])) {
                        throw new Exception('کد خط و نام الزامی است');
                    }
                    if ($db->exists('lines', 'line_code = ?', [$r['line_code']])) {
                        throw new Exception("کد خط {$r['line_code']} تکراری است");
                    }

                    $schemaRows = $db->fetchAll("SHOW COLUMNS FROM `lines`");
                    $actual = [];
                    foreach ($schemaRows as $schemaRow) {
                        if (isset($schemaRow['Field'])) $actual[(string)$schemaRow['Field']] = true;
                    }
                    $cols = ['line_code', 'created_at'];
                    $marks = ['?', 'NOW()'];
                    $params = [$r['line_code']];
                    foreach ($allowed as $f) {
                        if (array_key_exists($f, $r) && isset($actual[$f])) {
                            $cols[] = "`$f`";
                            $marks[] = '?';
                            $params[] = ($f === 'status') ? ((in_array((string)$r[$f], ['0','inactive'], true)) ? 'inactive' : 'active') : $r[$f];
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
            Response::error(500, 'ورود انبوه ناموفق بود: ' . fa_db_error($e));
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
        if (empty($ids)) Response::error(400, 'شناسه معتبری برای حذف ارسال نشده');

        $db = Database::getInstance();
        $pdo = $db->getConnection();

        // v4.3.77: خطِ «فعال» قابل حذف نیست — برای امنیت داده، ابتدا باید «غیرفعال» شود.
        // مقدار وضعیت در اسکیماهای مختلف 'active' یا '1' است؛ هر دو پوشش داده می‌شوند.
        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
        $activeStmt = $pdo->prepare("SELECT COUNT(*) FROM `lines` WHERE id IN ($idPlaceholders) AND LOWER(TRIM(COALESCE(status, ''))) IN ('active', '1', 'true')");
        $activeStmt->execute($ids);
        $activeCount = (int) $activeStmt->fetchColumn();
        if ($activeCount > 0) {
            Response::error(409, "حذف انجام نشد.\n\n$activeCount خط انتخاب‌شده وضعیت «فعال» دارد — برای امنیت داده، ابتدا وضعیت را «غیرفعال» کنید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }

        try {
            $pdo->beginTransaction();

            // دکل‌های این خطوط حذف، ارجاع سایر جداول null می‌شود (مطابق حذف تکی)
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
            Response::error(500, 'حذف انبوه ناموفق بود: ' . fa_db_error($e));
        }

        Logger::info('Lines bulk-deleted', ['count' => $deleted, 'user_id' => $user['id']]);
        Response::success(['deleted' => $deleted], "{$deleted} خط حذف شد");
    });

    // لیست دکل‌های یک خط
    $router->get('lines/{id}/towers', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('towers.view');

        $db = Database::getInstance();
        $contractId = Helpers::getContractId();
        $where = "line_id = ? AND status = 'active'";
        $params = [(int) $id];
        if ($contractId === 0) { $where .= ' AND contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND contract_id = ?'; $params[] = $contractId; }
        $rows = $db->fetchAll(
            "SELECT * FROM towers WHERE $where ORDER BY tower_number",
            $params
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
        'contract_id'        => $row['contract_id'] ? (int)$row['contract_id'] : null,
        'contract_title'     => $row['contract_title'] ?? null,
        'dispatch_code'      => $row['dispatch_code'] ?? null,
        'name'               => $row['name'],
        'group_name'         => $row['group_name'] ?? null,
        'voltage_kv'         => $row['voltage_kv'] !== null ? (float) $row['voltage_kv'] : null,
        'circuit_count'      => (int) ($row['circuit_count'] ?? 1),
        'bundle_count'       => $row['bundle_count'] !== null ? (int) $row['bundle_count'] : null,
        'conductor_type'     => $row['conductor_type'] ?? null,
        'tower_structure' => $row['resolved_tower_structure'] ?? ($row['tower_structure'] ?? null),
        'tower_count' => (int)($row['tower_count'] ?? 0),
        'tower_structure_locked' => ((int)($row['tower_count'] ?? 0)) > 0,
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
        'status'          => (string) ($row['status'] ?? 'active'),
        'created_at'         => $row['created_at'] ?? null,
        'updated_at'         => $row['updated_at'] ?? null,
    ];
}
