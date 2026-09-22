-- ============================================================================
--  Powerline Web — مهاجرت دیتابیس نسخه 4.3.86
--  موضوع: تکمیل فهرست بها (طبقه‌بندی ولتاژ/مدار/باندل/روش بازدید/نوع زمین)
--          + ضرایب کاهش و افزایش بها + اتصال بازدید/تعمیرات به فهرست بها
--          و صدور صورت‌وضعیت
--
--  نحوه اجرا: در phpMyAdmin دیتابیس jibimar1_Powerline را انتخاب کنید،
--  تب SQL را باز کنید، کل این فایل را paste کرده و Go بزنید.
--
--  نکته‌ها:
--   * این اسکریپت فقط یک‌بار باید اجرا شود.
--   * برخی ستون‌های طبقه‌بندی (item_kind، activity_type، inspection_method،
--     voltage_kv، circuit_count، bundle_count، terrain_type در جدول اقلام و
--     terrain_type در جدول دکل‌ها) از قبل روی دیتابیس شما موجودند —
--     اگر خطای «Duplicate column» داد یعنی همان ستون قبلاً هست؛
--     لطفاً خطاهای «تکراری بودن ستون/ایندکس» را نادیده بگیرید و بقیه را اجرا کنید.
--   * به مقدار هیچ ستون موجودی دست نمی‌زنیم — فقط ستون جدید اضافه/نرمال‌سازی
--     می‌شود و مقادیر تستی داخل ستون‌های جدید/ردیف‌های جدید قرار می‌گیرد.
--   * ۴ ستون قیمت زمین (دشت / تپه‌ماهور / نیمه‌کوهستانی / صعب‌العبور) مطابق
--     فهرست بهای کشوری اضافه می‌شود؛ ستون unit_price قبلی به‌عنوان
--     «بهای پایه» دست‌نخورده باقی می‌ماند و در نبود قیمت زمین استفاده می‌شود.
--   * واژگان کلیدی سامانه:
--       item_kind         : base = قلم عادی | coefficient = ردیف ضریب کاهش/افزایش بها
--       activity_type     : inspection = بازدید | repair = تعمیرات | operation = عملیات
--       inspection_method : climbing = بازدید صعودی | patrol = بازدید پیمایشی
--       terrain_type      : plain = دشت | hilly = تپه‌ماهور |
--                           semi_mountainous = نیمه‌کوهستانی | impassable = صعب‌العبور
-- ============================================================================

