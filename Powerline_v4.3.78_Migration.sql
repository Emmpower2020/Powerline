-- ============================================================================
--  Powerline Web — مهاجرت دیتابیس نسخه 4.3.78
--  موضوع: امور بهره‌برداری + استانداردسازی ستون وضعیت (فعال/غیرفعال)
--
--  نحوه اجرا: در phpMyAdmin دیتابیس jibimar1_Powerline را انتخاب کنید،
--  تب SQL را باز کنید، کل این فایل را paste کرده و Go بزنید.
--
--  نکته‌ها:
--   * این اسکریپت فقط یک‌بار باید اجرا شود (MySQL ستون تکراری قبول نمی‌کند).
--   * داده‌های موجود حفظ می‌شوند؛ ردیف‌های فعلی جداول به «فعال» تنظیم می‌شوند
--     تا مشابه قبل قابل استفاده و قابل حذف نباشند. از این به بعد هر ثبت جدید
--     از داخل برنامه به‌صورت پیش‌فرض «غیرفعال» ایجاد می‌شود و با ویرایش گروهی
--     فعال می‌شود (سیاست امنیت داده).
--   * اگر خطایی با پیام Duplicate column داد یعنی آن بخش قبلاً اجرا شده؛
--     ادامهٔ بقیهٔ دستورات مهم است، لطفاً خطاهای «تکراری بودن ستون/ایندکس» را
--     نادیده بگیرید و بقیه را اجرا کنید.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- بخش ۱ — جدول «امور بهره‌برداری» (داده‌های پایه)
-- ۴ امور اولیه طبق قرارداد جاری ثبت می‌شوند (فعال تا در فرم‌ها قابل انتخاب باشند)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `districts` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_districts_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `districts` (`name`, `status`) VALUES
  ('کردستان', 'active'),
  ('ایلام', 'active'),
  ('کرمانشاه غربی', 'active'),
  ('کرمانشاه شرقی', 'active');

-- ----------------------------------------------------------------------------
-- بخش ۲ — ستون وضعیت استاندارد (فعال/غیرفعال) برای جداولی که نداشتند
-- ----------------------------------------------------------------------------

-- مدارها: اصلاً ستون وضعیت نداشت
ALTER TABLE `circuits`
  ADD COLUMN `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' AFTER `contract_id`,
  ADD INDEX `idx_circuits_status` (`status`);
-- ردیف‌های فعلی مدارها در حال استفاده‌اند → فعال (محافظت‌شده در برابر حذف)
UPDATE `circuits` SET `status` = 'active';

-- تجهیزات: فقط is_active عددی (0/1) داشت → ستون متنی استاندارد اضافه می‌شود
ALTER TABLE `equipment`
  ADD COLUMN `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' AFTER `warranty_expiry`,
  ADD INDEX `idx_equipment_status` (`status`);
-- مقدار اولیه از is_active منتقل می‌شود (داده از دست نمی‌رود)
UPDATE `equipment` SET `status` = IF(`is_active` = 1, 'active', 'inactive');

