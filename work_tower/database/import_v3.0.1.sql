-- مهاجرت v3.0.1 — اصلاح نسخه v3.0.0
--
-- رفع خطای #1452 (Cannot add or update a child row: fk_pers_org):
-- ستون organization_id در personnel نوع NOT NULL با کلید خارجی به organization است
-- و در INSERT های نسخه قبل ارسال نشده بود.
--
-- ✅ این فایل جایگزین import_v3.0.0.sql است و هر دو کار را یکجا انجام می‌دهد.
-- ✅ اگر ALTER قبلاً اجرا شده، دوباره اجرا شدنش بی‌ضرر است.
-- ✅ اگر INSERT قبلاً با موفقیت انجام شده، ردیف‌های تکراری پاک و دوباره درج می‌شوند.
--
-- نکته: organization_id = 4 یعنی «واحد خطوط انتقال» (از جدول organization فعلی).
-- اگر می‌خواهید پرسنل زیر سازمان دیگری ثبت شوند، این عدد را تغییر دهید.

ALTER TABLE `personnel`
  MODIFY `personnel_type` ENUM('employee','contractor','operator','guard','manager','line_expert','safety_expert','crew_supervisor','lineman','driver') NOT NULL DEFAULT 'employee';

-- پاکسازی import خراب قبلی (۱۵۷ ردیف با نوع خالی) + ردیف‌های احتمالی تکراری از تلاش مجدد
DELETE FROM `personnel` WHERE `personnel_type` = '' AND `personnel_code` LIKE 'P-1%';
DELETE FROM `personnel` WHERE `personnel_code` IN ('P-2001','P-2002','P-2003','P-2004','P-2005','P-2006','P-2007','P-2008');

-- درج پرسنل از اکسل Persons.xlsx — با organization_id (واحد خطوط انتقال = 4)
INSERT INTO `personnel` (`organization_id`, `personnel_code`, `first_name`, `last_name`, `national_id`, `father_name`, `personnel_type`, `position`, `mobile`, `supervisor_name`, `collaboration_start`, `is_active`, `created_at`) VALUES
(4, 'P-2001', 'یادگار', 'میری', '3333333330', 'مراد', 'crew_supervisor', 'سرپرست اکیپ', '09189356966', 'هادی توحیدی', '1404/02/01', 1, NOW()),
(4, 'P-2002', 'محسن', 'ذهبی', '3333333331', 'مراد', 'crew_supervisor', 'سرپرست اکیپ', '09189356966', 'هادی توحیدی', '1404/02/02', 1, NOW()),
(4, 'P-2003', 'رضا', 'قاسمی', '3333333332', 'مراد', 'crew_supervisor', 'سرپرست اکیپ', '09189356966', 'هادی توحیدی', '1404/02/03', 1, NOW()),
(4, 'P-2004', 'علی', 'نورآیند', '3333333333', 'مراد', 'crew_supervisor', 'سرپرست اکیپ', '09189356966', 'هادی توحیدی', '1404/02/04', 1, NOW()),
(4, 'P-2005', 'مجتبی', 'ملک خطابی', '3333333334', 'مراد', 'lineman', 'سیمبان', '09189356966', 'رضا قاسمی', '1404/02/05', 1, NOW()),
(4, 'P-2006', 'نامدار', 'شهیدی', '3333333335', 'مراد', 'lineman', 'سیمبان', '09189356966', 'رضا قاسمی', '1404/02/06', 1, NOW()),
(4, 'P-2007', 'ساسان', 'امیری', '3333333336', 'مراد', 'line_expert', 'کارشناس خط', '09189356966', 'هادی توحیدی', '1404/02/07', 1, NOW()),
(4, 'P-2008', 'رامین', 'رشیدی', '3333333337', 'مراد', 'line_expert', 'کارشناس خط', '09189356966', 'هادی توحیدی', '1404/02/08', 1, NOW());

-- بررسی نتیجه
SELECT `personnel_code`, `first_name`, `last_name`, `personnel_type`, `position` FROM `personnel` WHERE `personnel_code` LIKE 'P-200%';