-- ----------------------------------------------------------------------------
-- بخش ۱ — طبقه‌بندی اقلام فهرست بها
--   ستون‌های item_kind / activity_type / inspection_method / voltage_kv /
--   circuit_count / bundle_count / terrain_type ممکن است از قبل موجود باشند؛
--   خطای Duplicate را نادیده بگیرید. ستون‌های زیر تازه اضافه می‌شوند:
--   tower_structure : محدود کردن قلم به یک نوع سازه دکل (مثل تیر چوبی)
--   ۴ ستون قیمت زمین + درصد ضریب
-- ----------------------------------------------------------------------------
ALTER TABLE `price_list_items`
  ADD COLUMN `item_kind` VARCHAR(30) NULL DEFAULT NULL COMMENT 'base=قلم عادی | coefficient=ضریب کاهش/افزایش' AFTER `category`,
  ADD COLUMN `activity_type` VARCHAR(30) NULL DEFAULT NULL COMMENT 'inspection=بازدید | repair=تعمیرات | operation=عملیات' AFTER `item_kind`,
  ADD COLUMN `inspection_method` VARCHAR(30) NULL DEFAULT NULL COMMENT 'climbing=صعودی | patrol=پیمایشی' AFTER `activity_type`,
  ADD COLUMN `voltage_kv` DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'سطح ولتاژ (kV)' AFTER `inspection_method`,
  ADD COLUMN `circuit_count` INT NULL DEFAULT NULL COMMENT 'تعداد مدار (1/2/4)' AFTER `voltage_kv`,
  ADD COLUMN `bundle_count` INT NULL DEFAULT NULL COMMENT 'تعداد باندل (1 تا 4)' AFTER `circuit_count`,
  ADD COLUMN `terrain_type` VARCHAR(30) NULL DEFAULT NULL COMMENT 'محدود کردن قلم به یک نوع زمین (خالی = همه زمین‌ها با قیمت ستون‌های چهارگانه)' AFTER `bundle_count`,
  ADD COLUMN `tower_structure` VARCHAR(100) NULL DEFAULT NULL COMMENT 'نوع سازه دکل (مشبک فلزی/تیر چوبی/تلسکوپی فلزی)' AFTER `terrain_type`,
  ADD COLUMN `unit_price_plain` DECIMAL(18,2) NULL DEFAULT NULL COMMENT 'بهای واحد — دشت' AFTER `unit_price`,
  ADD COLUMN `unit_price_hilly` DECIMAL(18,2) NULL DEFAULT NULL COMMENT 'بهای واحد — تپه‌ماهور' AFTER `unit_price_plain`,
  ADD COLUMN `unit_price_semi_mountainous` DECIMAL(18,2) NULL DEFAULT NULL COMMENT 'بهای واحد — نیمه‌کوهستانی' AFTER `unit_price_hilly`,
  ADD COLUMN `unit_price_impassable` DECIMAL(18,2) NULL DEFAULT NULL COMMENT 'بهای واحد — صعب‌العبور' AFTER `unit_price_semi_mountainous`,
  ADD COLUMN `coefficient_percent` DECIMAL(8,4) NULL DEFAULT NULL COMMENT 'درصد ضریب (مثبت=افزایش، منفی=کاهش) — فقط برای item_kind=coefficient' AFTER `unit_price_impassable`,
  ADD INDEX `idx_pli_class` (`item_kind`, `activity_type`, `voltage_kv`, `circuit_count`, `bundle_count`),
  ADD INDEX `idx_pli_method` (`inspection_method`);

-- نرمال‌سازی: اقلام موجود بدون item_kind → «قلم عادی» (فقط ستون جدید/خالی)
UPDATE `price_list_items` SET `item_kind` = 'base' WHERE `item_kind` IS NULL OR `item_kind` = '';

-- ----------------------------------------------------------------------------
-- بخش ۲ — بازدیدها: روش بازدید (صعودی/پیمایشی) + نوع زمین بازدید
-- ----------------------------------------------------------------------------
ALTER TABLE `inspections`
  ADD COLUMN `inspection_method` VARCHAR(30) NULL DEFAULT NULL COMMENT 'climbing=بازدید صعودی | patrol=بازدید پیمایشی' AFTER `inspection_date`,
  ADD COLUMN `terrain_type` VARCHAR(30) NULL DEFAULT NULL COMMENT 'نوع زمین بازدید (NULL = از دکل)' AFTER `inspection_method`,
  ADD INDEX `idx_inspections_method` (`inspection_method`);

-- ----------------------------------------------------------------------------
-- بخش ۳ — دکل‌ها: نوع زمین هر دکل (مبنای انتخاب ستون قیمت در فهرست بها)
--   ستون terrain_type ممکن است از قبل موجود باشد — خطای Duplicate را نادیده بگیرید
-- ----------------------------------------------------------------------------
ALTER TABLE `towers`
  ADD COLUMN `terrain_type` VARCHAR(30) NULL DEFAULT NULL COMMENT 'plain=دشت | hilly=تپه‌ماهور | semi_mountainous=نیمه‌کوهستانی | impassable=صعب‌العبور' AFTER `tower_structure`,
  ADD INDEX `idx_towers_terrain` (`terrain_type`);

