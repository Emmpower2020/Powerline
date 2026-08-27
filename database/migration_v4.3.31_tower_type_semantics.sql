-- Powerline Web v4.3.31
-- مدل نهایی دکل‌ها:
-- tower_structure = ساختار دکل (مشبک فلزی، تیر چوبی، ...)
-- tower_type = نوع دکل (آویزی / کششی)
-- tower_type_code = کد نوع دکل (NN، CC، AA، ...)
-- foundation_type در مدل دکل استفاده نمی‌شود.

USE `sabadga2_Powerline`;

SET @has_foundation_type = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'towers' AND COLUMN_NAME = 'foundation_type'
);

-- در نسخه قدیمی، نوع دکل در foundation_type بوده است؛ قبل از حذف آن را به tower_type منتقل می‌کنیم.
SET @sql = IF(
  @has_foundation_type = 1,
  'UPDATE `towers` SET `tower_type` = `foundation_type` WHERE `foundation_type` IN (''کششی'',''آویزی'')',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- قبل از NOT NULL شدن، داده‌های خالی/NULL را به یک مقدار معتبر تبدیل می‌کنیم تا Migration روی دیتابیس‌های قدیمی متوقف نشود.
UPDATE `towers` SET `tower_type` = 'آویزی' WHERE `tower_type` IS NULL OR TRIM(`tower_type`) = '';

-- tower_type دیگر ساختار دکل نیست و فقط «آویزی/کششی» را نگه می‌دارد.
ALTER TABLE `towers`
  MODIFY COLUMN `tower_type` VARCHAR(20) NOT NULL COMMENT 'نوع دکل: آویزی / کششی';

SET @has_tower_type_code = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'towers' AND COLUMN_NAME = 'tower_type_code'
);
SET @has_foundation_type_code = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'towers' AND COLUMN_NAME = 'foundation_type_code'
);

SET @sql = IF(
  @has_tower_type_code = 0 AND @has_foundation_type_code = 1,
  'ALTER TABLE `towers` CHANGE `foundation_type_code` `tower_type_code` VARCHAR(20) NULL COMMENT ''کد نوع دکل''',
  IF(@has_tower_type_code = 0,
     'ALTER TABLE `towers` ADD COLUMN `tower_type_code` VARCHAR(20) NULL COMMENT ''کد نوع دکل'' AFTER `tower_type`',
     'SELECT 1')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_foundation_type = 1,
  'ALTER TABLE `towers` DROP COLUMN `foundation_type`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- هرگونه ستون کد قدیمی باید دیگر وجود نداشته باشد.
SET @has_foundation_type_code = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'towers' AND COLUMN_NAME = 'foundation_type_code'
);
SET @sql = IF(
  @has_foundation_type_code = 1,
  'ALTER TABLE `towers` DROP COLUMN `foundation_type_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SHOW COLUMNS FROM `towers` LIKE 'tower_type';
SHOW COLUMNS FROM `towers` LIKE 'tower_structure';
SHOW COLUMNS FROM `towers` LIKE 'tower_type_code';
