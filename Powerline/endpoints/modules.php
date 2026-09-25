<?php
/**
 * endpoints/modules.php — تمام ماژول‌های اضافی با CRUD کامل
 * قراردادها، صورت‌وضعیت، ایمنی، پرسنل، پیمانکاران، تجهیزات، فهرست بها، چک‌لیست، لاگ ممیزی، سازمان، اکیپ‌ها
 */

// ═══════════════════════════════════════════════════════════════
// v4.3.87 — فهرست بهای کشوری (فرمت استاندارد) — توابع مشترک
//   مورد استفاده: price-list-items (CRUD/ایمپورت/تطبیق) و
//   invoices (کاندیدهای دوره / صدور صورت‌وضعیت)
//
//   واژگان کلیدی (هم‌نام با ستون‌های دیتابیس):
//     item_kind         : base = ردیف اصلی | coefficient = ردیف ضریب کاهش/افزایش بها
//     code              : کد ملی؛ ردیف‌های ضریب کد ملی ندارند و «کد اختصاصی»
//                         به شکل *<کد والد>-<n> می‌گیرند (مثل *20101-1)
//     parent_code       : کد ردیف والد (برای ضرایب)
//     chapter           : 2 نگهداری | 7 کشیک و فراخوان | 8 بازدید پهبادی | 10 تعمیرات
//     activity_type     : inspection = بازدید | repair = تعمیرات | operation = عملیات | service = خدمات فنی
//     inspection_method : climbing = صعودی | patrol = پیمایشی | drone = پهبادی
//     terrain_type (اقلام) : plain_hilly = دشت و تپه‌ماهور | semi_mountainous = نیمه‌کوهستانی/جنگل
//                           | impassable = صعب‌العبور/باتلاقی/شالیزار
//     terrain_type (دکل)   : plain | hilly | semi_mountainous | impassable
//                            (plain و hilly هنگام تطبیق به گروه plain_hilly می‌روند)
//     coefficient_kind  : two_person | bundle_2 | bundle_3 | bundle_4 |
//                         double_insulator | terrain_semi_mountainous |
//                         terrain_impassable | tower_wooden_concrete |
//                         tower_telescopic | tower_h_pole
//     ضرایب «مبلغی» هستند (unit_price منفی = کاهش بها، مثبت = اضافه بها)
// ═══════════════════════════════════════════════════════════════

/** نگاشت عنوان فارسی/انگلیسی نوع فعالیت به کلید استاندارد (خالی = عمومی) */
function pl_normalize_activity_type($v): ?string
{
    if ($v === null || $v === '') return null;
    $map = [
        'inspection' => 'inspection', 'repair' => 'repair', 'operation' => 'operation', 'service' => 'service',
        'بازدید' => 'inspection', 'بازديدي' => 'inspection', 'بازدیدی' => 'inspection',
        'تعمیرات' => 'repair', 'تعميرات' => 'repair',
        'عملیات' => 'operation', 'عمليات' => 'operation',
        'خدمات' => 'service', 'خدمات فنی' => 'service',
    ];
    $k = trim(mb_strtolower((string)$v, 'UTF-8'));
    return $map[$k] ?? $map[trim((string)$v)] ?? null;
}

/** نگاشت روش بازدید: climbing = صعودی | patrol = پیمایشی | drone = پهبادی (خالی = عمومی) */
function pl_normalize_inspection_method($v): ?string
{
    if ($v === null || $v === '') return null;
    $map = [
        'climbing' => 'climbing', 'patrol' => 'patrol', 'drone' => 'drone',
        'صعودی' => 'climbing', 'بازدید صعودی' => 'climbing', 'بازدیدصعودی' => 'climbing', 'صعودي' => 'climbing',
        'پیمایشی' => 'patrol', 'بازدید پیمایشی' => 'patrol', 'بازدیدپیمایشی' => 'patrol', 'پيمايشي' => 'patrol',
        'پهبادی' => 'drone', 'بازدید پهبادی' => 'drone', 'پهپادی' => 'drone', 'پهپاد' => 'drone',
    ];
    $k = trim(mb_strtolower((string)$v, 'UTF-8'));
    return $map[$k] ?? $map[trim((string)$v)] ?? null;
}

/** نگاشت نوع زمین دکل: plain / hilly / semi_mountainous / impassable */
function pl_normalize_terrain($v): ?string
{
    if ($v === null || $v === '') return null;
    $map = [
        'plain' => 'plain', 'hilly' => 'hilly', 'semi_mountainous' => 'semi_mountainous', 'impassable' => 'impassable',
        'دشت' => 'plain',
        'تپه ماهور' => 'hilly', 'تپه‌ماهور' => 'hilly', 'تپه‌ماور' => 'hilly',
        'نیمه کوهستانی' => 'semi_mountainous', 'نیمه‌کوهستانی' => 'semi_mountainous', 'نیمه كوهستانی' => 'semi_mountainous',
        'صعب العبور' => 'impassable', 'صعب‌العبور' => 'impassable', 'صعب العبور و باتلاقی' => 'impassable',
        'کوهستانی' => 'impassable',
    ];
    return $map[trim((string)$v)] ?? null;
}

/**
 * نگاشت نوع زمین «اقلام فهرست بها» — گروه‌بندی کشوری سه‌گانه:
 *   plain_hilly = دشت و تپه‌ماهور | semi_mountainous = نیمه‌کوهستانی/جنگل | impassable = صعب‌العبور/باتلاقی
 * (مقادیر قدیمی plain/hilly دکل به plain_hilly نگاشت می‌شوند)
 */
function pl_normalize_item_terrain($v): ?string
{
    if ($v === null || $v === '') return null;
    $map = [
        'plain_hilly' => 'plain_hilly', 'semi_mountainous' => 'semi_mountainous', 'impassable' => 'impassable',
        'دشت و تپه ماهور' => 'plain_hilly', 'دشت و تپه‌ماهور' => 'plain_hilly', 'دشت و تپه ماور' => 'plain_hilly',
        'دشت' => 'plain_hilly', 'تپه‌ماهور' => 'plain_hilly', 'تپه ماهور' => 'plain_hilly',
        'plain' => 'plain_hilly', 'hilly' => 'plain_hilly',
        'نیمه کوهستانی' => 'semi_mountainous', 'نیمه‌کوهستانی' => 'semi_mountainous', 'نیمه‌كوهستانی' => 'semi_mountainous',
        'نیمه کوهستانی یا جنگل' => 'semi_mountainous',
        'صعب العبور' => 'impassable', 'صعب‌العبور' => 'impassable',
        'صعب العبور، باتلاقی یا شالیزار' => 'impassable', 'باتلاقی' => 'impassable', 'شالیزار' => 'impassable',
    ];
    return $map[trim((string)$v)] ?? null;
}

/** گروه زمین کشوری از زمین دکل: plain| hilly → plain_hilly */
function pl_terrain_group($towerTerrain): ?string
{
    $t = pl_normalize_terrain($towerTerrain);
    if ($t === null) return pl_normalize_item_terrain($towerTerrain); // قبول مستقیم گروه کشوری
    if ($t === 'plain' || $t === 'hilly') return 'plain_hilly';
    return $t;
}

/** عنوان فارسی نوع زمین دکل */
function pl_terrain_label(?string $t): string
{
    switch ($t) {
        case 'plain': return 'دشت';
        case 'hilly': return 'تپه‌ماهور';
        case 'semi_mountainous': return 'نیمه‌کوهستانی';
        case 'impassable': return 'صعب‌العبور';
    }
    return 'نامشخص';
}

/** عنوان فارسی گروه زمین کشوری (اقلام فهرست بها) */
function pl_terrain_group_label(?string $g): string
{
    switch ($g) {
        case 'plain_hilly': return 'دشت و تپه‌ماهور';
        case 'semi_mountainous': return 'نیمه‌کوهستانی (جنگل)';
        case 'impassable': return 'صعب‌العبور (باتلاقی/شالیزار)';
    }
    return 'همه زمین‌ها';
}

/** عنوان فارسی فصل فهرست بها */
function pl_chapter_label($c): string
{
    switch ((int)$c) {
        case 2: return 'فصل ۲ — نگهداری';
        case 7: return 'فصل ۷ — کشیک و فراخوان';
        case 8: return 'فصل ۸ — بازدید پهبادی';
        case 10: return 'فصل ۱۰ — تعمیرات';
    }
    return '—';
}

/** فصل فهرست از کد ملی: 20101→2 | 70103→7 | 80101→8 | 100101/101001→10 | *1010001→10 */
function pl_chapter_from_code($code): ?int
{
    $c = ltrim(trim((string)$code), '*');
    if ($c === '') return null;
    if (preg_match('/^10\d{4,}$/', $c)) return 10;
    if (preg_match('/^2\d{4}$/', $c)) return 2;
    if (preg_match('/^7\d{4}$/', $c)) return 7;
    if (preg_match('/^8\d{4}$/', $c)) return 8;
    return null;
}

