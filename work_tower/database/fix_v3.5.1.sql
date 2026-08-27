-- =====================================================================
-- اصلاحیه v3.5.1 — ۲ بخش، هر دو قابل اجرای مجدد (idempotent)
--   ۱) پاک‌سازی کوتیشن‌های اضافه در جدول conductors (باگ import اولیه)
--   ۲) افزودن permission های ماژول‌های بدون کنترل دسترسی + گرنت اولیه به نقش‌ها
-- اجرا در phpMyAdmin روی دیتابیس sabadga2_Powerline
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- بخش ۱: پاک‌سازی کوتیشن — داده‌ها با '''Fox''' درج شده بودند یعنی مقدار
-- واقعی در دیتابیس 'Fox' (با کوتیشن) است. نمایش، جستجو، merge فرم خطوط
-- و bulk-import بر اساس نام همه خراب بودند.
-- ─────────────────────────────────────────────────────────────────────

-- ۱-۱) حذف ردیف‌های تکراری احتمالی (اگر هر دو شکل 'Fox' و Fox وجود داشته باشند،
--      کوچک‌ترین id می‌ماند تا بعد از trim با محدودیت UNIQUE تداخل نکنیم)
DELETE c1 FROM conductors c1
JOIN conductors c2
  ON TRIM(BOTH '\'' FROM c1.name) = TRIM(BOTH '\'' FROM c2.name)
 AND c1.id > c2.id;

-- ۱-۲) حذف کوتیشن از ابتدا و انتهای همه ستون‌های متنی
UPDATE conductors SET
  name               = TRIM(BOTH '\'' FROM name),
  type               = TRIM(BOTH '\'' FROM type),
  type_code          = TRIM(BOTH '\'' FROM type_code),
  standard           = TRIM(BOTH '\'' FROM standard),
  core_type          = TRIM(BOTH '\'' FROM core_type),
  material_outer     = TRIM(BOTH '\'' FROM material_outer),
  material_inner     = TRIM(BOTH '\'' FROM material_inner),
  stranding_outer    = TRIM(BOTH '\'' FROM stranding_outer),
  stranding_inner    = TRIM(BOTH '\'' FROM stranding_inner),
  diameter_code_all  = TRIM(BOTH '\'' FROM diameter_code_all),
  diameter_code_inner= TRIM(BOTH '\'' FROM diameter_code_inner)
WHERE name LIKE '''%'''
   OR type LIKE '''%'''
   OR type_code LIKE '''%'''
   OR standard LIKE '''%'''
   OR core_type LIKE '''%'''
   OR material_outer LIKE '''%'''
   OR material_inner LIKE '''%'''
   OR stranding_outer LIKE '''%'''
   OR stranding_inner LIKE '''%'''
   OR diameter_code_all LIKE '''%'''
   OR diameter_code_inner LIKE '''%''';

-- ۱-۳) یکسان‌سازی استاندارد (Bs → BS)
UPDATE conductors SET standard = 'BS'  WHERE standard IN ('Bs', 'bs', 'british');
UPDATE conductors SET standard = 'ASTM' WHERE standard IN ('astm', 'AsTm');

-- ۱-۴) بررسی نتیجه — باید ۱۵ ردیف بدون کوتیشن باشد
SELECT id, name, standard, sectional_area_all FROM conductors ORDER BY sectional_area_all;

