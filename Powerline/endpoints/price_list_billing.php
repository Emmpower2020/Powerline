<?php
/**
 * endpoints/price_list_billing.php — اتصال عملیات واقعی به فهرست بها
 * v4.3.86
 */

function plb_columns(PDO $pdo, string $table): array
{
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];
    $out = [];
    foreach ($pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($r['Field'])) $out[$r['Field']] = true;
    }
    return $cache[$table] = $out;
}

function plb_price_status_col(PDO $pdo): string
{
    $c = plb_columns($pdo, 'price_list_items');
    return isset($c['status']) ? 'status' : (isset($c['is_active']) ? 'is_active' : 'status');
}

function plb_list_status_col(PDO $pdo): string
{
    $c = plb_columns($pdo, 'price_lists');
    return isset($c['status']) ? 'status' : (isset($c['is_active']) ? 'is_active' : 'status');
}

function plb_normalize_text(?string $v): string
{
    $v = (string)$v;
    $v = str_replace(['ي','ى','ك','ۀ','ة','ؤ','إ','أ'], ['ی','ی','ک','ه','ه','و','ا','ا'], $v);
    $v = str_replace(['‌','ـ'], ['', ''], $v);
    $v = preg_replace('/\s+/u', ' ', trim($v)) ?? trim($v);
    return $v;
}

function plb_numeric($v): ?float
{
    if ($v === null || $v === '') return null;
    $s = strtr((string)$v, ['۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9','٬'=>'',','=>'','٫'=>'.']);
    if (!is_numeric($s)) return null;
    return (float)$s;
}

function plb_infer_activity(string $title): ?string
{
    $t = plb_normalize_text($title);
    if (mb_strpos($t, 'بازدید') !== false) return 'inspection';
    if (mb_strpos($t, 'تعمیر') !== false || mb_strpos($t, 'تعویض') !== false || mb_strpos($t, 'نصب') !== false || mb_strpos($t, 'اصلاح') !== false) return 'repair';
    return null;
}

function plb_infer_method(string $title): ?string
{
    $t = plb_normalize_text($title);
    if (mb_strpos($t, 'پیمایشی') !== false) return 'patrol';
    if (mb_strpos($t, 'صعودی') !== false) return 'climbing';
    return null;
}

function plb_infer_terrain(string $title): ?string
{
    $t = plb_normalize_text($title);
    if (mb_strpos($t, 'صعبالعبور') !== false || mb_strpos($t, 'صعب العبور') !== false || mb_strpos($t, 'صعب‌العبور') !== false) return 'mountainous';
    if (mb_strpos($t, 'نیمهکوهستانی') !== false || mb_strpos($t, 'نیمه کوهستانی') !== false || mb_strpos($t, 'نیمه‌کوهستانی') !== false) return 'semi_mountainous';
    if (mb_strpos($t, 'دشت و تپه ماهور') !== false || mb_strpos($t, 'دشت') !== false) return 'plain';
    return null;
}

function plb_infer_voltage(string $title): ?float
{
    if (preg_match('/(\d{2,4})\s*کیلوولت/u', plb_normalize_text($title), $m)) return (float)$m[1];
    return null;
}

function plb_infer_circuit(string $title): ?int
{
    $t = plb_normalize_text($title);
    if (mb_strpos($t, 'چهار مداره') !== false) return 4;
    if (mb_strpos($t, 'دو مداره') !== false) return 2;
    if (mb_strpos($t, 'تک مداره') !== false) return 1;
    return null;
}

function plb_infer_bundle(string $title): ?int
{
    $t = plb_normalize_text($title);
    if (mb_strpos($t, 'چهار باندل') !== false) return 4;
    if (mb_strpos($t, 'سه باندل') !== false) return 3;
    if (mb_strpos($t, 'دو باندل') !== false) return 2;
    if (mb_strpos($t, 'تک باندل') !== false || mb_strpos($t, 'یک باندل') !== false) return 1;
    return null;
}

