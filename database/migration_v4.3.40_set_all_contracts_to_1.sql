-- Powerline Web v4.3.40
-- انتقال همه رکوردهای دارای قرارداد به قرارداد شماره ۱
--
-- این Migration فقط جداول عملیاتی دارای contract_id را تغییر می‌دهد.
-- جدول conductors (انواع سیم) عمداً در آن نیست.
-- جداول مرجع مثل contractors / tower_structures / tower_type_codes نیز قرارداد ندارند.
-- قبل از اجرا مطمئن شوید قرارداد ID=1 وجود دارد.

SET @db := DATABASE();
SET @contract_1_exists := (SELECT COUNT(*) FROM `contracts` WHERE `id` = 1);
SELECT IF(@contract_1_exists = 1,
          'OK: قرارداد شماره ۱ موجود است.',
          'هشدار: قرارداد شماره ۱ وجود ندارد؛ هیچ رکوردی تغییر نخواهد کرد.') AS `precheck`;

-- اگر قرارداد ۱ وجود نداشته باشد، UPDATEها به‌صورت شرطی هیچ رکوردی را تغییر نمی‌دهند.
START TRANSACTION;

UPDATE `lines` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `towers` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `circuits` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `personnel` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `equipment` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `inspections` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `defects` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `work_orders` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `safety_incidents` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `price_lists` SET `contract_id` = 1 WHERE @contract_1_exists = 1;
UPDATE `invoices` SET `contract_id` = 1 WHERE @contract_1_exists = 1;

-- ردیف‌های رابطه‌ای فهرست‌بها نیز در صورت داشتن رکورد مستقل، به قرارداد ۱ منتقل شوند.
UPDATE `contract_price_list_items` SET `contract_id` = 1 WHERE @contract_1_exists = 1;

COMMIT;

-- گزارش تعداد رکوردهای منتقل‌شده
SELECT
  (SELECT COUNT(*) FROM `lines` WHERE contract_id = 1) AS lines_count,
  (SELECT COUNT(*) FROM `towers` WHERE contract_id = 1) AS towers_count,
  (SELECT COUNT(*) FROM `circuits` WHERE contract_id = 1) AS circuits_count,
  (SELECT COUNT(*) FROM `personnel` WHERE contract_id = 1) AS personnel_count,
  (SELECT COUNT(*) FROM `equipment` WHERE contract_id = 1) AS equipment_count,
  (SELECT COUNT(*) FROM `inspections` WHERE contract_id = 1) AS inspections_count,
  (SELECT COUNT(*) FROM `defects` WHERE contract_id = 1) AS defects_count,
  (SELECT COUNT(*) FROM `work_orders` WHERE contract_id = 1) AS work_orders_count,
  (SELECT COUNT(*) FROM `safety_incidents` WHERE contract_id = 1) AS safety_incidents_count,
  (SELECT COUNT(*) FROM `price_lists` WHERE contract_id = 1) AS price_lists_count,
  (SELECT COUNT(*) FROM `invoices` WHERE contract_id = 1) AS invoices_count,
  (SELECT COUNT(*) FROM `contract_price_list_items` WHERE contract_id = 1) AS contract_price_list_items_count;
