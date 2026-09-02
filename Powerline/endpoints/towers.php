<?php
/**
 * endpoints/towers.php — مدیریت دکل‌ها
 */

/** ستون‌های واقعی جدول برای سازگاری با Migrationهای نسخه جدید. */
function towerTableColumns(Database $db): array
{
    static $columns = null;
    if ($columns !== null) return $columns;
    $columns = [];
    foreach ($db->fetchAll("SHOW COLUMNS FROM `towers`") as $row) {
        if (isset($row['Field'])) $columns[(string)$row['Field']] = true;
    }
    return $columns;
}

function towerCodeColumn(Database $db): string
{
    $columns = towerTableColumns($db);
    if (isset($columns['tower_type_code'])) return 'tower_type_code';
    if (isset($columns['foundation_type_code'])) return 'foundation_type_code';
    return 'tower_type_code';
}

/** بعد از ایجاد/ویرایش/حذف دکل، ساختار غالب دکل‌های خط را روی جدول خطوط منعکس می‌کند. */
function syncLineTowerStructure(PDO $pdo, ?int $lineId): void
{
    if (!$lineId) return;
    $lineCols = [];
    foreach ($pdo->query("SHOW COLUMNS FROM `lines`")->fetchAll() as $row) {
        if (isset($row['Field'])) $lineCols[(string)$row['Field']] = true;
    }
    $structureCols = isset($lineCols['tower_structure']) ? ['tower_structure'] : [];
    if (!$structureCols) return;

    $stmt = $pdo->prepare("SELECT tower_structure, COUNT(*) AS cnt FROM towers WHERE line_id = ? AND status = 'active' AND tower_structure IS NOT NULL AND tower_structure <> '' GROUP BY tower_structure ORDER BY cnt DESC, tower_structure ASC LIMIT 1");
    $stmt->execute([$lineId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $sets = [];
    $params = [];

    // اگر هیچ دکل فعالِ دارای ساختار باقی نمانده، ساختار قبلی خط را هم پاک کن.
    $structureValue = $row ? ($row['tower_structure'] ?? null) : null;
    $params[] = $structureValue;

    foreach ($structureCols as $col) { $sets[] = "`$col` = ?"; }
    $sets[] = 'updated_at = NOW()';
    $params[] = $lineId;
    $pdo->prepare("UPDATE `lines` SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    
}

function registerTowerRoutes(Router $router): void
{
    // v3.5.1: هندلر «دکل‌های نزدیک» اینجا (قبل از استفاده) تعریف می‌شود —
    // مسیر ثابت towers/nearby باید قبل از مسیر پارامتری towers/{id} ثبت شود،
    // وگرنه «nearby» به‌عنوان {id} گرفته می‌شود و endpoint همیشه 404 می‌دهد
    $towersNearbyHandler = function () {
        Auth::authenticate();
        Auth::requirePermission('towers.view');

        $lat = (float) Helpers::query('lat', 0);
        $lng = (float) Helpers::query('lng', 0);
        $radius = (int) Helpers::query('radius', 5000);  // متر
        $contractId = Helpers::getContractId();

        if (!$lat || !$lng) {
            Response::error(400, 'مختصات lat و lng الزامی است');
        }

        $db = Database::getInstance();
        $rows = $db->fetchAll(
            "SELECT t.*, l.line_code, l.name AS line_name, l.voltage_kv,
                    ST_Distance_Sphere(t.geom, ST_GeomFromText('POINT($lng $lat)', 4326)) AS distance_meters
             FROM towers t
             LEFT JOIN `lines` l ON l.id = t.line_id
             WHERE t.status = 'active'
               AND (
                    ? IS NULL
                    OR (? = 0 AND t.contract_id IS NULL)
                    OR (? > 0 AND t.contract_id = ?)
               )
               AND ST_Distance_Sphere(t.geom, ST_GeomFromText('POINT($lng $lat)', 4326)) <= ?
             ORDER BY distance_meters ASC
             LIMIT 50",
            [$contractId, $contractId, $contractId, $contractId, $radius]
        );

        $data = array_map(function ($row) {
            $formatted = formatTowerRow($row);
            $formatted['distance_meters'] = (float) $row['distance_meters'];
            return $formatted;
        }, $rows);

        Response::success($data);
    };

    // لیست دکل‌ها
    $router->get('towers', function () {
        Auth::authenticate();
        Auth::requirePermission('towers.view');

        $db = Database::getInstance();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $lineId = Helpers::queryInt('line_id');
        $towerType = Helpers::query('tower_type');
        $towerTypeCode = Helpers::query('tower_type_code');
        $contractId = Helpers::getContractId();

        $where = '1=1';
        $params = [];

        if ($contractId === 0) { $where .= ' AND t.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND t.contract_id = ?'; $params[] = $contractId; }

        if (!empty($search)) {
            $where .= ' AND (t.tower_code LIKE ? OR CAST(t.tower_number AS CHAR) LIKE ? OR t.tower_structure LIKE ? OR t.tower_type LIKE ? OR t.line_supervisor LIKE ?)';
            $searchParam = "%$search%";
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
        }

        if ($lineId) {
            $where .= ' AND t.line_id = ?';
            $params[] = $lineId;
        }

        if ($towerType) {
            // tower_type قدیمی صرفاً برای سازگاری با داده‌های قبلی نگه داشته شده است.
            $where .= ' AND t.tower_type = ?';
            $params[] = $towerType;
        }

        if ($towerTypeCode) {
            $codeCol = towerCodeColumn($db);
            $where .= " AND t.`$codeCol` = ?";
            $params[] = $towerTypeCode;
        }

        $total = $db->count('towers t', $where, $params);

        $sql = "SELECT t.*, l.line_code, l.name AS line_name, l.voltage_kv, ct.title AS contract_title
                FROM towers t
                LEFT JOIN `lines` l ON l.id = t.line_id
                LEFT JOIN contracts ct ON ct.id = t.contract_id
                WHERE $where
                ORDER BY t.id DESC
                LIMIT $pageSize OFFSET $offset";

        $rows = $db->fetchAll($sql, $params);

        $data = array_map('formatTowerRow', $rows);
        Response::paginated($data, $page, $pageSize, $total);
    });

    // v3.5.1: مسیر ثابت nearby باید قبل از مسیر پارامتری {id} ثبت شود (در انتها تعریف شده و اینجا وصل می‌شود)
    $router->get('towers/nearby', $towersNearbyHandler);

    // جزئیات یک دکل
    $router->get('towers/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('towers.view');

        $db = Database::getInstance();
        $row = $db->fetchOne(
            "SELECT t.*, l.line_code, l.name AS line_name, l.voltage_kv, ct.title AS contract_title
             FROM towers t
             LEFT JOIN `lines` l ON l.id = t.line_id
             LEFT JOIN contracts ct ON ct.id = t.contract_id
             WHERE t.id = ?",
            [(int) $id]
        );

        if (!$row) {
            Response::error(404, 'دکل پیدا نشد');
        }

        Response::success(formatTowerRow($row));
    });

    // ایجاد دکل
    $router->post('towers', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('towers.create');

        $body = Helpers::getJsonBody();

        $required = ['tower_number', 'tower_structure', 'tower_type'];
        foreach ($required as $field) {
            if (empty($body[$field])) {
                Response::error(400, "فیلد '$field' الزامی است");
            }
        }

        $db = Database::getInstance();

        $lineId = !empty($body['line_id']) ? (int) $body['line_id'] : null;
        $line = null;

        // بررسی وجود خط (در صورت ارسال)
        if ($lineId !== null) {
            $line = $db->fetchOne("SELECT id, line_code, line_supervisor, tower_structure FROM `lines` WHERE id = ?", [$lineId]);
            if (!$line) {
                Response::error(404, 'خط مورد نظر پیدا نشد');
            }
        }

        // v2.1.0: کد دکل خودکار = کد خط + شماره سه‌رقمی (مثال: 61404-001)
        $towerCode = trim($body['tower_code'] ?? '');
        if ($towerCode === '' ) {
            if ($line === null || empty($body['tower_number'])) {
                Response::error(400, 'برای تولید خودکار کد دکل، خط و شماره دکل الزامی است (یا کد را دستی ارسال کنید)');
            }
            $towerCode = $line['line_code'] . '-' . str_pad((string) (int) $body['tower_number'], 3, '0', STR_PAD_LEFT);
        }

        // بررسی تکراری نبودن کد دکل در خط (فقط وقتی خط مشخص است)
        if ($lineId !== null && $db->exists('towers', 'line_id = ? AND tower_code = ?', [$lineId, $towerCode])) {
            Response::error(409, 'کد دکل در این خط قبلاً ثبت شده');
        }

        $dbColumns = towerTableColumns($db);
        $towerCodeColumn = towerCodeColumn($db);
        
        // GPS
        $gpsLat = $body['gps_lat'] ?? null;
        $gpsLng = $body['gps_lng'] ?? null;
        $geomWkt = 'POINT EMPTY';

        if ($gpsLat !== null && $gpsLng !== null) {
            if (!Helpers::isValidGPS((float) $gpsLat, (float) $gpsLng)) {
                Response::error(400, 'مختصات GPS نامعتبر است');
            }
            $geomWkt = "POINT($gpsLng $gpsLat)";
        }

        // سرپرست خط: اگر ارسال نشده بود از خط متناظر ارث می‌رسد
        $supervisor = $body['line_supervisor'] ?? ($line['line_supervisor'] ?? null);

        $columns = ['line_id','contract_id','tower_code','tower_number'];
        $values = ['?','?','?'];
        $params = [$lineId, !empty($body['contract_id']) ? (int)$body['contract_id'] : null, $towerCode, $body['tower_number']];
        $columns[]='tower_structure'; $values[]='?'; $params[]=$body['tower_structure'];
        $columns[]='tower_type'; $values[]='?'; $params[]=$body['tower_type'];
        $columns[]=$towerCodeColumn; $values[]='?'; $params[]=$body['tower_type_code'] ?? null;
        foreach (['base_height_a','base_height_b','base_height_c','base_height_d','insulator_r1','insulator_s1','insulator_t1','insulator_r2','insulator_s2','insulator_t2','insulator_count_r1','insulator_count_s1','insulator_count_t1','insulator_count_r2','insulator_count_s2','insulator_count_t2'] as $f) { $columns[]=$f; $values[]='?'; $params[]=$body[$f] ?? null; }
        $columns[]='gps_lat'; $values[]='?'; $params[]=$gpsLat;
        $columns[]='gps_lng'; $values[]='?'; $params[]=$gpsLng;
        $columns[]='geom'; $values[]='ST_GeomFromText(?)'; $params[]=$geomWkt;
        $columns[]='line_supervisor'; $values[]='?'; $params[]=$supervisor;
        if (isset($dbColumns['status'])) { $columns[]='status'; $values[]='1'; }
        if (isset($dbColumns['created_at'])) { $columns[]='created_at'; $values[]='NOW()'; }
        $quotedCols = implode(', ', array_map(fn($c) => "`$c`", $columns));
        $sql = "INSERT INTO towers (" . $quotedCols . ") VALUES (" . implode(', ', $values) . ")";
        try {
            $db->execute($sql, $params);
            if ($lineId !== null) { syncLineTowerStructure($db->getConnection(), $lineId); }
        } catch (\PDOException $e) {
            $message = $e->getMessage();
            if (strpos($message, 'Duplicate') !== false || strpos($message, 'uniq_line_tower') !== false) Response::error(409, 'کد دکل در این خط قبلاً ثبت شده است.');
            Logger::error('Tower create failed', ['error' => $message]);
            Response::error(500, 'ثبت دکل در دیتابیس انجام نشد: ' . $message);
        }

        $newId = (int) $db->lastInsertId();
        Logger::info('Tower created', ['tower_id' => $newId, 'user_id' => $user['id']]);
        Response::success(['id' => $newId, 'tower_code' => $towerCode], 'دکل با موفقیت ایجاد شد', 201);
    });

    // ویرایش دکل
    $router->put('towers/{id}', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('towers.update');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        $existing = $db->fetchOne(
            "SELECT t.id, t.line_id, t.tower_number, l.line_code
             FROM towers t LEFT JOIN `lines` l ON l.id = t.line_id
             WHERE t.id = ?",
            [(int) $id]
        );
        if (!$existing) {
            Response::error(404, 'دکل پیدا نشد');
        }

        // v2.1.0: فیلدهای قابل ویرایش بر اساس ساختار اکسل رسمی
        $codeField = towerCodeColumn($db);
        $allowedFields = [
            'tower_number', 'tower_structure', 'tower_type', $codeField,
            'base_height_a', 'base_height_b', 'base_height_c', 'base_height_d',
            'insulator_r1', 'insulator_s1', 'insulator_t1', 'insulator_r2', 'insulator_s2', 'insulator_t2',
            'insulator_count_r1', 'insulator_count_s1', 'insulator_count_t1',
            'insulator_count_r2', 'insulator_count_s2', 'insulator_count_t2',
            'line_supervisor', 'contract_id', 'status',
        ];

        $updates = [];
        $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $body)) {
                $updates[] = "`$field` = ?";
                $params[] = $body[$field];
            }
        }

        // اتصال دکل به خط (یا قطع اتصال با null)
        $effectiveLineId = $existing['line_id'];
        if (array_key_exists('line_id', $body)) {
            $newLineId = !empty($body['line_id']) ? (int) $body['line_id'] : null;
            if ($newLineId !== null && !$db->exists('lines', 'id = ?', [$newLineId])) {
                Response::error(404, 'خط مورد نظر پیدا نشد');
            }
            $updates[] = "line_id = ?";
            $params[] = $newLineId;
            $effectiveLineId = $newLineId;
        }

        // v2.1.0: اگر خط یا شماره دکل تغییر کرده باشد، کد دکل دوباره تولید می‌شود (خط‌کد-شماره۳رقمی)
        $effectiveNumber = array_key_exists('tower_number', $body) ? $body['tower_number'] : $existing['tower_number'];
        if ((array_key_exists('line_id', $body) || array_key_exists('tower_number', $body)) && $effectiveLineId && $effectiveNumber) {
            $lineRow = $db->fetchOne("SELECT line_code FROM `lines` WHERE id = ?", [(int) $effectiveLineId]);
            if ($lineRow) {
                $updates[] = "tower_code = ?";
                $params[] = $lineRow['line_code'] . '-' . str_pad((string) (int) $effectiveNumber, 3, '0', STR_PAD_LEFT);
                $dbColumns = towerTableColumns($db);
            }
        }

        // اگه GPS جدید داده شده
        if (isset($body['gps_lat']) && isset($body['gps_lng'])) {
            if (!Helpers::isValidGPS((float) $body['gps_lat'], (float) $body['gps_lng'])) {
                Response::error(400, 'مختصات GPS نامعتبر است');
            }
            $updates[] = "gps_lat = ?";
            $params[] = $body['gps_lat'];
            $updates[] = "gps_lng = ?";
            $params[] = $body['gps_lng'];
            $updates[] = "geom = ST_GeomFromText(?)";
            $params[] = "POINT({$body['gps_lng']} {$body['gps_lat']})";
        }

        if (empty($updates)) {
            Response::error(400, 'هیچ فیلدی برای ویرایش ارسال نشده');
        }

        $updates[] = 'updated_at = NOW()';
        $params[] = (int) $id;

        $sql = "UPDATE towers SET " . implode(', ', $updates) . " WHERE id = ?";
        $db->execute($sql, $params);
        syncLineTowerStructure($db->getConnection(), $effectiveLineId ? (int)$effectiveLineId : null);

        Logger::info('Tower updated', ['tower_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'دکل با موفقیت ویرایش شد');
    });

    // ویرایش گروهی دکل‌ها — v4.3.32: حداکثر ۱۰۰ دکل در هر درخواست و یک UPDATE تراکنشی
    // بدنه: {"ids":[...], "patch":{"tower_structure":"..."}}
    $router->post('towers/bulk-update', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('towers.update');

        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        $patch = $body['patch'] ?? [];

        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 100) Response::error(400, 'حداکثر ۱۰۰ دکل در هر درخواست');
        if (!is_array($patch) || count($patch) === 0) Response::error(400, 'مقدار ویرایش ارسال نشده');

        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($v) => $v > 0)));
        if (count($ids) === 0) Response::error(400, 'شناسه معتبر ارسال نشده');

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $allowedFields = [
            'tower_structure', 'tower_type', 'tower_type_code',
            'insulator_r1', 'insulator_s1', 'insulator_t1',
            'insulator_r2', 'insulator_s2', 'insulator_t2',
            'line_supervisor', 'contract_id', 'status', 'line_id',
        ];

        // line_id باید به خط واقعی اشاره کند (اتصال گروهی دکل‌ها به خط)
        if (array_key_exists('line_id', $patch)) {
            $lineIdVal = $patch['line_id'];
            if ($lineIdVal !== null && (!$lineIdVal || (int)$lineIdVal <= 0)) {
                Response::error(400, 'شناسه خط نامعتبر است');
            }
            if ($lineIdVal !== null) {
                $lineExists = $db->fetchOne('SELECT id FROM `lines` WHERE id = ?', [(int)$lineIdVal]);
                if (!$lineExists) Response::error(400, 'خط موردنظر پیدا نشد');
            }
        }

        $updates = [];
        $params = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $patch)) {
                $updates[] = "`$field` = ?";
                $params[] = $patch[$field];
            }
        }
        if (!$updates) Response::error(400, 'هیچ فیلد مجازی برای ویرایش ارسال نشده');

        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
        $affectedLines = [];
        if (array_key_exists('line_id', $patch)) {
            // خطوط قدیمی دکل‌های جابه‌جاشده + خط مقصد؛ ساختار هر دو باید از نو محاسبه شود
            foreach ($db->fetchAll("SELECT DISTINCT line_id FROM towers WHERE id IN ($idPlaceholders) AND line_id IS NOT NULL", $ids) as $lr) {
                $affectedLines[(int)$lr['line_id']] = true;
            }
            if ($patch['line_id'] !== null) $affectedLines[(int)$patch['line_id']] = true;
        }
        if (array_key_exists('tower_structure', $patch)) {
            $lineRows = $db->fetchAll("SELECT DISTINCT line_id FROM towers WHERE id IN ($idPlaceholders) AND line_id IS NOT NULL", $ids);
            foreach ($lineRows as $lr) { $affectedLines[(int)$lr['line_id']] = true; }
        }

        try {
            $pdo->beginTransaction();
            $params = array_merge($params, $ids);
            $stmt = $pdo->prepare("UPDATE `towers` SET " . implode(', ', $updates) . ", updated_at = NOW() WHERE id IN ($idPlaceholders)");
            $stmt->execute($params);
            $updated = $stmt->rowCount();
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error('Towers bulk-update failed', ['error' => $e->getMessage(), 'count' => count($ids)]);
            Response::error(500, 'ویرایش گروهی دکل‌ها ناموفق بود: ' . $e->getMessage());
        }

        foreach (array_keys($affectedLines) as $lineId) {
            syncLineTowerStructure($pdo, (int)$lineId);
        }

        Logger::info('Towers bulk-updated', ['count' => $updated, 'user_id' => $user['id']]);
        Response::success(['updated' => $updated], "{$updated} دکل ویرایش شد");
    });

    // حذف دکل (v2.0.0: HARD DELETE — هماهنگ با رفتار خطوط)
    $router->delete('towers/{id}', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('towers.delete');

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $towerId = (int) $id;

        $existing = $db->fetchOne("SELECT id, line_id FROM towers WHERE id = ?", [$towerId]);
        if (!$existing) {
            Response::error(404, 'دکل پیدا نشد');
        }

        try {
            $pdo->beginTransaction();

            // ارجاع‌های سمت عیوب/بازدید/دستورکار/حوادث null می‌شود تا سابقه حفظ شود
            foreach (['defects', 'inspections', 'work_orders', 'safety_incidents'] as $tbl) {
                $pdo->prepare("UPDATE `$tbl` SET tower_id = NULL WHERE tower_id = ?")->execute([$towerId]);
            }

            $stmt = $pdo->prepare("DELETE FROM towers WHERE id = ?");
            $stmt->execute([$towerId]);

            $pdo->commit();
            syncLineTowerStructure($pdo, $existing['line_id'] !== null ? (int)$existing['line_id'] : null);
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Logger::error("Tower delete failed", ['tower_id' => $towerId, 'error' => $e->getMessage()]);
            Response::error(500, 'حذف دکل ناموفق بود: ' . $e->getMessage());
        }

        Logger::info('Tower hard-deleted', ['tower_id' => $towerId, 'user_id' => $user['id']]);
        Response::success(null, 'دکل با موفقیت از دیتابیس حذف شد');
    });

    // حذف انبوه دکل‌ها — v2.2.0: یک درخواست برای هر تعداد ردیف
    // بدنه: {"ids": [1, 2, 3, ...]} — خروجی: تعداد حذف‌شده‌ها
    $router->post('towers/bulk-delete', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('towers.delete');

        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];

        if (!is_array($ids) || count($ids) === 0) {
            Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        }
        if (count($ids) > 5000) {
            Response::error(400, 'حداکثر ۵۰۰۰ ردیف در هر درخواست');
        }

        $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));

        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));

        try {
            $pdo->beginTransaction();

            foreach (['defects', 'inspections', 'work_orders', 'safety_incidents'] as $tbl) {
                $pdo->prepare("UPDATE `$tbl` SET tower_id = NULL WHERE tower_id IN ($idPlaceholders)")->execute($ids);
            }

            $stmt = $pdo->prepare("DELETE FROM towers WHERE id IN ($idPlaceholders)");
            $stmt->execute($ids);
            $deleted = $stmt->rowCount();

            $pdo->commit();
            $affectedLines = [];
            foreach ($linesCache as $lid => $lr) { if ($lid) $affectedLines[] = (int)$lid; }
            foreach ($affectedLines as $lid) syncLineTowerStructure($pdo, $lid);
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Logger::error("Towers bulk-delete failed", ['error' => $e->getMessage()]);
            Response::error(500, 'حذف انبوه ناموفق بود: ' . $e->getMessage());
        }

        Logger::info('Towers bulk-deleted', ['count' => $deleted, 'user_id' => $user['id']]);
        Response::success(['deleted' => $deleted], "{$deleted} دکل حذف شد");
    });

    // ورود انبوه دکل‌ها — v2.3.0: آرایه‌ای از ردیف‌ها در یک تراکنش
    // بدنه: {"rows": [{...فیلدهای دکل..., "id": عدد (اگر ویرایش)}]} — حداکثر ۵۰۰ ردیف در هر درخواست
    $router->post('towers/bulk-import', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('towers.create');

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

        // کش خطوط برای تولید کد دکل و ارث‌بری سرپرست
        // v3.2.2: علاوه بر id، با «کد خط» و «نام نرمال‌شده» هم resolve می‌شود تا import مستقل از کش کلاینت کار کند
        $normLineName = function ($s): string {
            $s = trim((string) $s);
            $s = str_replace("\xE2\x80\x8C", ' ', $s); // نیم‌فاصله → فاصله
            $s = str_replace(['ي', 'ك'], ['ی', 'ک'], $s); // عربی → فارسی
            $s = preg_replace('/\s+/u', ' ', $s);
            return mb_strtolower($s, 'UTF-8');
        };
        $linesCache = [];
        $linesByCode = [];
        $linesByName = [];
        foreach ($db->fetchAll("SELECT id, line_code, line_supervisor, name FROM `lines`") as $lr) {
            $linesCache[(int) $lr['id']] = $lr;
            if (!empty($lr['line_code'])) $linesByCode[trim((string) $lr['line_code'])] = $lr;
            if (!empty($lr['name'])) $linesByName[$normLineName($lr['name'])] = $lr;
        }
        $getLine = function ($lineId) use (&$linesCache) {
            if ($lineId === null) return null;
            return $linesCache[(int) $lineId] ?? null;
        };
        // v3.2.2: resolve خط از ردیف اکسل — اولویت: id سپس کد خط سپس نام نرمال‌شده
        $resolveLine = function ($r) use (&$linesCache, &$linesByCode, &$linesByName, $normLineName) {
            $lid = !empty($r['line_id']) ? (int) $r['line_id'] : null;
            if ($lid && isset($linesCache[$lid])) return $linesCache[$lid];
            $code = isset($r['line_code']) ? trim((string) $r['line_code']) : '';
            if ($code !== '' && isset($linesByCode[$code])) return $linesByCode[$code];
            $name = isset($r['line_name']) ? trim((string) $r['line_name']) : '';
            if ($name !== '') {
                $n = $normLineName($name);
                if (isset($linesByName[$n])) return $linesByName[$n];
            }
            return null;
        };

        // v2.4.0: کش کدهای موجود هر خط — به‌جای کوئری exists برای هر ردیف، یک SELECT در هر خط
        $lineCodesCache = [];
        $getLineCodes = function ($lineId) use ($db, &$lineCodesCache) {
            if ($lineId === null) return [];
            if (!isset($lineCodesCache[$lineId])) {
                $rows = $db->fetchAll("SELECT tower_code FROM towers WHERE line_id = ?", [(int) $lineId]);
                $lineCodesCache[$lineId] = array_column($rows, 'tower_code');
            }
            return $lineCodesCache[$lineId];
        };

        $inserted = 0; $updated = 0; $failed = 0;
        $firstError = '';
        $failIndexes = [];
        $statuses = [];
        $errors = [];

        try {
            $pdo->beginTransaction();

            $towerColumns = towerTableColumns($db);
            $towerCodeField = towerCodeColumn($db);
            $insertTower = function (array $d) use ($pdo, $towerColumns, $towerCodeField) {
                $cols = ['line_id','contract_id','tower_code','tower_number'];
                $vals = ['?','?','?','?']; $params = [$d['line_id'], $d['contract_id'] ?? null, $d['tower_code'], $d['tower_number']];
                if (isset($towerColumns['tower_type'])) { $cols[]='tower_type'; $vals[]='?'; $params[]=$d['tower_type'] ?? null; }
                $cols[]='tower_structure'; $vals[]='?'; $params[]=$d['tower_structure'] ?? null;
                $cols[]=$towerCodeField; $vals[]='?'; $params[]=$d['tower_type_code'] ?? null;
                foreach (['base_height_a','base_height_b','base_height_c','base_height_d','insulator_r1','insulator_s1','insulator_t1','insulator_r2','insulator_s2','insulator_t2','insulator_count_r1','insulator_count_s1','insulator_count_t1','insulator_count_r2','insulator_count_s2','insulator_count_t2','gps_lat','gps_lng','line_supervisor'] as $f) {
                    if (isset($towerColumns[$f])) { $cols[]=$f; $vals[]='?'; $params[]=$d[$f] ?? null; }
                }
                if (isset($towerColumns['geom'])) { $cols[]='geom'; $vals[]='ST_GeomFromText(?)'; $params[]=$d['geom_wkt'] ?? 'POINT EMPTY'; }
                if (isset($towerColumns['status'])) { $cols[]='status'; $vals[]='1'; }
                if (isset($towerColumns['created_at'])) { $cols[]='created_at'; $vals[]='NOW()'; }
                $sql='INSERT INTO `towers` ('.implode(', ', array_map(fn($c)=>"`$c`",$cols)).') VALUES ('.implode(', ',$vals).')';
                $pdo->prepare($sql)->execute($params);
            };

            $updateTower = function (array $d) use ($pdo, $towerColumns, $towerCodeField) {
                $sets=[]; $params=[];
                if (isset($towerColumns['line_id'])) { $sets[]='`line_id`=?'; $params[]=$d['line_id']; }
                if (isset($towerColumns['tower_number'])) { $sets[]='`tower_number`=?'; $params[]=$d['tower_number']; }
                if (isset($towerColumns['tower_structure'])) { $sets[]='`tower_structure`=?'; $params[]=$d['tower_structure'] ?? null; }
                if (isset($towerColumns[$towerCodeField])) { $sets[]="`$towerCodeField`=?"; $params[]=$d['tower_type_code'] ?? null; }
                if (isset($towerColumns['tower_type'])) { $sets[]='`tower_type`=?'; $params[]=$d['tower_type'] ?? null; }
                foreach (['base_height_a','base_height_b','base_height_c','base_height_d','insulator_r1','insulator_s1','insulator_t1','insulator_r2','insulator_s2','insulator_t2','insulator_count_r1','insulator_count_s1','insulator_count_t1','insulator_count_r2','insulator_count_s2','insulator_count_t2','gps_lat','gps_lng','line_supervisor'] as $f) {
                    if (isset($towerColumns[$f])) { $sets[]="`$f`=?"; $params[]=$d[$f] ?? null; }
                }
                if (isset($towerColumns['geom'])) { $sets[]='`geom`=ST_GeomFromText(?)'; $params[]=$d['geom_wkt'] ?? 'POINT EMPTY'; }
                
                if (isset($towerColumns['updated_at'])) { $sets[]='`updated_at`=NOW()'; }
                if (!$sets) return;
                $params[]=$d['id'];
                $pdo->prepare('UPDATE `towers` SET '.implode(', ',$sets).' WHERE `id`=?')->execute($params);
            };

            foreach ($rows as $i => $r) {
                try {
                    // v3.2.2: خط با id یا کد یا نام نرمال‌شده resolve می‌شود — پیام راهنما اگر پیدا نشد
                    $lineId = !empty($r['line_id']) ? (int) $r['line_id'] : null;
                    $line = $resolveLine($r);
                    if ($lineId !== null && !$line) {
                        $ref = $r['line_code'] ?? $r['line_name'] ?? $lineId;
                        throw new Exception("خط «{$ref}» پیدا نشد — ابتدا خطوط را در بخش «خطوط انتقال» وارد کنید");
                    }
                    $number = isset($r['tower_number']) && $r['tower_number'] !== '' ? (int) $r['tower_number'] : null;
                    if ($number === null) throw new Exception('شماره دکل الزامی است');

                    // v3.2.2: اگر خط با کد/نام resolve شد، line_id هم از همانجا برداشته می‌شود
                    if ($line) $lineId = (int) $line['id'];

                    $structure = $r['tower_structure'] ?? 'مشبک فلزی';
                    $towerType = $typeByStructure[$structure] ?? 'other';
                    $supervisor = array_key_exists('line_supervisor', $r) ? $r['line_supervisor'] : ($line['line_supervisor'] ?? null);

                    $gpsLat = isset($r['gps_lat']) && $r['gps_lat'] !== '' && $r['gps_lat'] !== null ? (float) $r['gps_lat'] : null;
                    $gpsLng = isset($r['gps_lng']) && $r['gps_lng'] !== '' && $r['gps_lng'] !== null ? (float) $r['gps_lng'] : null;
                    if ($gpsLat !== null && $gpsLng !== null && !Helpers::isValidGPS($gpsLat, $gpsLng)) {
                        throw new Exception('مختصات GPS نامعتبر');
                    }
                    $geomWkt = ($gpsLat !== null && $gpsLng !== null) ? "POINT($gpsLng $gpsLat)" : 'POINT EMPTY';

                    $n = fn($k) => (isset($r[$k]) && $r[$k] !== '' && $r[$k] !== null) ? $r[$k] : null;

                    // اگر id داشته باشد → ویرایش، وگرنه → درج با کد خودکار
                    if (!empty($r['id'])) {
                        $code = $line ? $line['line_code'] . '-' . str_pad((string) $number, 3, '0', STR_PAD_LEFT) : null;
                        $updateTower([
                            'id'=>(int)$r['id'], 'line_id'=>$lineId, 'tower_number'=>$number,
                            'tower_structure'=>$structure, 'tower_type'=>$towerType, 'tower_type_code'=>$n('tower_type_code'),
                            'base_height_a'=>$n('base_height_a'), 'base_height_b'=>$n('base_height_b'), 'base_height_c'=>$n('base_height_c'), 'base_height_d'=>$n('base_height_d'),
                            'insulator_r1'=>$n('insulator_r1'), 'insulator_s1'=>$n('insulator_s1'), 'insulator_t1'=>$n('insulator_t1'),
                            'insulator_r2'=>$n('insulator_r2'), 'insulator_s2'=>$n('insulator_s2'), 'insulator_t2'=>$n('insulator_t2'),
                            'insulator_count_r1'=>$n('insulator_count_r1'), 'insulator_count_s1'=>$n('insulator_count_s1'), 'insulator_count_t1'=>$n('insulator_count_t1'),
                            'insulator_count_r2'=>$n('insulator_count_r2'), 'insulator_count_s2'=>$n('insulator_count_s2'), 'insulator_count_t2'=>$n('insulator_count_t2'),
                            'gps_lat'=>$gpsLat, 'gps_lng'=>$gpsLng, 'geom_wkt'=>$geomWkt, 'line_supervisor'=>$supervisor,
                        ]);
                        // کد دکل هم اگر خط مشخص است بازتولید شود
                        if ($code) {
                            $pdo->prepare("UPDATE towers SET tower_code = ? WHERE id = ?")->execute([$code, (int) $r['id']]);
                        }
                        $updated++; $statuses[] = 'updated'; $errors[] = null;
                    } else {
                        if (!$line) {
                            // v3.2.2: پیام راهنما — بیشترین علت خطا: خطوط هنوز import نشده‌اند
                            $ref = $r['line_name'] ?? $r['line_code'] ?? '';
                            throw new Exception($ref !== ''
                                ? "نام/کد خط «{$ref}» با هیچ خط ثبت‌شده‌ای مطابقت ندارد — ابتدا اکسل خطوط را در بخش «خطوط انتقال» وارد کنید"
                                : 'ستون خط (نام خط یا کد خط) در فایل خالی است — ابتدا خطوط را در بخش «خطوط انتقال» وارد کنید');
                        }
                        $code = $line['line_code'] . '-' . str_pad((string) $number, 3, '0', STR_PAD_LEFT);
                        // v2.4.0: چک تکراری از کش درون‌حافظه‌ای (بدون کوئری اضافه در هر ردیف)
                        if (in_array($code, $getLineCodes($lineId), true)) {
                            throw new Exception("کد دکل {$code} تکراری است");
                        }
                        $lineCodesCache[(int) $lineId][] = $code;
                        $insertTower([
                            'line_id'=>$lineId, 'contract_id'=>($r['contract_id'] ?? null) !== '' ? ($r['contract_id'] ?? null) : null, 'tower_code'=>$code, 'tower_number'=>$number, 'tower_type'=>$towerType,
                            'tower_structure'=>$structure, 'tower_type_code'=>$n('tower_type_code'), 'base_height_a'=>$n('base_height_a'), 'base_height_b'=>$n('base_height_b'),
                            'base_height_c'=>$n('base_height_c'), 'base_height_d'=>$n('base_height_d'),
                            'insulator_r1'=>$n('insulator_r1'), 'insulator_s1'=>$n('insulator_s1'), 'insulator_t1'=>$n('insulator_t1'),
                            'insulator_r2'=>$n('insulator_r2'), 'insulator_s2'=>$n('insulator_s2'), 'insulator_t2'=>$n('insulator_t2'),
                            'insulator_count_r1'=>$n('insulator_count_r1'), 'insulator_count_s1'=>$n('insulator_count_s1'), 'insulator_count_t1'=>$n('insulator_count_t1'),
                            'insulator_count_r2'=>$n('insulator_count_r2'), 'insulator_count_s2'=>$n('insulator_count_s2'), 'insulator_count_t2'=>$n('insulator_count_t2'),
                            'gps_lat'=>$gpsLat, 'gps_lng'=>$gpsLng, 'geom_wkt'=>$geomWkt, 'line_supervisor'=>$supervisor,
                        ]);
                        $inserted++; $statuses[] = 'inserted'; $errors[] = null;
                    }
                } catch (Exception $e) {
                    $failed++;
                    $failIndexes[] = $i; $statuses[] = 'failed';
                    $errors[] = $e->getMessage();
                    if ($firstError === '') $firstError = $e->getMessage();
                }
            }

            $pdo->commit();
            // بعد از import انبوه، ساختار غالب هر خط مجدداً محاسبه شود.
            foreach (array_keys($lineCodesCache) as $syncLineId) {
                try { syncLineTowerStructure($pdo, (int)$syncLineId); } catch (Throwable $syncError) { Logger::error('Tower bulk line sync failed', ['line_id'=>(int)$syncLineId, 'error'=>$syncError->getMessage()]); }
            }
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error("Towers bulk-import failed", ['error' => $e->getMessage()]);
            Response::error(500, 'ورود انبوه ناموفق بود: ' . $e->getMessage());
        }

        Logger::info('Towers bulk-import', ['inserted' => $inserted, 'updated' => $updated, 'failed' => $failed, 'user_id' => $user['id']]);
        Response::success([
            'inserted' => $inserted,
            'updated' => $updated,
            'failed' => $failed,
            'first_error' => $firstError,
            'fail_indexes' => $failIndexes,
            'errors' => $errors,
            'statuses' => $statuses,
        ], "درج: {$inserted} | ویرایش: {$updated} | خطا: {$failed}");
    });

    // v3.5.1: هندلر towers/nearby به ابتدای همین تابع منتقل شد (باید قبل از towers/{id} ثبت شود)
}

