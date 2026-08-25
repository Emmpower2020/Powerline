-- Migration v1.2.0
-- 1) حذف ستون‌های construction_date و commission_date از جدول lines
-- 2) افزودن UNIQUE INDEX روی dispatch_code (با مقادیر NULL قابل قبول)
-- 3) اجرا روی دیتابیس sabadga2_Powerline

USE `sabadga2_Powerline`;

-- 1) حذف ستون‌های تاریخ
ALTER TABLE `lines`
  DROP COLUMN IF EXISTS `construction_date`,
  DROP COLUMN IF EXISTS `commission_date`;

-- 2) افزودن unique index روی dispatch_code
-- در MariaDB/MySQL، UNIQUE index با مقادیر NULL متعدد مشکلی ندارد
-- (NULL می‌تونه چند بار تکرار بشه ولی مقدار غیر NULL باید یکتا باشه)
ALTER TABLE `lines`
  DROP INDEX IF EXISTS `idx_lines_dispatch_code_unique`;

ALTER TABLE `lines`
  ADD UNIQUE INDEX `idx_lines_dispatch_code_unique` (`dispatch_code`);

-- 3) نمایش ساختار جدید برای تأیید
SHOW COLUMNS FROM `lines` WHERE Field IN ('construction_date', 'commission_date', 'dispatch_code');
SHOW INDEX FROM `lines` WHERE Key_name = 'idx_lines_dispatch_code_unique';