-- جداول گردش‌کاری: ستون status آنها «مرحلهٔ کار» است (پیش‌نویس/ارسال/تأیید و...)
-- بنابراین وضعیتِ فعال/غیرفعال در ستون جداگانهٔ activity_status نگه داشته می‌شود
ALTER TABLE `inspections`      ADD COLUMN `activity_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive', ADD INDEX `idx_inspections_activity` (`activity_status`);
ALTER TABLE `defects`          ADD COLUMN `activity_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive', ADD INDEX `idx_defects_activity` (`activity_status`);
ALTER TABLE `work_orders`      ADD COLUMN `activity_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive', ADD INDEX `idx_work_orders_activity` (`activity_status`);
ALTER TABLE `invoices`         ADD COLUMN `activity_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive', ADD INDEX `idx_invoices_activity` (`activity_status`);
ALTER TABLE `safety_incidents` ADD COLUMN `activity_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive', ADD INDEX `idx_safety_activity` (`activity_status`);
-- ردیف‌های موجود این جداول در حال استفاده‌اند → فعال
UPDATE `inspections`      SET `activity_status` = 'active';
UPDATE `defects`          SET `activity_status` = 'active';
UPDATE `work_orders`      SET `activity_status` = 'active';
UPDATE `invoices`         SET `activity_status` = 'active';
UPDATE `safety_incidents` SET `activity_status` = 'active';

-- ----------------------------------------------------------------------------
-- بخش ۳ — ستون «امور بهره‌برداری» برای جداول وابسته به قرارداد
-- (پیمانکار و قرارداد عمداً امور نمی‌گیرند: یک قرارداد می‌تواند چند امور را پوشش دهد)
-- ----------------------------------------------------------------------------
ALTER TABLE `lines`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_lines_district` (`district_id`),
  ADD CONSTRAINT `fk_lines_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `towers`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_towers_district` (`district_id`),
  ADD CONSTRAINT `fk_towers_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `circuits`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `status`,
  ADD INDEX `idx_circuits_district` (`district_id`),
  ADD CONSTRAINT `fk_circuits_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `personnel`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_personnel_district` (`district_id`),
  ADD CONSTRAINT `fk_personnel_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `equipment`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `status`,
  ADD INDEX `idx_equipment_district` (`district_id`),
  ADD CONSTRAINT `fk_equipment_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inspections`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_inspections_district` (`district_id`),
  ADD CONSTRAINT `fk_inspections_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `defects`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_defects_district` (`district_id`),
  ADD CONSTRAINT `fk_defects_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `work_orders`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_work_orders_district` (`district_id`),
  ADD CONSTRAINT `fk_work_orders_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `invoices`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_invoices_district` (`district_id`),
  ADD CONSTRAINT `fk_invoices_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `safety_incidents`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `contract_id`,
  ADD INDEX `idx_safety_district` (`district_id`),
  ADD CONSTRAINT `fk_safety_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- بخش ۴ — ستون «امور بهره‌برداری» برای جدول کاربران
--  امورِ هر کاربر تعیین می‌کند فقط داده‌های همان امور را ببیند.
--  مدیر برنامه (super_admin) اموری انتخاب نمی‌کند (NULL) و همهٔ امور را می‌بیند.
-- ----------------------------------------------------------------------------
ALTER TABLE `users`
  ADD COLUMN `district_id` bigint UNSIGNED DEFAULT NULL AFTER `organization_id`,
  ADD INDEX `idx_users_district` (`district_id`),
  ADD CONSTRAINT `fk_users_district` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- بخش ۵ — قرارداد: وضعیت چهارگانه (فعال / غیرفعال / پیش‌نویس / اتمام قرارداد)
--  مقادیر قدیمی expired و terminated و completed هر سه با عنوان «اتمام قرارداد»
--  نمایش داده می‌شوند؛ دادهٔ فعلی قراردادها بدون تغییر می‌ماند.
-- ----------------------------------------------------------------------------
ALTER TABLE `contracts`
  MODIFY COLUMN `status` ENUM('draft','active','inactive','expired','terminated','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive';

-- ----------------------------------------------------------------------------
-- بخش ۶ — نرمال‌سازی داده‌های قدیدی وضعیت (ارقام 1/0 و deactive → استاندارد متنی)
-- ----------------------------------------------------------------------------
UPDATE `personnel`     SET `status` = 'active'   WHERE `status` IN ('1','true');
UPDATE `personnel`     SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');
UPDATE `contractors`   SET `status` = 'active'   WHERE `status` IN ('1','true');
UPDATE `contractors`   SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');
UPDATE `lines`         SET `status` = 'active'   WHERE `status` IN ('1','true');
UPDATE `lines`         SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');
UPDATE `towers`        SET `status` = 'active'   WHERE `status` IN ('1','true');
UPDATE `towers`        SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');
UPDATE `users`         SET `status` = 'active'   WHERE `status` IN ('1','true');
UPDATE `users`         SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');
UPDATE `crews`         SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');
UPDATE `organization`  SET `status` = 'inactive' WHERE `status` IN ('0','false','deactive');

-- ----------------------------------------------------------------------------
-- بررسی نهایی — این SELECT ها باید بدون خطا اجرا شوند:
-- ----------------------------------------------------------------------------
-- SELECT name, status FROM districts;
-- SELECT COUNT(*) FROM circuits WHERE status = 'active';
-- SHOW COLUMNS FROM users LIKE 'district_id';
