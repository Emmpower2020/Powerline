-- Powerline Web v4.3.30
-- تطبیق کامل مراجع دکل با ساختار واقعی دیتابیس موجود
-- در lines فقط tower_structure وجود دارد؛ tower_structure_type وجود ندارد.
-- در towers در دیتابیس فعلی tower_type_code وجود دارد؛ tower_type فعلاً برای سازگاری نگه داشته می‌شود.

USE `sabadga2_Powerline`;

CREATE TABLE IF NOT EXISTS `tower_structures` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tower_structures_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `tower_structures` (`name`, `sort_order`) VALUES
('مشبک فلزی', 1),
('تلسکوپی فلزی', 2),
('تلسکوپی بتنی', 3),
('تیر چوبی', 4),
('تیر بتنی', 5);

CREATE TABLE IF NOT EXISTS `tower_type_codes` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `title` varchar(100) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tower_type_codes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `tower_type_codes` (`code`, `sort_order`) VALUES
('NN',1),('AA',2),('CC',3),('LT',4),('HT',5),('DC0',6),('DC10',7),('DC30',8),('DC60',9),('DC90',10);

SET @has_old_code = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'towers' AND COLUMN_NAME = 'foundation_type_code'
);
SET @has_new_code = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'towers' AND COLUMN_NAME = 'tower_type_code'
);
SET @sql = IF(
  @has_old_code = 1 AND @has_new_code = 0,
  'ALTER TABLE `towers` CHANGE `foundation_type_code` `tower_type_code` varchar(20) DEFAULT NULL COMMENT ''کد نوع دکل''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- جدول lines در دیتابیس فعلی از قبل tower_structure دارد؛ هیچ tower_structure_type ای در آن وجود ندارد.
-- ساختار هر خطی که دکل فعال دارد بر اساس پرتکرارترین ساختار دکل‌های فعال آن تعیین می‌شود.
UPDATE `lines` l
SET l.tower_structure = (
  SELECT t.tower_structure
  FROM `towers` t
  WHERE t.line_id = l.id
    AND t.is_active = 1
    AND t.tower_structure IS NOT NULL
    AND t.tower_structure <> ''
  GROUP BY t.tower_structure
  ORDER BY COUNT(*) DESC, t.tower_structure ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM `towers` tx
  WHERE tx.line_id = l.id AND tx.is_active = 1
);

SHOW COLUMNS FROM `lines` LIKE 'tower_structure';
SHOW COLUMNS FROM `towers` LIKE 'tower_type_code';
SELECT id,name,sort_order,is_active FROM `tower_structures` ORDER BY sort_order,id;
SELECT id,code,title,sort_order,is_active FROM `tower_type_codes` ORDER BY sort_order,id;
