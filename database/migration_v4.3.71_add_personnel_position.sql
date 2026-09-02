-- v4.3.71: بازگرداندن ستون «سمت» به جدول پرسنل
-- این ستون در برخی نسخه‌های دیتابیس حذف شده بود؛ بدون آن سمت پرسنل ذخیره نمی‌شود.
-- اجرا در phpMyAdmin (دیتابیس jibimar1_Powerline → SQL → اجرای متن زیر):
ALTER TABLE `personnel` ADD COLUMN `position` VARCHAR(200) NULL DEFAULT NULL AFTER `father_name`;