/** نگاشت/نرمال‌سازی نوع ضریب */
function pl_coefficient_kind_normalize($v): ?string
{
    if ($v === null || $v === '') return null;
    $map = [
        'two_person' => 'two_person', 'بازدید دو نفره' => 'two_person', 'دو نفره' => 'two_person',
        'bundle_2' => 'bundle_2', 'دو باندل' => 'bundle_2', 'خطوط دو باندل' => 'bundle_2',
        'bundle_3' => 'bundle_3', 'سه باندل' => 'bundle_3', 'خطوط سه باندل' => 'bundle_3',
        'bundle_4' => 'bundle_4', 'چهار باندل' => 'bundle_4',
        'double_insulator' => 'double_insulator', 'مقره دوبل' => 'double_insulator',
        'terrain_semi_mountainous' => 'terrain_semi_mountainous', 'مسیر نیمه کوهستانی' => 'terrain_semi_mountainous',
        'terrain_impassable' => 'terrain_impassable', 'مسیر صعب العبور' => 'terrain_impassable',
        'tower_wooden_concrete' => 'tower_wooden_concrete', 'تیر چوبی و بتنی' => 'tower_wooden_concrete', 'تیر چوبی' => 'tower_wooden_concrete',
        'tower_telescopic' => 'tower_telescopic', 'دکل تلسکوپی' => 'tower_telescopic', 'تلسکوپی' => 'tower_telescopic',
        'tower_h_pole' => 'tower_h_pole', 'پایه H' => 'tower_h_pole', 'پایه h' => 'tower_h_pole',
    ];
    $k = trim(mb_strtolower((string)$v, 'UTF-8'));
    return $map[$k] ?? $map[trim((string)$v)] ?? null;
}

/** عنوان فارسی نوع ضریب */
function pl_coefficient_kind_label($k): string
{
    $map = [
        'two_person' => 'بازدید دو نفره',
        'bundle_2' => 'اضافه بها خطوط دو باندل',
        'bundle_3' => 'اضافه بها خطوط سه باندل',
        'bundle_4' => 'اضافه بها خطوط چهار باندل',
        'double_insulator' => 'مقره دوبل',
        'terrain_semi_mountainous' => 'اضافه بها مسیر نیمه‌کوهستانی',
        'terrain_impassable' => 'اضافه بها مسیر صعب‌العبور و باتلاقی',
        'tower_wooden_concrete' => 'کاهش بها تیر چوبی و بتنی',
        'tower_telescopic' => 'کاهش بها دکل تلسکوپی',
        'tower_h_pole' => 'کاهش بها پایه H',
    ];
    return $map[$k] ?? 'ضریب';
}

/** پاک‌سازی کد قلم (حفظ * ابتدای کدهای اختصاصی) */
function pl_clean_code($v): ?string
{
    $s = trim((string)($v ?? ''));
    return ($s === '') ? null : $s;
}

/** عدد امن — null/خالی/غیرعددی → null (پشتیبانی از ارقام فارسی و ٪) */
function pl_num_or_null($v)
{
    if ($v === null || $v === '' || $v === false) return null;
    if (is_numeric($v)) return $v + 0;
    $fa = ['۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9','٫'=>'.','٪'=>''];
    $s = strtr(trim((string)$v), $fa);
    $s = preg_replace('/[^0-9.\-+]/', '', $s);
    return ($s === '' || !is_numeric($s)) ? null : $s + 0;
}

/**
 * شرط «فعال» سازگار با هر دو ساختار ستون وضعیت:
 *   varchar ('active') یا عددی (1) + ستون اختیاری is_active
 */
function pl_active_condition(PDO $pdo, string $table): string
{
    static $cache = [];
    $key = $table;
    if (!isset($cache[$key])) {
        $isInt = false;
        try {
            $row = $pdo->query("SHOW COLUMNS FROM `$table` LIKE 'status'")->fetch(PDO::FETCH_ASSOC);
            if ($row) $isInt = strpos(strtolower((string)$row['Type']), 'int') !== false;
        } catch (Exception $e) { /* بدون ستون status */ }
        if ($isInt) {
            $parts = ['`status` = 1'];
            if (Helpers::columnExists($table, 'is_active')) $parts[] = '`is_active` = 1';
        } else {
            $parts = ["`status` = 'active'", "`status` = '1'"];
            if (Helpers::columnExists($table, 'is_active')) $parts[] = '`is_active` = 1';
        }
        $cache[$key] = '(' . implode(' OR ', $parts) . ')';
    }
    return $cache[$key];
}

/** مقدار «فعال» مناسب نوع ستون status برای INSERT/UPDATE (عددی 1 یا 'active') */
function pl_active_status_value(PDO $pdo, string $table)
{
    try {
        $row = $pdo->query("SHOW COLUMNS FROM `$table` LIKE 'status'")->fetch(PDO::FETCH_ASSOC);
        if ($row && strpos(strtolower((string)$row['Type']), 'int') !== false) return 1;
    } catch (Exception $e) { /* ignore */ }
    return 'active';
}

/**
 * نرمال‌سازی payload قلم فهرست بها (فرم/ایمپورت) — مدل کشوری v4.3.87
 * هر کلید فقط اگر ستونش در دیتابیس موجود باشد در INSERT/UPDATE استفاده می‌شود.
 */
function pl_item_payload(array $body): array
{
    // item_kind: coefficient صریح یا کلید قدیمی is_coefficient
    $kind = strtolower(trim((string)($body['item_kind'] ?? '')));
    if ($kind !== 'coefficient' && !empty($body['is_coefficient'])) $kind = 'coefficient';
    if ($kind !== 'coefficient') $kind = 'base';

    $chapter = pl_num_or_null($body['chapter'] ?? null);
    if ($chapter === null && !empty($body['code'])) {
        $fromCode = pl_chapter_from_code((string)$body['code']);
        if ($fromCode !== null) $chapter = $fromCode;
    }

    $structure = trim((string)($body['tower_structure'] ?? ''));
    if ($structure === '' || $structure === 'همه' || $structure === 'general') $structure = null;

    return [
        'item_kind'         => $kind,
        'chapter'           => $chapter !== null ? (int)$chapter : null,
        'parent_code'       => pl_clean_code($body['parent_code'] ?? null),
        'coefficient_kind'  => $kind === 'coefficient'
            ? (pl_coefficient_kind_normalize($body['coefficient_kind'] ?? null) ?? 'other')
            : null,
        'sort_order'        => pl_num_or_null($body['sort_order'] ?? null),
        'activity_type'     => pl_normalize_activity_type($body['activity_type'] ?? null),
        'inspection_method' => pl_normalize_inspection_method($body['inspection_method'] ?? null),
        'voltage_kv'        => pl_num_or_null($body['voltage_kv'] ?? null),
        'circuit_count'     => pl_num_or_null($body['circuit_count'] ?? null),
        'bundle_count'      => pl_num_or_null($body['bundle_count'] ?? null),
        'terrain_type'      => pl_normalize_item_terrain($body['terrain_type'] ?? null),
        'tower_structure'   => $structure,
    ];
}

/** آیا ستون‌های فهرست بهای کشوری موجودند؟ (پیام راهنما در نبود مهاجرت) */
function pl_require_boq(string $table = 'price_list_items'): void
{
    if (!Helpers::columnExists($table, 'item_kind')) {
        Response::error(409, "ستون‌های طبقه‌بندی فهرست بها هنوز اضافه نشده‌اند.\n\nفایل Powerline_v4.3.87_NationalBOQ.sql را در phpMyAdmin اجرا کنید و دوباره تلاش کنید.");
    }
}

/**
 * اعمال ضرایب فرزندِ یک ردیف پایه بر اساس زمینه (خط/دکل/بازدید)
 * ctx: bundle_count, crew_size, tower_structure, terrain_type (زمین دکل)
 * خروجی: ['coefficients'=>[...], 'coefficient_amount'=>float]
 */