/**
 * فرمت‌بندی ردیف دکل — v2.1.0: ساختار بر اساس اکسل رسمی (بدون فیلدهای حذف‌شده)
 */
function formatTowerRow(array $row): array
{
    $num = fn($v) => $v !== null ? (float) $v : null;
    $int = fn($v) => $v !== null ? (int) $v : null;

    return [
        'id'                => (int) $row['id'],
        'line_id'           => $row['line_id'] !== null ? (int) $row['line_id'] : null,
        'line_code'         => $row['line_code'] ?? null,
        'line_name'         => $row['line_name'] ?? null,
        // v2.6.0: ولتاژ خط برای رنگ‌بندی نام خط در جدول دکل‌ها
        'voltage_kv'        => isset($row['voltage_kv']) ? (int) $row['voltage_kv'] : null,
        'tower_code'        => $row['tower_code'],
        'contract_id'       => $row['contract_id'] ? (int) $row['contract_id'] : null,
        'contract_title'    => $row['contract_title'] ?? null,
        'tower_number'      => $int($row['tower_number']),
        'tower_type'        => $row['tower_type'] ?? null,
        'tower_structure'   => $row['tower_structure'] ?? null,
        'tower_type_code'   => $row['tower_type_code'] ?? null,
        'base_height_a'     => $num($row['base_height_a'] ?? null),
        'base_height_b'     => $num($row['base_height_b'] ?? null),
        'base_height_c'     => $num($row['base_height_c'] ?? null),
        'base_height_d'     => $num($row['base_height_d'] ?? null),
        'insulator_r1'      => $row['insulator_r1'] ?? null,
        'insulator_s1'      => $row['insulator_s1'] ?? null,
        'insulator_t1'      => $row['insulator_t1'] ?? null,
        'insulator_r2'      => $row['insulator_r2'] ?? null,
        'insulator_s2'      => $row['insulator_s2'] ?? null,
        'insulator_t2'      => $row['insulator_t2'] ?? null,
        'insulator_count_r1' => $int($row['insulator_count_r1'] ?? null),
        'insulator_count_s1' => $int($row['insulator_count_s1'] ?? null),
        'insulator_count_t1' => $int($row['insulator_count_t1'] ?? null),
        'insulator_count_r2' => $int($row['insulator_count_r2'] ?? null),
        'insulator_count_s2' => $int($row['insulator_count_s2'] ?? null),
        'insulator_count_t2' => $int($row['insulator_count_t2'] ?? null),
        'gps_lat'           => $num($row['gps_lat'] ?? null),
        'gps_lng'           => $num($row['gps_lng'] ?? null),
        'line_supervisor'   => $row['line_supervisor'] ?? null,
        'status'          => (string) $row['status'],
        'created_at'        => $row['created_at'] ?? null,
        'updated_at'        => $row['updated_at'] ?? null,
    ];
}
