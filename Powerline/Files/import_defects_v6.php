<?php
/**
 * import_defects_v6.php — نسخه نهایی با نرمال‌سازی نیم‌فاصله (ZWNJ)
 *
 * اصلاحات این نسخه:
 *   ۱) تبدیل نیم‌فاصله (U+200C) به فاصله معمولی در هر دو طرف مقایسه
 *   ۲) جلوگیری از ایجاد دسته‌های تکراری
 *   ۳) تمام قابلیت‌های v5
 *
 * محل قرارگیری: در فولدر Powerline روی سرور
 * استفاده: https://jibimarket.com/Powerline/import_defects_v6.php
 */

// ============================================================================
//  تنظیمات دیتابیس
// ============================================================================
$DB_HOST = 'localhost';
$DB_NAME = 'jibimar1_Powerline';
$DB_USER = 'jibimar1_Powerline';
$DB_PASS = 'JBg3XgdWjdzajJYMprus';

$EXCEL_FILE = __DIR__ . '/عیوب_استاندارد.xlsx';
$AUTO_CREATE_CATEGORIES = true;

header('Content-Type: text/html; charset=utf-8');
echo '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">';
echo '<title>وارد کردن عیوب v6</title>';
echo '<style>
body { font-family: Tahoma, sans-serif; max-width: 1100px; margin: 20px auto; padding: 20px; direction: rtl; background: #f8f9fc; }
.log { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-family: monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.success { color: #10b981; font-weight: bold; }
.error { color: #ef4444; font-weight: bold; }
.warning { color: #f59e0b; }
.info { color: #3b82f6; }
h1 { color: #6366f1; }
.stats { background: #EEF0FF; padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
th, td { padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; }
th { background: #EEF0FF; }
.match { background: #d1fae5; }
.created { background: #dbeafe; }
.warning-box { background: #fef3c7; padding: 12px 16px; border-radius: 8px; margin: 16px 0; border-right: 4px solid #f59e0b; }
</style></head><body>';
echo '<h1>📥 وارد کردن عیوب v6 (با نرمال‌سازی نیم‌فاصله)</h1>';

echo '<div class="log">';

// ============================================================================
//  اتصال به دیتابیس
// ============================================================================
echo "🔌 اتصال به دیتابیس...";

try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER, $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    echo ' <span class="success">✓ موفق</span>' . "\n";
} catch (PDOException $e) {
    echo ' <span class="error">✗ خطا: ' . htmlspecialchars($e->getMessage()) . '</span></div>';
    exit;
}

// ============================================================================
//  بررسی فایل اکسل
// ============================================================================
if (!file_exists($EXCEL_FILE)) {
    echo "<span class='error'>✗ فایل اکسل پیدا نشد: $EXCEL_FILE</span>\n";
    exit;
}

echo "📄 فایل اکسل: $EXCEL_FILE\n";
echo "📊 حجم: " . round(filesize($EXCEL_FILE) / 1024, 1) . " KB\n\n";

// ============================================================================
//  خواندن فایل اکسل
// ============================================================================
echo "📖 باز کردن فایل اکسل...\n";

$rows_data = null;

// روش ۱: PhpSpreadsheet
$autoload_paths = [
    __DIR__ . '/vendor/autoload.php',
    __DIR__ . '/../vendor/autoload.php',
];

foreach ($autoload_paths as $path) {
    if (file_exists($path)) {
        require_once $path;
        if (class_exists('PhpOffice\PhpSpreadsheet\IOFactory')) {
            try {
                $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($EXCEL_FILE);
                foreach ($spreadsheet->getAllSheets() as $sheet) {
                    $rows_data[$sheet->getTitle()] = $sheet->toArray(null, true, true, false);
                }
                echo "  <span class='success'>✓ PhpSpreadsheet بارگذاری شد</span>\n";
                break;
            } catch (Exception $e) {
                echo "  <span class='warning'>⚠ PhpSpreadsheet خطا: " . htmlspecialchars($e->getMessage()) . "</span>\n";
            }
        }
    }
}

// روش ۲: parser داخلی اصلاح‌شده
if ($rows_data === null) {
    echo "  استفاده از parser داخلی اصلاح‌شده...\n";
    try {
        $rows_data = parseXlsxSheetsFixed($EXCEL_FILE);
        echo "  <span class='success'>✓ Parser داخلی بارگذاری شد</span>\n";
    } catch (Exception $e) {
        echo "  <span class='error'>✗ خطا: " . htmlspecialchars($e->getMessage()) . "</span>\n";
        exit;
    }
}

echo "  تعداد شیت‌ها: " . count($rows_data) . "\n";
echo "  شیت‌ها: " . implode('، ', array_keys($rows_data)) . "\n\n";

// ============================================================================
//  بررسی وجود شیت «عیوب»
// ============================================================================
if (!isset($rows_data['عیوب'])) {
    echo "<span class='error'>✗ شیت «عیوب» در فایل اکسل پیدا نشد!</span>\n";
    exit;
}

$defectRows = $rows_data['عیوب'];
echo "🔍 دیباگ — ۳ ردیف اول شیت «عیوب»:\n";
for ($i = 0; $i < min(3, count($defectRows)); $i++) {
    echo "  ردیف " . ($i + 1) . ": " . json_encode($defectRows[$i], JSON_UNESCAPED_UNICODE) . "\n";
}
echo "\n";

// ============================================================================
//  استخراج دسته‌ها از شیت «دسته‌بندی‌ها» (اگه باشه)
// ============================================================================
$excelCategories = [];

if (isset($rows_data['دسته‌بندی‌ها'])) {
    echo "🏷️ استخراج دسته‌ها از شیت «دسته‌بندی‌ها»...\n";
    $catRows = $rows_data['دسته‌بندی‌ها'];

    for ($i = 1; $i < count($catRows); $i++) {
        $row = $catRows[$i];
        if (empty($row)) continue;

        $catName = isset($row[1]) ? trim((string)$row[1]) : '';
        $towerType = isset($row[2]) ? trim((string)$row[2]) : 'all';

        if (empty($catName)) continue;

        // نرمال‌سازی نام دسته — تبدیل نیم‌فاصله به فاصله معمولی
        $catName = normalizeCategoryName($catName);

        $excelCategories[$catName] = [
            'tower_type' => $towerType ?: 'all',
            'original_name' => $catName,
        ];
    }
    echo "  تعداد دسته‌ها در شیت دسته‌بندی‌ها: " . count($excelCategories) . "\n\n";
}

// ============================================================================
//  استخراج دسته‌ها از شیت «عیوب» (fallback)
// ============================================================================
echo "🏷️ استخراج دسته‌ها از شیت «عیوب» (fallback)...\n";
$categoriesFromDefects = [];

for ($i = 1; $i < count($defectRows); $i++) {
    $row = $defectRows[$i];
    if (empty($row) || count($row) < 5) continue;

    $catName = isset($row[2]) ? trim((string)$row[2]) : '';
    $towerType = isset($row[6]) ? trim((string)$row[6]) : 'all';

    if (empty($catName)) continue;

    $catName = normalizeCategoryName($catName);

    if (!isset($categoriesFromDefects[$catName])) {
        $categoriesFromDefects[$catName] = [
            'tower_type' => $towerType ?: 'all',
            'count' => 0,
        ];
    }
    $categoriesFromDefects[$catName]['count']++;
}

echo "  تعداد دسته‌های منحصر به فرد در شیت عیوب: " . count($categoriesFromDefects) . "\n";

// ادغام
foreach ($categoriesFromDefects as $catName => $info) {
    if (!isset($excelCategories[$catName])) {
        $excelCategories[$catName] = $info;
    }
}

echo "  مجموع دسته‌های نهایی: " . count($excelCategories) . "\n\n";

// ============================================================================
//  بارگذاری دسته‌های موجود از دیتابیس (با نرمال‌سازی)
// ============================================================================
echo "🏷️ بارگذاری دسته‌ها از دیتابیس...\n";
$dbCategories = $pdo->query("SELECT id, name, tower_type FROM defect_categories ORDER BY id")->fetchAll();

// نگاشت نرمال‌شده → id
$dbCatMap = [];
$dbCatOriginalNames = [];
foreach ($dbCategories as $cat) {
    $normName = normalizeCategoryName($cat['name']);
    $dbCatMap[$normName] = $cat['id'];
    $dbCatOriginalNames[$cat['id']] = $cat['name'];
}
echo "  تعداد دسته‌ها در دیتابیس: " . count($dbCategories) . "\n\n";

// ============================================================================
//  ایجاد دسته‌های مفقوده
// ============================================================================
$autoCreatedCats = 0;
$catIdMap = [];

foreach ($excelCategories as $catName => $info) {
    if (isset($dbCatMap[$catName])) {
        $catIdMap[$catName] = $dbCatMap[$catName];
    } elseif ($AUTO_CREATE_CATEGORIES) {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO defect_categories (name, applies_to, tower_type, status, created_at)
                VALUES (?, 'tower', ?, 1, NOW())
            ");
            // ذخیره نام به‌صورت اصلی (با نیم‌فاصله) برای یکدستی
            $displayName = restoreZwnj($catName);
            $stmt->execute([$displayName, $info['tower_type']]);
            $newId = $pdo->lastInsertId();
            $catIdMap[$catName] = $newId;
            $dbCatMap[$catName] = $newId;
            $dbCatOriginalNames[$newId] = $displayName;
            $autoCreatedCats++;
            echo "  <span class='info'>✨ دسته جدید: «" . htmlspecialchars($displayName) . "» (id=$newId, type=" . $info['tower_type'] . ")</span>\n";
        } catch (Exception $e) {
            echo "  <span class='error'>✗ خطا در ساخت دسته: " . htmlspecialchars($e->getMessage()) . "</span>\n";
        }
    }
}

if ($autoCreatedCats > 0) echo "\n";

// ============================================================================
//  پاک‌کردن تعاریف قبلی
// ============================================================================
echo "🧹 پاک‌کردن تعاریف عیوب قبلی...\n";
$deleted = $pdo->exec("DELETE FROM defect_definitions");
echo "  <span class='warning'>$deleted رکورد قدیمی حذف شد</span>\n\n";

// ============================================================================
//  پردازش شیت «عیوب»
// ============================================================================
echo str_repeat('=', 70) . "\n";
echo "🔍 پردازش شیت «عیوب»...\n";
echo str_repeat('=', 70) . "\n\n";

$totalRows = count($defectRows) - 1;
echo "تعداد ردیف‌ها: $totalRows\n\n";

$totalImported = 0;
$totalErrors = 0;
$skippedNoCategory = 0;
$skippedEmpty = 0;
$categoryStats = [];

$insertStmt = $pdo->prepare("
    INSERT INTO defect_definitions
        (category_id, defect_code, title, default_priority, default_severity, status, created_at)
    VALUES
        (?, ?, ?, ?, 'minor', 1, NOW())
    ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        default_priority = VALUES(default_priority)
");

$pdo->beginTransaction();

for ($i = 1; $i < count($defectRows); $i++) {
    $row = $defectRows[$i];

    if (empty($row) || count($row) < 5) {
        $skippedEmpty++;
        continue;
    }

    $defectId = $row[1];
    $categoryName = isset($row[2]) ? trim((string)$row[2]) : '';
    $defectCode = $row[3];
    $title = $row[4];
    $priority = isset($row[5]) ? $row[5] : 1;

    if (empty($categoryName) || empty($title)) {
        $skippedEmpty++;
        continue;
    }

    // نرمال‌سازی برای تطبیق
    $normalizedCatName = normalizeCategoryName($categoryName);

    // پیدا کردن category_id
    if (!isset($catIdMap[$normalizedCatName])) {
        $found = false;
        foreach ($dbCatMap as $normDbName => $dbId) {
            if ($normDbName === $normalizedCatName) {
                $catIdMap[$normalizedCatName] = $dbId;
                $found = true;
                break;
            }
        }
        if (!$found) {
            $skippedNoCategory++;
            if ($skippedNoCategory <= 3) {
                echo "  <span class='warning'>⚠ ردیف " . ($i + 1) . ": دسته «" . htmlspecialchars($categoryName) . "» پیدا نشد</span>\n";
            }
            continue;
        }
    }
    $categoryId = $catIdMap[$normalizedCatName];

    if (empty($defectCode)) {
        $defectCode = $categoryId * 1000 + $i;
    }

    $priorityStr = 'medium';
    if (is_numeric($priority)) {
        $pNum = (int)$priority;
        if ($pNum == 1) $priorityStr = 'critical';
        elseif ($pNum == 2) $priorityStr = 'high';
        elseif ($pNum == 3) $priorityStr = 'medium';
        else $priorityStr = 'low';
    }

    try {
        $insertStmt->execute([
            $categoryId,
            (int)$defectCode,
            trim((string)$title),
            $priorityStr
        ]);
        $totalImported++;
        if (!isset($categoryStats[$normalizedCatName])) {
            $categoryStats[$normalizedCatName] = [
                'count' => 0,
                'display_name' => $dbCatOriginalNames[$categoryId],
            ];
        }
        $categoryStats[$normalizedCatName]['count']++;
    } catch (Exception $e) {
        $totalErrors++;
        if ($totalErrors <= 3) {
            echo "  <span class='error'>خطا ردیف " . ($i + 1) . ": " . htmlspecialchars($e->getMessage()) . "</span>\n";
        }
    }
}

$pdo->commit();

echo "\n";
echo str_repeat('=', 70) . "\n";
echo "📊 خلاصه نهایی:\n";
echo str_repeat('=', 70) . "\n";

echo "<div class='stats'>";
echo "<strong>تعداد کل عیوب وارد شده:</strong> <span class='success'>$totalImported</span><br>";
echo "<strong>تعداد خطاها:</strong> " . ($totalErrors > 0 ? "<span class='warning'>$totalErrors</span>" : "0") . "<br>";
echo "<strong>ردیف‌های خالی رد شده:</strong> $skippedEmpty<br>";
echo "<strong>ردیف‌های بدون دسته:</strong> $skippedNoCategory<br>";
echo "<strong>دسته‌های جدید ساخته‌شده:</strong> <span class='info'>$autoCreatedCats</span><br>";
echo "</div>";

echo "\n📋 آمار هر دسته:\n";
echo "<table>";
echo "<tr><th>#</th><th>نام دسته</th><th>تعداد عیوب</th></tr>";
uasort($categoryStats, function($a, $b) { return $b['count'] - $a['count']; });
$idx = 1;
foreach ($categoryStats as $catName => $info) {
    echo "<tr class='match'>";
    echo "<td style='text-align:center;'>" . $idx++ . "</td>";
    echo "<td>" . htmlspecialchars($info['display_name']) . "</td>";
    echo "<td style='text-align:center;'>" . $info['count'] . "</td>";
    echo "</tr>";
}
echo "</table>";

echo "\n\n" . str_repeat('=', 70) . "\n";
echo "✅ عملیات کامل شد!\n";
echo str_repeat('=', 70) . "\n";

echo "</div>";

echo "<div class='warning-box'>";
echo "⚠️ <strong>توصیه امنیتی:</strong> حالا که import تموم شد، این فایل رو از سرور حذف کن.";
echo "</div>";

echo "</body></html>";

// ============================================================================
//  تابع نرمال‌سازی نام دسته
//  تبدیل نیم‌فاصله (U+200C) به فاصله معمولی + حذف کاراکترهای اضافی
// ============================================================================
function normalizeCategoryName($name) {
    // حذف کاراکترهای کنترلی و escape sequence های اکسل
    $name = str_replace(["\t", "\r", "\n", '_x0009_', '_x000d_'], '', $name);
    // تبدیل نیم‌فاصله (ZWNJ) به فاصله معمولی
    $name = str_replace("\u{200c}", ' ', $name);
    // نرمال‌سازی فاصله‌های اضافی
    $name = preg_replace('/\s+/u', ' ', $name);
    $name = trim($name);
    return $name;
}

// ============================================================================
//  تابع بازگردانی نیم‌فاصله (برای ذخیره در دیتابیس به‌صورت استاندارد)
//  واژه‌های خاصی که باید با نیم‌فاصله نوشته بشن: یراق‌آلات، مقره‌ها، ...
// ============================================================================
function restoreZwnj($name) {
    // لیست واژه‌هایی که باید با نیم‌فاصله نوشته بشن
    $zwnjWords = [
        'یراق آلات' => 'یراق\u{200c}آلات',
        'مقره ها' => 'مقره\u{200c}ها',
        'هادی فاز' => 'هادی\u{200c}فاز',  // این لزوماً با نیم‌فاصله نیست ولی برای یکدستی
    ];
    foreach ($zwnjWords as $search => $replace) {
        $name = str_replace($search, $replace, $name);
    }
    return $name;
}

// ============================================================================
//  Parser داخلی اصلاح‌شده XLSX
// ============================================================================
function parseXlsxSheetsFixed($filePath) {
    if (!class_exists('ZipArchive')) {
        throw new Exception('اکستنشن ZipArchive در PHP نصب نیست');
    }

    $zip = new ZipArchive();
    if ($zip->open($filePath) !== true) {
        throw new Exception('باز کردن فایل XLSX ناموفق بود');
    }

    $workbookXml = $zip->getFromName('xl/workbook.xml');
    if ($workbookXml === false) {
        $zip->close();
        throw new Exception('فایل workbook.xml در XLSX پیدا نشد');
    }

    $relsXml = $zip->getFromName('xl/_rels/workbook.xml.rels');
    $relsMap = [];
    if ($relsXml) {
        $rels = simplexml_load_string($relsXml);
        if ($rels) {
            foreach ($rels->Relationship as $rel) {
                $relsMap[(string)$rel['Id']] = (string)$rel['Target'];
            }
        }
    }

    $sheets = [];
    $wb = simplexml_load_string($workbookXml);
    if (!$wb) {
        $zip->close();
        throw new Exception('پارس workbook.xml ناموفق بود');
    }

    foreach ($wb->sheets->sheet as $sheet) {
        $sheetName = (string)$sheet['name'];
        $rId = (string)$sheet['r:id'];
        $target = isset($relsMap[$rId]) ? $relsMap[$rId] : null;

        if (!$target) {
            $sheetId = (string)$sheet['sheetId'];
            $target = "worksheets/sheet$sheetId.xml";
        }

        // 🔧 اصلاح مهم: حذف اسلش ابتدایی
        $target = ltrim($target, '/');

        if (strpos($target, 'xl/') !== 0) {
            $target = 'xl/' . $target;
        }

        $sheets[$sheetName] = $target;
    }

    // خواندن sharedStrings
    $sharedStrings = [];
    $ssXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($ssXml) {
        $ss = simplexml_load_string($ssXml);
        if ($ss) {
            foreach ($ss->si as $si) {
                if (isset($si->t)) {
                    $sharedStrings[] = (string)$si->t;
                } else {
                    $text = '';
                    foreach ($si->r as $r) {
                        $text .= (string)$r->t;
                    }
                    $sharedStrings[] = $text;
                }
            }
        }
    }

    // خواندن هر شیت
    $result = [];
    foreach ($sheets as $sheetName => $sheetFile) {
        $sheetXml = $zip->getFromName($sheetFile);
        if ($sheetXml === false) {
            $altPaths = [
                $sheetFile,
                'xl/' . $sheetFile,
                str_replace('xl/xl/', 'xl/', $sheetFile),
            ];
            foreach ($altPaths as $alt) {
                $sheetXml = $zip->getFromName($alt);
                if ($sheetXml !== false) break;
            }
            if ($sheetXml === false) continue;
        }

        $sheet = simplexml_load_string($sheetXml);
        if (!$sheet) continue;

        $rows = [];
        foreach ($sheet->sheetData->row as $row) {
            $rowData = [];
            $maxCol = 0;
            foreach ($row->c as $cell) {
                $cellRef = (string)$cell['r'];
                $colStr = preg_replace('/[0-9]/', '', $cellRef);
                $colNum = 0;
                for ($i = 0; $i < strlen($colStr); $i++) {
                    $colNum = $colNum * 26 + (ord($colStr[$i]) - ord('A') + 1);
                }
                $colNum--;
                if ($colNum > $maxCol) $maxCol = $colNum;

                $value = null;
                if (isset($cell->v)) {
                    $value = (string)$cell->v;
                    if (isset($cell['t']) && (string)$cell['t'] === 's') {
                        $value = isset($sharedStrings[(int)$value]) ? $sharedStrings[(int)$value] : '';
                    } elseif (isset($cell['t']) && (string)$cell['t'] === 'inlineStr') {
                        $value = (string)$cell->is->t;
                    }
                } elseif (isset($cell->is->t)) {
                    $value = (string)$cell->is->t;
                }
                $rowData[$colNum] = $value;
            }
            $filledRow = [];
            for ($i = 0; $i <= $maxCol; $i++) {
                $filledRow[$i] = isset($rowData[$i]) ? $rowData[$i] : null;
            }
            $rows[] = $filledRow;
        }
        $result[$sheetName] = $rows;
    }

    $zip->close();
    return $result;
}