function pl_apply_coefficients(PDO $pdo, int $listId, array $item, array $ctx): array
{
    $bundles   = pl_num_or_null($ctx['bundle_count'] ?? null);
    $crewSize  = (int)($ctx['crew_size'] ?? 1);
    if ($crewSize < 1) $crewSize = 1;
    $structure = trim((string)($ctx['tower_structure'] ?? ''));
    if ($structure === '' || $structure === 'همه') $structure = null;
    $terrainGroup = pl_terrain_group($ctx['terrain_type'] ?? null);
    $itemTerrain = pl_normalize_item_terrain($item['terrain_type'] ?? null);
    $active = pl_active_condition($pdo, 'price_list_items');

    $coefs = [];
    $sumAmount = 0.0;
    $cStmt = $pdo->prepare("SELECT * FROM price_list_items WHERE price_list_id = ? AND parent_code = ?"
        . " AND item_kind = 'coefficient' AND $active ORDER BY COALESCE(sort_order, id) ASC, id ASC");
    $cStmt->execute([$listId, (string)$item['code']]);
    foreach ($cStmt->fetchAll(PDO::FETCH_ASSOC) as $cr) {
        $kind = (string)($cr['coefficient_kind'] ?? '');
        $apply = false;
        switch ($kind) {
            case 'bundle_2': $apply = ($bundles !== null && (int)$bundles === 2 && (int)($item['bundle_count'] ?? 1) !== 2); break;
            case 'bundle_3': $apply = ($bundles !== null && (int)$bundles === 3 && (int)($item['bundle_count'] ?? 1) !== 3); break;
            case 'bundle_4': $apply = ($bundles !== null && (int)$bundles === 4 && (int)($item['bundle_count'] ?? 1) !== 4); break;
            case 'two_person': $apply = ($crewSize >= 2); break;
            case 'tower_wooden_concrete':
            case 'tower_telescopic':
            case 'tower_h_pole':
                $apply = pl_structure_matches_coefficient($kind, $structure); break;
            case 'terrain_semi_mountainous':
                // فقط وقتی ردیف پایه برای این زمین نیست (مدل پایه + ضریب)
                $apply = ($terrainGroup === 'semi_mountainous' && $itemTerrain !== 'semi_mountainous'); break;
            case 'terrain_impassable':
                $apply = ($terrainGroup === 'impassable' && $itemTerrain !== 'impassable'); break;
            case 'double_insulator':
            default:
                $apply = false; // فقط دستی
        }
        if (!$apply) continue;
        $amount = (float)$cr['unit_price'];
        $sumAmount += $amount;
        $coefs[] = [
            'id' => (int)$cr['id'],
            'code' => (string)$cr['code'],
            'title' => (string)$cr['title'],
            'kind' => $kind,
            'kind_label' => pl_coefficient_kind_label($kind),
            'amount' => $amount,
        ];
    }
    return ['coefficients' => $coefs, 'coefficient_amount' => round($sumAmount, 2)];
}

/** آیا ضریبِ سازه برای این نوع دکل صدق می‌کند؟ */
function pl_structure_matches_coefficient(string $kind, ?string $structure): bool
{
    if ($structure === null || $structure === '') return false;
    $s = trim($structure);
    switch ($kind) {
        case 'tower_wooden_concrete':
            return ($s === 'تیر چوبی' || $s === 'تیر بتنی' || $s === 'تیر چوبی و بتنی'
                || mb_strpos($s, 'چوبی') !== false || mb_strpos($s, 'بتنی') !== false);
        case 'tower_telescopic':
            return (mb_strpos($s, 'تلسکوپی') !== false);
        case 'tower_h_pole':
            return ($s === 'H' || $s === 'h' || mb_strpos($s, 'پایه H') !== false || mb_strpos($s, 'پایه h') !== false);
    }
    return false;
}

/**
 * تطبیق ردیف پایه فهرست بهای کشوری + اعمال ضرایب فرزند — v4.3.87
 *
 * ctx:
 *   price_list_id, activity_type, inspection_method, voltage_kv,
 *   circuit_count, bundle_count, terrain_type (زمین دکل: plain/hilly/semi_mountainous/impassable
 *   یا گروه کشوری plain_hilly/...), tower_structure, crew_size (پیش‌فرض ۱), chapter?
 *
 * منطق:
 *   ۱) ردیف پایه با بیشترین امتیاز تطابق (دقیق > عمومی) انتخاب می‌شود؛
 *      زمین از «موقعیت دکل» می‌آید (plain/hilly → گروه دشت و تپه‌ماهور).
 *   ۲) ضرایب فرزندِ همان ردیف (parent_code) بر اساس نوعشان اعمال می‌شوند:
 *      bundle_2/3/4 (باندل خط)، two_person (تعداد نفرات بازدید)،
 *      tower_* (نوع سازه دکل)، terrain_* (اگر ردیف پایه برای آن زمین نباشد)
 *   ۳) خروجی: base_unit_price + مجموع مبلغ ضرایب = unit_price
 */
