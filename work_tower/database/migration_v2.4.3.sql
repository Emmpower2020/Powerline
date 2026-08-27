-- Migration v2.4.3 — حذف ستون «نوع خط» (line_type) از جدول خطوط
-- اجرا در phpMyAdmin (دیتابیس Powerline)
-- ستون voltage_kv مبنای تفکیک/رنگ‌بندی است و نوع خط دیگر استفاده نمی‌شود

ALTER TABLE `lines` DROP COLUMN `line_type`;
