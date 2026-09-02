-- Powerline v4.3.64 – پاکسازی ستون‌های زائد جدول personnel
-- Backup بگیرید، سپس یک بار اجرا کنید.
-- ستون‌های حفظ‌شده: organization_id, personnel_type, mobile, hire_date
ALTER TABLE `personnel`
  DROP COLUMN `position`,
  DROP COLUMN `phone`,
  DROP COLUMN `collaboration_start`,
  DROP COLUMN `contract_end_date`;
