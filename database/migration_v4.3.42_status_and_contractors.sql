-- Powerline v4.3.42: activity flags are standardized as extensible status strings.
-- status values: active / inactive (future values can be added without schema redesign).
SET NAMES utf8mb4;
START TRANSACTION;

-- Contractors: add CEO field and migrate legacy contact_person into it when empty.
SET @sql := IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contractors' AND COLUMN_NAME='ceo_name')=0, 'ALTER TABLE contractors ADD COLUMN ceo_name VARCHAR(200) NULL AFTER contractor_code', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE contractors SET ceo_name = NULLIF(TRIM(contact_person), '') WHERE (ceo_name IS NULL OR ceo_name='') AND contact_person IS NOT NULL;
-- organization
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organization' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `organization` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @ix := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organization' AND INDEX_NAME='idx_org_active');
SET @sql := IF(@ix>0, 'ALTER TABLE `organization` DROP INDEX `idx_org_active`, ADD INDEX `idx_org_status` (`status`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `organization` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `organization` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- users
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `users` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @ix := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='idx_user_act');
SET @sql := IF(@ix>0, 'ALTER TABLE `users` DROP INDEX `idx_user_act`, ADD INDEX `idx_user_act` (`status`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `users` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `users` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- personnel
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='personnel' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `personnel` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `personnel` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `personnel` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- contractors
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contractors' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `contractors` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @ix := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contractors' AND INDEX_NAME='idx_cont_act');
SET @sql := IF(@ix>0, 'ALTER TABLE `contractors` DROP INDEX `idx_cont_act`, ADD INDEX `idx_cont_act` (`status`)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `contractors` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `contractors` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- crews
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crews' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `crews` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `crews` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `crews` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- personnel_certificates
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='personnel_certificates' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `personnel_certificates` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `personnel_certificates` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `personnel_certificates` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- lines
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lines' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `lines` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `lines` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `lines` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- towers
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='towers' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `towers` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `towers` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `towers` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- corridors
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='corridors' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `corridors` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `corridors` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `corridors` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- equipment
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='equipment' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `equipment` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `equipment` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `equipment` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- checklist_templates
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checklist_templates' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `checklist_templates` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `checklist_templates` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `checklist_templates` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- checklist_items
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checklist_items' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `checklist_items` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `checklist_items` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `checklist_items` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- defect_categories
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='defect_categories' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `defect_categories` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `defect_categories` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `defect_categories` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- defect_definitions
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='defect_definitions' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `defect_definitions` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `defect_definitions` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `defect_definitions` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- price_lists
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='price_lists' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `price_lists` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `price_lists` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `price_lists` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- price_list_items
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='price_list_items' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `price_list_items` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `price_list_items` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `price_list_items` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- safety_equipment
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='safety_equipment' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `safety_equipment` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `safety_equipment` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `safety_equipment` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- tower_structures
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tower_structures' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `tower_structures` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `tower_structures` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `tower_structures` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- tower_type_codes
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tower_type_codes' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `tower_type_codes` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `tower_type_codes` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `tower_type_codes` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;
-- conductors
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='conductors' AND COLUMN_NAME='is_active');
SET @sql := IF(@has>0, CONCAT('ALTER TABLE `conductors` CHANGE COLUMN `is_active` `status` VARCHAR(30) NOT NULL DEFAULT ', CHAR(39), 'active', CHAR(39)), 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE `conductors` SET status='active' WHERE status IN ('1','true','TRUE') OR status=1;
UPDATE `conductors` SET status='inactive' WHERE status IN ('0','false','FALSE') OR status=0;

-- Helpful indexes where old index name was not explicitly listed
SET @ix := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contractors' AND INDEX_NAME='idx_cont_status');
SET @sql := IF(@ix=0, 'ALTER TABLE contractors ADD INDEX idx_cont_status (status)', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
COMMIT;
