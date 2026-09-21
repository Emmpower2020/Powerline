-- ============================================================================
-- Powerline Web v4.3.86 — اتصال عملیات به فهرست بها و صدور صورت‌وضعیت
--
-- این Migration افزایشی است و مقادیر ستون‌های موجود را تغییر نمی‌دهد.
--
-- قابلیت‌ها:
--  1) اطلاعات شرایط تطبیق روی price_list_items
--  2) ذخیره مستقل کاهش/اضافه‌بها بدون ساخت کد رسمی جعلی
--  3) شرایط زمین در سطح هر دکل (دشت/نیمه‌کوهستانی/صعب‌العبور)
--  4) نوع بازدید و تعداد نفرات در inspections
--  5) متره مالی برای بازدید و دستورکار با Snapshot قیمت
--  6) اتصال متره به اقلام صورت‌وضعیت
--
-- توجه: بخش TEST DATA انتهای فایل فقط برای تست است و فقط ستون‌های جدید را پر می‌کند.
-- ============================================================================

SET NAMES utf8mb4;

-- --------------------------------------------------------------------------
-- helper: افزودن ستون فقط در صورت نبودن
-- --------------------------------------------------------------------------
SET @db_name = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='item_kind')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `item_kind` VARCHAR(30) NOT NULL DEFAULT ''base'' AFTER `category`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='activity_type')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `activity_type` VARCHAR(30) NULL AFTER `item_kind`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='voltage_kv')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `voltage_kv` DECIMAL(10,2) NULL AFTER `activity_type`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='circuit_count')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `circuit_count` INT NULL AFTER `voltage_kv`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='bundle_count')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `bundle_count` INT NULL AFTER `circuit_count`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='terrain_type')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `terrain_type` VARCHAR(30) NULL AFTER `bundle_count`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='price_list_items' AND COLUMN_NAME='inspection_method')=0,
  'ALTER TABLE `price_list_items` ADD COLUMN `inspection_method` VARCHAR(30) NULL AFTER `terrain_type`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- دکل: نوع زمین + سه پرچم برای واردسازی/کنترل داده و سازگاری با ساختار گزارش‌ها
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='towers' AND COLUMN_NAME='terrain_type')=0,
  'ALTER TABLE `towers` ADD COLUMN `terrain_type` VARCHAR(30) NULL AFTER `tower_type_code`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='towers' AND COLUMN_NAME='plain_terrain')=0,
  'ALTER TABLE `towers` ADD COLUMN `plain_terrain` TINYINT(1) NULL DEFAULT NULL AFTER `terrain_type`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='towers' AND COLUMN_NAME='semi_mountainous')=0,
  'ALTER TABLE `towers` ADD COLUMN `semi_mountainous` TINYINT(1) NULL DEFAULT NULL AFTER `plain_terrain`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='towers' AND COLUMN_NAME='mountainous')=0,
  'ALTER TABLE `towers` ADD COLUMN `mountainous` TINYINT(1) NULL DEFAULT NULL AFTER `semi_mountainous`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- بازدید: نوع فعالیت و تعداد نفرات؛ terrain_type برای Override ثبت‌شده در همان بازدید
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inspections' AND COLUMN_NAME='inspection_method')=0,
  'ALTER TABLE `inspections` ADD COLUMN `inspection_method` VARCHAR(30) NULL AFTER `priority`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inspections' AND COLUMN_NAME='crew_size')=0,
  'ALTER TABLE `inspections` ADD COLUMN `crew_size` INT NULL AFTER `inspection_method`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inspections' AND COLUMN_NAME='terrain_type')=0,
  'ALTER TABLE `inspections` ADD COLUMN `terrain_type` VARCHAR(30) NULL AFTER `crew_size`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------------------------------