function pl_match_price_item(PDO $pdo, array $ctx): ?array
{
    $listId = (int)($ctx['price_list_id'] ?? 0);
    if ($listId <= 0) return null;

    $voltage   = pl_num_or_null($ctx['voltage_kv'] ?? null);
    $circuits  = pl_num_or_null($ctx['circuit_count'] ?? null);
    $bundles   = pl_num_or_null($ctx['bundle_count'] ?? null);
    $activity  = pl_normalize_activity_type($ctx['activity_type'] ?? null);
    $method    = pl_normalize_inspection_method($ctx['inspection_method'] ?? null);
    $structure = trim((string)($ctx['tower_structure'] ?? ''));
    if ($structure === '' || $structure === 'همه') $structure = null;
    $crewSize = (int)($ctx['crew_size'] ?? 1);
    if ($crewSize < 1) $crewSize = 1;
    $terrainGroup = pl_terrain_group($ctx['terrain_type'] ?? null); // plain_hilly|semi_mountainous|impassable|null
    $chapter = isset($ctx['chapter']) ? pl_num_or_null($ctx['chapter']) : null;

    $active = pl_active_condition($pdo, 'price_list_items');
    $hasChapter = Helpers::columnExists('price_list_items', 'chapter');

    // ── ۱) انتخاب ردیف پایه با امتیازدهی تطابق ──
    $where = "price_list_id = ? AND (item_kind = 'base' OR item_kind IS NULL) AND $active";
    $params = [$listId];
    if ($method !== null)   { $where .= ' AND (inspection_method = ? OR inspection_method IS NULL)'; $params[] = $method; }
    if ($activity !== null) { $where .= ' AND (activity_type = ? OR activity_type IS NULL)'; $params[] = $activity; }
    if ($voltage !== null)  { $where .= ' AND (voltage_kv = ? OR voltage_kv IS NULL)'; $params[] = $voltage; }
    if ($circuits !== null) { $where .= ' AND (circuit_count = ? OR circuit_count IS NULL)'; $params[] = (int)$circuits; }
    if ($chapter !== null && $hasChapter) { $where .= ' AND (chapter = ? OR chapter IS NULL)'; $params[] = (int)$chapter; }

    // مقادیر نرمال‌شده برای امتیازدهی (امن — همگی از نگاشت‌های بسته می‌آیند)
    $m = $method !== null ? "'" . $method . "'" : "''";
    $a = $activity !== null ? "'" . $activity . "'" : "''";
    $v = $voltage !== null ? (float)$voltage : 'NULL';
    $c = $circuits !== null ? (int)$circuits : 'NULL';
    $b = $bundles !== null ? (int)$bundles : 'NULL';
    $tg = $terrainGroup !== null ? "'" . $terrainGroup . "'" : "''";

    // امتیاز زمین: ردیف مخصوص همان گروه > بدون زمین (عمومی) > ردیف گروه دیگر (پایه + ضریب زمین)
    $terrainScore = "(CASE WHEN terrain_type = $tg THEN 3 WHEN terrain_type IS NULL THEN 2 ELSE 1 END)";
    // امتیاز باندل: باندل دقیق (ردیف‌های ۴۰۰kV دو/سه باندل) > تک‌باندل + ضریب > عمومی
    $bundleScore = "(CASE WHEN bundle_count = $b THEN 3 WHEN bundle_count = 1 THEN 2 WHEN bundle_count IS NULL THEN 1 ELSE 0 END)";

    $order = " ORDER BY"
        . " (inspection_method = $m) DESC,"
        . " (activity_type = $a) DESC,"
        . " (voltage_kv = $v) DESC,"
        . " (circuit_count = $c) DESC,"
        . " $terrainScore DESC,"
        . " $bundleScore DESC,"
        . " ((inspection_method IS NOT NULL) + (activity_type IS NOT NULL) + (voltage_kv IS NOT NULL)"
        . "  + (circuit_count IS NOT NULL) + (terrain_type IS NOT NULL) + (bundle_count IS NOT NULL)) DESC,"
        . " COALESCE(sort_order, id) ASC, id ASC LIMIT 1";
    $stmt = $pdo->prepare('SELECT * FROM price_list_items WHERE ' . $where . $order);
    $stmt->execute($params);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$item) return null;

    $base = (float)$item['unit_price'];

    // ── ۲) ضرایب فرزندِ همین ردیف (کد اختصاصی *<parent>-<n>) ──
    $applied = pl_apply_coefficients($pdo, $listId, $item, [
        'bundle_count' => $bundles,
        'crew_size' => $crewSize,
        'tower_structure' => $structure,
        'terrain_type' => $terrainGroup,
    ]);
    $coefs = $applied['coefficients'];
    $sumAmount = $applied['coefficient_amount'];

    $final = round($base + $sumAmount, 2);

    return [
        'item' => $item,
        'base_unit_price' => $base,
        'coefficients' => $coefs,
        'coefficient_amount' => round($sumAmount, 2),
        'coefficient_percent' => ($base > 0 && $sumAmount != 0.0) ? round($sumAmount * 100.0 / $base, 2) : 0.0,
        'unit_price' => $final,
        'terrain_group' => $terrainGroup,
        'terrain_label' => pl_terrain_group_label($terrainGroup),
    ];
}

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
        // v4.3.87: features → گیت شبیه‌ساز توسعه و تشخیص قابلیت‌های موجود روی هاست
        Response::success([
            'version' => 'v4.3.87',
            'component' => 'Powerline PHP Backend',
            'features' => ['price-list-import', 'price-list-match', 'invoice-candidates', 'invoice-generate', 'invoice-items', 'boq-standard-import', 'coefficient-lines'],
        ], 'نسخه بک‌اند');
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
                : ($table === 'contractors'
                    ? 'پیمانکار فعال است و برای جلوگیری از حذف ناخواسته تا زمانی که وضعیت آن را به «غیرفعال» تغییر ندهید، حذف نمی‌شود.'
                    : "$label فعال است — برای امنیت داده، ابتدا وضعیت آن را به «غیرفعال» تغییر دهید؛ رکوردهای غیرفعال قابل حذف هستند.");
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

    // ============================================================
    //  v4.3.86 — کاندیداهای صورت‌وضعیت:
    //  بازدیدهای ارسال‌شده/تأییدشدهٔ یک قرارداد در یک دوره، همراه با
    //  قلم متناسب فهرست بها + قیمت زمین + ضرایب (محاسبهٔ سروری)
    //  params: contract_id, period_start, period_end, price_list_id?, district_id?
    $router->get('invoices/candidates', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('financial.view');
        pl_require_boq();
        $pdo = Database::getInstance()->getConnection();

        $contractId = Helpers::queryInt('contract_id');
        $periodStart = Helpers::query('period_start');
        $periodEnd = Helpers::query('period_end');
        if ($periodStart === null || $periodEnd === null || $periodStart === '' || $periodEnd === '') {
            Response::error(400, 'ابتدا دوره (از تاریخ / تا تاریخ) را مشخص کنید');
        }
        $priceListId = Helpers::queryInt('price_list_id');
        if (!$priceListId) {
            $listActive = pl_active_condition($pdo, 'price_lists');
            $row = $pdo->query("SELECT id FROM price_lists WHERE $listActive ORDER BY id DESC LIMIT 1")->fetch();
            $priceListId = $row ? (int)$row['id'] : 0;
        }
        if (!$priceListId) Response::error(404, 'هیچ فهرست بهای فعالی ثبت نشده است');

        $hasCrewSize = Helpers::columnExists('inspections', 'crew_size');
        $crewSel = $hasCrewSize ? ', i.crew_size' : ', 1 AS crew_size';

        $where = "i.status IN ('submitted','approved') AND i.inspection_date >= ? AND i.inspection_date <= ?";
        $params = [$periodStart, $periodEnd];
        if ($contractId === null || $contractId > 0) {
            $where .= ' AND i.contract_id = ?';
            $params[] = (int)($contractId ?? 0);
        }
        $districtId = Helpers::queryInt('district_id');
        if ($districtId) { $where .= ' AND i.district_id = ?'; $params[] = $districtId; }

        $stmt = $pdo->prepare("SELECT i.id, i.inspection_code, i.inspection_date, i.inspection_method, i.terrain_type AS ins_terrain$crewSel,
                i.line_id, i.tower_id, l.line_code, l.name AS line_name, l.voltage_kv, l.circuit_count, l.bundle_count,
                l.tower_structure AS line_structure, t.tower_code, t.tower_structure AS tower_structure, t.terrain_type AS tower_terrain
            FROM inspections i
            LEFT JOIN `lines` l ON l.id = i.line_id
            LEFT JOIN towers t ON t.id = i.tower_id
            WHERE $where
            ORDER BY i.inspection_date ASC, i.id ASC LIMIT 2000");
        $stmt->execute($params);

        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $method = pl_normalize_inspection_method($row['inspection_method'] ?? null) ?? 'climbing';
            // v4.3.87: نوع زمین از «موقعیت دکل» (خواستهٔ کاربر)؛ بازدید فقط در نبود دکل
            $terrain = pl_normalize_terrain($row['tower_terrain'] ?? null)
                ?? pl_normalize_terrain($row['ins_terrain'] ?? null) ?? 'plain';
            $structure = $row['tower_structure'] ?? $row['line_structure'] ?? null;
            $chapter = $method === 'drone' ? 8 : 2; // پهبادی → فصل ۸، صعودی/پیمایشی → فصل ۲
            $crewSize = (int)($row['crew_size'] ?? 1);
            if ($crewSize < 1) $crewSize = 1;
            $match = pl_match_price_item($pdo, [
                'price_list_id' => $priceListId,
                'voltage_kv' => $row['voltage_kv'] ?? null,
                'circuit_count' => $row['circuit_count'] ?? null,
                'bundle_count' => $row['bundle_count'] ?? null,
                'activity_type' => 'inspection',
                'inspection_method' => $method,
                'tower_structure' => $structure,
                'terrain_type' => $terrain,
                'crew_size' => $crewSize,
                'chapter' => $chapter,
            ]);
            $out[] = [
                'inspection_id' => (int)$row['id'],
                'inspection_code' => $row['inspection_code'],
                'inspection_date' => $row['inspection_date'],
                'line_code' => $row['line_code'],
                'line_name' => $row['line_name'],
                'tower_code' => $row['tower_code'],
                'activity_type' => 'inspection',
                'inspection_method' => $method,
                'chapter' => $chapter,
                'terrain_type' => $terrain,
                'terrain_label' => pl_terrain_label($terrain),
                'tower_structure' => $structure,
                'crew_size' => $crewSize,
                'voltage_kv' => $row['voltage_kv'] !== null ? $row['voltage_kv'] + 0 : null,
                'circuit_count' => $row['circuit_count'] !== null ? (int)$row['circuit_count'] : null,
                'bundle_count' => $row['bundle_count'] !== null ? (int)$row['bundle_count'] : null,
                'matched' => $match ? [
                    'item_id' => (int)$match['item']['id'],
                    'code' => $match['item']['code'],
                    'title' => $match['item']['title'],
                    'unit' => $match['item']['unit'],
                    'chapter' => isset($match['item']['chapter']) ? (int)$match['item']['chapter'] : null,
                    'base_unit_price' => $match['base_unit_price'],
                    'coefficients' => $match['coefficients'],
                    'coefficient_amount' => $match['coefficient_amount'],
                    'unit_price' => $match['unit_price'],
                    'terrain_label' => $match['terrain_label'],
                ] : null,
            ];
        }
        Response::success(['price_list_id' => $priceListId, 'items' => $out]);
    });

    // ============================================================
    //  v4.3.87 — صدور صورت‌وضعیت از بازدیدها و تعمیرات
    //  body: { contract_id, period_start, period_end, price_list_id?, district_id?,
    //          tax_percent? (پیش‌فرض ۱۰), notes?, items: [
    //            { inspection_id, quantity?, include_coefficients? }
    //            یا { price_list_item_id, quantity, work_order_id?, line_id?, tower_id?,
    //                terrain_type?, tower_structure?, crew_size? }
    //          ] }
    //  قیمت‌ها همه در سرور از فهرست بها بازمحاسبه می‌شوند (قابل جعل نیستند)
    //  هر ضریب، خودش یک ردیف مستقل در اقلام صورت‌وضعیت می‌گیرد
    //  (مطابق فهرست بهای کشوری: کاهش/اضافه بها زیر ردیف اصلی با کد اختصاصی)
    // ============================================================
    $router->post('invoices/generate', function () {
        $user = Auth::authenticate();
        Auth::requirePermissionSoft('financial.create');
        pl_require_boq('invoice_items');
        $body = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();

        $contractId = (int)($body['contract_id'] ?? 0);
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        if ($contractId <= 0) Response::error(400, 'قرارداد الزامی است');
        if (count($items) === 0) Response::error(400, 'هیچ قلمی برای صورت‌وضعیت انتخاب نشده است');

        $contract = $pdo->prepare('SELECT id, title, contractor_id FROM contracts WHERE id = ?');
        $contract->execute([$contractId]);
        $contract = $contract->fetch(PDO::FETCH_ASSOC);
        if (!$contract) Response::error(404, 'قرارداد پیدا نشد');

        $periodStart = $body['period_start'] ?? date('Y-m-d');
        $periodEnd = $body['period_end'] ?? date('Y-m-d');
        $taxPercent = pl_num_or_null($body['tax_percent'] ?? null);
        if ($taxPercent === null) $taxPercent = 10.0;
        $contractorId = $body['contractor_id'] ?? $contract['contractor_id'] ?? null;

        $priceListId = (int)($body['price_list_id'] ?? 0);
        if ($priceListId <= 0) {
            $listActive = pl_active_condition($pdo, 'price_lists');
            $row = $pdo->query("SELECT id FROM price_lists WHERE $listActive ORDER BY id DESC LIMIT 1")->fetch();
            $priceListId = $row ? (int)$row['id'] : 0;
        }
        if ($priceListId <= 0) Response::error(404, 'فهرست بهای مبنای محاسبه پیدا نشد');

        // ── بازمحاسبهٔ سروری همهٔ اقلام ──
        $lines = [];
        $sumBase = 0.0; $sumCoef = 0.0; $sumNet = 0.0;
        $hasInsCrew = Helpers::columnExists('inspections', 'crew_size');
        $insStmt = $pdo->prepare("SELECT i.id, i.inspection_code, i.inspection_method, i.terrain_type AS ins_terrain"
            . ($hasInsCrew ? ', i.crew_size' : '')
            . ", l.line_code, l.name AS line_name, l.voltage_kv, l.circuit_count, l.bundle_count,
                l.tower_structure AS line_structure, t.tower_code, t.tower_structure AS tower_structure, t.terrain_type AS tower_terrain
            FROM inspections i
            LEFT JOIN `lines` l ON l.id = i.line_id
            LEFT JOIN towers t ON t.id = i.tower_id
            WHERE i.id = ?");
        $itemStmt = $pdo->prepare('SELECT * FROM price_list_items WHERE id = ? AND price_list_id = ?');
        $lineStmt = $pdo->prepare('SELECT id, line_code, name, voltage_kv, circuit_count, bundle_count, tower_structure FROM `lines` WHERE id = ?');
        $towerStmt = $pdo->prepare('SELECT id, tower_code, tower_structure, terrain_type, line_id FROM towers WHERE id = ?');
        $woStmt = $pdo->prepare('SELECT wo_code, title FROM work_orders WHERE id = ?');

        /** افزودن یک ردیف پایه + ردیف‌های ضریب آن */
        $addEntry = function (array $match, float $quantity, ?int $inspectionId, ?int $workOrderId,
                              ?string $contextDesc, ?string $terrain, ?string $structure) use (&$lines, &$sumBase, &$sumCoef, &$sumNet): void {
            $item = $match['item'];
            $base = (float)$match['base_unit_price'];
            $unit = $item['unit'] ?: 'عدد';
            $desc = $contextDesc !== null && $contextDesc !== ''
                ? $item['title'] . ' — ' . $contextDesc
                : $item['title'];
            $desc .= ' [' . $item['code'] . ']';

            $lineBase = round($base * $quantity, 2);
            $sumBase += $lineBase;
            $lines[] = [
                'inspection_id' => $inspectionId,
                'work_order_id' => $workOrderId,
                'price_list_item_id' => (int)$item['id'],
                'description' => $desc,
                'unit' => $unit,
                'quantity' => $quantity,
                'unit_price' => $base,
                'total_price' => $lineBase,
                'base_amount' => $lineBase,
                'coefficient_percent' => null,
                'coefficient_amount' => 0.0,
                'is_coefficient' => 0,
                'terrain_type' => $terrain,
                'tower_structure' => $structure,
            ];
            $sumNet += $lineBase;

            // ردیف‌های ضریب — مستقل، مطابق فهرست کشوری (کاهش/اضافه بها)
            foreach ($match['coefficients'] as $coef) {
                $amount = (float)$coef['amount'];
                $lineCoef = round($amount * $quantity, 2);
                $sumCoef += $lineCoef;
                $sumNet += $lineCoef;
                $coefDesc = $coef['title'] . ($contextDesc ? ' — ' . $contextDesc : '') . ' [' . $coef['code'] . ']';
                $lines[] = [
                    'inspection_id' => $inspectionId,
                    'work_order_id' => $workOrderId,
                    'price_list_item_id' => (int)$coef['id'],
                    'description' => $coefDesc,
                    'unit' => $unit,
                    'quantity' => $quantity,
                    'unit_price' => $amount,
                    'total_price' => $lineCoef,
                    'base_amount' => 0.0,
                    'coefficient_percent' => null,
                    'coefficient_amount' => $lineCoef,
                    'is_coefficient' => 1,
                    'terrain_type' => $terrain,
                    'tower_structure' => $structure,
                ];
            }
        };

        foreach ($items as $it) {
            if (!is_array($it)) continue;
            $quantity = max(0.001, (float)($it['quantity'] ?? 1));
            $workOrderId = !empty($it['work_order_id']) ? (int)$it['work_order_id'] : null;

            if (!empty($it['inspection_id'])) {
                // ── قلم بازدید: تطبیق خودکار از فهرست بها (زمین از دکل) ──
                $inspectionId = (int)$it['inspection_id'];
                $insStmt->execute([$inspectionId]);
                $ins = $insStmt->fetch(PDO::FETCH_ASSOC);
                if (!$ins) Response::error(404, "بازدید #$inspectionId پیدا نشد");
                $method = pl_normalize_inspection_method($ins['inspection_method'] ?? null) ?? 'climbing';
                $terrain = pl_normalize_terrain($ins['tower_terrain'] ?? null)
                    ?? pl_normalize_terrain($ins['ins_terrain'] ?? null) ?? 'plain';
                $structure = $ins['tower_structure'] ?? $ins['line_structure'] ?? null;
                $crewSize = (int)($ins['crew_size'] ?? 1);
                if ($crewSize < 1) $crewSize = 1;
                $chapter = $method === 'drone' ? 8 : 2;
                $match = pl_match_price_item($pdo, [
                    'price_list_id' => $priceListId,
                    'voltage_kv' => $ins['voltage_kv'] ?? null,
                    'circuit_count' => $ins['circuit_count'] ?? null,
                    'bundle_count' => $ins['bundle_count'] ?? null,
                    'activity_type' => 'inspection',
                    'inspection_method' => $method,
                    'tower_structure' => $structure,
                    'terrain_type' => $terrain,
                    'crew_size' => $crewSize,
                    'chapter' => $chapter,
                ]);
                $methodLabels = ['climbing' => 'بازدید صعودی', 'patrol' => 'بازدید پیمایشی', 'drone' => 'بازدید پهبادی'];
                if (!$match || $match['unit_price'] === null) {
                    Response::error(422, "برای بازدید {$ins['inspection_code']} ردیف مناسبی در فهرست بها یافت نشد ("
                        . ($methodLabels[$method] ?? $method) . ' / ' . pl_terrain_label($terrain) . ')');
                }
                $context = 'دکل ' . ($ins['tower_code'] ?: '—') . ' — خط ' . ($ins['line_code'] ?: '—')
                    . ' — ' . pl_terrain_label($terrain)
                    . ($structure ? " — $structure" : '');
                $addEntry($match, $quantity, $inspectionId, $workOrderId, $context, $terrain, $structure);
            } elseif (!empty($it['price_list_item_id'])) {
                // ── قلم دستی (تعمیرات/عملیات/خدمات) + زمینه اختیاری خط/دکل ──
                $itemStmt->execute([(int)$it['price_list_item_id'], $priceListId]);
                $pli = $itemStmt->fetch(PDO::FETCH_ASSOC);
                if (!$pli) Response::error(404, 'قلم فهرست بها پیدا نشد: ' . (int)$it['price_list_item_id']);
                if (($pli['item_kind'] ?? 'base') === 'coefficient') {
                    Response::error(400, 'ردیف‌های ضریب به‌تنهایی قابل انتخاب نیستند — ردیف اصلی را انتخاب کنید تا ضرایب مربوط خودکار اعمال شوند (' . $pli['code'] . ')');
                }
                // زمینه: دکل → خط؛ یا خط مستقیم؛ یا مقدار صریح
                $line = null; $tower = null; $structure = null; $terrain = null; $crewSize = 1;
                if (!empty($it['tower_id'])) {
                    $towerStmt->execute([(int)$it['tower_id']]);
                    $tower = $towerStmt->fetch(PDO::FETCH_ASSOC);
                    if (!$tower) Response::error(404, 'دکل زمینه پیدا نشد: ' . (int)$it['tower_id']);
                    if ($tower['line_id']) {
                        $lineStmt->execute([(int)$tower['line_id']]);
                        $line = $lineStmt->fetch(PDO::FETCH_ASSOC);
                    }
                    $structure = $tower['tower_structure'] ?? null;
                    $terrain = pl_normalize_terrain($tower['terrain_type'] ?? null);
                } elseif (!empty($it['line_id'])) {
                    $lineStmt->execute([(int)$it['line_id']]);
                    $line = $lineStmt->fetch(PDO::FETCH_ASSOC);
                    if (!$line) Response::error(404, 'خط زمینه پیدا نشد: ' . (int)$it['line_id']);
                    $structure = $line['tower_structure'] ?? null;
                }
                // مقادیر صریح بر زمینه اولویت دارند (زمین/سازه/تعداد نفرات)
                if (!empty($it['terrain_type'])) $terrain = pl_normalize_terrain($it['terrain_type']) ?? $terrain;
                if (!empty($it['tower_structure'])) $structure = trim((string)$it['tower_structure']);
                if (!empty($it['crew_size'])) $crewSize = max(1, (int)$it['crew_size']);

                $match = [
                    'item' => $pli,
                    'base_unit_price' => (float)$pli['unit_price'],
                    'coefficients' => [],
                    'coefficient_amount' => 0.0,
                ];
                $applied = pl_apply_coefficients($pdo, $priceListId, $pli, [
                    'bundle_count' => $line['bundle_count'] ?? null,
                    'crew_size' => $crewSize,
                    'tower_structure' => $structure,
                    'terrain_type' => $terrain,
                ]);
                $match['coefficients'] = $applied['coefficients'];
                $match['coefficient_amount'] = $applied['coefficient_amount'];

                $context = '';
                if ($line) $context .= 'خط ' . ($line['line_code'] ?: '—');
                if ($tower) $context .= ($context ? ' — ' : '') . 'دکل ' . ($tower['tower_code'] ?: '—');
                if ($terrain) $context .= ($context ? ' — ' : '') . pl_terrain_label($terrain);
                if ($workOrderId) {
                    $woStmt->execute([$workOrderId]);
                    $wo = $woStmt->fetch(PDO::FETCH_ASSOC);
                    if ($wo) $context .= ($context ? ' — ' : '') . 'دستورکار ' . $wo['wo_code'];
                }
                $addEntry($match, $quantity, null, $workOrderId, $context !== '' ? $context : null, $terrain, $structure);
            } else {
                continue;
            }
        }
        if (count($lines) === 0) Response::error(400, 'هیچ قلم معتبری یافت نشد');

        $tax = round($sumNet * $taxPercent / 100.0, 2);
        $final = round($sumNet + $tax, 2);
        $code = 'INV-' . date('Y') . '-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $districtId = Helpers::districtFromBody($body, 'invoices');

        // ── ثبت صورت‌وضعیت ──
        $invCols = ['invoice_code', 'contract_id', 'contractor_id', 'period_start', 'period_end',
            'total_amount', 'tax_amount', 'final_amount', 'status', 'notes', 'created_at'];
        $invVals = ['?', '?', '?', '?', '?', '?', '?', '?', "'draft'", '?', 'NOW()'];
        $invParams = [$code, $contractId, $contractorId, $periodStart, $periodEnd, $sumNet, $tax, $final, $body['notes'] ?? null];
        foreach ([
            'price_list_id' => $priceListId,
            'net_amount' => round($sumNet, 2),
            'coefficient_amount' => round($sumCoef, 2),
            'tax_percent' => $taxPercent,
        ] as $col => $val) {
            if (Helpers::columnExists('invoices', $col)) { $invCols[] = "`$col`"; $invVals[] = '?'; $invParams[] = $val; }
        }
        if (Helpers::columnExists('invoices', 'activity_status')) { $invCols[] = 'activity_status'; $invVals[] = "'inactive'"; }
        if (Helpers::columnExists('invoices', 'district_id')) { $invCols[] = 'district_id'; $invVals[] = '?'; $invParams[] = $districtId; }
        $pdo->prepare('INSERT INTO invoices (' . implode(', ', $invCols) . ') VALUES (' . implode(', ', $invVals) . ')')->execute($invParams);
        $invoiceId = (int)$pdo->lastInsertId();

        // ── ثبت اقلام (پایه + ضریب، هر کدام یک ردیف) ──
        $iiCols = ['invoice_id', 'price_list_item_id', 'work_order_id', 'description', 'unit', 'quantity', 'unit_price', 'total_price'];
        foreach (['inspection_id', 'terrain_type', 'tower_structure', 'coefficient_percent', 'coefficient_amount', 'base_amount'] as $col) {
            if (Helpers::columnExists('invoice_items', $col)) $iiCols[] = "`$col`";
        }
        $iiStmt = $pdo->prepare('INSERT INTO invoice_items (' . implode(', ', $iiCols) . ') VALUES (' . implode(', ', array_fill(0, count($iiCols), '?')) . ')');
        foreach ($lines as $ln) {
            $p = [];
            foreach ($iiCols as $c) {
                $k = trim($c, '`');
                $p[] = $ln[$k] ?? null;
            }
            $iiStmt->execute($p);
        }

        Logger::info('Invoice generated', ['invoice_id' => $invoiceId, 'code' => $code, 'items' => count($lines), 'user_id' => $user['id']]);
        Response::success([
            'id' => $invoiceId,
            'invoice_code' => $code,
            'items_count' => count($lines),
            'base_amount' => round($sumBase, 2),
            'coefficient_amount' => round($sumCoef, 2),
            'net_amount' => round($sumNet, 2),
            'tax_amount' => $tax,
            'final_amount' => $final,
        ], 'صورت‌وضعیت صادر شد', 201);
    });

    $router->get('invoices/{id}/items', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('financial.view');
        $pdo = Database::getInstance()->getConnection();
        $stmt = $pdo->prepare("SELECT ii.*, pli.code AS pli_code, ins.inspection_code, wo.wo_code
            FROM invoice_items ii
            LEFT JOIN price_list_items pli ON pli.id = ii.price_list_item_id
            LEFT JOIN inspections ins ON ins.id = ii.inspection_id
            LEFT JOIN work_orders wo ON wo.id = ii.work_order_id
            WHERE ii.invoice_id = ?
            ORDER BY ii.id ASC");
        $stmt->execute([(int)$id]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            foreach (['quantity','unit_price','total_price','base_amount','coefficient_amount'] as $k) {
                if (array_key_exists($k, $r) && $r[$k] !== null) $r[$k] = $r[$k] + 0;
            }
        }
        unset($r);
        $inv = $pdo->prepare('SELECT i.*, c.title AS contract_title, ct.contractor_name FROM invoices i LEFT JOIN contracts c ON c.id = i.contract_id LEFT JOIN contractors ct ON ct.id = i.contractor_id WHERE i.id = ?');
        $inv->execute([(int)$id]);
        $invoice = $inv->fetch(PDO::FETCH_ASSOC);
        Response::success(['invoice' => $invoice ?: null, 'items' => $rows]);
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
        // v4.3.87: سازگار با هر دو ساختار — ستون status (varchar) یا is_active (tinyint)
        $cols = ['name', 'version', 'effective_date', 'contract_id', 'created_at'];
        $params = [$body['name'], $body['version'] ?? '1.0', $body['effective_date'] ?? date('Y-m-d'), $body['contract_id'] ?? null, date('Y-m-d H:i:s')];
        if (Helpers::columnExists('price_lists', 'status')) { $cols[] = 'status'; $params[] = pl_active_status_value($pdo, 'price_lists'); }
        elseif (Helpers::columnExists('price_lists', 'is_active')) { $cols[] = 'is_active'; $params[] = 1; }
        $stmt = $pdo->prepare('INSERT INTO price_lists (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')');
        $stmt->execute($params);
        Response::success(['id' => (int)$pdo->lastInsertId()], 'فهرست بها ایجاد شد', 201);
    });

    $router->put('price-lists/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.update');
        $body = Helpers::getJsonBody();
        $pdo = Database::getInstance()->getConnection();
        $fields = ['name','version','effective_date','contract_id'];
        // v4.3.87: وضعیت فقط روی ستونی که واقعاً وجود دارد
        if (array_key_exists('status', $body)) {
            if (Helpers::columnExists('price_lists', 'status')) $fields[] = 'status';
            elseif (Helpers::columnExists('price_lists', 'is_active')) {
                $fields[] = 'is_active';
                $body['is_active'] = in_array(strtolower(trim((string)$body['status'])), ['inactive','0','false','deactive'], true) ? 0 : 1;
            }
            unset($body['status']);
        }
        if (array_key_exists('is_active', $body) && Helpers::columnExists('price_lists', 'is_active')) $fields[] = 'is_active';
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
        if ($listId) { $where .= ' AND pli.price_list_id = ?'; $params[] = $listId; }
        // v4.3.87: فیلترهای طبقه‌بندی کشوری — فصل/ولتاژ/مدار/باندل/فعالیت/روش/زمین/نوع ضریب/والد + جستجو
        $voltage = Helpers::query('voltage_kv');
        if ($voltage !== null && $voltage !== '') {
            if ($voltage === 'general') { $where .= ' AND pli.voltage_kv IS NULL'; }
            else { $where .= ' AND pli.voltage_kv = ?'; $params[] = (float)$voltage; }
        }
        $circuits = Helpers::query('circuit_count');
        if ($circuits !== null && $circuits !== '') {
            if ($circuits === 'general') { $where .= ' AND pli.circuit_count IS NULL'; }
            else { $where .= ' AND pli.circuit_count = ?'; $params[] = (int)$circuits; }
        }
        $bundles = Helpers::query('bundle_count');
        if ($bundles !== null && $bundles !== '') {
            if ($bundles === 'general') { $where .= ' AND pli.bundle_count IS NULL'; }
            else { $where .= ' AND pli.bundle_count = ?'; $params[] = (int)$bundles; }
        }
        $activity = Helpers::query('activity_type');
        if ($activity !== null && $activity !== '') {
            $act = pl_normalize_activity_type($activity);
            if ($act !== null) { $where .= ' AND pli.activity_type = ?'; $params[] = $act; }
        }
        $method = Helpers::query('inspection_method');
        if ($method !== null && $method !== '') {
            $m = pl_normalize_inspection_method($method);
            if ($m !== null) { $where .= ' AND pli.inspection_method = ?'; $params[] = $m; }
        }
        $terrain = Helpers::query('terrain_type');
        if ($terrain !== null && $terrain !== '') {
            if ($terrain === 'general') { $where .= ' AND pli.terrain_type IS NULL'; }
            else {
                $g = pl_normalize_item_terrain($terrain);
                if ($g !== null) { $where .= ' AND pli.terrain_type = ?'; $params[] = $g; }
            }
        }
        $kind = Helpers::query('item_kind');
        if ($kind === 'coefficient' || $kind === 'base') {
            if ($kind === 'base') { $where .= " AND (pli.item_kind = 'base' OR pli.item_kind IS NULL)"; }
            else { $where .= ' AND pli.item_kind = ?'; $params[] = $kind; }
        }
        $coef = Helpers::query('coefficient');
        if ($coef === '1') { $where .= " AND pli.item_kind = 'coefficient'"; }
        elseif ($coef === '0') { $where .= " AND (pli.item_kind = 'base' OR pli.item_kind IS NULL)"; }
        $chapter = Helpers::query('chapter');
        if ($chapter !== null && $chapter !== '') {
            if (Helpers::columnExists('price_list_items', 'chapter')) {
                $where .= ' AND pli.chapter = ?'; $params[] = (int)$chapter;
            }
        }
        $coefKind = Helpers::query('coefficient_kind');
        if ($coefKind !== null && $coefKind !== '') {
            $ck = pl_coefficient_kind_normalize($coefKind);
            if ($ck !== null) { $where .= ' AND pli.coefficient_kind = ?'; $params[] = $ck; }
        }
        $parentCode = Helpers::query('parent_code');
        if ($parentCode !== null && $parentCode !== '') {
            $where .= ' AND pli.parent_code = ?'; $params[] = trim((string)$parentCode);
        }
        $search = Helpers::getSearch();
        if (!empty($search)) {
            $where .= ' AND (pli.code LIKE ? OR pli.title LIKE ? OR pli.category LIKE ? OR pli.parent_code LIKE ?)';
            $sp = "%$search%"; $params[] = $sp; $params[] = $sp; $params[] = $sp; $params[] = $sp;
        }
        // ترتیب: مثل فایل رسمی — ردیف اصلی و بعد ضرایبش (sort_order فایل اصلی)
        $orderBy = Helpers::columnExists('price_list_items', 'sort_order')
            ? ' ORDER BY COALESCE(pli.sort_order, pli.id) ASC, pli.id ASC'
            : " ORDER BY (pli.item_kind = 'coefficient') ASC, pli.id ASC";
        $stmt = $pdo->prepare("SELECT pli.* FROM price_list_items pli WHERE $where$orderBy LIMIT 5000");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        // اعداد به int/float تبدیل می‌شوند تا فرانت بدون تبدیل محاسبه کند
        foreach ($rows as &$r) {
            foreach (['voltage_kv','unit_price','coefficient_percent'] as $k) {
                if (array_key_exists($k, $r) && $r[$k] !== null) $r[$k] = $r[$k] + 0;
            }
            foreach (['circuit_count','bundle_count','chapter','sort_order'] as $k) {
                if (array_key_exists($k, $r) && $r[$k] !== null) $r[$k] = (int)$r[$k];
            }
        }
        unset($r);
        Response::success($rows);
    });

    $router->post('price-list-items', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.create');
        $body = Helpers::getJsonBody();
        if (empty($body['title']) || empty($body['price_list_id'])) Response::error(400, 'عنوان و فهرست الزامی است');
        pl_require_boq();
        $pdo = Database::getInstance()->getConnection();
        $code = pl_clean_code($body['code'] ?? null) ?? ('PL-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT));
        $cls = pl_item_payload($body);

        // ساخت INSERT پویا — فقط ستون‌های موجود در این دیتابیس
        $candidateCols = ['price_list_id', 'code', 'title', 'unit', 'unit_price', 'category',
            'item_kind', 'chapter', 'parent_code', 'coefficient_kind', 'sort_order',
            'activity_type', 'inspection_method', 'voltage_kv', 'circuit_count', 'bundle_count',
            'terrain_type', 'tower_structure'];
        $values = [
            'price_list_id' => (int)$body['price_list_id'],
            'code' => $code,
            'title' => $body['title'],
            'unit' => trim((string)($body['unit'] ?? '')) !== '' ? $body['unit']
                : ($cls['item_kind'] === 'coefficient' ? 'ضریب' : 'برج'),
            'unit_price' => pl_num_or_null($body['unit_price'] ?? null) ?? 0,
            'category' => trim((string)($body['category'] ?? '')) !== '' ? $body['category']
                : ($cls['chapter'] !== null ? pl_chapter_label($cls['chapter']) : 'عملیات'),
            'item_kind' => $cls['item_kind'],
            'chapter' => $cls['chapter'],
            'parent_code' => $cls['parent_code'],
            'coefficient_kind' => $cls['coefficient_kind'],
            'sort_order' => $cls['sort_order'],
            'activity_type' => $cls['activity_type'],
            'inspection_method' => $cls['inspection_method'],
            'voltage_kv' => $cls['voltage_kv'],
            'circuit_count' => $cls['circuit_count'],
            'bundle_count' => $cls['bundle_count'],
            'terrain_type' => $cls['terrain_type'],
            'tower_structure' => $cls['tower_structure'],
        ];
        $cols = []; $marks = []; $params = [];
        foreach ($candidateCols as $c) {
            if (Helpers::columnExists('price_list_items', $c)) {
                $cols[] = "`$c`"; $marks[] = '?'; $params[] = $values[$c];
            }
        }
        if (Helpers::columnExists('price_list_items', 'status')) { $cols[] = 'status'; $marks[] = '?'; $params[] = pl_active_status_value($pdo, 'price_list_items'); }
        if (Helpers::columnExists('price_list_items', 'is_active')) { $cols[] = 'is_active'; $marks[] = '1'; }
        $stmt = $pdo->prepare('INSERT INTO price_list_items (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $marks) . ')');
        $stmt->execute($params);
        Response::success(['id' => (int)$pdo->lastInsertId(), 'code' => $code], 'قلم ایجاد شد', 201);
    });

    $router->put('price-list-items/{id}', function ($id) {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.update');
        $body = Helpers::getJsonBody(); $pdo = Database::getInstance()->getConnection();
        // v4.3.81: قفل امور — تغییر امور رکورد فقط برای مدیر
        $body = Helpers::stripDistrictForNonAdmin($body);
        $fields = ['code','title','unit','unit_price','category'];
        // v4.3.87: فیلدهای طبقه‌بندی کشوری — فقط فیلدهای ارسال‌شده با مقدار نرمال‌شده
        if (Helpers::columnExists('price_list_items', 'item_kind')) {
            $cls = pl_item_payload($body);
            foreach ($cls as $k => $v) {
                if (array_key_exists($k, $body) && Helpers::columnExists('price_list_items', $k)) {
                    $body[$k] = $v; $fields[] = $k;
                }
            }
        }
        // وضعیت: مقدار 'active'/'inactive' به شکل عددی ستون تبدیل می‌شود
        if (array_key_exists('status', $body) && Helpers::columnExists('price_list_items', 'status')) {
            $fields[] = 'status';
            $isInactive = in_array(strtolower(trim((string)$body['status'])), ['inactive', '0', 'false', 'deactive'], true);
            $activeVal = pl_active_status_value($pdo, 'price_list_items');
            $inactiveVal = is_int($activeVal) ? 0 : 'inactive';
            $body['status'] = $isInactive ? $inactiveVal : $activeVal;
            if (Helpers::columnExists('price_list_items', 'is_active')) {
                $fields[] = 'is_active';
                $body['is_active'] = $isInactive ? 0 : 1;
            }
        } elseif (array_key_exists('status', $body)) {
            unset($body['status']);
        }
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
        $pdo = Database::getInstance()->getConnection();
        // حذف ردیف اصلی، ضرایب فرزندش هم حذف می‌شوند (بی‌والد می‌مانند)
        $stmt = $pdo->prepare('SELECT code, price_list_id FROM price_list_items WHERE id = ?');
        $stmt->execute([(int)$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $del = $pdo->prepare('DELETE FROM price_list_items WHERE price_list_id = ? AND parent_code = ?');
            $del->execute([(int)$row['price_list_id'], (string)$row['code']]);
        }
        Database::getInstance()->execute('DELETE FROM price_list_items WHERE id = ?', [(int)$id]);
        Response::success(null, 'قلم حذف شد');
    });

    // ============================================================
    //  v4.3.87 — ایمپورت گروهی فهرست بهای کشوری
    //  body: { price_list_id, items: [...], replace?: bool }
    //  هر item فیلدهای POST + اجبار title؛ اقلامِ پارس‌شده از فرمت استاندارد
    //  (شماره ردیف فصل | شرح | واحد | بهای واحد) توسط فرانت پارس و ارسال می‌شوند.
    //  ردیف‌های بدون کد (ضرایب) باید code اختصاصی *<کد والد>-<n> و parent_code داشته باشند.
    //  همهٔ ستون‌های اختیاری فقط در صورت وجود در دیتابیس نوشته می‌شوند.
    // ============================================================
    $router->post('price-list-items/import', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.create');
        pl_require_boq();
        $body = Helpers::getJsonBody();
        $listId = (int)($body['price_list_id'] ?? 0);
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        $replace = !empty($body['replace']);
        if ($listId <= 0) Response::error(400, 'ابتدا یک فهرست بها انتخاب کنید');
        if (count($items) === 0) Response::error(400, 'هیچ ردیفی برای ایمپورت یافت نشد');

        $pdo = Database::getInstance()->getConnection();
        $chk = $pdo->prepare('SELECT id FROM price_lists WHERE id = ?');
        $chk->execute([$listId]);
        if (!$chk->fetch()) Response::error(404, 'فهرست بها پیدا نشد');

        // ساخت INSERT پویا — سازگار با وجود/نبود ستون‌ها در هر دیتابیس
        $candidateCols = ['price_list_id', 'code', 'title', 'unit', 'unit_price', 'category',
            'item_kind', 'chapter', 'parent_code', 'coefficient_kind', 'sort_order',
            'activity_type', 'inspection_method', 'voltage_kv', 'circuit_count', 'bundle_count',
            'terrain_type', 'tower_structure',
            // ستون‌های قدیمی v4.3.86 — فقط اگر دیتابیس داشته باشد
            'unit_price_plain', 'unit_price_hilly', 'unit_price_semi_mountainous', 'unit_price_impassable', 'coefficient_percent'];
        $hasStatusCol = Helpers::columnExists('price_list_items', 'status');
        $hasIsActiveCol = Helpers::columnExists('price_list_items', 'is_active');
        $insValCols = array_values(array_filter($candidateCols, fn($c) => Helpers::columnExists('price_list_items', $c)));
        if ($hasStatusCol) $insValCols[] = 'status';
        if ($hasIsActiveCol) $insValCols[] = 'is_active';
        $stmt = $pdo->prepare('INSERT INTO price_list_items (' . implode(', ', $insValCols) . ') VALUES ('
            . implode(', ', array_fill(0, count($insValCols), '?')) . ')');

        $pdo->beginTransaction();
        try {
            if ($replace) {
                $pdo->prepare('DELETE FROM price_list_items WHERE price_list_id = ?')->execute([$listId]);
            }
            $normal = 0; $coefs = 0; $seq = 0;
            $activeVal = pl_active_status_value($pdo, 'price_list_items');
            foreach ($items as $it) {
                if (!is_array($it) || empty($it['title'])) continue;
                $cls = pl_item_payload($it);
                $code = pl_clean_code($it['code'] ?? null);
                if ($code === null) {
                    $seq++;
                    $code = ($cls['item_kind'] === 'coefficient' ? 'COEF-' : 'PL-') . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
                }
                $unit = trim((string)($it['unit'] ?? '')) !== '' ? $it['unit']
                    : ($cls['item_kind'] === 'coefficient' ? 'ضریب' : 'برج');
                $category = trim((string)($it['category'] ?? '')) !== '' ? $it['category']
                    : ($cls['chapter'] !== null ? pl_chapter_label($cls['chapter'])
                        : ($cls['item_kind'] === 'coefficient' ? 'ضریب' : 'عملیات'));

                $rowByCol = [
                    'price_list_id' => $listId,
                    'code' => $code,
                    'title' => $it['title'],
                    'unit' => $unit,
                    'unit_price' => pl_num_or_null($it['unit_price'] ?? null) ?? 0,
                    'category' => $category,
                    'item_kind' => $cls['item_kind'],
                    'chapter' => $cls['chapter'],
                    'parent_code' => $cls['parent_code'],
                    'coefficient_kind' => $cls['coefficient_kind'],
                    'sort_order' => $cls['sort_order'],
                    'activity_type' => $cls['activity_type'],
                    'inspection_method' => $cls['inspection_method'],
                    'voltage_kv' => $cls['voltage_kv'],
                    'circuit_count' => $cls['circuit_count'],
                    'bundle_count' => $cls['bundle_count'],
                    'terrain_type' => $cls['terrain_type'],
                    'tower_structure' => $cls['tower_structure'],
                    // قدیمی v4.3.86 — اگر ستون‌ها موجودند
                    'unit_price_plain' => pl_num_or_null($it['unit_price_plain'] ?? null),
                    'unit_price_hilly' => pl_num_or_null($it['unit_price_hilly'] ?? null),
                    'unit_price_semi_mountainous' => pl_num_or_null($it['unit_price_semi_mountainous'] ?? null),
                    'unit_price_impassable' => pl_num_or_null($it['unit_price_impassable'] ?? null),
                    'coefficient_percent' => pl_num_or_null($it['coefficient_percent'] ?? null),
                ];
                $row = [];
                foreach ($insValCols as $c) {
                    if ($c === 'status') { $row[] = $activeVal; }
                    elseif ($c === 'is_active') { $row[] = 1; }
                    else { $row[] = $rowByCol[$c] ?? null; }
                }
                $stmt->execute($row);
                if ($cls['item_kind'] === 'coefficient') $coefs++; else $normal++;
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            Response::error(500, 'خطا در ذخیره اقلام: ' . $e->getMessage());
        }
        Response::success(['imported_items' => $normal, 'imported_coefficients' => $coefs],
            "ایمپورت انجام شد — $normal ردیف اصلی و $coefs ردیف ضریب ثبت شد" . ($replace ? ' (ردیف‌های قبلی حذف شدند)' : ''), 201);
    });

    // ============================================================
    //  v4.3.87 — تطبیق ردیف فهرست بها با خط/دکل/روش بازدید
    //  params: line_id, tower_id?, inspection_method (صعودی/پیمایشی/پهبادی),
    //          terrain_type? (پیش‌فرض: زمین دکل), crew_size?,
    //          price_list_id? (پیش‌فرض: آخرین فهرست فعال)
    //  زمین و سازه از دکل خوانده می‌شود — قیمت متناسب با موقعیت دکل
    // ============================================================
    $router->get('price-list-items/match', function () {
        Auth::authenticate();
        Auth::requirePermissionSoft('price_lists.view');
        pl_require_boq();
        $pdo = Database::getInstance()->getConnection();

        $lineId = Helpers::queryInt('line_id');
        $towerId = Helpers::queryInt('tower_id');
        $method = pl_normalize_inspection_method(Helpers::query('inspection_method') ?? Helpers::query('inspection_type')) ?? 'climbing';
        $terrainOverride = Helpers::query('terrain_type');
        $crewSize = Helpers::queryInt('crew_size');
        $priceListId = Helpers::queryInt('price_list_id');

        // فهرست پیش‌فرض: آخرین فهرست فعال (سازگار با ستون وضعیت عددی/متنی)
        if (!$priceListId) {
            $listActive = pl_active_condition($pdo, 'price_lists');
            $row = $pdo->query("SELECT id FROM price_lists WHERE $listActive ORDER BY id DESC LIMIT 1")->fetch();
            if (!$row) Response::error(404, 'هیچ فهرست بهای فعالی ثبت نشده است');
            $priceListId = (int)$row['id'];
        }

        $line = null; $tower = null;
        if ($lineId) {
            $line = $pdo->query("SELECT id, line_code, name, voltage_kv, circuit_count, bundle_count, tower_structure FROM `lines` WHERE id = " . (int)$lineId)->fetch(PDO::FETCH_ASSOC);
            if (!$line) Response::error(404, 'خط پیدا نشد');
        }
        if ($towerId) {
            $tower = $pdo->query('SELECT id, tower_code, tower_structure, terrain_type, line_id FROM towers WHERE id = ' . (int)$towerId)->fetch(PDO::FETCH_ASSOC);
            if (!$tower) Response::error(404, 'دکل پیدا نشد');
        }

        $structure = $tower['tower_structure'] ?? ($line['tower_structure'] ?? null);
        // v4.3.87: زمین از دکل (اولویت)، سپس بازدید/پارامتر، پیش‌فرض دشت
        $terrain = pl_normalize_terrain($tower['terrain_type'] ?? null)
            ?? pl_normalize_terrain($terrainOverride ?? null) ?? 'plain';
        $chapter = $method === 'drone' ? 8 : 2;

        $match = pl_match_price_item($pdo, [
            'price_list_id' => $priceListId,
            'voltage_kv' => $line['voltage_kv'] ?? null,
            'circuit_count' => $line['circuit_count'] ?? null,
            'bundle_count' => $line['bundle_count'] ?? null,
            'activity_type' => 'inspection',
            'inspection_method' => $method,
            'tower_structure' => $structure,
            'terrain_type' => $terrain,
            'crew_size' => $crewSize ?: 1,
            'chapter' => $chapter,
        ]);

        Response::success([
            'price_list_id' => $priceListId,
            'line' => $line,
            'tower' => $tower,
            'inspection_method' => $method,
            'terrain_type' => $terrain,
            'terrain_label' => pl_terrain_label($terrain),
            'tower_structure' => $structure,
            'matched' => $match ? [
                'item_id' => (int)$match['item']['id'],
                'code' => $match['item']['code'],
                'title' => $match['item']['title'],
                'unit' => $match['item']['unit'],
                'chapter' => isset($match['item']['chapter']) ? (int)$match['item']['chapter'] : null,
                'base_unit_price' => $match['base_unit_price'],
                'coefficients' => $match['coefficients'],
                'coefficient_amount' => $match['coefficient_amount'],
                'unit_price' => $match['unit_price'],
                'terrain_label' => $match['terrain_label'],
            ] : null,
        ]);
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
