-- Migration v1.2.1
-- حل مشکل duplicate dispatch_code و افزودن UNIQUE INDEX
-- اجرا روی دیتابیس sabadga2_Powerline

USE `sabadga2_Powerline`;

-- ============================================================
-- مرحله ۱: لیست مقادیر dispatch_code تکراری (برای بررسی دستی)
-- ============================================================
SELECT dispatch_code, COUNT(*) AS cnt, GROUP_CONCAT(id) AS line_ids
FROM `lines`
WHERE dispatch_code IS NOT NULL AND dispatch_code != ''
GROUP BY dispatch_code
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- ============================================================
-- مرحله ۲: پاک کردن مقادیر تکراری dispatch_code
-- استراتژی: برای هر گروه تکراری، اولین رکورد (با id کمتر) dispatch_code خود را نگه می‌داریم
-- بقیه را NULL می‌کنیم تا dispatch_code یکتا بشه
-- ============================================================

-- روش: آپدیت dispatch_code به NULL برای ردیف‌هایی که dispatch_code تکراری دارن (بجز اولین رکورد هر گروه)
UPDATE `lines` l
JOIN (
    SELECT id
    FROM (
        SELECT
            id,
            dispatch_code,
            ROW_NUMBER() OVER (PARTITION BY dispatch_code ORDER BY id ASC) AS rn
        FROM `lines`
        WHERE dispatch_code IS NOT NULL AND dispatch_code != ''
    ) t
    WHERE rn > 1
) dup ON l.id = dup.id
SET l.dispatch_code = NULL;

-- ============================================================
-- مرحله ۳: حذف ستون‌های construction_date و commission_date
-- ============================================================
ALTER TABLE `lines`
  DROP COLUMN IF EXISTS `construction_date`,
  DROP COLUMN IF EXISTS `commission_date`;

-- ============================================================
-- مرحله ۴: افزودن UNIQUE INDEX روی dispatch_code
-- حالا که مقادیر تکراری پاک شدند، این دستور بدون خطا اجرا می‌شه
-- ============================================================
ALTER TABLE `lines`
  DROP INDEX IF EXISTS `idx_lines_dispatch_code_unique`;

ALTER TABLE `lines`
  ADD UNIQUE INDEX `idx_lines_dispatch_code_unique` (`dispatch_code`);

-- ============================================================
-- مرحله ۵: تأیید نهایی
-- ============================================================
-- نمایش ساختار جدید
SHOW COLUMNS FROM `lines` WHERE Field IN ('construction_date', 'commission_date', 'dispatch_code');

-- نمایش index جدید
SHOW INDEX FROM `lines` WHERE Key_name = 'idx_lines_dispatch_code_unique';

-- نمایش آمار dispatch_code (NULLها و مقادیر یکتا)
SELECT
    COUNT(*) AS total,
    COUNT(dispatch_code) AS non_null,
    SUM(CASE WHEN dispatch_code IS NULL THEN 1 ELSE 0 END) AS null_count,
    COUNT(DISTINCT dispatch_code) AS distinct_count
FROM `lines`;