-- جدول کاهش/اضافه‌بها — کد رسمی ندارد و عمداً کد ساختگی ایجاد نمی‌کند
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `price_list_adjustments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `price_list_id` BIGINT UNSIGNED NOT NULL,
  `parent_price_list_item_id` BIGINT UNSIGNED NOT NULL,
  `adjustment_type` VARCHAR(20) NOT NULL,       -- addition / reduction
  `title` VARCHAR(500) NOT NULL,
  `unit` VARCHAR(50) NULL,
  `amount` DECIMAL(18,2) NOT NULL DEFAULT 0,    -- در اکسل مقدار منفی/مثبت حفظ می‌شود
  `rule_key` VARCHAR(80) NULL,                  -- wood_concrete / crew_size_2 / bundle_2 / ...
  `rule_value` VARCHAR(200) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pla_rule` (`parent_price_list_item_id`,`title`(191),`amount`,`rule_key`,`rule_value`(100)),
  KEY `idx_pla_pl` (`price_list_id`),
  KEY `idx_pla_parent` (`parent_price_list_item_id`),
  KEY `idx_pla_rule_key` (`rule_key`),
  CONSTRAINT `fk_pla_pl` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pla_parent` FOREIGN KEY (`parent_price_list_item_id`) REFERENCES `price_list_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- متره‌های قابل صورت‌وضعیت
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `billing_measurements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_type` VARCHAR(30) NOT NULL,            -- inspection / work_order
  `source_id` BIGINT UNSIGNED NOT NULL,
  `contract_id` BIGINT UNSIGNED NULL,
  `price_list_id` BIGINT UNSIGNED NOT NULL,
  `price_list_item_id` BIGINT UNSIGNED NULL,
  `performed_date` DATE NULL,
  `voltage_kv` DECIMAL(10,2) NULL,
  `circuit_count` INT NULL,
  `bundle_count` INT NULL,
  `terrain_type` VARCHAR(30) NULL,
  `tower_structure` VARCHAR(100) NULL,
  `inspection_method` VARCHAR(30) NULL,
  `crew_size` INT NULL,
  `description` VARCHAR(500) NOT NULL,
  `unit` VARCHAR(50) NULL,
  `quantity` DECIMAL(15,3) NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `total_price` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `match_status` VARCHAR(30) NOT NULL DEFAULT 'matched',
  `match_message` VARCHAR(500) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
  `invoice_id` BIGINT UNSIGNED NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bm_source` (`source_type`,`source_id`),
  KEY `idx_bm_contract` (`contract_id`),
  KEY `idx_bm_pl` (`price_list_id`),
  KEY `idx_bm_status` (`status`),
  KEY `idx_bm_invoice` (`invoice_id`),
  CONSTRAINT `fk_bm_pl` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_bm_pli` FOREIGN KEY (`price_list_item_id`) REFERENCES `price_list_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_bm_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_bm_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_bm_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_measurement_adjustments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `measurement_id` BIGINT UNSIGNED NOT NULL,
  `price_list_adjustment_id` BIGINT UNSIGNED NULL,
  `description` VARCHAR(500) NOT NULL,
  `amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bma_measurement` (`measurement_id`),
  KEY `idx_bma_adjustment` (`price_list_adjustment_id`),
  CONSTRAINT `fk_bma_measurement` FOREIGN KEY (`measurement_id`) REFERENCES `billing_measurements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bma_adjustment` FOREIGN KEY (`price_list_adjustment_id`) REFERENCES `price_list_adjustments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ارتباط ردیف صورت‌وضعیت با متره منبع؛ ستون فقط اضافه می‌شود
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='invoice_items' AND COLUMN_NAME='billing_measurement_id')=0,
  'ALTER TABLE `invoice_items` ADD COLUMN `billing_measurement_id` BIGINT UNSIGNED NULL AFTER `price_list_item_id`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='invoice_items' AND COLUMN_NAME='inspection_id')=0,
  'ALTER TABLE `invoice_items` ADD COLUMN `inspection_id` BIGINT UNSIGNED NULL AFTER `billing_measurement_id`',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- FKهای جدید در صورت نبودن
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@db_name AND TABLE_NAME='invoice_items' AND CONSTRAINT_NAME='fk_ii_bm')=0,
  'ALTER TABLE `invoice_items` ADD CONSTRAINT `fk_ii_bm` FOREIGN KEY (`billing_measurement_id`) REFERENCES `billing_measurements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@db_name AND TABLE_NAME='invoice_items' AND CONSTRAINT_NAME='fk_ii_inspection')=0,
  'ALTER TABLE `invoice_items` ADD CONSTRAINT `fk_ii_inspection` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------------------------------
-- TEST DATA — فقط ستون‌های جدید را مقداردهی می‌کند؛ مقادیر موجود تغییر نمی‌کنند.
-- سه دکل فعال نمونه برای هر شرایط زمین. اجرای دوباره امن است.
-- --------------------------------------------------------------------------
SET @t1 = (SELECT id FROM `towers` WHERE (`terrain_type` IS NULL OR `terrain_type`='') ORDER BY id LIMIT 0,1);
SET @t2 = (SELECT id FROM `towers` WHERE (`terrain_type` IS NULL OR `terrain_type`='') ORDER BY id LIMIT 1,1);
SET @t3 = (SELECT id FROM `towers` WHERE (`terrain_type` IS NULL OR `terrain_type`='') ORDER BY id LIMIT 2,1);
SET @t4 = (SELECT id FROM `towers` WHERE (`terrain_type` IS NULL OR `terrain_type`='') ORDER BY id LIMIT 3,1);
SET @t5 = (SELECT id FROM `towers` WHERE (`terrain_type` IS NULL OR `terrain_type`='') ORDER BY id LIMIT 4,1);
SET @t6 = (SELECT id FROM `towers` WHERE (`terrain_type` IS NULL OR `terrain_type`='') ORDER BY id LIMIT 5,1);

UPDATE `towers` SET terrain_type='plain', plain_terrain=1, semi_mountainous=0, mountainous=0 WHERE id IN (@t1,@t4) AND (terrain_type IS NULL OR terrain_type='');
UPDATE `towers` SET terrain_type='semi_mountainous', plain_terrain=0, semi_mountainous=1, mountainous=0 WHERE id IN (@t2,@t5) AND (terrain_type IS NULL OR terrain_type='');
UPDATE `towers` SET terrain_type='mountainous', plain_terrain=0, semi_mountainous=0, mountainous=1 WHERE id IN (@t3,@t6) AND (terrain_type IS NULL OR terrain_type='');

-- چند مقدار تستی برای فقط ستون‌های جدید بازدیدها؛ هیچ مقدار قبلی ویرایش نمی‌شود.
SET @i1 = (SELECT id FROM `inspections` ORDER BY id LIMIT 0,1);
SET @i2 = (SELECT id FROM `inspections` ORDER BY id LIMIT 1,1);
SET @i3 = (SELECT id FROM `inspections` ORDER BY id LIMIT 2,1);
UPDATE `inspections` SET inspection_method='patrol', crew_size=1, terrain_type='plain' WHERE id=@i1 AND inspection_method IS NULL;
UPDATE `inspections` SET inspection_method='climbing', crew_size=2, terrain_type='semi_mountainous' WHERE id=@i2 AND inspection_method IS NULL;
UPDATE `inspections` SET inspection_method='patrol', crew_size=2, terrain_type='mountainous' WHERE id=@i3 AND inspection_method IS NULL;

-- پایان Migration v4.3.86
