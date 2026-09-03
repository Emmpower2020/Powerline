# -*- coding: utf-8 -*-
import io
p = 'Powerline/endpoints/modules.php'
s = io.open(p, encoding='utf-8').read()

# ── ۱) کمکی: ستون سمت پرسنل در این دیتابیس (position یا personnel_type) ──
anchor = "    $router->post('personnel', function () {"
helper = """    // v4.3.69: ستون «سمت» پرسنل در نسخه‌های مختلف دیتابیس یا position است یا
    // personnel_type — کوئری‌ها با ستون واقعی ساخته می‌شوند تا import روی
    // هر دو ساختار بدون خطای «Unknown column» کار کند.
    $personnelPositionCol = function (PDO $pdo): string {
        foreach ($pdo->query('SHOW COLUMNS FROM personnel')->fetchAll() as $c) {
            if (($c['Field'] ?? null) === 'position') return 'position';
        }
        return 'personnel_type';
    };

"""
assert anchor in s and '$personnelPositionCol' not in s
s = s.replace(anchor, helper + anchor, 1)

# ── ۲) POST پرسنل ──
old_post = """        $stmt = $pdo->prepare("INSERT INTO personnel (organization_id, user_id, personnel_code, first_name, last_name, national_id, position, phone, mobile, email, hire_date, contract_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())");"""
new_post = """        $posCol = $personnelPositionCol($pdo);
        $stmt = $pdo->prepare("INSERT INTO personnel (organization_id, user_id, personnel_code, first_name, last_name, national_id, $posCol, phone, mobile, email, hire_date, contract_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())");"""
assert old_post in s
s = s.replace(old_post, new_post, 1)
# use closure در POST
old_sig = "    $router->post('personnel', function () {"
new_sig = "    $router->post('personnel', function () use ($personnelPositionCol) {"
s = s.replace(old_sig, new_sig, 1)

# ── ۳) bulk-import پرسنل ──
old_ins = """            $ins = $pdo->prepare("INSERT INTO personnel (organization_id, personnel_code, first_name, last_name, national_id, father_name, position, phone, mobile, email, supervisor_name, collaboration_start, status, created_at)
                                   VALUES (4, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())");
            $upd = $pdo->prepare("UPDATE personnel SET first_name = ?, last_name = ?, national_id = ?, father_name = ?, position = ?, phone = ?, mobile = ?, email = ?, supervisor_name = ?, collaboration_start = ? WHERE id = ?");"""
new_ins = """            $posCol = $personnelPositionCol($pdo);
            $ins = $pdo->prepare("INSERT INTO personnel (organization_id, personnel_code, first_name, last_name, national_id, father_name, $posCol, phone, mobile, email, supervisor_name, collaboration_start, status, created_at)
                                   VALUES (4, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())");
            $upd = $pdo->prepare("UPDATE personnel SET first_name = ?, last_name = ?, national_id = ?, father_name = ?, $posCol = ?, phone = ?, mobile = ?, email = ?, supervisor_name = ?, collaboration_start = ? WHERE id = ?");"""
assert old_ins in s
s = s.replace(old_ins, new_ins, 1)
old_sig2 = "    $router->post('personnel/bulk-import', function () {"
new_sig2 = "    $router->post('personnel/bulk-import', function () use ($personnelPositionCol) {"
assert old_sig2 in s
s = s.replace(old_sig2, new_sig2, 1)

# ── ۴) PUT پرسنل ──
old_put_fields = "$fields = ['first_name', 'last_name', 'national_id', 'personnel_type', 'position', 'phone', 'mobile', 'email', 'hire_date', 'contract_id', 'status', 'father_name', 'supervisor_name', 'collaboration_start'];"
new_put_fields = """$posCol = $personnelPositionCol($pdo);
        $fields = ['first_name', 'last_name', 'national_id', $posCol, 'phone', 'mobile', 'email', 'hire_date', 'contract_id', 'status', 'father_name', 'supervisor_name', 'collaboration_start'];"""
assert old_put_fields in s
s = s.replace(old_put_fields, new_put_fields, 1)
old_sig3 = "    $router->put('personnel/{id}', function ($id) {"
new_sig3 = "    $router->put('personnel/{id}', function ($id) use ($personnelPositionCol) {"
assert old_sig3 in s
s = s.replace(old_sig3, new_sig3, 1)

# ── ۵) GET پرسنل: اگر position نبود با نام مستعار برگرداند ──
old_get = """        $stmt = $pdo->prepare("SELECT p.*, u.username, c.title AS contract_title FROM personnel p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN contracts c ON c.id = p.contract_id WHERE $where ORDER BY p.id DESC LIMIT $pageSize OFFSET $offset");"""
new_get = """        $posCol = $personnelPositionCol($pdo);
        $posSel = $posCol === 'position' ? 'p.position' : 'p.personnel_type AS position';
        $stmt = $pdo->prepare("SELECT p.*, u.username, c.title AS contract_title, $posSel FROM personnel p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN contracts c ON c.id = p.contract_id WHERE $where ORDER BY p.id DESC LIMIT $pageSize OFFSET $offset");"""
assert old_get in s
s = s.replace(old_get, new_get, 1)
old_sig4 = "    $router->get('personnel', function () {"
new_sig4 = "    $router->get('personnel', function () use ($personnelPositionCol) {"
assert old_sig4 in s
s = s.replace(old_sig4, new_sig4, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('personnel column-compat applied (GET/POST/PUT/bulk-import)')
