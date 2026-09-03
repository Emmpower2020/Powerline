<?php
/**
 * endpoints/modules.php — تمام ماژول‌های اضافی با CRUD کامل
 * قراردادها، صورت‌وضعیت، ایمنی، پرسنل، پیمانکاران، تجهیزات، فهرست بها، چک‌لیست، لاگ ممیزی، سازمان، اکیپ‌ها
 */

function registerModuleRoutes(Router $router): void
{
    // v4.3.69: ستون «سمت» پرسنل در نسخه‌های مختلف دیتابیس یا position است یا
    // personnel_type — کوئری‌ها با ستون واقعی ساخته می‌شوند تا import روی
    // هر دو ساختار بدون خطای «Unknown column» کار کند.
    // v4.3.70: جدول personnel در نسخه‌های مختلف دیتابیس ستون‌های متفاوتی دارد
    // (position / personnel_type / phone / collaboration_start ممکن است نباشند).
    // کوئری‌ها فقط با ستون‌های واقعی موجود ساخته می‌شوند تا هیچ‌وقت
    // «Unknown column» و خطای ۵۰۰ رخ ندهد.
    $personnelCols = function (PDO $pdo): array {
        $cols = [];
        foreach ($pdo->query('SHOW COLUMNS FROM personnel')->fetchAll() as $c) {
            if (isset($c['Field'])) $cols[$c['Field']] = true;
        }
        return $cols;
    };
    $personnelPositionCol = function (PDO $pdo) use ($personnelCols) {
        $cols = $personnelCols($pdo);
        if (isset($cols['position'])) return 'position';
        if (isset($cols['personnel_type'])) return 'personnel_type';
        return null; // هیچ ستون سمدی وجود ندارد
    };

    // v4.3.70: نمایش نسخه بک‌اند برای اطمینان از آپلود درست فایل‌ها
    // (بدون نیاز به لاگین — فقط شماره نسخه برمی‌گرداند)
    $router->get('backend-version', function () {
        Response::success(['version' => 'v4.3.83', 'component' => 'Powerline PHP Backend'], 'نسخه بک‌اند');
    });


    // ─────────────────────────────────────────────────────────────
    // v4.3.55: سازگاری جداول مرجع دکل با هر دو ساختار دیتابیس
    // نسخه‌های مختلف دیتابیس یا ستون `status` (varchar) دارند یا `is_active` (tinyint).
    // کد قبلاً همیشه status را می‌خواند و روی دیتابیس‌های is_active با
    // «Unknown column status» خطای 500 می‌داد (خطای بارگذاری ساختار/کد نوع دکل).
    // ─────────────────────────────────────────────────────────────
    $towerRefUsesStatus = function (PDO $pdo, string $table): bool {
        static $cache = [];
        if (!isset($cache[$table])) {
            $hasStatus = false;
            foreach ($pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll() as $c) {
                if (($c['Field'] ?? null) === 'status') { $hasStatus = true; break; }
            }
            $cache[$table] = $hasStatus;
        }
        return $cache[$table];
    };
    /** عبارت SELECT وضعیت به‌صورت متنی active/inactive برای فرانت‌اند */
    $towerRefStatusExpr = function (PDO $pdo, string $table) use ($towerRefUsesStatus): string {
        return $towerRefUsesStatus($pdo, $table)
            ? 'status'
            : "CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END";
    };
    /** تبدیل مقدار active/inactive فرانت‌اند به [ستون واقعی، مقدار دیتابیسی] */
    $towerRefStatusValue = function (PDO $pdo, string $table, $value) use ($towerRefUsesStatus): array {
        $inactive = ((string)$value) === 'inactive';
        return $towerRefUsesStatus($pdo, $table)
            ? ['status', $inactive ? 'inactive' : 'active']
            : ['is_active', $inactive ? 0 : 1];
    };

    // v4.3.59: حذف ایمن و توضیح‌دار رکوردهای حساس.
    // قرارداد و پیمانکارِ فعال هرگز حذف نمی‌شوند. همچنین برای این دو موجودیت،
    // وجود هر وابستگی مستقیم در هر جدول (حتی SET NULL/CASCADE) مانع حذف است تا
    // حذف ناخواسته باعث پاک‌شدن زنجیره‌ای اطلاعات نشود.
    $guardedDelete = function (string $table, string $label, int $id, array $guards = []): void {
        $db = Database::getInstance();
        $pdo = $db->getConnection();
        $schema = $pdo->query('SELECT DATABASE()')->fetchColumn();

        // برچسب خوانا برای نمایش دلیل خطا؛ برای جداول ناشناخته نام خود جدول هم قابل‌فهم است.
        $labels = [
            'contracts' => 'قراردادها',
            'circuits' => 'مدارها',
            'invoices' => 'صورت‌وضعیت‌ها',
            'crews' => 'اکیپ‌ها',
            'lines' => 'خطوط',
            'work_orders' => 'دستورکارها',
            'defects' => 'عیوب',
            'inspections' => 'بازدیدها',
            'equipment' => 'تجهیزات',
            'towers' => 'دکل‌ها',
            'personnel' => 'پرسنل',
            'crew_members' => 'اعضای اکیپ',
            'contract_price_list_items' => 'اقلام قیمت قرارداد',
            'price_lists' => 'فهرست بها',
            'safety_incidents' => 'حوادث ایمنی',
        ];

        $humanTable = static function (string $name) use ($labels): string {
            return $labels[$name] ?? $name;
        };

        $blockers = [];

        // رکورد هنوز وجود دارد؟ و برای موجودیت‌های حساس، وضعیت فعال را بررسی کن.
        $rowStmt = $pdo->prepare("SELECT * FROM `$table` WHERE id = ? LIMIT 1");
        $rowStmt->execute([$id]);
        $row = $rowStmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error(404, "$label پیدا نشد یا قبلاً حذف شده است");
        }
        // v4.3.77: هیچ رکوردِ «فعالی» در هیچ جدولی حذف نمی‌شود (امنیت داده).
        // v4.3.78: جداول گردش‌کاری (بازدید/عیب/دستورکار/صورت‌وضعیت/حادثه) وضعیت
        // فعال/غیرفعال را در activity_status نگه می‌دارند؛ ستون status آنها «مرحلهٔ کار» است.
        // مقدار وضعیت بسته به اسکیما varchar ('active'/'inactive' یا مقدار قدیمی 'deactive')
        // یا tinyint (1/0) است — همه به‌صورت واحد نرمال‌سازی می‌شود.
        // قرارداد و پیمانکار پیام اختصاصی خود را حفظ می‌کنند (از v4.3.59).
        $rawStatus = array_key_exists('activity_status', $row)
            ? ($row['activity_status'] ?? '')
            : ($row['status'] ?? '');
        $statusActive = in_array(strtolower(trim((string)$rawStatus)), ['active', '1', 'true'], true);
        if ($statusActive) {
            $specific = $table === 'contracts'
                ? 'قرارداد فعال است و برای جلوگیری از حذف ناخواسته تا زمانی که وضعیت آن را از «فعال» خارج نکنید، حذف نمی‌شود.'
                : $table === 'contractors'
                    ? 'پیمانکار فعال است و برای جلوگیری از حذف ناخواسته تا زمانی که وضعیت آن را به «غیرفعال» تغییر ندهید، حذف نمی‌شود.'
                    : "$label فعال است — برای امنیت داده، ابتدا وضعیت آن را به «غیرفعال» تغییر دهید؛ رکوردهای غیرفعال قابل حذف هستند.";
            Response::error(409, "حذف $label انجام نشد.\n\n$specific");
        }

        try {
            $sql = "
                SELECT DISTINCT kcu.TABLE_NAME AS child_table, kcu.COLUMN_NAME AS child_column,
                       rc.DELETE_RULE AS delete_rule
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                INNER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
                 AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                 AND rc.TABLE_NAME = kcu.TABLE_NAME
                WHERE kcu.REFERENCED_TABLE_SCHEMA = ?
                  AND kcu.REFERENCED_TABLE_NAME = ?
                  AND kcu.REFERENCED_COLUMN_NAME = 'id'
                  AND kcu.TABLE_NAME <> ?
                ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME";
            $st = $pdo->prepare($sql);
            $st->execute([$schema, $table, $table]);
            foreach ($st->fetchAll() as $fk) {
                $childTable = (string)$fk['child_table'];
                $childColumn = (string)$fk['child_column'];
                $rule = strtoupper((string)$fk['delete_rule']);
                // برای قرارداد و پیمانکار هیچ وابستگی مستقیمی نادیده گرفته نمی‌شود؛
                // حتی اگر FK در DB با SET NULL/CASCADE تعریف شده باشد.
                if (!in_array($table, ['contracts', 'contractors'], true) && in_array($rule, ['SET NULL', 'CASCADE', 'SET DEFAULT'], true)) {
                    continue;
                }
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM `$childTable` WHERE `$childColumn` = ?");
                $cntStmt->execute([$id]);
                $count = (int)$cntStmt->fetchColumn();
                if ($count > 0) {
                    $blockers[] = [
                        'table' => $childTable,
                        'column' => $childColumn,
                        'count' => $count,
                        'rule' => $rule,
                        'label' => $humanTable($childTable),
                    ];
                }
            }
        } catch (Throwable $e) {
            Logger::error('guardedDelete FK introspection failed', [
                'table' => $table,
                'id' => $id,
                'error' => $e->getMessage(),
            ]);
            // در صورت شکست introspection، نگاشت صریح قبلی را به‌عنوان fallback اجرا می‌کنیم.
            foreach ($guards as $gKey => $gLabel) {
                $gTable = $gKey;
                $gCol = $table . '_id';
                if (str_contains($gKey, '.')) { [$gTable, $gCol] = explode('.', $gKey, 2); }
                try {
                    $cnt = (int)$db->fetchOne("SELECT COUNT(*) AS c FROM `$gTable` WHERE `$gCol` = ?", [$id])['c'];
                } catch (Throwable $ignored) { continue; }
                if ($cnt > 0) {
                    $blockers[] = [
                        'table' => $gTable,
                        'column' => $gCol,
                        'count' => $cnt,
                        'rule' => 'RESTRICT',
                        'label' => $gLabel,
                    ];
                }
            }
        }

        if ($blockers) {
            $lines = [];
            foreach ($blockers as $b) {
                $countText = number_format($b['count'], 0, '.', ',');
                $lines[] = "• {$b['label']}: {$countText} مورد";
            }
            $detail = implode("\n", $lines);
            $name = $label === 'پیمانکار' ? 'این پیمانکار' : "این $label";
            $message = "$name قابل حذف نیست چون هنوز در بخش‌های دیگر سیستم استفاده شده است:\n$detail\n\nابتدا ارتباط $label را از این بخش‌ها بردارید (یا رکوردهای مرتبط را مدیریت کنید) و بعد دوباره برای حذف تلاش کنید. با این کنترل، حذف $label باعث حذف زنجیره‌ای اطلاعات مرتبط نمی‌شود.";
            Response::error(409, $message, [
                'entity' => $table,
                'entity_id' => $id,
                'blockers' => $blockers,
            ]);
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM `$table` WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                Response::error(404, "$label پیدا نشد یا قبلاً حذف شده است");
            }
        } catch (PDOException $e) {
            Logger::error('guardedDelete delete failed', [
                'table' => $table,
                'id' => $id,
                'error' => $e->getMessage(),
            ]);
            // اگر دیتابیس رابطه‌ای را که در introspection دیده نشده بود گزارش کرد،
            // پیام را به‌صورت کاربرپسند برگردان و متن خام SQL را نمایش نده.
            if ((string)$e->getCode() === '23000') {
                Response::error(409, "حذف این $label انجام نشد چون هنوز رکوردهای وابسته به آن وجود دارد. ابتدا رکوردهای مرتبط را مدیریت کنید.");
            }
            Response::error(500, "حذف این $label با خطای داخلی سرور مواجه شد. جزئیات در لاگ سیستم ثبت شده است.");
        }
        Response::success(null, "$label با موفقیت حذف شد");
    };

    // مرجع‌های دکل: ساختارهای سازه و کدهای نوع دکل از جداول مرجع خوانده می‌شوند.
    $router->get('tower-references', function () use ($towerRefUsesStatus) {
        Auth::authenticate();
        if (!Auth::canAccess('towers.view') && !Auth::canAccess('lines.view')) {
            Response::error(403, 'دسترسی به اطلاعات مرجع دکل‌ها مجاز نیست');
        }
        $pdo = Database::getInstance()->getConnection();
        try {
            $whereS = $towerRefUsesStatus($pdo, 'tower_structures') ? "status = 'active'" : 'is_active = 1';
            $whereC = $towerRefUsesStatus($pdo, 'tower_type_codes') ? "status = 'active'" : 'is_active = 1';
            $structures = $pdo->query("SELECT id, name FROM tower_structures WHERE $whereS ORDER BY sort_order, id")->fetchAll();
            $codes = $pdo->query("SELECT id, code, title FROM tower_type_codes WHERE $whereC ORDER BY sort_order, id")->fetchAll();
            Response::success([
                'tower_structures' => $structures,
                'tower_type_codes' => $codes,
            ], 'اطلاعات مرجع دکل');
        } catch (Throwable $e) {
            Logger::error('tower-references: ' . $e->getMessage());
            Response::error(500, 'جداول مرجع دکل‌ها هنوز ایجاد نشده‌اند. ابتدا Migration مربوطه را اجرا کنید.');
        }
    });

    // CRUD جداول مرجع ساختار و کد دکل
    $router->get('tower-structures', function () use ($towerRefStatusExpr) {
        Auth::authenticate(); Auth::requirePermissionSoft('towers.view');
        $pdo=Database::getInstance()->getConnection();
        $statusExpr = $towerRefStatusExpr($pdo, 'tower_structures');
        Response::success($pdo->query("SELECT id,name,sort_order,$statusExpr AS status,created_at,updated_at FROM tower_structures ORDER BY sort_order,id")->fetchAll());
    });
    $router->post('tower-structures', function () use ($towerRefStatusValue) {
        Auth::authenticate(); Auth::requirePermissionSoft('towers.create');
        $b=Helpers::getJsonBody(); if(trim((string)($b['name']??''))==='') Response::error(400,'نام ساختار دکل الزامی است');
        $pdo=Database::getInstance()->getConnection();
        list($statusCol, $statusVal) = $towerRefStatusValue($pdo, 'tower_structures', $b['status'] ?? 'active');
        $st=$pdo->prepare("INSERT INTO tower_structures (name,sort_order,$statusCol) VALUES (?,?,?)");
        try{$st->execute([trim($b['name']), (int)($b['sort_order']??0), $statusVal]);}catch(PDOException $e){Response::error(409,'این ساختار قبلاً ثبت شده است');}
        Response::success(['id'=>(int)$pdo->lastInsertId()],'ساختار دکل ایجاد شد',201);
    });
    $router->put('tower-structures/{id}', function($id) use ($towerRefStatusValue) {
        Auth::authenticate(); Auth::requirePermissionSoft('towers.update'); $b=Helpers::getJsonBody();
        $pdo=Database::getInstance()->getConnection();
        $fields=[];$params=[]; foreach(['name','sort_order'] as $f){if(array_key_exists($f,$b)){$fields[]="`$f`=?";$params[]=$b[$f];}}
        if(array_key_exists('status',$b)){list($statusCol,$statusVal)=$towerRefStatusValue($pdo,'tower_structures',$b['status']);$fields[]="`$statusCol`=?";$params[]=$statusVal;}
        if(!$fields) Response::error(400,'فیلدی برای ویرایش ارسال نشده'); $params[]=(int)$id;
        try{Database::getInstance()->execute("UPDATE tower_structures SET ".implode(',',$fields).",updated_at=NOW() WHERE id=?",$params);}catch(PDOException $e){Response::error(409,'ویرایش ساختار انجام نشد: '.fa_db_error($e));}
        Response::success(null,'ساختار دکل ویرایش شد');
    });
    // v4.3.77: مرجعِ «فعال» قابل حذف نیست — ابتدا باید غیرفعال شود (امنیت داده)
    $towerRefIsActive = function (string $table, int $id) use ($towerRefStatusExpr): bool {
        $pdo = Database::getInstance()->getConnection();
        $statusExpr = $towerRefStatusExpr($pdo, $table);
        $row = Database::getInstance()->fetchOne("SELECT $statusExpr AS st FROM `$table` WHERE id = ?", [$id]);
        return $row && in_array(strtolower(trim((string)($row['st'] ?? ''))), ['active', '1', 'true'], true);
    };
    $router->delete('tower-structures/{id}', function($id) use ($towerRefIsActive){
        Auth::authenticate(); Auth::requirePermissionSoft('towers.delete');
        if ($towerRefIsActive('tower_structures', (int)$id)) {
            Response::error(409, "حذف ساختار دکل انجام نشد.\n\nاین ساختار فعال است — برای امنیت داده، ابتدا کلید «فعال» را خاموش کنید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }
        Database::getInstance()->execute("DELETE FROM tower_structures WHERE id=?",[(int)$id]); Response::success(null,'ساختار دکل حذف شد');
    });

    $router->get('tower-type-codes', function () use ($towerRefStatusExpr) {
        Auth::authenticate(); Auth::requirePermissionSoft('towers.view'); $pdo=Database::getInstance()->getConnection();
        $statusExpr = $towerRefStatusExpr($pdo, 'tower_type_codes');
        Response::success($pdo->query("SELECT id,code,title,sort_order,$statusExpr AS status,created_at,updated_at FROM tower_type_codes ORDER BY sort_order,id")->fetchAll());
    });
    $router->post('tower-type-codes', function () use ($towerRefStatusValue) {
        Auth::authenticate(); Auth::requirePermissionSoft('towers.create'); $b=Helpers::getJsonBody(); if(trim((string)($b['code']??''))==='') Response::error(400,'کد نوع دکل الزامی است');
        $pdo=Database::getInstance()->getConnection();
        list($statusCol, $statusVal) = $towerRefStatusValue($pdo, 'tower_type_codes', $b['status'] ?? 'active');
        $st=$pdo->prepare("INSERT INTO tower_type_codes (code,title,sort_order,$statusCol) VALUES (?,?,?,?)");
        try{$st->execute([trim($b['code']),trim((string)($b['title']??''))?:null,(int)($b['sort_order']??0), $statusVal]);}catch(PDOException $e){Response::error(409,'این کد قبلاً ثبت شده است');}
        Response::success(['id'=>(int)$pdo->lastInsertId()],'کد نوع دکل ایجاد شد',201);
    });
    $router->put('tower-type-codes/{id}', function($id) use ($towerRefStatusValue) {
        Auth::authenticate(); Auth::requirePermissionSoft('towers.update'); $b=Helpers::getJsonBody(); $pdo=Database::getInstance()->getConnection();
        $fields=[];$params=[]; foreach(['code','sort_order'] as $f){if(array_key_exists($f,$b)){$fields[]="`$f`=?";$params[]=$b[$f];}}
        if(array_key_exists('title',$b)){$fields[]="`title`=?";$params[]=trim((string)$b['title'])===''?null:$b['title'];}
        if(array_key_exists('status',$b)){list($statusCol,$statusVal)=$towerRefStatusValue($pdo,'tower_type_codes',$b['status']);$fields[]="`$statusCol`=?";$params[]=$statusVal;}
        if(!$fields) Response::error(400,'فیلدی برای ویرایش ارسال نشده'); $params[]=(int)$id; Database::getInstance()->execute("UPDATE tower_type_codes SET ".implode(',',$fields).",updated_at=NOW() WHERE id=?",$params); Response::success(null,'کد نوع دکل ویرایش شد');
    });
    $router->delete('tower-type-codes/{id}', function($id) use ($towerRefIsActive){
        Auth::authenticate(); Auth::requirePermissionSoft('towers.delete');
        // v4.3.77: کد نوعِ «فعال» قابل حذف نیست — ابتدا باید غیرفعال شود
        if ($towerRefIsActive('tower_type_codes', (int)$id)) {
            Response::error(409, "حذف کد نوع دکل انجام نشد.\n\nاین کد فعال است — برای امنیت داده، ابتدا کلید «فعال» را خاموش کنید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }
        Database::getInstance()->execute("DELETE FROM tower_type_codes WHERE id=?",[(int)$id]); Response::success(null,'کد نوع دکل حذف شد'); });

    // ============================================================
    //  امور بهره‌برداری (Districts) — v4.3.78
    //  جدول داده‌های پایه برای تعریف امورهای مختلف (کردستان، ایلام، ...)
    //  کاربر اموردار فقط داده‌های امور خودش را می‌بیند؛ مدیر (district_id=NULL) همه را می‌بیند.
    //  تا قبل از اجرای migration (ساخت جدول districts) همهٔ مسیرها پاسخ خالی می‌دهند.
    // ============================================================
    $districtsReady = function (): bool {
        return Helpers::districtsReady();
    };

    // لیست امور — برای همهٔ کاربران لاگین‌شده قابل خواندن است (کمبوباکس فرم‌ها)
    $router->get('districts', function () {
        Auth::authenticate();
        if (!Helpers::districtsReady()) Response::paginated([], 1, 1, 0);
        $rows = Database::getInstance()->getConnection()
            ->query("SELECT id, name, status, created_at, updated_at FROM districts ORDER BY id ASC")->fetchAll();
        // v4.3.79: پاسخ صفحه‌بندی‌شده (هم‌شکل بقیهٔ ماژول‌ها) — قبلاً آرایهٔ خام
        // برمی‌گشت؛ apiClient پاسخ بدون pagination را به آرایهٔ خالی تبدیل می‌کرد و
        // جدول «امور بهره‌برداری» در صفحهٔ داده‌های پایه خالی نمایش داده می‌شد
        // (در حالی که ثبت تکراری درست پیام «قبلاً ثبت شده» می‌داد).
        $total = count($rows);
        Response::paginated($rows, 1, max(1, $total), $total);
    });

    $router->post('districts', function () use ($guardedDelete) {
        Auth::authenticate(); Auth::requirePermissionSoft('districts.create');
        // v4.3.81: تعریف/ویرایش امور فقط برای مدیر سیستم
        if (!Helpers::userCanChangeDistrict()) Response::error(403, 'مدیریت امور بهره‌برداری فقط برای مدیر سیستم مجاز است');
        $b = Helpers::getJsonBody();
        $name = trim((string)($b['name'] ?? ''));
        if ($name === '') Response::error(400, 'نام امور بهره‌برداری الزامی است');
        if (!Helpers::districtsReady()) Response::error(500, 'جدول امور بهره‌برداری هنوز ایجاد نشده — ابتدا فایل migration نسخه 4.3.78 را اجرا کنید');
        $pdo = Database::getInstance()->getConnection();
        // v4.3.78: طبق سیاست امنیت داده، ثبت جدید پیش‌فرض «غیرفعال» است
        $st = $pdo->prepare("INSERT INTO districts (name, status, created_at) VALUES (?, 'inactive', NOW())");
        try { $st->execute([$name]); }
        catch (PDOException $e) { Response::error(409, 'این امور بهره‌برداری قبلاً ثبت شده است'); }
        Response::success(['id' => (int)$pdo->lastInsertId()], 'امور بهره‌برداری ایجاد شد', 201);
    });

    $router->put('districts/{id}', function ($id) {
        Auth::authenticate(); Auth::requirePermissionSoft('districts.update');
        // v4.3.81: تعریف/ویرایش امور فقط برای مدیر سیستم
        if (!Helpers::userCanChangeDistrict()) Response::error(403, 'مدیریت امور بهره‌برداری فقط برای مدیر سیستم مجاز است');
        $b = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();
        $fields = []; $params = [];
        if (array_key_exists('name', $b)) {
            $name = trim((string)$b['name']);
            if ($name === '') Response::error(400, 'نام امور بهره‌برداری نمی‌تواند خالی باشد');
            $fields[] = '`name` = ?'; $params[] = $name;
        }
        if (array_key_exists('status', $b)) {
            $fields[] = '`status` = ?'; $params[] = ((string)$b['status'] === 'inactive') ? 'inactive' : 'active';
        }
        if (!$fields) Response::error(400, 'فیلدی برای ویرایش ارسال نشده');
        $fields[] = 'updated_at = NOW()';
        $params[] = (int)$id;
        try { $pdo->prepare("UPDATE districts SET " . implode(',', $fields) . " WHERE id = ?")->execute($params); }
        catch (PDOException $e) { Response::error(409, 'ویرایش امور ناموفق بود: ' . fa_db_error($e)); }
        Response::success(null, 'امور بهره‌برداری ویرایش شد');
    });

    // حذف امور — فقط رکورد غیرفعال؛ وابستگی‌ها (خطوط/دکل‌ها/...) از طریق FK بررسی می‌شوند
    $router->delete('districts/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate(); Auth::requirePermissionSoft('districts.delete');
        // v4.3.81: حذف امور فقط برای مدیر سیستم
        if (!Helpers::userCanChangeDistrict()) Response::error(403, 'مدیریت امور بهره‌برداری فقط برای مدیر سیستم مجاز است');
        $guardedDelete('districts', 'امور بهره‌برداری', (int)$id);
    });

    // ============================================================
    //  Endpoint تجمیعی داده‌های مرجع — v3.5.2
    //  یک درخواست = پرسنل + مدارها + سیم‌ها + خطوط (سبک)
    //  هدف: باز شدن صفحه از ~۹ درخواست به ۱-۲ درخواست — هم سرعت، هم
    //  دوری از آستانه لایه ضد DDoS هاست (نت‌افراز) که بعد از ~۸ درخواست
    //  پشت‌سرهم فعال می‌شود
    //  اصول: هر بخش permission جداگانه دارد (بدون دسترسی = کلید حذف می‌شود، نه 403)
    //  و هر بخش try/catch خودش را دارد (خطای یک جدول بقیه را زمین نمی‌زند)
    // ============================================================
    $router->get('bootstrap', function () use ($towerRefUsesStatus) {
        Auth::authenticate();
        $pdo = Database::getInstance()->getConnection();

        $result = [
            'personnel'   => [],
            'circuits'    => [],
            'conductors'  => [],
            'lines'       => [],
            'tower_structures' => [],
            'tower_type_codes' => [],
            'generated_at'=> date('c'),
        ];
        $errors = [];

        // پرسنل — فقط فیلدهای لازم برای کمبوباکس‌ها (سبک)
        if (Auth::canAccess('personnel.view')) {
            try {
                $pCols = array_column($pdo->query('SHOW COLUMNS FROM personnel')->fetchAll(), 'Field');
                $pSel = ['id', 'personnel_code', 'first_name', 'last_name'];
                if (in_array('position', $pCols, true)) $pSel[] = 'position';
                elseif (in_array('personnel_type', $pCols, true)) $pSel[] = 'personnel_type AS position';
                else $pSel[] = 'NULL AS position';
                if (in_array('supervisor_name', $pCols, true)) $pSel[] = 'supervisor_name';
                $result['personnel'] = $pdo->query(
                    'SELECT ' . implode(', ', $pSel) . ' FROM personnel ORDER BY first_name, last_name'
                )->fetchAll();
            } catch (Exception $e) {
                $errors['personnel'] = 'در دسترس نیست';
                Logger::error('bootstrap/personnel: ' . $e->getMessage());
            }
        }

        // مدارها — کدهای دیسپاچینگ
        if (Auth::canAccess('circuits.view')) {
            try {
                $result['circuits'] = $pdo->query(
                    "SELECT id, dispatch_code, name, voltage FROM circuits ORDER BY dispatch_code"
                )->fetchAll();
            } catch (Exception $e) {
                $errors['circuits'] = 'در دسترس نیست';
                Logger::error('bootstrap/circuits: ' . $e->getMessage());
            }
        }

        // انواع سیم‌ها — کامل (۱۵ ردیف، سبک)
        // v4.3.55: سازگاری با ساختار قدیمی دیتابیس (is_active به‌جای status)
        if (Auth::canAccess('conductors.view')) {
            try {
                $condWhere = $towerRefUsesStatus($pdo, 'conductors') ? "status = 'active'" : 'is_active = 1';
                $result['conductors'] = $pdo->query(
                    "SELECT * FROM conductors WHERE $condWhere ORDER BY sectional_area_all"
                )->fetchAll();
            } catch (Exception $e) {
                $errors['conductors'] = 'در دسترس نیست';
                Logger::error('bootstrap/conductors: ' . $e->getMessage());
            }
        }

        // مراجع دکل
        if (Auth::canAccess('towers.view')) {
            try {
                $tsWhere = $towerRefUsesStatus($pdo, 'tower_structures') ? "status = 'active'" : 'is_active = 1';
                $tcWhere = $towerRefUsesStatus($pdo, 'tower_type_codes') ? "status = 'active'" : 'is_active = 1';
                $result['tower_structures'] = $pdo->query("SELECT id,name,sort_order FROM tower_structures WHERE $tsWhere ORDER BY sort_order,id")->fetchAll();
                $result['tower_type_codes'] = $pdo->query("SELECT id,code,title,sort_order FROM tower_type_codes WHERE $tcWhere ORDER BY sort_order,id")->fetchAll();
            } catch (Exception $e) { $errors['tower_references'] = 'در دسترس نیست'; }
        }

        // خطوط — فقط فیلدهای سبک (دکل‌ها عمداً اینجا نیستند: ~۲۶۰۰ ردیف)
        if (Auth::canAccess('lines.view')) {
            try {
                $result['lines'] = $pdo->query(
                    "SELECT l.id, l.line_code, l.name, l.voltage_kv, l.dispatch_code,
                            l.conductor_type, l.tower_structure,
                            (SELECT COUNT(*) FROM towers tt WHERE tt.line_id=l.id AND tt.status = 'active') AS tower_count,
                            CASE WHEN (SELECT COUNT(*) FROM towers tt2 WHERE tt2.line_id=l.id AND tt2.status = 'active') > 0
                                 THEN 1 ELSE 0 END AS tower_structure_locked,
                            l.status
                     FROM `lines` l ORDER BY l.line_code"
                )->fetchAll();
            } catch (Exception $e) {
                $errors['lines'] = 'در دسترس نیست';
                Logger::error('bootstrap/lines: ' . $e->getMessage());
            }
        }

        $result['errors'] = $errors ?: null; // null به‌جای آرایه خالی — تمیزتر در JSON
        Response::success($result, 'داده‌های مرجع');
    });

    // ============================================================
    //  قراردادها (Contracts) — CRUD کامل
    // ============================================================
    $router->get('contracts', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('contracts.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch(); $status = Helpers::query('status');
        $where = '1=1'; $params = [];
        if (!empty($search)) { $where .= ' AND (c.contract_code LIKE ? OR c.title LIKE ?)'; $sp = "%$search%"; $params[] = $sp; $params[] = $sp; }
        if ($status) { $where .= ' AND c.status = ?'; $params[] = $status; }
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM contracts c WHERE $where"); $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        $stmt = $pdo->prepare("SELECT c.*, ct.contractor_name AS contractor_name FROM contracts c LEFT JOIN contractors ct ON ct.id = c.contractor_id WHERE $where ORDER BY c.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    $router->post('contracts', function () {
        Auth::authenticate(); Auth::requirePermission('contracts.create');
        $body = Helpers::getJsonBody();
        $title = trim((string)($body['title'] ?? ''));
        if ($title === '') Response::error(400, 'عنوان قرارداد الزامی است');
        $contractorId = (int)($body['contractor_id'] ?? 0);
        if ($contractorId <= 0) Response::error(400, 'انتخاب پیمانکار الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $chk = $pdo->prepare("SELECT id FROM contractors WHERE id = ? LIMIT 1");
        $chk->execute([$contractorId]);
        if (!$chk->fetchColumn()) Response::error(400, 'پیمانکار انتخاب‌شده وجود ندارد');
        $code = trim((string)($body['contract_code'] ?? ''));
        if ($code === '') Response::error(400, 'کد قرارداد الزامی است و باید توسط کاربر وارد شود.');
        $start = !empty($body['start_date']) ? $body['start_date'] : date('Y-m-d');
        $end = !empty($body['end_date']) ? $body['end_date'] : date('Y-m-d', strtotime('+1 year'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$end)) Response::error(400, 'فرمت تاریخ قرارداد نامعتبر است');
        if ($end < $start) Response::error(400, 'تاریخ پایان نمی‌تواند قبل از شروع باشد');
        $type = (string)($body['contract_type'] ?? 'maintenance');
        if (!in_array($type, ['maintenance','construction','inspection','consulting','supply'], true)) Response::error(400, 'نوع قرارداد نامعتبر است');
        // v4.3.78: وضعیت چهارگانهٔ قرارداد — فعال / غیرفعال / پیش‌نویس / اتمام قرارداد
        // (expired و terminated و completed در نمایش همه «اتمام قرارداد» هستند)
        $status = (string)($body['status'] ?? 'inactive');
        if (!in_array($status, ['draft', 'active', 'inactive', 'expired', 'terminated', 'completed'], true)) {
            Response::error(400, 'وضعیت قرارداد نامعتبر است');
        }
        // فرم قدیمی ممکن است مقدار نمایشی بفرستد — به مقدار دیتابیسی ترجمه می‌شود
        if ($status === 'finished') $status = 'completed';
        $stmt = $pdo->prepare("INSERT INTO contracts (contract_code, title, contractor_id, organization_id, contract_type, start_date, end_date, amount, currency, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IRR', ?, ?, NOW())");
        try {
            $stmt->execute([$code, $title, $contractorId, $body['organization_id'] ?? null, $type, $start, $end, (float)($body['amount'] ?? 0), $status, $body['notes'] ?? null]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') Response::error(409, 'کد قرارداد تکراری است یا ارتباط پیمانکار/سازمان معتبر نیست.');
            Response::error(500, 'ثبت قرارداد ناموفق بود: ' . fa_db_error($e));
        }
        Response::success(['id' => (int)$pdo->lastInsertId(), 'contract_code' => $code], 'قرارداد ایجاد شد', 201);
    });

    $router->put('contracts/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('contracts.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['contract_code', 'title', 'contractor_id', 'contract_type', 'start_date', 'end_date', 'amount', 'status', 'notes'];
        $updates = []; $params = [];
        foreach ($fields as $f) {
            if (!array_key_exists($f, $body)) continue;
            $v = $body[$f];
            if ($f === 'contract_code' && trim((string)$v) === '') Response::error(400, 'کد قرارداد الزامی است و باید توسط کاربر وارد شود.');
            if ($f === 'contract_code') $v = trim((string)$v);
            // v4.3.78: اعتبارسنجی وضعیت چهارگانه در ویرایش
            if ($f === 'status') {
                $sv = (string)$v;
                if ($sv === 'finished') $sv = 'completed';
                if (!in_array($sv, ['draft', 'active', 'inactive', 'expired', 'terminated', 'completed'], true)) {
                    Response::error(400, 'وضعیت قرارداد نامعتبر است');
                }
                $v = $sv;
            }
            $updates[] = "`$f` = ?"; $params[] = $v;
        }
        if (empty($updates)) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        try {
            $pdo->prepare("UPDATE contracts SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') Response::error(409, 'کد قرارداد تکراری است یا ارتباط یکی از اطلاعات مرتبط معتبر نیست.');
            Response::error(500, 'ویرایش قرارداد ناموفق بود: ' . fa_db_error($e));
        }
        Response::success(null, 'قرارداد ویرایش شد');
    });

    $router->delete('contracts/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate(); Auth::requirePermission('contracts.delete');
        $pdo = Database::getInstance()->getConnection();
        $chk = $pdo->prepare("SELECT status FROM contracts WHERE id = ? LIMIT 1");
        $chk->execute([(int)$id]);
        $status = $chk->fetchColumn();
        if ($status === false) Response::error(404, 'قرارداد پیدا نشد یا قبلاً حذف شده است');
        if (strtolower((string)$status) === 'active') {
            Response::error(409, 'حذف قرارداد انجام نشد. این قرارداد در حال حاضر «فعال» است و برای جلوگیری از حذف ناخواسته، حذف قرارداد فعال مجاز نیست. ابتدا وضعیت قرارداد را از «فعال» خارج کنید و سپس، پس از برداشتن تمام وابستگی‌ها، دوباره برای حذف اقدام کنید.');
        }
        $guardedDelete('contracts', 'قرارداد', (int)$id, ['invoices' => 'صورت‌وضعیت‌ها']);
    });

    // ============================================================
    //  صورت‌وضعیت‌ها (Invoices) — CRUD کامل
    // ============================================================
    $router->get('invoices', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('financial.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch(); $status = Helpers::query('status');
        $contractId = Helpers::getContractId();
        $where = '1=1'; $params = [];
        if ($contractId === 0) { $where .= ' AND i.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND i.contract_id = ?'; $params[] = $contractId; }
        if (!empty($search)) { $where .= ' AND (i.invoice_code LIKE ? OR c.title LIKE ?)'; $sp = "%$search%"; $params[] = $sp; $params[] = $sp; }
        if ($status) { $where .= ' AND i.status = ?'; $params[] = $status; }
        // v4.3.78: کاربر اموردار فقط صورت‌وضعیت‌های امور خودش را می‌بیند
        $where .= Helpers::districtWhere('i', 'invoices', $params);
        $disJoin = Helpers::districtJoin('i', 'invoices');
        $disSel = Helpers::districtSelect();
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM invoices i LEFT JOIN contracts c ON c.id = i.contract_id WHERE $where"); $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        $stmt = $pdo->prepare("SELECT i.*, c.title AS contract_title, ct.contractor_name AS contractor_name$disSel FROM invoices i LEFT JOIN contracts c ON c.id = i.contract_id LEFT JOIN contractors ct ON ct.id = i.contractor_id$disJoin WHERE $where ORDER BY i.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    $router->post('invoices', function () {
        $user = Auth::authenticate(); Auth::requirePermission('financial.create');
        $body = Helpers::getJsonBody();
        if (empty($body['contract_id'])) Response::error(400, 'قرارداد الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $code = 'INV-' . date('Y') . '-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $total = $body['total_amount'] ?? 0; $tax = $total * 0.1; $final = $total + $tax;
        // v4.3.78: امور بهره‌برداری + وضعیت پیش‌فرض «غیرفعال» (activity_status)
        $districtId = Helpers::districtFromBody($body, 'invoices');
        $cols = ['invoice_code', 'contract_id', 'contractor_id', 'period_start', 'period_end', 'total_amount', 'tax_amount', 'final_amount', 'status', 'created_at'];
        $vals = ['?', '?', '?', '?', '?', '?', '?', '?', "'draft'", 'NOW()'];
        $params = [$code, (int)$body['contract_id'], $body['contractor_id'] ?? null, $body['period_start'] ?? date('Y-m-d'), $body['period_end'] ?? date('Y-m-d'), $total, $tax, $final];
        if (Helpers::columnExists('invoices', 'activity_status')) { $cols[] = 'activity_status'; $vals[] = "'inactive'"; }
        if (Helpers::columnExists('invoices', 'district_id')) { $cols[] = 'district_id'; $vals[] = '?'; $params[] = $districtId; }
        $stmt = $pdo->prepare("INSERT INTO invoices (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ")");
        $stmt->execute($params);
        Response::success(['id' => (int)$pdo->lastInsertId(), 'invoice_code' => $code], 'صورت‌وضعیت ایجاد شد', 201);
    });

    $router->put('invoices/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermission('financial.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);

        $existing = $pdo->prepare('SELECT id FROM invoices WHERE id = ?');
        $existing->execute([(int)$id]);
        if (!$existing->fetch()) Response::error(404, 'صورت‌وضعیت پیدا نشد');

        $fields = ['contract_id', 'contractor_id', 'period_start', 'period_end', 'total_amount', 'status'];
        // v4.3.78: ویرایش امور بهره‌برداری و وضعیت فعال/غیرفعال
        if (Helpers::columnExists('invoices', 'district_id')) $fields[] = 'district_id';
        if (Helpers::columnExists('invoices', 'activity_status')) $fields[] = 'activity_status';
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = ($body[$f] === '' ? null : $body[$f]); } }
        if (!$updates) Response::error(400, 'هیچ فیلدی ارسال نشده');

        // اگر مبلغ کل تغییر کرد، مالیات و مبلغ نهایی از نو محاسبه می‌شوند
        if (array_key_exists('total_amount', $body)) {
            $total = (float)($body['total_amount'] ?? 0);
            $updates[] = '`tax_amount` = ?'; $params[] = $total * 0.1;
            $updates[] = '`final_amount` = ?'; $params[] = $total * 1.1;
        }

        $params[] = (int)$id;
        $pdo->prepare('UPDATE invoices SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
        Response::success(null, 'صورت‌وضعیت ویرایش شد');
    });

    $router->post('invoices/{id}/approve', function ($id) {
        $user = Auth::authenticate(); Auth::requirePermission('financial.approve');
        $pdo = Database::getInstance()->getConnection();
        $pdo->prepare("UPDATE invoices SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?")->execute([$user['id'], (int)$id]);
        Response::success(null, 'صورت‌وضعیت تأیید شد');
    });

    $router->post('invoices/{id}/pay', function ($id) {
        $user = Auth::authenticate(); Auth::requirePermission('financial.pay');
        $pdo = Database::getInstance()->getConnection();
        $pdo->prepare("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?")->execute([(int)$id]);
        Response::success(null, 'پرداخت ثبت شد');
    });

    // v4.3.78: حذف صورت‌وضعیت — فقط رکوردِ غیرفعال (امنیت داده)
    $router->delete('invoices/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate(); Auth::requirePermission('financial.delete');
        $guardedDelete('invoices', 'صورت‌وضعیت', (int)$id);
    });

    // ============================================================
    //  ایمنی (Safety) — CRUD کامل
    // ============================================================
    $router->get('safety-incidents', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('safety.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch(); $type = Helpers::query('incident_type');
        $contractId = Helpers::getContractId();
        $where = '1=1'; $params = [];
        if ($contractId === 0) { $where .= ' AND s.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND s.contract_id = ?'; $params[] = $contractId; }
        if (!empty($search)) { $where .= ' AND (s.incident_code LIKE ? OR s.title LIKE ?)'; $sp = "%$search%"; $params[] = $sp; $params[] = $sp; }
        if ($type) { $where .= ' AND s.incident_type = ?'; $params[] = $type; }
        // v4.3.78: کاربر اموردار فقط حوادث امور خودش را می‌بیند
        $where .= Helpers::districtWhere('s', 'safety_incidents', $params);
        $disJoin = Helpers::districtJoin('s', 'safety_incidents');
        $disSel = Helpers::districtSelect();
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM safety_incidents s WHERE $where"); $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        $stmt = $pdo->prepare("SELECT s.*, l.line_code, t.tower_code, c.title AS contract_title$disSel FROM safety_incidents s LEFT JOIN `lines` l ON l.id = s.line_id LEFT JOIN towers t ON t.id = s.tower_id LEFT JOIN contracts c ON c.id = s.contract_id$disJoin WHERE $where ORDER BY s.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    $router->post('safety-incidents', function () {
        $user = Auth::authenticate(); Auth::requirePermission('safety.create');
        $body = Helpers::getJsonBody();
        if (empty($body['title'])) Response::error(400, 'عنوان الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $code = 'SI-' . date('Y') . '-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        // v4.3.78: امور بهره‌برداری + وضعیت پیش‌فرض «غیرفعال» (activity_status)
        $districtId = Helpers::districtFromBody($body, 'safety_incidents');
        $cols = ['incident_code', 'incident_type', 'severity', 'title', 'description', 'occurred_at', 'location_desc', 'line_id', 'tower_id', 'contract_id', 'work_order_id', 'reporter_id', 'status', 'created_at'];
        $vals = ['?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', "'reported'", 'NOW()'];
        $params = [$code, $body['incident_type'] ?? 'near_miss', $body['severity'] ?? 'none', $body['title'], $body['description'] ?? null, $body['occurred_at'] ?? date('Y-m-d H:i:s'), $body['location_desc'] ?? null, $body['line_id'] ?? null, $body['tower_id'] ?? null, $body['contract_id'] ?? null, $body['work_order_id'] ?? null, $user['id']];
        if (Helpers::columnExists('safety_incidents', 'activity_status')) { $cols[] = 'activity_status'; $vals[] = "'inactive'"; }
        if (Helpers::columnExists('safety_incidents', 'district_id')) { $cols[] = 'district_id'; $vals[] = '?'; $params[] = $districtId; }
        $stmt = $pdo->prepare("INSERT INTO safety_incidents (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ")");
        $stmt->execute($params);
        Response::success(['id' => (int)$pdo->lastInsertId(), 'incident_code' => $code], 'حادثه ثبت شد', 201);
    });

    $router->put('safety-incidents/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('safety.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['title', 'description', 'severity', 'status', 'root_cause', 'corrective_actions', 'preventive_actions', 'contract_id', 'line_id', 'tower_id', 'occurred_at', 'location_desc', 'incident_type'];
        // v4.3.78: ویرایش امور بهره‌برداری و وضعیت فعال/غیرفعال
        if (Helpers::columnExists('safety_incidents', 'district_id')) $fields[] = 'district_id';
        if (Helpers::columnExists('safety_incidents', 'activity_status')) $fields[] = 'activity_status';
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = ($body[$f] === '' ? null : $body[$f]); } }
        if (empty($updates)) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        $pdo->prepare("UPDATE safety_incidents SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'حادثه ویرایش شد');
    });

    $router->delete('safety-incidents/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate(); Auth::requirePermission('safety.delete');
        // v4.3.78: حادثهٔ فعال قابل حذف نیست — ابتدا باید غیرفعال شود (امنیت داده)
        $guardedDelete('safety_incidents', 'حادثه', (int)$id);
    });

    // ============================================================
    //  پرسنل (Personnel) — CRUD کامل
    // ============================================================
    $router->get('personnel', function () use ($personnelPositionCol, $personnelCols) {
        Auth::authenticate();
        Auth::requirePermissionSoft('personnel.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        // v3.0.0: فیلتر نوع پرسنل — برای کمبوباکس‌های سرپرست اکیپ/کارشناس خط
        $contractId = Helpers::getContractId();
        $where = '1=1'; $params = [];
        if ($contractId === 0) { $where .= ' AND p.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND p.contract_id = ?'; $params[] = $contractId; }
        if (!empty($search)) {
            $searchCols = ['personnel_code', 'first_name', 'last_name', 'national_id', 'supervisor_name', 'father_name'];
            $posCol0 = $personnelPositionCol($pdo);
            if ($posCol0) $searchCols[] = $posCol0;
            $parts = [];
            foreach ($searchCols as $sc) { $parts[] = "p.`$sc` LIKE ?"; $params[] = "%$search%"; }
            $where .= ' AND (' . implode(' OR ', $parts) . ')';
        }
        // v4.3.78: کاربر اموردار فقط پرسنل امور خودش را می‌بیند
        $where .= Helpers::districtWhere('p', 'personnel', $params);
        $disJoin = Helpers::districtJoin('p', 'personnel');
        $disSel = Helpers::districtSelect();
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM personnel p WHERE $where"); $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        $posCol = $personnelPositionCol($pdo);
        $posSel = $posCol ? "p.`$posCol` AS position" : 'NULL AS position';
        $stmt = $pdo->prepare("SELECT p.*, u.username, c.title AS contract_title$disSel, $posSel FROM personnel p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN contracts c ON c.id = p.contract_id$disJoin WHERE $where ORDER BY p.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    $router->post('personnel', function () use ($personnelPositionCol, $personnelCols) {
        Auth::authenticate();
        Auth::requirePermissionSoft('personnel.create');
        $body = Helpers::getJsonBody();
        if (empty($body['first_name'])) Response::error(400, 'نام الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $code = $body['personnel_code'] ?? ('P-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT));
        // درج فقط با ستون‌های واقعی جدول — ستون‌های نبودِن نادیده گرفته می‌شوند
        $cols = $personnelCols($pdo);
        $insCols = [
            'organization_id' => $body['organization_id'] ?? 1,
            'user_id' => $body['user_id'] ?? null,
            'personnel_code' => $code,
            'first_name' => $body['first_name'],
            'last_name' => $body['last_name'] ?? '',
            'national_id' => $body['national_id'] ?? null,
        ];
        foreach (['father_name', 'supervisor_name', 'phone', 'mobile', 'email', 'hire_date', 'collaboration_start', 'contract_id'] as $opt) {
            if (isset($cols[$opt])) $insCols[$opt] = $body[$opt] ?? null;
        }
        // v4.3.78: امور بهره‌برداری پرسنل (اگر migration اجرا شده باشد)
        if (isset($cols['district_id'])) $insCols['district_id'] = Helpers::districtFromBody($body, 'personnel');
        $posCol = $personnelPositionCol($pdo);
        if ($posCol !== null) $insCols[$posCol] = $body['position'] ?? null;
        // v4.3.78: طبق سیاست امنیت داده، ثبت جدید پیش‌فرض «غیرفعال» است —
        // فعال‌سازی از طریق ویرایش گروهی انجام می‌شود
        if (isset($cols['status'])) $insCols['status'] = 'inactive';
        $colNames = implode(', ', array_map(fn($k) => "`$k`", array_keys($insCols)));
        $ph = implode(', ', array_fill(0, count($insCols), '?'));
        $stmt = $pdo->prepare("INSERT INTO personnel ($colNames, created_at) VALUES ($ph, NOW())");
        try {
            $stmt->execute(array_values($insCols));
        } catch (PDOException $e) {
            // کد پرسنلی/کد ملی یکتاست — پیام فارسی به‌جای خطای خام
            Response::error(409, str_contains($e->getMessage(), 'Duplicate') || str_contains($e->getMessage(), 'uniq_')
                ? 'این کد پرسنلی یا کد ملی قبلاً برای پرسنل دیگری ثبت شده است'
                : 'ثبت پرسنل ناموفق بود: ' . fa_db_error($e));
        }
        Response::success(['id' => (int)$pdo->lastInsertId(), 'personnel_code' => $code], 'پرسنل ایجاد شد', 201);
    });

    $router->put('personnel/{id}', function ($id) use ($personnelPositionCol, $personnelCols) {
        Auth::authenticate();
        Auth::requirePermissionSoft('personnel.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $cols = $personnelCols($pdo);
        $posCol = $personnelPositionCol($pdo);
        if ($posCol !== null && $posCol !== 'position' && array_key_exists('position', $body)) { $body[$posCol] = $body['position']; unset($body['position']); }
        $fields = ['first_name', 'last_name', 'national_id', 'phone', 'mobile', 'email', 'hire_date', 'contract_id', 'status', 'father_name', 'supervisor_name', 'collaboration_start', 'personnel_code'];
        if ($posCol !== null) $fields[] = $posCol;
        // v4.3.78: ویرایش امور بهره‌برداری پرسنل
        if (isset($cols['district_id'])) $fields[] = 'district_id';
        $fields = array_values(array_filter($fields, fn($f) => isset($cols[$f])));
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = $body[$f]; } }
        if (empty($updates)) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        $pdo->prepare("UPDATE personnel SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'پرسنل ویرایش شد');
    });

    $router->delete('personnel/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate();
        Auth::requirePermissionSoft('personnel.delete');
        $guardedDelete('personnel', 'پرسنل', (int)$id, ['defects.discovered_by' => 'عیوب (ثبت‌کننده)', 'inspections.inspector_id' => 'بازدیدها (بازرس)']);
    });

    // حذف انبوه پرسنل — v3.2.0: همان روش دکل‌ها/خطوط + مدیریت ارجاع‌های FK
    // نکته FK: crew_members و personnel_certificates خودکار CASCADE می‌شوند؛
    // work_orders.assigned_to و defects.repaired_by خودکار SET NULL؛
    // اما defects.discovered_by نوع NOT NULL بدون ON DELETE است → عیوب ثبت‌شده توسط پرسنلِ در حال حذف
    // به یک پرسنل جانشین (خارج از لیست حذف) منتقل می‌شوند؛ اگر جانشینی نباشد آن پرسنل‌ها حذف نمی‌شوند.
    // inspections.inspector_id نیز NULL می‌شود.
    $router->post('personnel/bulk-delete', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('personnel.delete');
        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 5000) Response::error(400, 'حداکثر ۵۰۰۰ ردیف در هر درخواست');
        $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));
        if (empty($ids)) Response::error(400, 'شناسه معتبری برای حذف ارسال نشده');

        $pdo = Database::getInstance()->getConnection();
        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
        $skipped = 0;

        // v4.3.77: پرسنلِ «فعال» قابل حذف نیست — ابتدا باید از طریق عملیات گروهی/ویرایش «غیرفعال» شود.
        // مقدار وضعیت در اسکیماهای مختلف active یا 1 است؛ هر دو پوشش داده می‌شوند.
        $activeStmt = $pdo->prepare("SELECT COUNT(*) FROM personnel WHERE id IN ($idPlaceholders) AND LOWER(TRIM(COALESCE(status, ''))) IN ('active', '1', 'true')");
        $activeStmt->execute($ids);
        $activeCount = (int) $activeStmt->fetchColumn();
        if ($activeCount > 0) {
            Response::error(409, "حذف انجام نشد.\n\n$activeCount پرسنل انتخاب‌شده وضعیت «فعال» دارد — برای امنیت داده، ابتدا وضعیت را «غیرفعال» کنید؛ رکوردهای غیرفعال قابل حذف هستند.");
        }

        try {
            $pdo->beginTransaction();

            // یافتن پرسنل جانشین: اولین پرسنل فعال خارج از لیست حذف
            $surrogate = null;
            $inList = '(' . $idPlaceholders . ')';
            $stmt = $pdo->prepare("SELECT id FROM personnel WHERE id NOT IN $inList AND status = 'active' ORDER BY id LIMIT 1");
            $stmt->execute($ids);
            if ($row = $stmt->fetch()) $surrogate = (int) $row['id'];

            // عیوب ثبت‌شده توسط پرسنل در حال حذف
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM defects WHERE discovered_by IN $inList");
            $stmt->execute($ids);
            $hasDefects = (int) $stmt->fetchColumn() > 0;

            $deleteIds = $ids;
            if ($hasDefects && $surrogate === null) {
                // جانشینی نیست — فقط پرسنل‌های بدون عیب ثبت‌شده حذف شوند
                $stmt = $pdo->prepare("SELECT id FROM personnel WHERE id IN $inList AND id NOT IN (SELECT DISTINCT discovered_by FROM defects WHERE discovered_by IS NOT NULL)");
                $stmt->execute($ids);
                $deleteIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));
                $skipped = count($ids) - count($deleteIds);
                if (empty($deleteIds)) {
                    $pdo->rollBack();
                    Response::error(409, 'این پرسنل(ها) عیوبی ثبت کرده‌اند و پرسنل جانشینی برای انتقال باقی نمانده — ابتدا عیوب را مدیریت کنید یا یک پرسنل جدید ثبت کنید');
                }
            } elseif ($hasDefects) {
                // انتقال عیوب به جانشین
                $pdo->prepare("UPDATE defects SET discovered_by = ? WHERE discovered_by IN $inList")->execute(array_merge([$surrogate], $ids));
            }

            $delPlaceholders = implode(',', array_fill(0, count($deleteIds), '?'));
            // v3.5.1: inspections.inspector_id از نوع NOT NULL است — به‌جای NULL کردن،
            // بازدیدها به پرسنل جانشین منتقل می‌شوند (مثل عیوب)؛ اگر جانشینی نبود،
            // پرسنل دارای بازدید از حذف خارج می‌شوند تا خطای 500 پیش نیاید
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM inspections WHERE inspector_id IN ($delPlaceholders)");
            $stmt->execute($deleteIds);
            $hasInspections = (int) $stmt->fetchColumn() > 0;
            if ($hasInspections) {
                if ($surrogate !== null) {
                    $pdo->prepare("UPDATE inspections SET inspector_id = ? WHERE inspector_id IN ($delPlaceholders)")
                        ->execute(array_merge([$surrogate], $deleteIds));
                } else {
                    // بدون جانشین — پرسنل دارای بازدید را از حذف خارج کن
                    $stmt = $pdo->prepare("SELECT id FROM personnel WHERE id IN ($delPlaceholders) AND id NOT IN (SELECT DISTINCT inspector_id FROM inspections WHERE inspector_id IS NOT NULL)");
                    $stmt->execute($deleteIds);
                    $deleteIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));
                    $skipped += count($ids) - count($deleteIds);
                    if (empty($deleteIds)) {
                        $pdo->rollBack();
                        Response::error(409, 'این پرسنل(ها) بازدیدهایی ثبت کرده‌اند و پرسنل جانشینی برای انتقال باقی نمانده — ابتدا بازدیدها را مدیریت کنید یا یک پرسنل جدید ثبت کنید');
                    }
                    $delPlaceholders = implode(',', array_fill(0, count($deleteIds), '?'));
                }
            }
            // حذف (crew_members و personnel_certificates خودکار CASCADE)
            $stmt = $pdo->prepare("DELETE FROM personnel WHERE id IN ($delPlaceholders)");
            $stmt->execute($deleteIds);
            $deleted = $stmt->rowCount();
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error("Personnel bulk-delete failed", ['error' => $e->getMessage()]);
            Response::error(500, 'حذف انبوه پرسنل ناموفق بود: ' . fa_db_error($e));
        }

        Logger::info('Personnel bulk-deleted', ['count' => $deleted, 'skipped' => $skipped, 'user_id' => $user['id']]);
        Response::success(['deleted' => $deleted, 'skipped' => $skipped], "{$deleted} پرسنل حذف شد" . ($skipped > 0 ? " ({$skipped} مورد به‌دلیل ثبت عیب رد شد)" : ''));
    });

    // ویرایش گروهی پرسنل — v4.3.73: حداکثر ۱۰۰ ردیف در هر درخواست با یک UPDATE
    // (درخواست‌های موازی زیاد روی هاست اشتراکی مسدود می‌شدند و فعال‌کردن گروهی خطا می‌داد)
    // بدنه: {"ids":[...], "patch":{"status":"active", "position":"...", "supervisor_name":"...", "contract_id":2|null}}
    $router->post('personnel/bulk-update', function () use ($personnelPositionCol, $personnelCols) {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('personnel.update');

        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        // v4.3.81: قفل امور — وصلهٔ گروهی امور فقط برای مدیر
        $patch = Helpers::stripDistrictForNonAdmin($body['patch'] ?? []);
        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 100) Response::error(400, 'حداکثر ۱۰۰ پرسنل در هر درخواست');
        if (!is_array($patch) || count($patch) === 0) Response::error(400, 'مقدار ویرایش ارسال نشده');

        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($v) => $v > 0)));
        if (count($ids) === 0) Response::error(400, 'شناسه معتبر ارسال نشده');

        // فقط فیلدهای مجاز که در این دیتابیس واقعاً وجود دارند
        $cols = $personnelCols($pdo = Database::getInstance()->getConnection());
        $allowed = ['status', 'supervisor_name', 'contract_id'];
        // v4.3.78: ویرایش گروهی امور بهره‌برداری پرسنل
        if (isset($cols['district_id'])) $allowed[] = 'district_id';
        $posCol = $personnelPositionCol($pdo);
        if ($posCol !== null) $allowed[] = $posCol;

        $updates = []; $params = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $patch)) {
                $updates[] = "`$field` = ?";
                $params[] = $patch[$field];
            }
        }
        if (!$updates) Response::error(400, 'هیچ فیلد مجازی برای ویرایش ارسال نشده');

        $ph = implode(',', array_fill(0, count($ids), '?'));
        try {
            $stmt = $pdo->prepare('UPDATE personnel SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id IN (' . $ph . ')');
            $stmt->execute(array_merge($params, $ids));
            $updated = $stmt->rowCount();
        } catch (PDOException $e) {
            Response::error(500, 'ویرایش گروهی پرسنل ناموفق بود: ' . fa_db_error($e));
        }
        Logger::info('Personnel bulk-updated', ['count' => $updated, 'user_id' => $user['id']]);
        Response::success(['updated' => $updated], "{$updated} پرسنل ویرایش شد");
    });

    // ورود انبوه پرسنل — v3.1.0: درج یا ویرایش بر اساس کد ملی / کد پرسنلی
    $router->post('personnel/bulk-import', function () use ($personnelPositionCol, $personnelCols) {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('personnel.create');
        $body = Helpers::getJsonBody();
        // v4.3.81: امورِ ایمپورت برای کاربر اموردار خودکار
        $rows = Helpers::forceDistrictOnRows($body['rows'] ?? []);
        if (!is_array($rows) || count($rows) === 0) Response::error(400, 'لیست ردیف‌ها ارسال نشده');
        if (count($rows) > 500) Response::error(400, 'حداکثر ۵۰۰ ردیف در هر درخواست');

        $pdo = Database::getInstance()->getConnection();
        $inserted = 0; $updated = 0; $failed = 0; $firstError = '';
        $statuses = []; $errors = [];

        try {
            $pdo->beginTransaction();
            // کش بر اساس کد ملی و کد پرسنلی
            $byNat = []; $byCode = [];
            foreach ($pdo->query("SELECT id, national_id, personnel_code FROM personnel")->fetchAll() as $r) {
                if (!empty($r['national_id'])) $byNat[trim((string) $r['national_id'])] = (int) $r['id'];
                if (!empty($r['personnel_code'])) $byCode[trim((string) $r['personnel_code'])] = (int) $r['id'];
            }

            $cols = $personnelCols($pdo);
            $posCol = $personnelPositionCol($pdo);
            // ساخت پویا بر اساس ستون‌های واقعی جدول
            $insMap = ['organization_id' => 4, 'personnel_code' => null, 'first_name' => null, 'last_name' => null,
                       'national_id' => null, 'father_name' => null, 'phone' => null, 'mobile' => null,
                       'email' => null, 'supervisor_name' => null, 'collaboration_start' => null];
            if ($posCol !== null) $insMap[$posCol] = null;
            if (isset($cols['status'])) $insMap['status'] = 1;
            $insKeys = array_keys(array_filter($insMap, fn($k) => isset($cols[$k]), ARRAY_FILTER_USE_KEY));
            $insPh = implode(', ', array_map(fn($k) => $k === 'organization_id' ? '4' : ($k === 'status' ? '1' : '?'), $insKeys));
            $ins = $pdo->prepare('INSERT INTO personnel (' . implode(',', array_map(fn($k) => "`$k`", $insKeys)) . ", created_at) VALUES ($insPh, NOW())");
            // ترتیب پارامترها = کلیدهای به‌جز organization_id/status
            $insParamKeys = array_values(array_filter($insKeys, fn($k) => $k !== 'organization_id' && $k !== 'status'));

            $updMap = ['first_name' => null, 'last_name' => null, 'national_id' => null, 'father_name' => null,
                       'phone' => null, 'mobile' => null, 'email' => null, 'supervisor_name' => null, 'collaboration_start' => null];
            if ($posCol !== null) $updMap[$posCol] = null;
            $updKeys = array_keys(array_filter($updMap, fn($k) => isset($cols[$k]), ARRAY_FILTER_USE_KEY));
            $upd = $pdo->prepare('UPDATE personnel SET ' . implode(', ', array_map(fn($k) => "`$k` = ?", $updKeys)) . ' WHERE id = ?');
            $updParamKeys = $updKeys;

            foreach ($rows as $i => $r) {
                try {
                    $first = trim((string) ($r['first_name'] ?? ''));
                    $last = trim((string) ($r['last_name'] ?? ''));
                    if ($first === '') throw new Exception('نام الزامی است');

                    $nat = isset($r['national_id']) && $r['national_id'] !== '' ? trim((string) $r['national_id']) : null;
                    $father = isset($r['father_name']) && $r['father_name'] !== '' ? $r['father_name'] : null;
                    $position = isset($r['position']) && $r['position'] !== '' ? $r['position'] : null;

                    // تشخیص ردیف موجود
                    $existingId = null;
                    if (!empty($r['id'])) $existingId = (int) $r['id'];
                    elseif ($nat && isset($byNat[$nat])) $existingId = $byNat[$nat];
                    elseif (!empty($r['personnel_code']) && isset($byCode[trim((string) $r['personnel_code'])])) $existingId = $byCode[trim((string) $r['personnel_code'])];

                    $vals = ['first_name' => $first, 'last_name' => $last, 'national_id' => $nat, 'father_name' => $father,
                        'phone' => $r['phone'] ?? null, 'mobile' => $r['mobile'] ?? null, 'email' => $r['email'] ?? null,
                        'supervisor_name' => $r['supervisor_name'] ?? null, 'collaboration_start' => $r['collaboration_start'] ?? null,
                        'position' => $position];
                    if ($posCol !== null && $posCol !== 'position') { $vals[$posCol] = $position; }
                    if ($existingId) {
                        $upd->execute([...array_map(fn($k) => $vals[$k] ?? null, $updParamKeys), $existingId]);
                        $updated++; $statuses[] = 'updated'; $errors[] = null;
                    } else {
                        $code = !empty($r['personnel_code']) ? $r['personnel_code'] : ('P-' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT));
                        $ins->execute(array_map(fn($k) => $k === 'personnel_code' ? $code : ($vals[$k] ?? null), $insParamKeys));
                        $newId = (int) $pdo->lastInsertId();
                        if ($nat) $byNat[$nat] = $newId;
                        if (!empty($code)) $byCode[$code] = $newId;
                        $inserted++; $statuses[] = 'inserted'; $errors[] = null;
                    }
                } catch (Exception $e) {
                    $failed++; $statuses[] = 'failed';
                    $errors[] = $e->getMessage();
                    if ($firstError === '') $firstError = $e->getMessage();
                }
            }
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Response::error(500, 'ورود انبوه پرسنل ناموفق بود: ' . fa_db_error($e));
        }

        Response::success([
            'inserted' => $inserted, 'updated' => $updated, 'failed' => $failed,
            'first_error' => $firstError, 'statuses' => $statuses, 'errors' => $errors,
        ], "درج: {$inserted} | ویرایش: {$updated} | خطا: {$failed}");
    });


    // ============================================================
    //  انواع سیم‌ها (Conductors) — v3.5.0: ماژول جدید
    //  منبع: Conductors Standard.xlsx — ۱۵ سیم ACSR (نام ستون‌ها انگلیسی مطابق اکسل)
    // ============================================================
    $conductorFields = fn($r) => [
        'name' => trim((string) ($r['name'] ?? '')),
        'type' => $r['type'] ?? 'ACSR',
        'type_code' => $r['type_code'] ?? null,
        'standard' => $r['standard'] ?? null,
        'core_type' => $r['core_type'] ?? null,
        'material_outer' => $r['material_outer'] ?? null,
        'material_inner' => $r['material_inner'] ?? null,
        'stranding_outer' => $r['stranding_outer'] ?? null,
        'stranding_inner' => $r['stranding_inner'] ?? null,
        'sectional_area_outer' => ($t = $r['sectional_area_outer'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'sectional_area_all' => ($t = $r['sectional_area_all'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'overall_diameter_all' => ($t = $r['overall_diameter_all'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'overall_diameter_inner' => ($t = $r['overall_diameter_inner'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'diameter_code_all' => $r['diameter_code_all'] ?? null,
        'diameter_code_inner' => $r['diameter_code_inner'] ?? null,
        'weight_all' => ($t = $r['weight_all'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'weight_inner' => ($t = $r['weight_inner'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'weight_outer' => ($t = $r['weight_outer'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'ultimate_strength' => ($t = $r['ultimate_strength'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'resistance' => ($t = $r['resistance'] ?? null) !== null && $t !== '' ? (float)$t : null,
        'status' => isset($r['status']) ? (string)$r['status'] : (isset($r['is_active']) && (int)$r['is_active'] === 0 ? 'inactive' : 'active'),
    ];
    $conductorCols = "(`name`,`type`,`type_code`,`standard`,`core_type`,`material_outer`,`material_inner`,`stranding_outer`,`stranding_inner`,`sectional_area_outer`,`sectional_area_all`,`overall_diameter_all`,`overall_diameter_inner`,`diameter_code_all`,`diameter_code_inner`,`weight_all`,`weight_inner`,`weight_outer`,`ultimate_strength`,`resistance`,`status`)";

    $router->get('conductors', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('conductors.view');
        $pdo = Database::getInstance()->getConnection();
        $search = Helpers::getSearch();
        $where = '1=1'; $params = [];
        if (!empty($search)) {
            $where .= ' AND (c.name LIKE ? OR c.standard LIKE ? OR c.type LIKE ?)';
            $sp = "%$search%"; $params[] = $sp; $params[] = $sp; $params[] = $sp;
        }
        $stmt = $pdo->prepare("SELECT c.* FROM conductors c WHERE $where ORDER BY c.id LIMIT 1000");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        // مرتب‌سازی دستی برای سازگاری MariaDB قدیمی (NULLS LAST)
        usort($rows, fn($a, $b) => ($a['sectional_area_all'] ?? 0) <=> ($b['sectional_area_all'] ?? 0));
        Response::success($rows);
    });

    $router->post('conductors', function () use ($towerRefUsesStatus) {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('conductors.create');
        $body = Helpers::getJsonBody();
        $f = $conductorFields($body);
        if ($f['name'] === '') Response::error(400, 'نام سیم الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare("SELECT id FROM conductors WHERE name = ? LIMIT 1");
        $stmt->execute([$f['name']]);
        if ($stmt->fetch()) Response::error(409, 'این نام سیم قبلاً ثبت شده است');
        // v4.3.55: نگاشت status فرانت‌اند به ستون واقعی جدول (status یا is_active)
        if (!$towerRefUsesStatus($pdo, 'conductors')) {
            $f['is_active'] = (($f['status'] ?? 'active') === 'inactive') ? 0 : 1;
            unset($f['status']);
        }
        $cols = '(' . implode(',', array_map(fn($k) => "`$k`", array_keys($f))) . ')';
        $vals = array_values($f);
        $ph = implode(',', array_fill(0, count($vals), '?'));
        $pdo->prepare("INSERT INTO conductors $cols VALUES ($ph, NOW())")->execute($vals);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'سیم ایجاد شد', 201);
    });

    $router->put('conductors/{id}', function ($id) use ($towerRefUsesStatus) {
        Auth::authenticate();
        Auth::requirePermissionSoft('conductors.update');
        $body = Helpers::getJsonBody();
        $f = $conductorFields($body);
        if ($f['name'] === '') Response::error(400, 'نام سیم الزامی است');
        $pdo = Database::getInstance()->getConnection();
        // v4.3.55: نگاشت status فرانت‌اند به ستون واقعی جدول (status یا is_active)
        if (!$towerRefUsesStatus($pdo, 'conductors')) {
            $f['is_active'] = (($f['status'] ?? 'active') === 'inactive') ? 0 : 1;
            unset($f['status']);
        }
        $vals = array_values($f);
        $vals[] = (int) $id;
        $sets = implode(',', array_map(fn($k) => "`$k` = ?", array_keys($f)));
        $pdo->prepare("UPDATE conductors SET $sets WHERE id = ?")->execute($vals);
        Response::success(null, 'سیم ویرایش شد');
    });

    $router->delete('conductors/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('conductors.delete');
        Database::getInstance()->execute("DELETE FROM conductors WHERE id = ?", [(int)$id]);
        Response::success(null, 'سیم حذف شد');
    });

    // حذف انبوه — v3.5.0 (همان روش استاندارد)
    $router->post('conductors/bulk-delete', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('conductors.delete');
        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 5000) Response::error(400, 'حداکثر ۵۰۰۰ ردیف در هر درخواست');
        $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));
        $pdo = Database::getInstance()->getConnection();
        $ph = implode(',', array_fill(0, count($ids), '?'));
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("DELETE FROM conductors WHERE id IN ($ph)");
            $stmt->execute($ids);
            $deleted = $stmt->rowCount();
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Response::error(500, 'حذف انبوه سیم‌ها ناموفق بود: ' . fa_db_error($e));
        }
        Response::success(['deleted' => $deleted], "{$deleted} سیم حذف شد");
    });

    // ورود انبوه — v3.5.0 (درج/ویرایش بر اساس نام)
    $router->post('conductors/bulk-import', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('conductors.create');
        $body = Helpers::getJsonBody();
        $rows = $body['rows'] ?? [];
        if (!is_array($rows) || count($rows) === 0) Response::error(400, 'لیست ردیف‌ها ارسال نشده');
        if (count($rows) > 500) Response::error(400, 'حداکثر ۵۰۰ ردیف در هر درخواست');
        $pdo = Database::getInstance()->getConnection();
        $inserted = 0; $updated = 0; $failed = 0; $firstError = '';
        $statuses = []; $errors = [];
        $existing = [];
        foreach ($pdo->query("SELECT id, name FROM conductors")->fetchAll() as $r2) {
            $existing[trim((string) $r2['name'])] = (int) $r2['id'];
        }
        try {
            $pdo->beginTransaction();
            $insCols = $conductorCols;
            $ph = implode(',', array_fill(0, 21, '?'));
            $ins = $pdo->prepare("INSERT INTO conductors $insCols VALUES ($ph, NOW())");
            $sets = implode(',', array_map(fn($k) => "`$k` = ?", array_keys($conductorFields([]))));
            $upd = $pdo->prepare("UPDATE conductors SET $sets WHERE id = ?");
            foreach ($rows as $r) {
                try {
                    $f = $conductorFields($r);
                    if ($f['name'] === '') throw new Exception('نام سیم الزامی است');
                    if (!empty($r['id'])) {
                        $vals = array_values($f); $vals[] = (int) $r['id'];
                        $upd->execute($vals);
                        $updated++; $statuses[] = 'updated'; $errors[] = null;
                    } elseif (isset($existing[$f['name']])) {
                        $vals = array_values($f); $vals[] = $existing[$f['name']];
                        $upd->execute($vals);
                        $updated++; $statuses[] = 'updated'; $errors[] = null;
                    } else {
                        $ins->execute(array_values($f));
                        $existing[$f['name']] = (int) $pdo->lastInsertId();
                        $inserted++; $statuses[] = 'inserted'; $errors[] = null;
                    }
                } catch (Exception $e) {
                    $failed++; $statuses[] = 'failed'; $errors[] = $e->getMessage();
                    if ($firstError === '') $firstError = $e->getMessage();
                }
            }
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Response::error(500, 'ورود انبوه سیم‌ها ناموفق بود: ' . fa_db_error($e));
        }
        Response::success([
            'inserted' => $inserted, 'updated' => $updated, 'failed' => $failed,
            'first_error' => $firstError, 'statuses' => $statuses, 'errors' => $errors,
        ], "درج: {$inserted} | ویرایش: {$updated} | خطا: {$failed}");
    });

    // ============================================================
    //  مدارها (Circuits) — v3.0.0: CRUD کامل
    //  منبع کدهای دیسپاچینگ برای فرم خطوط — فیلتر بر اساس ولتاژ
    // ============================================================
    $router->get('circuits', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('circuits.view');
        $pdo = Database::getInstance()->getConnection();
        $search = Helpers::getSearch();
        // v3.0.0: فیلتر ولتاژ — کمبوباکس کد دیسپاچینگ در فرم خطوط فقط کدهای هم‌ولتاژ را می‌بیند
        $voltage = Helpers::queryInt('voltage');
        $contractId = Helpers::getContractId();
        $where = '1=1'; $params = [];
        if ($contractId === 0) { $where .= ' AND c.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND c.contract_id = ?'; $params[] = $contractId; }
        if (!empty($search)) { $where .= ' AND (c.dispatch_code LIKE ? OR c.name LIKE ?)'; $sp = "%$search%"; $params[] = $sp; $params[] = $sp; }
        if (!empty($voltage)) { $where .= ' AND c.voltage = ?'; $params[] = $voltage; }
        // v4.3.78: کاربر اموردار فقط مدارهای امور خودش را می‌بیند
        $where .= Helpers::districtWhere('c', 'circuits', $params);
        $disJoin = Helpers::districtJoin('c', 'circuits');
        $disSel = Helpers::districtSelect();
        // v4.3.78: ستون وضعیت (فعال/غیرفعال) — قبل از migration مقدار خالی برمی‌گردد
        $statusSel = Helpers::columnExists('circuits', 'status') ? 'c.status' : "NULL AS status";
        $stmt = $pdo->prepare("SELECT c.*, $statusSel, l.line_code, l.name AS line_name, ct.title AS contract_title$disSel FROM circuits c LEFT JOIN `lines` l ON l.id = c.line_id LEFT JOIN contracts ct ON ct.id = c.contract_id$disJoin WHERE $where ORDER BY c.voltage DESC, c.dispatch_code LIMIT 1000");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $data = array_map(function ($r) {
            return [
                'id' => (int) $r['id'],
                'dispatch_code' => $r['dispatch_code'],
                'name' => $r['name'],
                'voltage' => $r['voltage'] !== null ? (int) $r['voltage'] : null,
                'line_id' => $r['line_id'] !== null ? (int) $r['line_id'] : null,
                'line_code' => $r['line_code'] ?? null,
                'line_name' => $r['line_name'] ?? null,
                'contract_id' => $r['contract_id'] ? (int)$r['contract_id'] : null,
                'contract_title' => $r['contract_title'] ?? null,
                // v4.3.78: وضعیت فعال/غیرفعال + امور بهره‌برداری
                'status' => $r['status'] ?? null,
                'district_id' => !empty($r['district_id']) ? (int)$r['district_id'] : null,
                'district_name' => $r['district_name'] ?? null,
                'created_at' => $r['created_at'] ?? null,
            ];
        }, $rows);
        Response::success($data);
    });

    $router->post('circuits', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('circuits.create');
        $body = Helpers::getJsonBody();
        if (empty($body['dispatch_code']) || empty($body['voltage'])) Response::error(400, 'کد دیسپاچینگ و ولتاژ الزامی است');
        $pdo = Database::getInstance()->getConnection();
        // جلوگیری از کد تکراری
        $stmt = $pdo->prepare("SELECT id FROM circuits WHERE dispatch_code = ? LIMIT 1");
        $stmt->execute([trim($body['dispatch_code'])]);
        if ($stmt->fetch()) Response::error(409, 'این کد دیسپاچینگ قبلاً ثبت شده است');
        // v4.3.78: وضعیت پیش‌فرض «غیرفعال» + امور بهره‌برداری (اگر migration اجرا شده باشد)
        $districtId = Helpers::districtFromBody($body, 'circuits');
        $hasStatusCol = Helpers::columnExists('circuits', 'status');
        $hasDistrictCol = Helpers::columnExists('circuits', 'district_id');
        $cols = ['line_id', 'dispatch_code', 'name', 'voltage', 'contract_id', 'created_at'];
        $vals = ['?', '?', '?', '?', '?', 'NOW()'];
        $params = [
            !empty($body['line_id']) ? (int) $body['line_id'] : null,
            trim($body['dispatch_code']),
            $body['name'] ?? null,
            (int) $body['voltage'],
            $body['contract_id'] ?? null,
        ];
        if ($hasStatusCol) { $cols[] = 'status'; $vals[] = "'inactive'"; }
        if ($hasDistrictCol) { $cols[] = 'district_id'; $vals[] = '?'; $params[] = $districtId; }
        $stmt = $pdo->prepare("INSERT INTO circuits (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ")");
        $stmt->execute($params);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'مدار ایجاد شد', 201);
    });

    $router->put('circuits/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('circuits.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['dispatch_code', 'name', 'voltage', 'line_id', 'contract_id'];
        // v4.3.78: ویرایش وضعیت (فعال/غیرفعال) و امور بهره‌برداری
        if (Helpers::columnExists('circuits', 'status')) $fields[] = 'status';
        if (Helpers::columnExists('circuits', 'district_id')) $fields[] = 'district_id';
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = ($body[$f] === '' ? null : $body[$f]); } }
        if (empty($updates)) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        $pdo->prepare("UPDATE circuits SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'مدار ویرایش شد');
    });

    $router->delete('circuits/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate();
        Auth::requirePermissionSoft('circuits.delete');
        // v4.3.78: مدارِ فعال قابل حذف نیست — ابتدا باید غیرفعال شود (امنیت داده)
        $guardedDelete('circuits', 'مدار', (int)$id);
    });

    // حذف انبوه مدارها — v3.2.0: همان روش دکل‌ها/خطوط (یک تراکنش، حداکثر ۵۰۰۰ ردیف)
    $router->post('circuits/bulk-delete', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('circuits.delete');
        $body = Helpers::getJsonBody();
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) Response::error(400, 'لیست شناسه‌ها ارسال نشده');
        if (count($ids) > 5000) Response::error(400, 'حداکثر ۵۰۰۰ ردیف در هر درخواست');
        $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));

        $pdo = Database::getInstance()->getConnection();
        $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
        // v4.3.78: مدارهای «فعال» قابل حذف نیستند — ابتدا باید غیرفعال شوند
        if (Helpers::columnExists('circuits', 'status')) {
            $activeStmt = $pdo->prepare("SELECT COUNT(*) FROM circuits WHERE id IN ($idPlaceholders) AND LOWER(TRIM(COALESCE(status, ''))) IN ('active', '1', 'true')");
            $activeStmt->execute($ids);
            $activeCount = (int) $activeStmt->fetchColumn();
            if ($activeCount > 0) {
                Response::error(409, "حذف انجام نشد.\n\n$activeCount مدار انتخاب‌شده وضعیت «فعال» دارد — برای امنیت داده، ابتدا وضعیت را «غیرفعال» کنید؛ رکوردهای غیرفعال قابل حذف هستند.");
            }
        }
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("DELETE FROM circuits WHERE id IN ($idPlaceholders)");
            $stmt->execute($ids);
            $deleted = $stmt->rowCount();
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Logger::error("Circuits bulk-delete failed", ['error' => $e->getMessage()]);
            Response::error(500, 'حذف انبوه مدارها ناموفق بود: ' . fa_db_error($e));
        }
        Logger::info('Circuits bulk-deleted', ['count' => $deleted, 'user_id' => $user['id']]);
        Response::success(['deleted' => $deleted], "{$deleted} مدار حذف شد");
    });

    // ورود انبوه مدارها — v3.1.0: آرایه‌ای از ردیف‌ها؛ درج یا ویرایش بر اساس کد دیسپاچینگ
    $router->post('circuits/bulk-import', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('circuits.create');
        $body = Helpers::getJsonBody();
        // v4.3.81: امورِ ایمپورت برای کاربر اموردار خودکار
        $rows = Helpers::forceDistrictOnRows($body['rows'] ?? []);
        if (!is_array($rows) || count($rows) === 0) Response::error(400, 'لیست ردیف‌ها ارسال نشده');
        if (count($rows) > 500) Response::error(400, 'حداکثر ۵۰۰ ردیف در هر درخواست');

        $pdo = Database::getInstance()->getConnection();
        $inserted = 0; $updated = 0; $failed = 0; $firstError = '';
        $statuses = []; $errors = [];

        // کش کدهای موجود
        $existing = [];
        foreach ($pdo->query("SELECT id, dispatch_code FROM circuits")->fetchAll() as $r) {
            $existing[$r['dispatch_code']] = (int) $r['id'];
        }

        try {
            $pdo->beginTransaction();
            $ins = $pdo->prepare("INSERT INTO circuits (line_id, dispatch_code, name, voltage, contract_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
            $upd = $pdo->prepare("UPDATE circuits SET name = ?, voltage = ?, contract_id = ? WHERE id = ?");

            foreach ($rows as $i => $r) {
                try {
                    $code = trim((string) ($r['dispatch_code'] ?? ''));
                    $name = isset($r['name']) && $r['name'] !== '' ? $r['name'] : null;
                    $voltage = isset($r['voltage']) && $r['voltage'] !== '' ? (int) $r['voltage'] : null;
                    if ($code === '') throw new Exception('کد دیسپاچینگ الزامی است');
                    if (!$voltage) throw new Exception('ولتاژ الزامی است');

                    if (!empty($r['id'])) {
                        $upd->execute([$name, $voltage, $r['contract_id'] ?? null, (int) $r['id']]);
                        $updated++; $statuses[] = 'updated'; $errors[] = null;
                    } elseif (isset($existing[$code])) {
                        $upd->execute([$name, $voltage, $r['contract_id'] ?? null, $existing[$code]]);
                        $updated++; $statuses[] = 'updated'; $errors[] = null;
                    } else {
                        $ins->execute([!empty($r['line_id']) ? (int) $r['line_id'] : null, $code, $name, $voltage, $r['contract_id'] ?? null]);
                        $existing[$code] = (int) $pdo->lastInsertId();
                        $inserted++; $statuses[] = 'inserted'; $errors[] = null;
                    }
                } catch (Exception $e) {
                    $failed++; $statuses[] = 'failed';
                    $errors[] = $e->getMessage();
                    if ($firstError === '') $firstError = $e->getMessage();
                }
            }
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Response::error(500, 'ورود انبوه مدارها ناموفق بود: ' . fa_db_error($e));
        }

        Response::success([
            'inserted' => $inserted, 'updated' => $updated, 'failed' => $failed,
            'first_error' => $firstError, 'statuses' => $statuses, 'errors' => $errors,
        ], "درج: {$inserted} | ویرایش: {$updated} | خطا: {$failed}");
    });

    // ============================================================
    // ============================================================
    //  پیمانکاران (Contractors) — CRUD کامل
    // ============================================================
    $router->get('contractors', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('contractors.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $status = Helpers::query('status');
        $where = '1=1'; $params = [];
        if (!empty($search)) {
            $where .= ' AND (c.contractor_name LIKE ? OR c.contractor_code LIKE ? OR c.ceo_name LIKE ?)';
            $sp = "%$search%"; array_push($params, $sp, $sp, $sp);
        }
        if ($status !== null && $status !== '' && $status !== 'all') {
            $statusValue = ((string)$status === '1') ? 'active' : (((string)$status === '0') ? 'inactive' : (string)$status);
            $where .= ' AND c.status = ?'; $params[] = $statusValue;
        }
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM contractors c WHERE $where");
        $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        $stmt = $pdo->prepare("SELECT c.id, c.contractor_code, c.contractor_name,
                                      c.ceo_name,
                                      c.contractor_phone, c.mobile, c.address, c.status,
                                      c.created_at, c.updated_at
                               FROM contractors c WHERE $where
                               ORDER BY c.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    $router->post('contractors', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('contractors.create');
        $body = Helpers::getJsonBody();
        $name = trim((string)($body['contractor_name'] ?? $body['name'] ?? ''));
        if ($name === '') Response::error(400, 'نام پیمانکار الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $code = trim((string)($body['contractor_code'] ?? ''));
        if ($code === '') $code = 'PC-' . str_pad((string)random_int(0, 999), 3, '0', STR_PAD_LEFT);
        // v4.3.78: طبق سیاست امنیت داده، ثبت جدید پیش‌فرض «غیرفعال» است —
        // فعال‌سازی از طریق ویرایش گروهی انجام می‌شود
        $status = (($body['status'] ?? 'inactive') === 'active') ? 'active' : 'inactive';
        $stmt = $pdo->prepare("INSERT INTO contractors
            (contractor_code, contractor_name, ceo_name, contractor_phone, mobile, address, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
        try {
            $stmt->execute([
                $code,
                $name,
                ($body['ceo_name'] ?? null) ?: null,
                ($body['contractor_phone'] ?? null) ?: null,
                ($body['mobile'] ?? null) ?: null,
                ($body['address'] ?? null) ?: null,
                $status,
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') Response::error(409, 'کد پیمانکار تکراری است.');
            Response::error(500, 'ثبت پیمانکار ناموفق بود: ' . fa_db_error($e));
        }
        Response::success(['id' => (int)$pdo->lastInsertId(), 'contractor_code' => $code], 'پیمانکار ایجاد شد', 201);
    });

    $router->put('contractors/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('contractors.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['contractor_code', 'contractor_name', 'ceo_name', 'contractor_phone', 'mobile', 'address', 'status'];
        $updates = []; $params = [];
        foreach ($fields as $f) {
            if (!array_key_exists($f, $body)) continue;
            $v = $body[$f];
            if ($f === 'contractor_name' && trim((string)$v) === '') Response::error(400, 'نام پیمانکار الزامی است');
            if ($f === 'status') {
                $v = ((string)$v === 'inactive' || (string)$v === '0') ? 'inactive' : 'active';
            }
            if ($f === 'contractor_code' && trim((string)$v) === '') $v = null;
            $updates[] = "`$f` = ?"; $params[] = ($v === '' ? null : $v);
        }
        if (!$updates) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        try {
            $pdo->prepare("UPDATE contractors SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') Response::error(409, 'کد پیمانکار تکراری است.');
            Response::error(500, 'ویرایش پیمانکار ناموفق بود: ' . fa_db_error($e));
        }
        Response::success(null, 'پیمانکار ویرایش شد');
    });

    $router->delete('contractors/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate();
        Auth::requirePermissionSoft('contractors.delete');
        $pdo = Database::getInstance()->getConnection();
        $chk = $pdo->prepare("SELECT status FROM contractors WHERE id = ? LIMIT 1");
        $chk->execute([(int)$id]);
        $status = $chk->fetchColumn();
        if ($status === false) Response::error(404, 'پیمانکار پیدا نشد یا قبلاً حذف شده است');
        if (strtolower((string)$status) === 'active') {
            Response::error(409, 'حذف پیمانکار انجام نشد. این پیمانکار در حال حاضر «فعال» است و برای جلوگیری از حذف ناخواسته، حذف پیمانکار فعال مجاز نیست. ابتدا وضعیت پیمانکار را به «غیرفعال» تغییر دهید و سپس، پس از برداشتن تمام وابستگی‌ها، دوباره برای حذف اقدام کنید.');
        }
        $guardedDelete('contractors', 'پیمانکار', (int)$id, [
            'contracts' => 'قراردادها',
            'circuits' => 'مدارها',
            'invoices' => 'صورت‌وضعیت‌ها',
        ]);
    });

    // ============================================================
    //  تجهیزات (Equipment) — CRUD کامل
    // ============================================================
    $router->get('equipment', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('equipment.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $contractId = Helpers::getContractId();
        $where = '1=1'; $params = [];
        if ($contractId === 0) { $where .= ' AND e.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND e.contract_id = ?'; $params[] = $contractId; }
        if (!empty($search)) { $where .= ' AND (e.serial_number LIKE ? OR e.manufacturer LIKE ?)'; $sp = "%$search%"; $params[] = $sp; $params[] = $sp; }
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM equipment e WHERE $where"); $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        // v4.3.78: کاربر اموردار فقط تجهیزات امور خودش را می‌بیند + نام امور
        $where .= Helpers::districtWhere('e', 'equipment', $params);
        $disJoin = Helpers::districtJoin('e', 'equipment');
        $disSel = Helpers::districtSelect();
        $stmt = $pdo->prepare("SELECT e.*, ec.name AS class_name, t.tower_code, c.title AS contract_title$disSel FROM equipment e LEFT JOIN equipment_classes ec ON ec.id = e.equipment_class_id LEFT JOIN towers t ON t.id = e.tower_id LEFT JOIN contracts c ON c.id = e.contract_id$disJoin WHERE $where ORDER BY e.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    $router->post('equipment', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('equipment.create');
        $body = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();
        // v4.3.78: وضعیت پیش‌فرض «غیرفعال» + امور بهره‌برداری؛ ستون status جدید در
        // دیتابیس‌هایی که هنوز migration نگرفته‌اند وجود ندارد و INSERT بدون آن ساخته می‌شود
        $districtId = Helpers::districtFromBody($body, 'equipment');
        // گروه تجهیز در فرم عمومی نیست — اگر ارسال نشد اولین گروه موجود استفاده می‌شود
        // تا ثبت تجهیز از فرم برنامه بدون خطا انجام شود (ستون NOT NULL است)
        $classId = $body['equipment_class_id'] ?? null;
        if (empty($classId)) {
            try { $classId = $pdo->query("SELECT id FROM equipment_classes ORDER BY id LIMIT 1")->fetchColumn() ?: 1; }
            catch (Throwable $e) { $classId = 1; }
        }
        $cols = ['equipment_class_id', 'tower_id', 'line_id', 'contract_id', 'serial_number', 'manufacturer', 'model', 'install_date', 'warranty_expiry', 'created_at'];
        $vals = ['?', '?', '?', '?', '?', '?', '?', '?', '?', 'NOW()'];
        $params = [$classId, $body['tower_id'] ?? null, $body['line_id'] ?? null, $body['contract_id'] ?? null, $body['serial_number'] ?? null, $body['manufacturer'] ?? null, $body['model'] ?? null, $body['install_date'] ?? null, $body['warranty_expiry'] ?? null];
        if (Helpers::columnExists('equipment', 'status')) { $cols[] = 'status'; $vals[] = "'inactive'"; }
        if (Helpers::columnExists('equipment', 'district_id')) { $cols[] = 'district_id'; $vals[] = '?'; $params[] = $districtId; }
        $stmt = $pdo->prepare("INSERT INTO equipment (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ")");
        $stmt->execute($params);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'تجهیز ایجاد شد', 201);
    });

    $router->put('equipment/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('equipment.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['serial_number', 'manufacturer', 'model', 'install_date', 'warranty_expiry', 'contract_id', 'status'];
        // v4.3.78: ویرایش امور بهره‌برداری تجهیز
        if (Helpers::columnExists('equipment', 'district_id')) $fields[] = 'district_id';
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = ($body[$f] === '' ? null : $body[$f]); } }
        if (empty($updates)) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        $pdo->prepare("UPDATE equipment SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'تجهیز ویرایش شد');
    });

    $router->delete('equipment/{id}', function ($id) use ($guardedDelete) {
        Auth::authenticate();
        Auth::requirePermissionSoft('equipment.delete');
        $guardedDelete('equipment', 'تجهیز', (int)$id, ['defects' => 'عیوب']);
    });

    // ============================================================
    //  گروه‌های تجهیزات (Equipment Classes)
    // ============================================================
    $router->get('equipment-classes', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('equipment.view');
        $pdo = Database::getInstance()->getConnection();
        $rows = $pdo->query("SELECT * FROM equipment_classes ORDER BY id")->fetchAll();
        Response::success($rows);
    });

    // ============================================================
    //  فهرست بها (Price Lists) — CRUD کامل
    // ============================================================
    $router->get('price-lists', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.view');
        $pdo = Database::getInstance()->getConnection();
        $contractId = Helpers::getContractId();
        $where = '1=1'; $params = [];
        if ($contractId === 0) { $where .= ' AND pl.contract_id IS NULL'; } elseif ($contractId !== null) { $where .= ' AND pl.contract_id = ?'; $params[] = $contractId; }
        $stmt = $pdo->prepare("SELECT pl.*, c.title AS contract_title FROM price_lists pl LEFT JOIN contracts c ON c.id = pl.contract_id WHERE $where ORDER BY pl.id DESC");
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    });

    $router->post('price-lists', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.create');
        $body = Helpers::getJsonBody();
        if (empty($body['name'])) Response::error(400, 'نام فهرست الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare("INSERT INTO price_lists (name, version, effective_date, contract_id, status, created_at) VALUES (?, ?, ?, ?, 'active', NOW())");
        $stmt->execute([$body['name'], $body['version'] ?? '1.0', $body['effective_date'] ?? date('Y-m-d'), $body['contract_id'] ?? null]);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'فهرست بها ایجاد شد', 201);
    });

    $router->put('price-lists/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.update');
        $body = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();
        $fields = ['name','version','effective_date','contract_id','status'];
        $updates=[]; $params=[];
        foreach ($fields as $f) { if (array_key_exists($f,$body)) { $updates[] = "`$f` = ?"; $params[] = $body[$f]; } }
        if (!$updates) Response::error(400, 'هیچ فیلدی برای ویرایش ارسال نشده');
        $params[]=(int)$id;
        $pdo->prepare("UPDATE price_lists SET ".implode(', ',$updates)." WHERE id = ?")->execute($params);
        Response::success(null, 'فهرست بها ویرایش شد');
    });

    $router->get('price-list-items', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.view');
        $pdo = Database::getInstance()->getConnection();
        $listId = Helpers::queryInt('list_id');
        $where = '1=1'; $params = [];
        if ($listId) { $where = 'pli.price_list_id = ?'; $params[] = $listId; }
        $stmt = $pdo->prepare("SELECT pli.* FROM price_list_items pli WHERE $where ORDER BY pli.id LIMIT 500");
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    });

    $router->post('price-list-items', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.create');
        $body = Helpers::getJsonBody();
        if (empty($body['title']) || empty($body['price_list_id'])) Response::error(400, 'عنوان و فهرست الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $code = $body['code'] ?? ('PL-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT));
        $stmt = $pdo->prepare("INSERT INTO price_list_items (price_list_id, code, title, unit, unit_price, category, status) VALUES (?, ?, ?, ?, ?, 'active')");
        $stmt->execute([(int)$body['price_list_id'], $code, $body['title'], $body['unit'] ?? 'عدد', $body['unit_price'] ?? 0, $body['category'] ?? 'عملیات']);
        Response::success(['id' => (int)$pdo->lastInsertId(), 'code' => $code], 'قلم ایجاد شد', 201);
    });

    $router->put('price-list-items/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['code','title','unit','unit_price','category','status'];
        $updates = []; $params = [];
        foreach ($fields as $f) { if (array_key_exists($f, $body)) { $updates[] = "`$f` = ?"; $params[] = $body[$f]; } }
        if (!$updates) Response::error(400, 'هیچ فیلدی ارسال نشده');
        $params[] = (int)$id;
        $pdo->prepare("UPDATE price_list_items SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
        Response::success(null, 'قلم فهرست بها ویرایش شد');
    });

    $router->delete('price-list-items/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.delete');
        Database::getInstance()->execute("DELETE FROM price_list_items WHERE id = ?", [(int)$id]);
        Response::success(null, 'قلم حذف شد');
    });

    // ============================================================
    //  چک‌لیست‌ها (Checklist Templates)
    // ============================================================
    $router->get('checklist-templates', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('checklists.view');
        $pdo = Database::getInstance()->getConnection();
        Response::success($pdo->query("SELECT * FROM checklist_templates WHERE status = 'active' ORDER BY id")->fetchAll());
    });

    $router->post('checklist-templates', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('checklists.create');
        $body = Helpers::getJsonBody();
        if (empty($body['name'])) Response::error(400, 'نام الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare("INSERT INTO checklist_templates (name, description, applies_to, status, created_at) VALUES (?, ?, ?, 'active', NOW())");
        $stmt->execute([$body['name'], $body['description'] ?? null, $body['applies_to'] ?? 'tower']);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'چک‌لیست ایجاد شد', 201);
    });

    // ============================================================
    //  لاگ ممیزی (Audit Log)
    // ============================================================
    $router->get('audit-log', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('settings.view');
        $pdo = Database::getInstance()->getConnection();
        $page = Helpers::getPage(); $pageSize = Helpers::getPageSize(); $offset = Helpers::getOffset();
        $search = Helpers::getSearch();
        $where = '1=1'; $params = [];
        if (!empty($search)) { $where .= ' AND (a.action LIKE ? OR a.entity_type LIKE ?)'; $sp = "%$search%"; $params[] = $sp; $params[] = $sp; }
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM audit_log a WHERE $where"); $countStmt->execute($params); $total = (int)$countStmt->fetchColumn();
        $stmt = $pdo->prepare("SELECT a.*, u.username, u.full_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE $where ORDER BY a.id DESC LIMIT $pageSize OFFSET $offset");
        $stmt->execute($params);
        Response::paginated($stmt->fetchAll(), $page, $pageSize, $total);
    });

    // ============================================================
    //  سازمان (Organization) — CRUD
    // ============================================================
    $router->get('organization', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('settings.view');
        $pdo = Database::getInstance()->getConnection();
        Response::success($pdo->query("SELECT * FROM organization WHERE status = 'active' ORDER BY id")->fetchAll());
    });

    $router->post('organization', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('settings.update');
        $body = Helpers::getJsonBody();
        if (empty($body['name'])) Response::error(400, 'نام الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare("INSERT INTO organization (parent_id, org_type, name, code, phone, address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())");
        $stmt->execute([$body['parent_id'] ?? null, $body['org_type'] ?? 'unit', $body['name'], $body['code'] ?? null, $body['phone'] ?? null, $body['address'] ?? null]);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'واحد سازمانی ایجاد شد', 201);
    });

    // ============================================================
    //  اکیپ‌ها (Crews) — CRUD
    // ============================================================
    $router->get('crews', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('crews.view');
        $pdo = Database::getInstance()->getConnection();
        $rows = $pdo->query("SELECT cr.*, ct.contractor_name AS contractor_name FROM crews cr LEFT JOIN contractors ct ON ct.id = cr.contractor_id WHERE cr.status = 'active' ORDER BY cr.id")->fetchAll();
        Response::success($rows);
    });

    $router->post('crews', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('crews.create');
        $body = Helpers::getJsonBody();
        if (empty($body['name'])) Response::error(400, 'نام اکیپ الزامی است');
        $pdo = Database::getInstance()->getConnection();
        $code = $body['crew_code'] ?? ('CR-' . str_pad((string)random_int(0, 999), 3, '0', STR_PAD_LEFT));
        $stmt = $pdo->prepare("INSERT INTO crews (contractor_id, organization_id, name, crew_code, supervisor_id, vehicle_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())");
        $stmt->execute([$body['contractor_id'] ?? null, $body['organization_id'] ?? 1, $body['name'], $code, $body['supervisor_id'] ?? null, $body['vehicle_id'] ?? null]);
        Response::success(['id' => (int)$pdo->lastInsertId(), 'crew_code' => $code], 'اکیپ ایجاد شد', 201);
    });

    // ============================================================
    //  گواهینامه پرسنل (Personnel Certificates)
    // ============================================================
    $router->get('personnel/{id}/certificates', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('personnel.view');
        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare("SELECT * FROM personnel_certificates WHERE personnel_id = ? ORDER BY id");
        $stmt->execute([(int)$id]);
        Response::success($stmt->fetchAll());
    });
}
