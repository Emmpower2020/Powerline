-- v4.3.64
-- حذف personnel_type از جدول personnel؛ position تنها ستون سمت پرسنل است.
-- قبل از اجرا از دیتابیس Backup بگیرید.

ALTER TABLE `personnel`
  DROP COLUMN IF EXISTS `personnel_type`;
