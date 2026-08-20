-- Migration v1.2.2
-- اصلاح اشتباه v1.2.1: dispatch_code نباید UNIQUE باشد (چند خط می‌توانند dispatch_code مشترک داشته باشند)
-- فقط line_code باید UNIQUE باشد (که از قبل در schema هست)
-- اجرا روی دیتابیس sabadga2_Powerline

USE `sabadga2_Powerline`;

-- ============================================================
-- مرحله ۱: حذف UNIQUE INDEX از dispatch_code (اگه در v1.2.1 اضافه شده)
-- ============================================================
ALTER TABLE `lines`
  DROP INDEX IF EXISTS `idx_lines_dispatch_code_unique`;

-- ============================================================
-- مرحله ۲: اطمینان از یونیک بودن line_code (که باید از قبل UNIQUE باشه)
-- ابتدا بررسی می‌کنیم مقادیر تکراری وجود داره یا نه
-- ============================================================
SELECT line_code, COUNT(*) AS cnt, GROUP_CONCAT(id) AS line_ids
FROM `lines`
GROUP BY line_code
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- اگر خطای تکراری نبود، UNIQUE INDEX اضافه می‌کنیم (در غیر این صورت باید دستی پاک کنید)
-- 注意: این دستور فقط اگر UNIQUE INDEX وجود نداشته باشه اجرا می‌شه
-- SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS
--                      WHERE table_schema = DATABASE() AND table_name = 'lines'
--                      AND index_name = 'idx_lines_line_code_unique'),
--               'SELECT "UNIQUE INDEX already exists on line_code" AS msg',
--               'ALTER TABLE `lines` ADD UNIQUE INDEX `idx_lines_line_code_unique` (`line_code`)');
-- PREPARE stmt FROM @sql;
-- EXECUTE stmt;
-- DEALLOCATE PREPARE stmt;

-- برای امنیت، این رو دستی اجرا کنید:
ALTER TABLE `lines`
  DROP INDEX IF EXISTS `idx_lines_line_code_unique`;

ALTER TABLE `lines`
  ADD UNIQUE INDEX `idx_lines_line_code_unique` (`line_code`);

-- ============================================================
-- مرحله ۳: تأیید نهایی
-- ============================================================
SHOW INDEX FROM `lines` WHERE Key_name IN ('idx_lines_dispatch_code_unique', 'idx_lines_line_code_unique');

-- اطلاعات آماری
SELECT
    COUNT(*) AS total_lines,
    COUNT(DISTINCT line_code) AS distinct_line_codes,
    COUNT(DISTINCT dispatch_code) AS distinct_dispatch_codes
FROM `lines`;
