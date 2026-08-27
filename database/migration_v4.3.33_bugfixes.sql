-- Powerline Web v4.3.33
-- اصلاحات پایگاه داده مرتبط با باگ‌های نسخه 4.3.32

USE `sabadga2_Powerline`;

-- tower_type اکنون فقط «آویزی/کششی» است؛ مقدار خالی را به مقدار معتبر تبدیل می‌کنیم.
UPDATE `towers`
SET `tower_type` = 'آویزی'
WHERE `tower_type` IS NULL OR TRIM(`tower_type`) = '';

-- ساختار هر خط از پرتکرارترین ساختار دکل‌های فعال آن تعیین می‌شود.
-- اگر هیچ دکل فعالِ دارای ساختار وجود نداشته باشد، نتیجه NULL شده و مقدار قبلی خط پاک می‌شود.
UPDATE `lines` l
SET l.tower_structure = (
  SELECT t.tower_structure
  FROM `towers` t
  WHERE t.line_id = l.id
    AND t.is_active = 1
    AND t.tower_structure IS NOT NULL
    AND TRIM(t.tower_structure) <> ''
  GROUP BY t.tower_structure
  ORDER BY COUNT(*) DESC, t.tower_structure ASC
  LIMIT 1
),
l.updated_at = NOW();