function plb_infer_adjustment(string $title): array
{
    $t = plb_normalize_text($title);
    $type = (str_contains($t, 'کاهش')) ? 'reduction' : 'addition';
    $ruleKey = null; $ruleValue = null;
    if (mb_strpos($t, 'تیر چوبی') !== false || mb_strpos($t, 'تیر بتنی') !== false || mb_strpos($t, 'چوبی و بتنی') !== false) {
        $ruleKey = 'wood_concrete'; $ruleValue = 'wood_concrete';
    } elseif (mb_strpos($t, 'دو نفر') !== false) {
        $ruleKey = 'crew_size'; $ruleValue = '2';
    } elseif (mb_strpos($t, 'چهار باندل') !== false) {
        $ruleKey = 'bundle_count'; $ruleValue = '4';
    } elseif (mb_strpos($t, 'سه باندل') !== false) {
        $ruleKey = 'bundle_count'; $ruleValue = '3';
    } elseif (mb_strpos($t, 'دو باندل') !== false) {
        $ruleKey = 'bundle_count'; $ruleValue = '2';
    } elseif (mb_strpos($t, 'نیمهکوهستانی') !== false || mb_strpos($t, 'نیمه کوهستانی') !== false || mb_strpos($t, 'نیمه‌کوهستانی') !== false) {
        $ruleKey = 'terrain_type'; $ruleValue = 'semi_mountainous';
    } elseif (mb_strpos($t, 'صعبالعبور') !== false || mb_strpos($t, 'صعب العبور') !== false || mb_strpos($t, 'صعب‌العبور') !== false) {
        $ruleKey = 'terrain_type'; $ruleValue = 'mountainous';
    }
    return [$type, $ruleKey, $ruleValue];
}

function plb_base_metadata(string $title, array $row = []): array
{
    return [
        'activity_type' => $row['activity_type'] ?? plb_infer_activity($title),
        'voltage_kv' => plb_numeric($row['voltage_kv'] ?? null) ?? plb_infer_voltage($title),
        'circuit_count' => isset($row['circuit_count']) && $row['circuit_count'] !== '' ? (int)$row['circuit_count'] : plb_infer_circuit($title),
        'bundle_count' => isset($row['bundle_count']) && $row['bundle_count'] !== '' ? (int)$row['bundle_count'] : plb_infer_bundle($title),
        'terrain_type' => $row['terrain_type'] ?? plb_infer_terrain($title),
        'inspection_method' => $row['inspection_method'] ?? plb_infer_method($title),
    ];
}