-- مقادیر تستی (فقط ستون جدید) — پرکردن هوشمند بر اساس خطوط واقعی:
UPDATE `towers` SET `terrain_type` = 'plain'            WHERE `terrain_type` IS NULL;
UPDATE `towers` SET `terrain_type` = 'hilly'            WHERE `line_id` IN (195, 201, 207, 212, 219, 221);
UPDATE `towers` SET `terrain_type` = 'semi_mountainous' WHERE `line_id` IN (202, 203, 204, 205, 206, 208, 217, 218);
UPDATE `towers` SET `terrain_type` = 'impassable'      WHERE `line_id` = 208 AND (`tower_number` MOD 4 = 0);

-- ----------------------------------------------------------------------------
-- بخش ۴ — صورت‌وضعیت‌ها: نگهداری فهرست مبنای محاسبه + جمع ضرایب + درصد مالیات
-- ----------------------------------------------------------------------------
ALTER TABLE `invoices`
  ADD COLUMN `price_list_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'فهرست بهای مبنای محاسبه' AFTER `contractor_id`,
  ADD COLUMN `net_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'جمع خالص اقلام (پس از ضرایب، قبل از مالیات)' AFTER `total_amount`,
  ADD COLUMN `coefficient_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'جمع مبلغ کاهش/افزایش بها' AFTER `net_amount`,
  ADD COLUMN `tax_percent` DECIMAL(5,2) NULL DEFAULT NULL COMMENT 'درصد مالیات اعمال‌شده هنگام صدور' AFTER `tax_amount`,
  ADD INDEX `idx_invoices_price_list` (`price_list_id`);

-- ----------------------------------------------------------------------------
-- بخش ۵ — اقلام صورت‌وضعیت: اتصال به بازدید + جزئیات ضریب و نوع زمین
--   (work_order_id و price_list_item_id از قبل موجودند)
-- ----------------------------------------------------------------------------
ALTER TABLE `invoice_items`
  ADD COLUMN `inspection_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'بازدید مرتبط' AFTER `invoice_id`,
  ADD COLUMN `terrain_type` VARCHAR(30) NULL DEFAULT NULL COMMENT 'نوع زمین اعمال‌شده' AFTER `unit_price`,
  ADD COLUMN `tower_structure` VARCHAR(100) NULL DEFAULT NULL COMMENT 'نوع سازه دکل (اسنپ‌شات)' AFTER `terrain_type`,
  ADD COLUMN `coefficient_percent` DECIMAL(8,4) NULL DEFAULT NULL COMMENT 'جمع درصد ضرایب اعمال‌شده' AFTER `tower_structure`,
  ADD COLUMN `coefficient_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'مبلغ افزایش/کاهش بها' AFTER `coefficient_percent`,
  ADD COLUMN `base_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'مبلغ پایه قبل از ضریب' AFTER `coefficient_amount`,
  ADD INDEX `idx_inv_items_inspection` (`inspection_id`);

-- ----------------------------------------------------------------------------
-- بخش ۶ — داده تستی: فهرست بهای نمونه ۱۴۰۵ با کل ماتریس
--   (ردیف‌های جدید — به اقلام موجود دست نمی‌زنیم)
--   ساختار: هر ترکیب (ولتاژ × مدار × باندل) × (صعودی/پیمایشی) یک قلم با
--   activity_type=inspection و inspection_method، به‌همراه ۴ قیمت زمین.
--   ضرایب کاهش/افزایش با item_kind=coefficient (در فهرست رسمی کد ندارند؛
--   کد آزمایشی COEF-xx برای سامانه).
-- ----------------------------------------------------------------------------
INSERT INTO `price_lists` (`name`, `version`, `effective_date`, `contract_id`, `status`, `created_at`)
VALUES ('فهرست بهای بازدید و نگهداری خطوط (آزمایشی) ۱۴۰۵', '1405.1', '2026-03-21', NULL, 'active', NOW());

SET @plid = LAST_INSERT_ID();

INSERT INTO `price_list_items`
  (`price_list_id`, `code`, `title`, `unit`, `category`, `item_kind`, `activity_type`, `inspection_method`,
   `voltage_kv`, `circuit_count`, `bundle_count`, `tower_structure`, `unit_price`,
   `unit_price_plain`, `unit_price_hilly`, `unit_price_semi_mountainous`, `unit_price_impassable`,
   `coefficient_percent`, `status`)
