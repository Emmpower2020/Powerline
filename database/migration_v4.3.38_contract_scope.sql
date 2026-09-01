-- v4.3.38: اتصال موجودیت‌های عملیاتی به قرارداد
-- نکته: nullable است تا داده‌های قبلی بدون قرارداد همچنان معتبر بمانند.
-- این migration برای اجرا روی دیتابیس موجود طراحی شده و در برابر اجرای مجدد مقاوم است.

SET @db := DATABASE();

-- helper: افزودن ستون contract_id در صورت نبودن

-- lines
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='lines')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='lines' AND column_name='contract_id'),
  'ALTER TABLE `lines` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `contractor_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- towers
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='towers')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='towers' AND column_name='contract_id'),
  'ALTER TABLE `towers` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `line_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- circuits (در بعضی نصب‌ها از migration قبلی ساخته شده است)
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='circuits')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='circuits' AND column_name='contract_id'),
  'ALTER TABLE `circuits` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `line_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- personnel
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='personnel')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='personnel' AND column_name='contract_id'),
  'ALTER TABLE `personnel` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `user_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- equipment
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='equipment')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='equipment' AND column_name='contract_id'),
  'ALTER TABLE `equipment` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `line_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- inspections
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='inspections')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='inspections' AND column_name='contract_id'),
  'ALTER TABLE `inspections` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `crew_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- defects
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='defects')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='defects' AND column_name='contract_id'),
  'ALTER TABLE `defects` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `tower_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- work_orders
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='work_orders')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='work_orders' AND column_name='contract_id'),
  'ALTER TABLE `work_orders` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `contractor_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- safety incidents
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='safety_incidents')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='safety_incidents' AND column_name='contract_id'),
  'ALTER TABLE `safety_incidents` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `work_order_id`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
-- price lists
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='price_lists')
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='price_lists' AND column_name='contract_id'),
  'ALTER TABLE `price_lists` ADD COLUMN `contract_id` BIGINT UNSIGNED NULL AFTER `effective_date`', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- helper: index و FK فقط در صورت نبودن

-- indexes
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='lines')
  AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='lines' AND column_name='contract_id')
  AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='lines' AND index_name='idx_line_contract'),
  'ALTER TABLE `lines` ADD INDEX `idx_line_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='towers')
  AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='towers' AND column_name='contract_id')
  AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='towers' AND index_name='idx_tower_contract'),
  'ALTER TABLE `towers` ADD INDEX `idx_tower_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- سایر indexes با یک حلقه SQL ساده
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='circuits') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='circuits' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='circuits' AND index_name='idx_circuit_contract'), 'ALTER TABLE `circuits` ADD INDEX `idx_circuit_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='personnel') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='personnel' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='personnel' AND index_name='idx_pers_contract'), 'ALTER TABLE `personnel` ADD INDEX `idx_pers_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='equipment') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='equipment' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='equipment' AND index_name='idx_eq_contract'), 'ALTER TABLE `equipment` ADD INDEX `idx_eq_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='inspections') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='inspections' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='inspections' AND index_name='idx_ins_contract'), 'ALTER TABLE `inspections` ADD INDEX `idx_ins_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='defects') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='defects' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='defects' AND index_name='idx_def_contract'), 'ALTER TABLE `defects` ADD INDEX `idx_def_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='work_orders') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='work_orders' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='work_orders' AND index_name='idx_wo_contract'), 'ALTER TABLE `work_orders` ADD INDEX `idx_wo_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='safety_incidents') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='safety_incidents' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='safety_incidents' AND index_name='idx_si_contract'), 'ALTER TABLE `safety_incidents` ADD INDEX `idx_si_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@db AND table_name='price_lists') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='price_lists' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=@db AND table_name='price_lists' AND index_name='idx_pl_contract'), 'ALTER TABLE `price_lists` ADD INDEX `idx_pl_contract` (`contract_id`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- FK ها؛ همه SET NULL هستند تا حذف قرارداد سابقه عملیاتی را پاک نکند.
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='lines' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='lines' AND constraint_name='fk_line_contract'), 'ALTER TABLE `lines` ADD CONSTRAINT `fk_line_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='towers' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='towers' AND constraint_name='fk_tower_contract'), 'ALTER TABLE `towers` ADD CONSTRAINT `fk_tower_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='circuits' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='circuits' AND constraint_name='fk_circuit_contract'), 'ALTER TABLE `circuits` ADD CONSTRAINT `fk_circuit_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='personnel' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='personnel' AND constraint_name='fk_pers_contract'), 'ALTER TABLE `personnel` ADD CONSTRAINT `fk_pers_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='equipment' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='equipment' AND constraint_name='fk_eq_contract'), 'ALTER TABLE `equipment` ADD CONSTRAINT `fk_eq_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='inspections' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='inspections' AND constraint_name='fk_ins_contract'), 'ALTER TABLE `inspections` ADD CONSTRAINT `fk_ins_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='defects' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='defects' AND constraint_name='fk_def_contract'), 'ALTER TABLE `defects` ADD CONSTRAINT `fk_def_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='work_orders' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='work_orders' AND constraint_name='fk_wo_contract'), 'ALTER TABLE `work_orders` ADD CONSTRAINT `fk_wo_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='safety_incidents' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='safety_incidents' AND constraint_name='fk_si_contract'), 'ALTER TABLE `safety_incidents` ADD CONSTRAINT `fk_si_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@db AND table_name='price_lists' AND column_name='contract_id') AND NOT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=@db AND table_name='price_lists' AND constraint_name='fk_pl_contract'), 'ALTER TABLE `price_lists` ADD CONSTRAINT `fk_pl_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
