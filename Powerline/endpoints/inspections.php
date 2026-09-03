<?php
/**
 * endpoints/inspections.php — مدیریت بازدیدها
 */

function registerInspectionRoutes(Router $router): void
{
    // لیست بازدیدها
    $router->get('inspections', function () {
        Auth::authenticate();
        Auth::requirePermission('inspections.view');

        $db = Database::getInstance();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $contractId = Helpers::getContractId();
        $status = Helpers::query('status');
        $lineId = Helpers::queryInt('line_id');
        $towerId = Helpers::queryInt('tower_id');

        $where = '1=1';
        $params = [];

        if ($contractId === 0) { $where .= ' AND i.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND i.contract_id = ?'; $params[] = $contractId; }

        if (!empty($search)) {
            $where .= ' AND (i.inspection_code LIKE ? OR i.notes LIKE ?)';
            $searchParam = "%$search%";
            $params[] = $searchParam;
            $params[] = $searchParam;
        }

        if ($status) {
            $where .= ' AND i.status = ?';
            $params[] = $status;
        }

        if ($lineId) {
            $where .= ' AND i.line_id = ?';
            $params[] = $lineId;
        }

        if ($towerId) {
            $where .= ' AND i.tower_id = ?';
            $params[] = $towerId;
        }

        $countSql = "SELECT COUNT(*) FROM inspections i WHERE $where";
        $stmt = $db->getConnection()->prepare($countSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        // v4.3.78: کاربر اموردار فقط بازدیدهای امور خودش را می‌بیند + نام امور
        $where .= Helpers::districtWhere('i', 'inspections', $params);
        $disJoin = Helpers::districtJoin('i', 'inspections');
        $disSel = Helpers::districtSelect();
        $sql = "SELECT i.*, c.title AS contract_title, l.line_code, l.name AS line_name, t.tower_code$disSel,
                       p.first_name AS inspector_first, p.last_name AS inspector_last
                FROM inspections i
                LEFT JOIN `lines` l ON l.id = i.line_id
                LEFT JOIN towers t ON t.id = i.tower_id
                LEFT JOIN contracts c ON c.id = i.contract_id
                LEFT JOIN personnel p ON p.id = i.inspector_id
                $disJoin
                WHERE $where
                ORDER BY i.id DESC
                LIMIT $pageSize OFFSET $offset";

        $rows = $db->fetchAll($sql, $params);
        $data = array_map('formatInspectionRow', $rows);

        Response::paginated($data, $page, $pageSize, $total);
    });

    // جزئیات یک بازدید
    $router->get('inspections/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('inspections.view');

        $db = Database::getInstance();
        $row = $db->fetchOne(
            "SELECT i.*, c.title AS contract_title, l.line_code, l.name AS line_name, t.tower_code,
                    p.first_name AS inspector_first, p.last_name AS inspector_last
             FROM inspections i
             LEFT JOIN `lines` l ON l.id = i.line_id
             LEFT JOIN towers t ON t.id = i.tower_id
             LEFT JOIN contracts c ON c.id = i.contract_id
             LEFT JOIN personnel p ON p.id = i.inspector_id
             WHERE i.id = ?",
            [(int) $id]
        );

        if (!$row) {
            Response::error(404, 'بازدید پیدا نشد');
        }

        Response::success(formatInspectionRow($row));
    });

    // ثبت بازدید جدید
    $router->post('inspections', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('inspections.create');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        if (empty($body['inspection_date'])) {
            Response::error(400, 'تاریخ بازدید الزامی است');
        }

        $inspectionCode = Helpers::generateCode('INS', 6);

        // v4.3.78: امور بهره‌برداری + وضعیت پیش‌فرض «غیرفعال» (activity_status)
        $districtId = Helpers::districtFromBody($body, 'inspections');
        $insCols = ['inspection_code', 'line_id', 'tower_id', 'contract_id', 'template_id', 'inspector_id', 'crew_id',
                    'inspection_date', 'start_time', 'end_time', 'gps_lat', 'gps_lng',
                    'status', 'priority', 'weather', 'notes', 'created_at'];
        $insVals = ['?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', "'draft'", '?', '?', '?', 'NOW()'];
        $insParams = [
            $inspectionCode,
            $body['line_id'] ?? null,
            $body['tower_id'] ?? null,
            $body['contract_id'] ?? null,
            $body['template_id'] ?? null,
            $body['inspector_id'] ?? 1,
            $body['crew_id'] ?? null,
            $body['inspection_date'],
            $body['start_time'] ?? null,
            $body['end_time'] ?? null,
            $body['gps_lat'] ?? null,
            $body['gps_lng'] ?? null,
            $body['priority'] ?? 'routine',
            $body['weather'] ?? null,
            $body['notes'] ?? null,
        ];
        if (Helpers::columnExists('inspections', 'activity_status')) { $insCols[] = 'activity_status'; $insVals[] = "'inactive'"; }
        if (Helpers::columnExists('inspections', 'district_id')) { $insCols[] = 'district_id'; $insVals[] = '?'; $insParams[] = $districtId; }
        $sql = "INSERT INTO inspections (" . implode(', ', $insCols) . ") VALUES (" . implode(', ', $insVals) . ")";

        $db->execute($sql, $insParams);

        $newId = (int) $db->lastInsertId();

        Logger::info('Inspection created', ['inspection_id' => $newId, 'user_id' => $user['id']]);
        Response::success(['id' => $newId, 'inspection_code' => $inspectionCode], 'بازدید ثبت شد', 201);
    });

    // ویرایش بازدید — برای جدول یکپارچه
    $router->put('inspections/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('inspections.update');
        $body = Helpers::getJsonBody();
        $fields = ['inspection_date','priority','weather','notes','line_id','tower_id','contract_id','inspector_id','crew_id','status'];
        // v4.3.78: ویرایش امور بهره‌برداری و وضعیت فعال/غیرفعال بازدید
        if (Helpers::columnExists('inspections', 'district_id')) $fields[] = 'district_id';
        if (Helpers::columnExists('inspections', 'activity_status')) $fields[] = 'activity_status';
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = ($body[$f] === '' ? null : $body[$f]); } }
        if (!$updates) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        Database::getInstance()->getConnection()->prepare("UPDATE inspections SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'بازدید ویرایش شد');
    });

    // حذف بازدید — برای عملیات گروهی جدول
    // v4.3.78: بازدیدِ فعال قابل حذف نیست — ابتدا باید غیرفعال شود (امنیت داده)
    $router->delete('inspections/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('inspections.delete');
        $row = Database::getInstance()->fetchOne("SELECT * FROM inspections WHERE id = ?", [(int)$id]);
        if (!$row) Response::error(404, 'بازدید پیدا نشد');
        $rawStatus = array_key_exists('activity_status', $row) ? ($row['activity_status'] ?? '') : ($row['status'] ?? '');
        if (in_array(strtolower(trim((string)$rawStatus)), ['active', '1', 'true'], true)) {
            Response::error(409, "حذف بازدید انجام نشد.\n\nاین بازدید فعال است — برای امنیت داده، ابتدا وضعیت آن را به «غیرفعال» تغییر دهید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }
        Database::getInstance()->execute("DELETE FROM inspections WHERE id = ?", [(int)$id]);
        Response::success(null, 'بازدید حذف شد');
    });

    // تأیید بازدید
    $router->post('inspections/{id}/approve', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('inspections.approve');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        $existing = $db->fetchOne("SELECT id, status FROM inspections WHERE id = ?", [(int) $id]);
        if (!$existing) {
            Response::error(404, 'بازدید پیدا نشد');
        }

        if ($existing['status'] !== 'submitted') {
            Response::error(400, 'فقط بازدیدهای ارسالی قابل تأیید هستند');
        }

        $db->update('inspections',
            ['status' => 'approved', 'approved_by' => $user['id'], 'approved_at' => date('Y-m-d H:i:s')],
            'id = ?',
            [(int) $id]
        );

        Logger::info('Inspection approved', ['inspection_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'بازدید تأیید شد');
    });
}

/**
 * فرمت‌بندی ردیف بازدید
 */
function formatInspectionRow(array $row): array
{
    return [
        'id'                => (int) $row['id'],
        'inspection_code'   => $row['inspection_code'],
        'contract_id'      => $row['contract_id'] ? (int)$row['contract_id'] : null,
        'contract_title'   => $row['contract_title'] ?? null,
        'line_id'           => $row['line_id'] ? (int) $row['line_id'] : null,
        'line_code'         => $row['line_code'] ?? null,
        'line_name'         => $row['line_name'] ?? null,
        'tower_id'          => $row['tower_id'] ? (int) $row['tower_id'] : null,
        'tower_code'        => $row['tower_code'] ?? null,
        'inspector_name'    => trim(($row['inspector_first'] ?? '') . ' ' . ($row['inspector_last'] ?? '')),
        'inspection_date'   => $row['inspection_date'],
        'start_time'        => $row['start_time'],
        'end_time'          => $row['end_time'],
        'gps_lat'           => $row['gps_lat'] !== null ? (float) $row['gps_lat'] : null,
        'gps_lng'           => $row['gps_lng'] !== null ? (float) $row['gps_lng'] : null,
        'status'            => $row['status'],
        'priority'          => $row['priority'],
        'weather'           => $row['weather'],
        'notes'             => $row['notes'],
        // v4.3.78: وضعیت فعال/غیرفعال + امور بهره‌برداری (بعد از migration)
        'activity_status'   => $row['activity_status'] ?? null,
        'district_id'       => !empty($row['district_id']) ? (int) $row['district_id'] : null,
        'district_name'     => $row['district_name'] ?? null,
        'created_at'        => $row['created_at'],
    ];
}