-- ─────────────────────────────────────────────────────────────────────
-- بخش ۲: permission های ماژول‌های بدون کنترل دسترسی (v3.5.1)
-- تا قبل از این نسخه route های پرسنل/سیم‌ها/مدارها/پیمانکاران/تجهیزات/
-- فهرست قیمت/چک‌لیست/اکیپ هیچ permission ی چک نمی‌کردند. حالا PHP با
-- requirePermissionSoft کنترل می‌کند: اگر permission تعریف شده باشد اعمال
-- می‌شود (وگرنه مجاز). این دستورها permission ها را تعریف می‌کنند تا از
-- همین الان اعمال شوند؛ نقش super_admin همیشه همه دسترسی‌ها را دارد.
-- INSERT IGNORE چون permissions.name یکتا است — اجرای مجدد امن
-- ─────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO `permissions` (`name`, `display_name`, `module`, `description`) VALUES
('personnel.view',    'مشاهده پرسنل',        'personnel',    'مشاهده فهرست پرسنل'),
('personnel.create',  'ایجاد/درج پرسنل',     'personnel',    'ایجاد پرسنل و درج انبوه'),
('personnel.update',  'ویرایش پرسنل',        'personnel',    'ویرایش اطلاعات پرسنل'),
('personnel.delete',  'حذف پرسنل',           'personnel',    'حذف پرسنل و حذف انبوه'),
('conductors.view',   'مشاهده انواع سیم',    'conductors',   'مشاهده فهرست سیم‌ها'),
('conductors.create', 'ایجاد/درج سیم',       'conductors',   'ایجاد سیم و درج انبوه'),
('conductors.update', 'ویرایش سیم',          'conductors',   'ویرایش سیم'),
('conductors.delete', 'حذف سیم',             'conductors',   'حذف سیم و حذف انبوه'),
('circuits.view',     'مشاهده مدارها',       'circuits',     'مشاهده فهرست مدارها'),
('circuits.create',   'ایجاد/درج مدار',      'circuits',     'ایجاد مدار و درج انبوه'),
('circuits.update',   'ویرایش مدار',         'circuits',     'ویرایش مدار'),
('circuits.delete',   'حذف مدار',            'circuits',     'حذف مدار و حذف انبوه'),
('contractors.view',  'مشاهده پیمانکاران',   'contractors',  'مشاهده فهرست پیمانکاران'),
('contractors.create','ایجاد پیمانکار',      'contractors',  'ایجاد پیمانکار'),
('contractors.update','ویرایش پیمانکار',     'contractors',  'ویرایش پیمانکار'),
('contractors.delete','حذف پیمانکار',        'contractors',  'حذف پیمانکار'),
('equipment.view',    'مشاهده تجهیزات',      'equipment',    'مشاهده تجهیزات و کلاس‌ها'),
('equipment.create',  'ایجاد تجهیز',         'equipment',    'ایجاد تجهیز'),
('equipment.update',  'ویرایش تجهیز',        'equipment',    'ویرایش تجهیز'),
('equipment.delete',  'حذف تجهیز',           'equipment',    'حذف تجهیز'),
('price_lists.view',  'مشاهده فهرست قیمت',   'price_lists',  'مشاهده فهرست‌های قیمت'),
('price_lists.create','ایجاد قلم قیمت',      'price_lists',  'ایجاد فهرست/قلم قیمت'),
('price_lists.delete','حذف قلم قیمت',        'price_lists',  'حذف قلم فهرست قیمت'),
('checklists.view',   'مشاهده چک‌لیست‌ها',   'checklists',   'مشاهده قالب‌های چک‌لیست'),
('checklists.create', 'ایجاد چک‌لیست',       'checklists',   'ایجاد قالب چک‌لیست'),
('crews.view',        'مشاهده اکیپ‌ها',      'crews',        'مشاهده فهرست اکیپ‌ها'),
('crews.create',      'ایجاد اکیپ',          'crews',        'ایجاد اکیپ');

-- گرنت اولیه به نقش‌های موجود (تا کاربران فعلی پس از اجرا بدون دردسر کار کنند):
--   manager (۲)      → مشاهده همه ماژول‌های جدید
--   gis_specialist(۴)→ سیم‌ها و مدارها (کامل)
--   contract_mgr (۶) → پیمانکاران و فهرست قیمت (کامل)
--   maintenance_mgr(۳)→ مشاهده پرسنل و اکیپ
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 2, p.id FROM permissions p WHERE p.module IN ('personnel','conductors','circuits','contractors','equipment','price_lists','checklists','crews') AND p.name LIKE '%.view';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 4, p.id FROM permissions p WHERE p.module IN ('conductors','circuits');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 6, p.id FROM permissions p WHERE p.module IN ('contractors','price_lists');
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 3, p.id FROM permissions p WHERE p.name IN ('personnel.view','crews.view');