function plb_find_price_list(PDO $pdo, ?int $listId, ?int $contractId): ?array
{
    $status = plb_list_status_col($pdo);
    if ($listId) {
        $st = $pdo->prepare("SELECT pl.*, {$status} AS normalized_status FROM price_lists pl WHERE pl.id=? LIMIT 1");
        $st->execute([$listId]);
        return $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    if ($contractId) {
        $st = $pdo->prepare("SELECT pl.*, {$status} AS normalized_status FROM price_lists pl WHERE pl.contract_id=? AND {$status} IN (1,'active') ORDER BY pl.effective_date DESC, pl.id DESC LIMIT 1");
        $st->execute([$contractId]);
        $r = $st->fetch(PDO::FETCH_ASSOC); if ($r) return $r;
    }
    $st = $pdo->query("SELECT pl.*, {$status} AS normalized_status FROM price_lists pl WHERE {$status} IN (1,'active') ORDER BY pl.effective_date DESC, pl.id DESC LIMIT 1");
    return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

function plb_context_from_source(PDO $pdo, string $sourceType, int $sourceId): array
{
    if ($sourceType === 'inspection') {
        $sql = "SELECT i.*, t.tower_code, t.tower_structure, t.terrain_type AS tower_terrain_type, t.plain_terrain, t.semi_mountainous, t.mountainous,
                       l.line_code, l.name AS line_name, l.voltage_kv, l.circuit_count, l.bundle_count
                FROM inspections i
                LEFT JOIN towers t ON t.id=i.tower_id
                LEFT JOIN `lines` l ON l.id=i.line_id
                WHERE i.id=?";
    } elseif ($sourceType === 'work_order') {
        $sql = "SELECT wo.*, t.tower_code, t.tower_structure, t.terrain_type AS tower_terrain_type, t.plain_terrain, t.semi_mountainous, t.mountainous,
                       l.line_code, l.name AS line_name, l.voltage_kv, l.circuit_count, l.bundle_count
                FROM work_orders wo
                LEFT JOIN towers t ON t.id=wo.tower_id
                LEFT JOIN `lines` l ON l.id=wo.line_id
                WHERE wo.id=?";
    } else {
        Response::error(400, 'نوع منبع مالی نامعتبر است');
    }
    $st = $pdo->prepare($sql); $st->execute([$sourceId]); $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) Response::error(404, 'رکورد عملیات پیدا نشد');

    $terrain = $r['terrain_type'] ?? null;
    if (!$terrain) $terrain = $r['tower_terrain_type'] ?? null;
    if (!$terrain) {
        $set = [];
        if ((int)($r['plain_terrain'] ?? 0) === 1) $set[] = 'plain';
        if ((int)($r['semi_mountainous'] ?? 0) === 1) $set[] = 'semi_mountainous';
        if ((int)($r['mountainous'] ?? 0) === 1) $set[] = 'mountainous';
        if (count($set) === 1) $terrain = $set[0];
    }
    $method = $sourceType === 'inspection' ? ($r['inspection_method'] ?? null) : null;
    return [
        'source_type' => $sourceType,
        'source_id' => $sourceId,
        'contract_id' => !empty($r['contract_id']) ? (int)$r['contract_id'] : null,
        'performed_date' => $r['inspection_date'] ?? ($r['actual_end'] ?? $r['planned_end'] ?? null),
        'line_id' => !empty($r['line_id']) ? (int)$r['line_id'] : null,
        'tower_id' => !empty($r['tower_id']) ? (int)$r['tower_id'] : null,
        'line_code' => $r['line_code'] ?? null,
        'line_name' => $r['line_name'] ?? null,
        'tower_code' => $r['tower_code'] ?? null,
        'voltage_kv' => plb_numeric($r['voltage_kv'] ?? null),
        'circuit_count' => isset($r['circuit_count']) ? (int)$r['circuit_count'] : null,
        'bundle_count' => isset($r['bundle_count']) ? (int)$r['bundle_count'] : null,
        'terrain_type' => $terrain,
        'tower_structure' => $r['tower_structure'] ?? null,
        'inspection_method' => $method,
        'crew_size' => isset($r['crew_size']) && $r['crew_size'] !== null ? (int)$r['crew_size'] : null,
        'title' => $r['title'] ?? ($r['inspection_code'] ?? $r['wo_code'] ?? ('عملیات #' . $sourceId)),
        'raw' => $r,
    ];
}

function plb_match(PDO $pdo, string $sourceType, int $sourceId, ?int $priceListId = null): array
{
    $ctx = plb_context_from_source($pdo, $sourceType, $sourceId);
    $list = plb_find_price_list($pdo, $priceListId, $ctx['contract_id']);
    if (!$list) return ['matched'=>false,'message'=>'فهرست بهای فعال برای این قرارداد پیدا نشد','context'=>$ctx];
    $statusCol = plb_price_status_col($pdo);
    $st = $pdo->prepare("SELECT * FROM price_list_items WHERE price_list_id=? AND {$statusCol} IN (1,'active') AND (item_kind='base' OR item_kind IS NULL) ORDER BY id");
    $st->execute([(int)$list['id']]); $items = $st->fetchAll(PDO::FETCH_ASSOC);
    $best = null; $bestScore = -1;
    foreach ($items as $it) {
        $score = 0; $valid = true;
        foreach (['voltage_kv','circuit_count','bundle_count','terrain_type','inspection_method','activity_type'] as $field) {
            $iv = $it[$field] ?? null; if ($iv === null || $iv === '') continue;
            $cv = $field === 'voltage_kv' ? $ctx[$field] : ($field === 'activity_type' ? (($sourceType === 'inspection') ? 'inspection' : 'repair') : ($ctx[$field] ?? null));
            if ($cv === null || $cv === '') { $valid = false; break; }
            if ($field === 'voltage_kv') { if (abs((float)$iv - (float)$cv) > 0.01) { $valid=false; break; } }
            else if ((string)$iv !== (string)$cv) { $valid=false; break; }
            $score += 2;
        }
        if (!$valid) continue;
        if (mb_strpos(plb_normalize_text((string)$it['title']), 'بازدید') !== false && $sourceType !== 'inspection') continue;
        $score += 1;
        if ($score > $bestScore) { $best = $it; $bestScore = $score; }
    }
    if (!$best) return ['matched'=>false,'message'=>'برای ترکیب ولتاژ/مدار/باندل/زمین/نوع فعالیت ردیف اصلی مطابق پیدا نشد','price_list'=>$list,'context'=>$ctx];

    $adj = $pdo->prepare("SELECT * FROM price_list_adjustments WHERE price_list_id=? AND parent_price_list_item_id=? AND status='active' ORDER BY id");
    $adj->execute([(int)$list['id'], (int)$best['id']]); $adjustments = [];
    $totalUnit = (float)$best['unit_price'];
    foreach ($adj->fetchAll(PDO::FETCH_ASSOC) as $a) {
        $apply = false;
        switch ($a['rule_key']) {
            case 'wood_concrete': $apply = in_array(plb_normalize_text((string)$ctx['tower_structure']), ['تیر چوبی','تیر بتنی'], true); break;
            case 'crew_size': $apply = (int)$ctx['crew_size'] === (int)$a['rule_value']; break;
            case 'bundle_count': $apply = (int)$ctx['bundle_count'] === (int)$a['rule_value']; break;
            case 'terrain_type': $apply = (string)$ctx['terrain_type'] === (string)$a['rule_value']; break;
            default: $apply = false;
        }
        if ($apply) { $a['applied'] = true; $adjustments[] = $a; $totalUnit += (float)$a['amount']; }
    }
    return [
        'matched'=>true,
        'price_list'=>['id'=>(int)$list['id'],'name'=>$list['name'],'version'=>$list['version'],'effective_date'=>$list['effective_date'],'contract_id'=>(int)($list['contract_id'] ?? 0)],
        'context'=>$ctx,
        'base_item'=>[
            'id'=>(int)$best['id'],'code'=>$best['code'],'title'=>$best['title'],'unit'=>$best['unit'],'unit_price'=>(float)$best['unit_price'],'activity_type'=>$best['activity_type'],'voltage_kv'=>$best['voltage_kv'],'circuit_count'=>$best['circuit_count'],'bundle_count'=>$best['bundle_count'],'terrain_type'=>$best['terrain_type'],'inspection_method'=>$best['inspection_method']
        ],
        'adjustments'=>$adjustments,
        'unit_total'=>$totalUnit,
    ];
}

function registerPriceListBillingRoutes(Router $router): void
{
    $router->get('price-list-adjustments', function () {
        Auth::authenticate(); Auth::requirePermissionSoft('price_lists.view');
        $pdo = Database::getInstance()->getConnection(); $listId = Helpers::queryInt('list_id');
        if (!$listId) Response::error(400, 'list_id الزامی است');
        $st = $pdo->prepare("SELECT a.*, p.code AS parent_code, p.title AS parent_title FROM price_list_adjustments a INNER JOIN price_list_items p ON p.id=a.parent_price_list_item_id WHERE a.price_list_id=? ORDER BY p.id,a.id");
        $st->execute([$listId]); Response::success($st->fetchAll(PDO::FETCH_ASSOC));
    });

    $router->post('price-lists/import', function () {
        Auth::authenticate(); Auth::requirePermission('price_lists.create');
        $body = Helpers::getJsonBody(); $rows = $body['rows'] ?? [];
        if (!is_array($rows) || count($rows) === 0) Response::error(400, 'ردیف‌های فهرست بها ارسال نشده‌اند');
        $pdo = Database::getInstance()->getConnection();
        $priceStatusCol = plb_price_status_col($pdo); $listStatusCol = plb_list_status_col($pdo);
        $priceListId = !empty($body['price_list_id']) ? (int)$body['price_list_id'] : 0;
        $pdo->beginTransaction();
        try {
            if (!$priceListId) {
                $cols=['name','version','effective_date','contract_id']; $vals=['?','?','?','?']; $params=[trim((string)($body['name'] ?? 'فهرست بها')), $body['version'] ?? null, $body['effective_date'] ?? date('Y-m-d'), !empty($body['contract_id']) ? (int)$body['contract_id'] : null];
                $cols[]=$listStatusCol; $vals[] = $listStatusCol==='is_active' ? '1' : "'active'";
                $stmt=$pdo->prepare("INSERT INTO price_lists (`" . implode('`,`',$cols) . "`) VALUES (" . implode(',',$vals) . ")");
                $stmt->execute($params); $priceListId=(int)$pdo->lastInsertId();
            }
            $inserted=0; $updated=0; $adjusted=0; $parentMap=[];
            foreach ($rows as $row) {
                $kind = strtolower(trim((string)($row['item_kind'] ?? $row['نوع قلم'] ?? 'base')));
                $code = trim((string)($row['code'] ?? $row['کد رسمی'] ?? $row['شماره ردیف فصل'] ?? ''));
                $title = trim((string)($row['title'] ?? $row['شرح'] ?? $row['شرح ردیف فصل'] ?? ''));
                $unit = trim((string)($row['unit'] ?? $row['واحد'] ?? ''));
                $price = plb_numeric($row['unit_price'] ?? $row['بهای واحد'] ?? 0) ?? 0;
                if ($kind === 'base' && $code !== '' && $title !== '') {
                    $m = plb_base_metadata($title,$row); $existing=$pdo->prepare('SELECT id FROM price_list_items WHERE price_list_id=? AND code=? LIMIT 1'); $existing->execute([$priceListId,$code]); $id=$existing->fetchColumn();
                    if ($id) {
                        $sql="UPDATE price_list_items SET title=?,unit=?,unit_price=?,category=?,item_kind=?,activity_type=?,voltage_kv=?,circuit_count=?,bundle_count=?,terrain_type=?,inspection_method=? WHERE id=?";
                        $pdo->prepare($sql)->execute([$title,$unit?:null,$price,$row['category'] ?? 'عملیات','base',$m['activity_type'],$m['voltage_kv'],$m['circuit_count'],$m['bundle_count'],$m['terrain_type'],$m['inspection_method'],(int)$id]); $updated++;
                    } else {
                        $sql="INSERT INTO price_list_items (price_list_id,code,title,unit,unit_price,category,`$priceStatusCol`,item_kind,activity_type,voltage_kv,circuit_count,bundle_count,terrain_type,inspection_method) VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?,?)";
                        $statusVal=$priceStatusCol==='is_active'?1:'active'; $pdo->prepare($sql)->execute([$priceListId,$code,$title,$unit?:null,$price,$row['category'] ?? 'عملیات',$statusVal,'base',$m['activity_type'],$m['voltage_kv'],$m['circuit_count'],$m['bundle_count'],$m['terrain_type'],$m['inspection_method']]); $id=(int)$pdo->lastInsertId(); $inserted++;
                    }
                    $parentMap[(string)$code]=(int)$id;
                } elseif ($kind === 'adjustment' || $kind === 'reduction' || $kind === 'addition') {
                    $parentCode=trim((string)($row['parent_code'] ?? $row['کد ردیف والد'] ?? '')); if (!$parentCode || empty($parentMap[$parentCode])) continue;
                    [$adjType,$ruleKey,$ruleValue]=plb_infer_adjustment($title); if (!empty($row['adjustment_type'])) $adjType=$row['adjustment_type']; if (!empty($row['rule_key'])) $ruleKey=$row['rule_key']; if (array_key_exists('rule_value',$row) && $row['rule_value']!=='') $ruleValue=$row['rule_value'];
                    $st=$pdo->prepare("INSERT IGNORE INTO price_list_adjustments (price_list_id,parent_price_list_item_id,adjustment_type,title,unit,amount,rule_key,rule_value,status) VALUES (?,?,?,?,?,?,?,?, 'active')"); $st->execute([$priceListId,$parentMap[$parentCode],$adjType,$title,$unit?:null,$price,$ruleKey,$ruleValue]); if ($st->rowCount()) $adjusted++;
                }
            }
            $pdo->commit(); Response::success(['price_list_id'=>$priceListId,'inserted'=>$inserted,'updated'=>$updated,'adjustments'=>$adjusted,'rows'=>count($rows)], 'فهرست بها با موفقیت وارد شد',201);
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); Logger::error('price list import failed',['error'=>$e->getMessage()]); Response::error(500,'واردسازی فهرست بها انجام نشد: '.$e->getMessage()); }
    });

    $router->get('price-list-match/{source_type}/{id}', function ($sourceType,$id) {
        Auth::authenticate(); Auth::requirePermissionSoft('price_lists.view');
        $listId=Helpers::queryInt('price_list_id'); $result=plb_match(Database::getInstance()->getConnection(),$sourceType,(int)$id,$listId); Response::success($result);
    });

    $router->post('billing-measurements', function () {
        $user=Auth::authenticate(); Auth::requirePermission('price_lists.create'); $body=Helpers::getJsonBody();
        $sourceType=(string)($body['source_type'] ?? ''); $sourceId=(int)($body['source_id'] ?? 0); if (!$sourceId) Response::error(400,'source_id الزامی است');
        $pdo=Database::getInstance()->getConnection(); $result=plb_match($pdo,$sourceType,$sourceId,!empty($body['price_list_id'])?(int)$body['price_list_id']:null); if (!$result['matched']) Response::error(422,$result['message'] ?? 'تطبیق فهرست بها انجام نشد',$result);
        $ctx=$result['context']; $qty=isset($body['quantity'])?(float)$body['quantity']:1.0; if ($qty<=0) Response::error(400,'مقدار متره باید بیشتر از صفر باشد');
        $pdo->beginTransaction(); try {
            $st=$pdo->prepare("SELECT id FROM billing_measurements WHERE source_type=? AND source_id=? AND status<>'cancelled' AND invoice_id IS NULL ORDER BY id DESC LIMIT 1"); $st->execute([$sourceType,$sourceId]); $existing=$st->fetchColumn();
            if ($existing) { $measurementId=(int)$existing; $pdo->prepare("UPDATE billing_measurements SET price_list_id=?,price_list_item_id=?,performed_date=?,voltage_kv=?,circuit_count=?,bundle_count=?,terrain_type=?,tower_structure=?,inspection_method=?,crew_size=?,description=?,unit=?,quantity=?,unit_price=?,total_price=?,match_status='matched',match_message=?,updated_at=NOW() WHERE id=?")->execute([(int)$result['price_list']['id'],(int)$result['base_item']['id'],$ctx['performed_date'],$ctx['voltage_kv'],$ctx['circuit_count'],$ctx['bundle_count'],$ctx['terrain_type'],$ctx['tower_structure'],$ctx['inspection_method'],$ctx['crew_size'],$result['base_item']['title'],$result['base_item']['unit'],$qty,$result['unit_total'],$qty*$result['unit_total'],'تطبیق خودکار فهرست بها',(int)$measurementId]);
                $pdo->prepare('DELETE FROM billing_measurement_adjustments WHERE measurement_id=?')->execute([$measurementId]);
            } else {
                $st=$pdo->prepare("INSERT INTO billing_measurements (source_type,source_id,contract_id,price_list_id,price_list_item_id,performed_date,voltage_kv,circuit_count,bundle_count,terrain_type,tower_structure,inspection_method,crew_size,description,unit,quantity,unit_price,total_price,match_status,match_message,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'matched',?,'draft',?)");
                $st->execute([$sourceType,$sourceId,$ctx['contract_id'] ?: (!empty($result['price_list']['contract_id']) ? (int)$result['price_list']['contract_id'] : null),(int)$result['price_list']['id'],(int)$result['base_item']['id'],$ctx['performed_date'],$ctx['voltage_kv'],$ctx['circuit_count'],$ctx['bundle_count'],$ctx['terrain_type'],$ctx['tower_structure'],$ctx['inspection_method'],$ctx['crew_size'],$result['base_item']['title'],$result['base_item']['unit'],$qty,$result['unit_total'],$qty*$result['unit_total'],'تطبیق خودکار فهرست بها',(int)($user['id'] ?? 0)]); $measurementId=(int)$pdo->lastInsertId();
            }
            $ast=$pdo->prepare("INSERT INTO billing_measurement_adjustments (measurement_id,price_list_adjustment_id,description,amount) VALUES (?,?,?,?)"); foreach($result['adjustments'] as $a){$ast->execute([$measurementId,(int)$a['id'],$a['title'],$a['amount']]);}
            $pdo->commit(); Response::success(['id'=>$measurementId,'result'=>$result,'quantity'=>$qty,'total_price'=>$qty*$result['unit_total']], 'متره با موفقیت ذخیره شد',201);
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack(); Response::error(500,'ذخیره متره انجام نشد: '.$e->getMessage());}
    });

    $router->get('billing-measurements', function () {
        Auth::authenticate(); Auth::requirePermissionSoft('price_lists.view'); $pdo=Database::getInstance()->getConnection(); $sourceType=Helpers::query('source_type'); $sourceId=Helpers::queryInt('source_id');
        if ($sourceType && $sourceId) {
            $st=$pdo->prepare("SELECT bm.*, pli.code AS price_code FROM billing_measurements bm LEFT JOIN price_list_items pli ON pli.id=bm.price_list_item_id WHERE bm.source_type=? AND bm.source_id=? ORDER BY bm.id DESC");
            $st->execute([$sourceType,$sourceId]);
        } else {
            $st=$pdo->query("SELECT bm.*, pli.code AS price_code, c.title AS contract_title, ct.contractor_name AS contractor_name, CONCAT(bm.source_type, ':', bm.source_id) AS source_label FROM billing_measurements bm LEFT JOIN price_list_items pli ON pli.id=bm.price_list_item_id LEFT JOIN contracts c ON c.id=bm.contract_id LEFT JOIN contractors ct ON ct.id=c.contractor_id WHERE bm.status='draft' AND bm.invoice_id IS NULL ORDER BY bm.performed_date, bm.id");
        }
        $rows=$st->fetchAll(PDO::FETCH_ASSOC);
        foreach($rows as &$r){$a=$pdo->prepare('SELECT * FROM billing_measurement_adjustments WHERE measurement_id=? ORDER BY id');$a->execute([(int)$r['id']]);$r['adjustments']=$a->fetchAll(PDO::FETCH_ASSOC);} unset($r); Response::success($rows);
    });

    $router->post('invoices/from-measurements', function () {
        Auth::authenticate(); Auth::requirePermission('financial.create'); $body=Helpers::getJsonBody(); $ids=array_values(array_unique(array_filter(array_map('intval',$body['measurement_ids'] ?? []),fn($v)=>$v>0))); if(!$ids) Response::error(400,'هیچ متره‌ای انتخاب نشده است');
        $pdo=Database::getInstance()->getConnection(); $marks=implode(',',array_fill(0,count($ids),'?')); $st=$pdo->prepare("SELECT bm.*, c.contractor_id FROM billing_measurements bm LEFT JOIN contracts c ON c.id=bm.contract_id WHERE bm.id IN ($marks) ORDER BY bm.id"); $st->execute($ids); $rows=$st->fetchAll(PDO::FETCH_ASSOC); if(count($rows)!==count($ids)) Response::error(404,'یکی از متره‌ها پیدا نشد');
        $contractId=(int)($rows[0]['contract_id'] ?? 0); $contractorId=(int)($rows[0]['contractor_id'] ?? 0); if(!$contractId||!$contractorId) Response::error(422,'قرارداد/پیمانکار برای متره کامل نیست'); foreach($rows as $r){if((int)$r['contract_id']!==$contractId)Response::error(422,'همه متره‌ها باید متعلق به یک قرارداد باشند'); if(!empty($r['invoice_id']))Response::error(409,'یکی از متره‌ها قبلاً در صورت‌وضعیت ثبت شده است');}
        $start=$body['period_start'] ?? min(array_map(fn($r)=>$r['performed_date'] ?: date('Y-m-d'),$rows)); $end=$body['period_end'] ?? max(array_map(fn($r)=>$r['performed_date'] ?: date('Y-m-d'),$rows));
        $pdo->beginTransaction(); try {
            $code='INV-'.date('Y').'-'.str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT); $st=$pdo->prepare("INSERT INTO invoices (invoice_code,contract_id,contractor_id,period_start,period_end,total_amount,tax_amount,final_amount,status,created_at) VALUES (?,?,?,?,?,0,0,0,'draft',NOW())"); $st->execute([$code,$contractId,$contractorId,$start,$end]); $invoiceId=(int)$pdo->lastInsertId(); $total=0;
            $itemSt=$pdo->prepare("INSERT INTO invoice_items (invoice_id,work_order_id,price_list_item_id,description,unit,quantity,unit_price,total_price,billing_measurement_id,inspection_id) VALUES (?,?,?,?,?,?,?,?,?,?)"); $adjSt=$pdo->prepare('SELECT bma.*, pla.adjustment_type, pla.parent_price_list_item_id, p.code AS parent_code FROM billing_measurement_adjustments bma LEFT JOIN price_list_adjustments pla ON pla.id=bma.price_list_adjustment_id LEFT JOIN price_list_items p ON p.id=pla.parent_price_list_item_id WHERE bma.measurement_id=? ORDER BY bma.id');
            foreach($rows as $r){$baseAmount=(float)$r['quantity']*(float)$r['unit_price']; $woId=$r['source_type']==='work_order'?(int)$r['source_id']:null; $insId=$r['source_type']==='inspection'?(int)$r['source_id']:null; $itemSt->execute([$invoiceId,$woId,$r['price_list_item_id'],$r['description'],$r['unit'],$r['quantity'],$r['unit_price'],$baseAmount,(int)$r['id'],$insId]); $total+=$baseAmount; $adjSt->execute([(int)$r['id']]); foreach($adjSt->fetchAll(PDO::FETCH_ASSOC) as $a){$amt=(float)$r['quantity']*(float)$a['amount']; $adjDescription=(($a['parent_code'] ?? null) ? '['.$a['parent_code'].'] ' : '').($a['description'] ?? 'افزایش/کاهش بها'); $itemSt->execute([$invoiceId,$woId,null,$adjDescription,$r['unit'],$r['quantity'],$a['amount'],$amt,(int)$r['id'],$insId]);$total+=$amt;}}
            $tax=$total*0.1; $pdo->prepare('UPDATE invoices SET total_amount=?,tax_amount=?,final_amount=? WHERE id=?')->execute([$total,$tax,$total+$tax,$invoiceId]); $up=$pdo->prepare("UPDATE billing_measurements SET status='invoiced',invoice_id=? WHERE id=?"); foreach($ids as $id)$up->execute([$invoiceId,$id]);
            $pdo->commit(); Response::success(['id'=>$invoiceId,'invoice_code'=>$code,'total_amount'=>$total,'tax_amount'=>$tax,'final_amount'=>$total+$tax,'measurement_ids'=>$ids],'صورت‌وضعیت از متره‌ها ایجاد شد',201);
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();Response::error(500,'صدور صورت‌وضعیت انجام نشد: '.$e->getMessage());}
    });
}
