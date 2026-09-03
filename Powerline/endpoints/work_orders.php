<?php
/**
 * endpoints/work_orders.php — مدیریت دستورکارهای تعمیرات
 */

function registerWorkOrderRoutes(Router $router): void
{
    // لیست دستورکارها
    $router->get('work-orders', function () {
        Auth::authenticate();
        Auth::requirePermission('maintenance.view');

        $db = Database::getInstance();
        $page = Helpers::getPage();
        $pageSize = Helpers::getPageSize();
        $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $contractId = Helpers::getContractId();
        $status = Helpers::query('status');
        $priority = Helpers::query('priority');
        $crewId = Helpers::queryInt('crew_id');
        $contractorId = Helpers::queryInt('contractor_id');

        $where = '1=1';
        $params = [];

        if ($contractId === 0) { $where .= ' AND wo.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND wo.contract_id = ?'; $params[] = $contractId; }

        if (!empty($search)) {
            $where .= ' AND (wo.wo_code LIKE ? OR wo.title LIKE ? OR wo.description LIKE ?)';
            $searchParam = "%$search%";
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
        }

        if ($status) {
            $where .= ' AND wo.status = ?';
            $params[] = $status;
        }

        if ($priority) {
            $where .= ' AND wo.priority = ?';
            $params[] = $priority;
        }

        if ($crewId) {
            $where .= ' AND wo.crew_id = ?';
            $params[] = $crewId;
        }

        if ($contractorId) {
            $where .= ' AND wo.contractor_id = ?';
            $params[] = $contractorId;
        }

        $countSql = "SELECT COUNT(*) FROM work_orders wo WHERE $where";
        $stmt = $db->getConnection()->prepare($countSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        // v4.3.78: کاربر اموردار فقط دستورکارهای امور خودش را می‌بیند + نام امور
        $where .= Helpers::districtWhere('wo', 'work_orders', $params);
        $disJoin = Helpers::districtJoin('wo', 'work_orders');
        $disSel = Helpers::districtSelect();
        $sql = "SELECT wo.*,
                       l.line_code, l.name AS line_name,
                       t.tower_code,
                       d.defect_code AS related_defect_code,
                       cr.name AS crew_name,
                       ct.contractor_name AS contractor_name,
                       c.title AS contract_title$disSel
                FROM work_orders wo
                LEFT JOIN `lines` l ON l.id = wo.line_id
                LEFT JOIN towers t ON t.id = wo.tower_id
                LEFT JOIN defects d ON d.id = wo.defect_id
                LEFT JOIN crews cr ON cr.id = wo.crew_id
                LEFT JOIN contractors ct ON ct.id = wo.contractor_id
                LEFT JOIN contracts c ON c.id = wo.contract_id
                $disJoin
                WHERE $where
                ORDER BY wo.id DESC
                LIMIT $pageSize OFFSET $offset";

        $rows = $db->fetchAll($sql, $params);
        $data = array_map('formatWorkOrderRow', $rows);

        Response::paginated($data, $page, $pageSize, $total);
    });

    // جزئیات یک دستورکار
    $router->get('work-orders/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('maintenance.view');

        $db = Database::getInstance();
        $row = $db->fetchOne(
            "SELECT wo.*,
                    l.line_code, l.name AS line_name,
                    t.tower_code,
                    d.defect_code AS related_defect_code,
                    cr.name AS crew_name,
                    ct.contractor_name AS contractor_name,
                    c.title AS contract_title
             FROM work_orders wo
             LEFT JOIN `lines` l ON l.id = wo.line_id
             LEFT JOIN towers t ON t.id = wo.tower_id
             LEFT JOIN defects d ON d.id = wo.defect_id
             LEFT JOIN crews cr ON cr.id = wo.crew_id
             LEFT JOIN contractors ct ON ct.id = wo.contractor_id
             LEFT JOIN contracts c ON c.id = wo.contract_id
             WHERE wo.id = ?",
            [(int) $id]
        );

        if (!$row) {
            Response::error(404, 'دستورکار پیدا نشد');
        }

        Response::success(formatWorkOrderRow($row));
    });

    // ایجاد دستورکار
    $router->post('work-orders', function () {
        $user = Auth::authenticate();
        Auth::requirePermission('maintenance.create');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        if (empty($body['title'])) {
            Response::error(400, 'عنوان دستورکار الزامی است');
        }

        $woCode = Helpers::generateCode('WO', 6);

        // v4.3.78: امور بهره‌برداری + وضعیت پیش‌فرض «غیرفعال» (activity_status)
        $districtId = Helpers::districtFromBody($body, 'work_orders');
        $woCols = ['wo_code', 'defect_id', 'line_id', 'tower_id', 'crew_id', 'contractor_id', 'contract_id',
                   'title', 'description', 'priority', 'status', 'planned_start', 'planned_end',
                   'outage_required', 'created_by', 'created_at'];
        $woVals = ['?', '?', '?', '?', '?', '?', '?', '?', '?', '?', "'draft'", '?', '?', '?', '?', 'NOW()'];
        $woParams = [
            $woCode,
            $body['defect_id'] ?? null,
            $body['line_id'] ?? null,
            $body['tower_id'] ?? null,
            $body['crew_id'] ?? null,
            $body['contractor_id'] ?? null,
            $body['contract_id'] ?? null,
            $body['title'],
            $body['description'] ?? null,
            $body['priority'] ?? 'medium',
            $body['planned_start'] ?? null,
            $body['planned_end'] ?? null,
            !empty($body['outage_required']) ? 1 : 0,
            $user['id'],
        ];
        if (Helpers::columnExists('work_orders', 'activity_status')) { $woCols[] = 'activity_status'; $woVals[] = "'inactive'"; }
        if (Helpers::columnExists('work_orders', 'district_id')) { $woCols[] = 'district_id'; $woVals[] = '?'; $woParams[] = $districtId; }
        $sql = "INSERT INTO work_orders (" . implode(', ', $woCols) . ") VALUES (" . implode(', ', $woVals) . ")";

        $db->execute($sql, $woParams);

        $newId = (int) $db->lastInsertId();

        Logger::info('Work order created', ['wo_id' => $newId, 'user_id' => $user['id']]);
        Response::success(['id' => $newId, 'wo_code' => $woCode], 'دستورکار ایجاد شد', 201);
    });

    // ویرایش دستورکار — برای جدول یکپارچه
    $router->put('work-orders/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('maintenance.update');
        $body = Helpers::getJsonBody();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['title','description','priority','planned_start','planned_end','crew_id','contractor_id','contract_id','outage_required','status'];
        // v4.3.78: ویرایش امور بهره‌برداری و وضعیت فعال/غیرفعال دستورکار
        if (Helpers::columnExists('work_orders', 'district_id')) $fields[] = 'district_id';
        if (Helpers::columnExists('work_orders', 'activity_status')) $fields[] = 'activity_status';
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = ($body[$f] === '' ? null : $body[$f]); } }
        if (!$updates) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        Database::getInstance()->getConnection()->prepare("UPDATE work_orders SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'دستورکار ویرایش شد');
    });

    // حذف دستورکار — برای عملیات گروهی جدول
    // v4.3.78: دستورکارِ فعال قابل حذف نیست — ابتدا باید غیرفعال شود (امنیت داده)
    $router->delete('work-orders/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('maintenance.delete');
        $row = Database::getInstance()->fetchOne("SELECT * FROM work_orders WHERE id = ?", [(int)$id]);
        if (!$row) Response::error(404, 'دستورکار پیدا نشد');
        $rawStatus = array_key_exists('activity_status', $row) ? ($row['activity_status'] ?? '') : ($row['status'] ?? '');
        if (in_array(strtolower(trim((string)$rawStatus)), ['active', '1', 'true'], true)) {
            Response::error(409, "حذف دستورکار انجام نشد.\n\nاین دستورکار فعال است — برای امنیت داده، ابتدا وضعیت آن را به «غیرفعال» تغییر دهید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }
        Database::getInstance()->execute("DELETE FROM work_orders WHERE id = ?", [(int)$id]);
        Response::success(null, 'دستورکار حذف شد');
    });

    // اختصاص دستورکار به اکیپ
    $router->post('work-orders/{id}/assign', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('maintenance.assign');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        $existing = $db->fetchOne("SELECT id, status FROM work_orders WHERE id = ?", [(int) $id]);
        if (!$existing) {
            Response::error(404, 'دستورکار پیدا نشد');
        }

        $crewId = $body['crew_id'] ?? null;
        if (empty($crewId)) {
            Response::error(400, 'شناسه اکیپ الزامی است');
        }

        $db->update('work_orders',
            ['crew_id' => $crewId, 'status' => 'assigned', 'assigned_to' => $body['assigned_to'] ?? null],
            'id = ?',
            [(int) $id]
        );

        Logger::info('Work order assigned', ['wo_id' => $id, 'crew_id' => $crewId, 'user_id' => $user['id']]);
        Response::success(null, 'دستورکار به اکیپ اختصاص داده شد');
    });

    // شروع کار
    $router->post('work-orders/{id}/start', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('maintenance.update');

        $db = Database::getInstance();
        $existing = $db->fetchOne("SELECT id, status FROM work_orders WHERE id = ?", [(int) $id]);
        if (!$existing) {
            Response::error(404, 'دستورکار پیدا نشد');
        }

        $db->update('work_orders',
            ['status' => 'in_progress', 'actual_start' => date('Y-m-d H:i:s')],
            'id = ?',
            [(int) $id]
        );

        Logger::info('Work order started', ['wo_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'دستورکار شروع شد');
    });

    // تکمیل دستورکار
    $router->post('work-orders/{id}/complete', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('maintenance.update');

        $body = Helpers::getJsonBody();
        $db = Database::getInstance();

        $existing = $db->fetchOne("SELECT id, status FROM work_orders WHERE id = ?", [(int) $id]);
        if (!$existing) {
            Response::error(404, 'دستورکار پیدا نشد');
        }

        $db->update('work_orders',
            [
                'status'        => 'completed',
                'actual_end'    => date('Y-m-d H:i:s'),
                'equipment_used'=> $body['equipment_used'] ?? null,
                'materials_used'=> $body['materials_used'] ?? null,
                'notes'         => $body['notes'] ?? null,
                'closed_by'     => $user['id'],
            ],
            'id = ?',
            [(int) $id]
        );

        Logger::info('Work order completed', ['wo_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'دستورکار تکمیل شد');
    });

    // بستن/تأیید نهایی دستورکار
    $router->post('work-orders/{id}/close', function ($id) {
        $user = Auth::authenticate();
        Auth::requirePermission('maintenance.close');

        $db = Database::getInstance();
        $existing = $db->fetchOne("SELECT id, status FROM work_orders WHERE id = ?", [(int) $id]);
        if (!$existing) {
            Response::error(404, 'دستورکار پیدا نشد');
        }

        $db->update('work_orders',
            ['status' => 'verified', 'closed_by' => $user['id']],
            'id = ?',
            [(int) $id]
        );

        Logger::info('Work order closed', ['wo_id' => $id, 'user_id' => $user['id']]);
        Response::success(null, 'دستورکار بسته شد');
    });
}

/**
 * فرمت‌بندی ردیف دستورکار
 */
function formatWorkOrderRow(array $row): array
{
    return [
        'id'                => (int) $row['id'],
        'wo_code'           => $row['wo_code'],
        'title'             => $row['title'],
        'description'       => $row['description'],
        'priority'          => $row['priority'],
        'status'            => $row['status'],
        // v4.3.78: وضعیت فعال/غیرفعال + امور بهره‌برداری (بعد از migration)
        'activity_status'   => $row['activity_status'] ?? null,
        'district_id'       => !empty($row['district_id']) ? (int) $row['district_id'] : null,
        'district_name'     => $row['district_name'] ?? null,
        'defect_id'         => $row['defect_id'] ? (int) $row['defect_id'] : null,
        'related_defect_code'=> $row['related_defect_code'] ?? null,
        'line_id'           => $row['line_id'] ? (int) $row['line_id'] : null,
        'line_code'         => $row['line_code'] ?? null,
        'line_name'         => $row['line_name'] ?? null,
        'tower_id'          => $row['tower_id'] ? (int) $row['tower_id'] : null,
        'tower_code'        => $row['tower_code'] ?? null,
        'crew_id'           => $row['crew_id'] ? (int) $row['crew_id'] : null,
        'crew_name'         => $row['crew_name'] ?? null,
        'contractor_id'     => $row['contractor_id'] ? (int) $row['contractor_id'] : null,
        'contractor_name'   => $row['contractor_name'] ?? null,
        'contract_id'       => $row['contract_id'] ? (int)$row['contract_id'] : null,
        'contract_title'    => $row['contract_title'] ?? null,
        'planned_start'     => $row['planned_start'],
        'planned_end'       => $row['planned_end'],
        'actual_start'      => $row['actual_start'],
        'actual_end'        => $row['actual_end'],
        'outage_required'   => (bool) $row['outage_required'],
        'equipment_used'    => $row['equipment_used'],
        'materials_used'    => $row['materials_used'],
        'notes'             => $row['notes'],
        'created_at'        => $row['created_at'],
        'updated_at'        => $row['updated_at'],
    ];
}
