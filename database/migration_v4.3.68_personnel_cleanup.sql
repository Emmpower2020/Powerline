-- Powerline v4.3.68
-- Final personnel schema: position is the only personnel role/position field.
-- Run after taking a database backup.

ALTER TABLE `personnel`
  DROP COLUMN IF EXISTS `personnel_type`,
  DROP COLUMN IF EXISTS `phone`,
  DROP COLUMN IF EXISTS `collaboration_start`,
  DROP COLUMN IF EXISTS `contract_end_date`;

-- Keep the fields required by the application.
ALTER TABLE `personnel`
  ADD COLUMN IF NOT EXISTS `position` VARCHAR(200) NULL AFTER `national_id`,
  ADD COLUMN IF NOT EXISTS `father_name` VARCHAR(100) NULL AFTER `position`,
  ADD COLUMN IF NOT EXISTS `mobile` VARCHAR(50) NULL AFTER `father_name`,
  ADD COLUMN IF NOT EXISTS `email` VARCHAR(200) NULL AFTER `mobile`,
  ADD COLUMN IF NOT EXISTS `hire_date` DATE NULL AFTER `email`,
  ADD COLUMN IF NOT EXISTS `supervisor_name` VARCHAR(200) NULL AFTER `hire_date`;
