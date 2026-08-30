<?php
/**
 * endpoints/dashboard.php — آمار داشبورد
 */

function registerDashboardRoutes(Router $router): void
{
    // آمار کلی داشبورد
    $router->get('dashboard/stats', function () {
        Auth::authenticate();

        $db = Database::getInstance();
        $pdo = $db->getConnection();

        // آمار کلی
        $stats = [
            'lines' => [
                'total'      => (int) $pdo->query("SELECT COUNT(*) FROM `lines` WHERE is_active = 1")->fetchColumn(),
                // v2.4.3: تفکیک بر اساس ولتاژ (نوع خط حذف شد)
                'by_voltage' => $pdo->query("
                    SELECT voltage_kv, COUNT(*) as count
                    FROM `lines`
                    WHERE is_active = 1 AND voltage_kv IS NOT NULL
                    GROUP BY voltage_kv
                ")->fetchAll(PDO::FETCH_KEY_PAIR),
            ],
            'towers' => [
                'total' => (int) $pdo->query("SELECT COUNT(*) FROM towers WHERE is_active = 1")->fetchColumn(),
                'by_type' => $pdo->query("
                    SELECT tower_type, COUNT(*) as count
                    FROM towers
                    WHERE is_active = 1
                    GROUP BY tower_type
                ")->fetchAll(PDO::FETCH_KEY_PAIR),
            ],
            'defects' => [
                'total'      => (int) $pdo->query("SELECT COUNT(*) FROM defects")->fetchColumn(),
                'new'        => (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE status = 'new'")->fetchColumn(),
                'approved'   => (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE status = 'approved'")->fetchColumn(),
                'in_progress'=> (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE status = 'in_progress'")->fetchColumn(),
                'repaired'   => (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE status = 'repaired'")->fetchColumn(),
                'verified'   => (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE status = 'verified'")->fetchColumn(),
                'critical'   => (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE priority = 'critical' AND status NOT IN ('verified', 'cancelled')")->fetchColumn(),
                'high'       => (int) $pdo->query("SELECT COUNT(*) FROM defects WHERE priority = 'high' AND status NOT IN ('verified', 'cancelled')")->fetchColumn(),
            ],
            'inspections' => [
                'total'        => (int) $pdo->query("SELECT COUNT(*) FROM inspections")->fetchColumn(),
                'today'        => (int) $pdo->query("SELECT COUNT(*) FROM inspections WHERE DATE(inspection_date) = CURDATE()")->fetchColumn(),
                'this_week'    => (int) $pdo->query("SELECT COUNT(*) FROM inspections WHERE inspection_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)")->fetchColumn(),
                'pending_approval' => (int) $pdo->query("SELECT COUNT(*) FROM inspections WHERE status = 'submitted'")->fetchColumn(),
            ],
            'work_orders' => [
                'total'        => (int) $pdo->query("SELECT COUNT(*) FROM work_orders")->fetchColumn(),
                'open'         => (int) $pdo->query("SELECT COUNT(*) FROM work_orders WHERE status IN ('draft', 'assigned', 'in_progress')")->fetchColumn(),
                'overdue'      => (int) $pdo->query("SELECT COUNT(*) FROM work_orders WHERE planned_end < NOW() AND status NOT IN ('completed', 'cancelled', 'verified')")->fetchColumn(),
            ],
            'users' => [
                'total'   => (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
                'active'  => (int) $pdo->query("SELECT COUNT(*) FROM users WHERE is_active = 1")->fetchColumn(),
            ],
            'contractors' => [
                'total'  => (int) $pdo->query("SELECT COUNT(*) FROM contractors WHERE is_active = 1")->fetchColumn(),
            ],
            'safety' => [
                'incidents_this_month' => (int) $pdo->query("SELECT COUNT(*) FROM safety_incidents WHERE MONTH(occurred_at) = MONTH(CURDATE()) AND YEAR(occurred_at) = YEAR(CURDATE())")->fetchColumn(),
                'near_miss_this_month' => (int) $pdo->query("SELECT COUNT(*) FROM safety_incidents WHERE incident_type = 'near_miss' AND MONTH(occurred_at) = MONTH(CURDATE())")->fetchColumn(),
            ],
        ];

        // نمودار ۷ روز اخیر (بازدید و عیوب)
        $activity = $pdo->query("
            SELECT
                DATE(d.created_at) AS date,
                COUNT(DISTINCT d.id) AS defects
            FROM defects d
            WHERE d.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(d.created_at)
            ORDER BY date
        ")->fetchAll();

        $inspections = $pdo->query("
            SELECT
                DATE(i.inspection_date) AS date,
                COUNT(*) AS inspections
            FROM inspections i
            WHERE i.inspection_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(i.inspection_date)
            ORDER BY date
        ")->fetchAll();

        // ساخت آرایه ۷ روزه
        $sevenDays = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i day"));
            $sevenDays[$date] = ['date' => $date, 'defects' => 0, 'inspections' => 0];
        }

        foreach ($activity as $a) {
            if (isset($sevenDays[$a['date']])) {
                $sevenDays[$a['date']]['defects'] = (int) $a['defects'];
            }
        }

        foreach ($inspections as $i) {
            if (isset($sevenDays[$i['date']])) {
                $sevenDays[$i['date']]['inspections'] = (int) $i['inspections'];
            }
        }

        $stats['activity_7_days'] = array_values($sevenDays);

        Response::success($stats);
    });

    // آخرین عیوب (برای داشبورد)
    $router->get('dashboard/recent-defects', function () {
        Auth::authenticate();

        $db = Database::getInstance();
        $limit = min(50, max(1, (int) Helpers::query('limit', 10)));

        $rows = $db->fetchAll(
            "SELECT d.id, d.defect_code, d.title, d.severity, d.priority, d.status,
                    d.discovered_at,
                    l.line_code, l.name AS line_name,
                    t.tower_code
             FROM defects d
             LEFT JOIN `lines` l ON l.id = d.line_id
             LEFT JOIN towers t ON t.id = d.tower_id
             ORDER BY d.id DESC
             LIMIT ?",
            [$limit]
        );

        $data = array_map(function ($row) {
            return [
                'id'             => (int) $row['id'],
                'defect_code'    => $row['defect_code'],
                'title'          => $row['title'],
                'severity'       => $row['severity'],
                'priority'       => $row['priority'],
                'status'         => $row['status'],
                'line_code'      => $row['line_code'],
                'line_name'      => $row['line_name'],
                'tower_code'     => $row['tower_code'],
                'discovered_at'  => $row['discovered_at'],
            ];
        }, $rows);

        Response::success($data);
    });

    // آمار عیوب بر اساس دسته
    $router->get('dashboard/defects-by-category', function () {
        Auth::authenticate();

        $db = Database::getInstance();
        $rows = $db->fetchAll("
            SELECT dc.id, dc.name, dc.tower_type,
                   COUNT(dd.id) AS definition_count,
                   (SELECT COUNT(*) FROM defects d WHERE d.defect_definition_id IN
                       (SELECT id FROM defect_definitions WHERE category_id = dc.id)
                   ) AS actual_defect_count
            FROM defect_categories dc
            LEFT JOIN defect_definitions dd ON dd.category_id = dc.id
            WHERE dc.is_active = 1
            GROUP BY dc.id
            ORDER BY actual_defect_count DESC, definition_count DESC
        ");

        $data = array_map(function ($row) {
            return [
                'id'                 => (int) $row['id'],
                'name'               => $row['name'],
                'tower_type'         => $row['tower_type'],
                'definition_count'   => (int) $row['definition_count'],
                'actual_defect_count'=> (int) $row['actual_defect_count'],
            ];
        }, $rows);

        Response::success($data);
    });
}