VALUES
  -- ── بازدید صعودی ۶۳ کیلوولت ──
  (@plid, 'SZ-63-1C-1B', 'بازدید صعودی دکل ۶۳ کیلوولت — تک‌مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 63, 1, 1, NULL, 2000000, 2000000, 2300000, 2700000, 3200000, NULL, 'active'),
  (@plid, 'SZ-63-2C-1B', 'بازدید صعودی دکل ۶۳ کیلوولت — دو مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 63, 2, 1, NULL, 2700000, 2700000, 3100500, 3645000, 4320000, NULL, 'active'),
  (@plid, 'SZ-63-4C-1B', 'بازدید صعودی دکل ۶۳ کیلوولت — چهارمداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 63, 4, 1, NULL, 3400000, 3400000, 3910000, 4590000, 5440000, NULL, 'active'),
  -- ── بازدید صعودی ۱۳۲ کیلوولت ──
  (@plid, 'SZ-132-1C-1B', 'بازدید صعودی دکل ۱۳۲ کیلوولت — تک‌مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 132, 1, 1, NULL, 2600000, 2600000, 2990000, 3510000, 4160000, NULL, 'active'),
  (@plid, 'SZ-132-2C-1B', 'بازدید صعودی دکل ۱۳۲ کیلوولت — دو مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 132, 2, 1, NULL, 3510000, 3510000, 4036500, 4738500, 5616000, NULL, 'active'),
  (@plid, 'SZ-132-2C-2B', 'بازدید صعودی دکل ۱۳۲ کیلوولت — دو مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 132, 2, 2, NULL, 4036500, 4036500, 4641975, 5449275, 6458400, NULL, 'active'),
  (@plid, 'SZ-132-4C-1B', 'بازدید صعودی دکل ۱۳۲ کیلوولت — چهارمداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 132, 4, 1, NULL, 4420000, 4420000, 5083000, 5967000, 7072000, NULL, 'active'),
  -- ── بازدید صعودی ۲۳۰ کیلوولت ──
  (@plid, 'SZ-230-1C-1B', 'بازدید صعودی دکل ۲۳۰ کیلوولت — تک‌مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 230, 1, 1, NULL, 3400000, 3400000, 3910000, 4590000, 5440000, NULL, 'active'),
  (@plid, 'SZ-230-2C-1B', 'بازدید صعودی دکل ۲۳۰ کیلوولت — دو مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 230, 2, 1, NULL, 4590000, 4590000, 5278500, 6196500, 7344000, NULL, 'active'),
  (@plid, 'SZ-230-2C-2B', 'بازدید صعودی دکل ۲۳۰ کیلوولت — دو مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 230, 2, 2, NULL, 5278500, 5278500, 6070275, 7125975, 8445600, NULL, 'active'),
  (@plid, 'SZ-230-4C-1B', 'بازدید صعودی دکل ۲۳۰ کیلوولت — چهارمداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 230, 4, 1, NULL, 5780000, 5780000, 6647000, 7803000, 9248000, NULL, 'active'),
  (@plid, 'SZ-230-4C-2B', 'بازدید صعودی دکل ۲۳۰ کیلوولت — چهارمداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 230, 4, 2, NULL, 6647000, 6647000, 7644050, 8973450, 10635200, NULL, 'active'),
  -- ── بازدید صعودی ۴۰۰ کیلوولت ──
  (@plid, 'SZ-400-1C-2B', 'بازدید صعودی دکل ۴۰۰ کیلوولت — تک‌مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 400, 1, 2, NULL, 5520000, 5520000, 6348000, 7452000, 8832000, NULL, 'active'),
  (@plid, 'SZ-400-1C-3B', 'بازدید صعودی دکل ۴۰۰ کیلوولت — تک‌مداره سه‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 400, 1, 3, NULL, 6244000, 6244000, 7180600, 8429400, 9990400, NULL, 'active'),
  (@plid, 'SZ-400-2C-2B', 'بازدید صعودی دکل ۴۰۰ کیلوولت — دو مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 400, 2, 2, NULL, 7452000, 7452000, 8569800, 10060200, 11923200, NULL, 'active'),
  (@plid, 'SZ-400-2C-3B', 'بازدید صعودی دکل ۴۰۰ کیلوولت — دو مداره سه‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 400, 2, 3, NULL, 8429400, 8429400, 9693810, 11379690, 13487040, NULL, 'active'),
  (@plid, 'SZ-400-4C-2B', 'بازدید صعودی دکل ۴۰۰ کیلوولت — چهارمداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 400, 4, 2, NULL, 9384000, 9384000, 10791600, 12668400, 15014400, NULL, 'active'),
  (@plid, 'SZ-400-4C-4B', 'بازدید صعودی دکل ۴۰۰ کیلوولت — چهارمداره چهار باندل', 'دکل', 'بازدید', 'base', 'inspection', 'climbing', 400, 4, 4, NULL, 13606800, 13606800, 15647820, 18369180, 21770880, NULL, 'active'),
  -- ── بازدید پیمایشی (حدود ۳۵٪ بهای صعودی) ──
  (@plid, 'PM-63-1C-1B',  'بازدید پیمایشی دکل ۶۳ کیلوولت — تک‌مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 63, 1, 1, NULL, 700000, 700000, 805000, 945000, 1120000, NULL, 'active'),
  (@plid, 'PM-63-2C-1B',  'بازدید پیمایشی دکل ۶۳ کیلوولت — دو مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 63, 2, 1, NULL, 945000, 945000, 1086750, 1275750, 1512000, NULL, 'active'),
  (@plid, 'PM-63-4C-1B',  'بازدید پیمایشی دکل ۶۳ کیلوولت — چهارمداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 63, 4, 1, NULL, 1190000, 1190000, 1368500, 1606500, 1904000, NULL, 'active'),
  (@plid, 'PM-132-2C-1B', 'بازدید پیمایشی دکل ۱۳۲ کیلوولت — دو مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 132, 2, 1, NULL, 1228500, 1228500, 1412775, 1658475, 1965600, NULL, 'active'),
  (@plid, 'PM-132-2C-2B', 'بازدید پیمایشی دکل ۱۳۲ کیلوولت — دو مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 132, 2, 2, NULL, 1412775, 1412775, 1624691, 1907246, 2260440, NULL, 'active'),
  (@plid, 'PM-230-1C-1B', 'بازدید پیمایشی دکل ۲۳۰ کیلوولت — تک‌مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 230, 1, 1, NULL, 1190000, 1190000, 1368500, 1606500, 1904000, NULL, 'active'),
  (@plid, 'PM-230-2C-1B', 'بازدید پیمایشی دکل ۲۳۰ کیلوولت — دو مداره تک‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 230, 2, 1, NULL, 1606500, 1606500, 1847475, 2168775, 2570400, NULL, 'active'),
  (@plid, 'PM-230-2C-2B', 'بازدید پیمایشی دکل ۲۳۰ کیلوولت — دو مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 230, 2, 2, NULL, 1847475, 1847475, 2124596, 2494091, 2955960, NULL, 'active'),
  (@plid, 'PM-400-2C-2B', 'بازدید پیمایشی دکل ۴۰۰ کیلوولت — دو مداره دو باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 400, 2, 2, NULL, 2608200, 2608200, 2999430, 3521070, 4173120, NULL, 'active'),
  (@plid, 'PM-400-2C-3B', 'بازدید پیمایشی دکل ۴۰۰ کیلوولت — دو مداره سه‌باندل', 'دکل', 'بازدید', 'base', 'inspection', 'patrol', 400, 2, 3, NULL, 2950290, 2950290, 3392834, 3982892, 4720464, NULL, 'active'),
  -- ── تعمیرات و عملیات (عمومی — بدون طبقه‌بندی ولتاژ) ──
  (@plid, 'OP-001', 'تعویض مقره پلیمری روی دکل', 'عدد', 'تعمیرات', 'base', 'repair', NULL, NULL, NULL, NULL, NULL, 2500000, NULL, NULL, NULL, NULL, NULL, 'active'),
  (@plid, 'OP-002', 'تنظیم و بستن یراق‌آلات دکل', 'دکل', 'تعمیرات', 'base', 'repair', NULL, NULL, NULL, NULL, NULL, 850000, NULL, NULL, NULL, NULL, NULL, 'active'),
  (@plid, 'OP-003', 'رنگ‌آمیزی اجزای دکل', 'متر مربع', 'تعمیرات', 'base', 'repair', NULL, NULL, NULL, NULL, NULL, 350000, NULL, NULL, NULL, NULL, NULL, 'active'),
  (@plid, 'OP-004', 'تعویض برقگیر روی دکل', 'عدد', 'تعمیرات', 'base', 'repair', NULL, NULL, NULL, NULL, NULL, 4500000, NULL, NULL, NULL, NULL, NULL, 'active'),
  (@plid, 'OP-005', 'شستشوی عایقی مقره‌های دکل', 'دکل', 'عملیات', 'base', 'operation', NULL, NULL, NULL, NULL, NULL, 1200000, 1400000, 1400000, 1700000, 2000000, NULL, 'active'),
  -- ── ضرایب کاهش/افزایش بها (item_kind=coefficient — در فهرست رسمی کد ندارند) ──
  (@plid, 'COEF-01', 'کاهش بها — دکل تیر چوبی', 'ضریب', 'ضریب', 'coefficient', NULL, NULL, NULL, NULL, NULL, 'تیر چوبی', 0, NULL, NULL, NULL, NULL, -15.0000, 'active'),
  (@plid, 'COEF-02', 'افزایش بها — عملیات در ارتفاع بیش از ۳۰۰۰ متر', 'ضریب', 'ضریب', 'coefficient', NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, 10.0000, 'active'),
  (@plid, 'COEF-03', 'افزایش بها — شرایط جوی نامساعد (باران/برف)', 'ضریب', 'ضریب', 'coefficient', NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, 10.0000, 'active'),
  (@plid, 'COEF-04', 'کاهش بها — حجم کار بیش از ۵۰ دکل در هر بازدید دوره‌ای', 'ضریب', 'ضریب', 'coefficient', NULL, NULL, 'climbing', NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, -5.0000, 'active');

-- ----------------------------------------------------------------------------
-- بخش ۷ — سازگاری (اختیاری):
--   اگر هنگام استفاده از فهرست بها خطای «Unknown column 'status'» گرفتید،
--   یعنی جدول فهرست شما هنوز ساختار قدیمی is_active دارد — این ۴ خط را اجرا کنید:
-- ----------------------------------------------------------------------------
-- ALTER TABLE `price_lists`     ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'active';
-- UPDATE `price_lists`     SET `status` = IF(`is_active` = 1, 'active', 'inactive');
-- ALTER TABLE `price_list_items` ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'active';
-- UPDATE `price_list_items` SET `status` = IF(`is_active` = 1, 'active', 'inactive');

-- ----------------------------------------------------------------------------
-- بررسی نهایی — این SELECT ها باید بدون خطا اجرا شوند:
-- ----------------------------------------------------------------------------
-- SELECT item_kind, COUNT(*) FROM price_list_items GROUP BY item_kind;
-- SELECT code, unit_price_plain, unit_price_hilly, unit_price_semi_mountainous, unit_price_impassable
--   FROM price_list_items WHERE voltage_kv = 63 AND circuit_count = 2 AND inspection_method = 'climbing';
-- SELECT inspection_method, COUNT(*) FROM price_list_items WHERE inspection_method IS NOT NULL GROUP BY inspection_method;
-- SELECT terrain_type, COUNT(*) FROM towers GROUP BY terrain_type;
-- SHOW COLUMNS FROM price_list_items LIKE 'unit_price_%';
