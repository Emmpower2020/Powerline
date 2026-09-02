-- ============================================================================
--  پلتفرم مدیریت دارایی و تعمیرات خطوط انتقال و فوق‌انتقال برق
--  Power Lines Asset & Maintenance Management Platform (EAM/CMMS)
--
--  Database: MySQL 8.0+ (یا MariaDB 10.5+)
--  Charset:  utf8mb4 / utf8mb4_unicode_ci
--  Engine:    InnoDB (برای پشتیبانی از foreign keys و transaction)
--
--  توجه ۱: این فایل تمام جداول لازم برای کل سیستم رو ایجاد می‌کنه.
--  توجه ۲: کدهای GIS با POINT/LINESTRING هستند (MySQL 8+ به‌صورت بومی).
--  توجه ۳: در صورت استفاده از PostgreSQL، نوع GEOMETRY رو جایگزین کنید.
--  توجه ۴: در انتهای فایل، داده‌های پیش‌فرض (seed) قرار داره.
--
--  اجرا: در phpMyAdmin یا خط فرمان MySQL کل این فایل رو اجرا کنید.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'NO_ENGINE_SUBSTITUTION';

-- ============================================================================
--  بخش ۱: سازمان (Organization)
--  سلسله‌مراتب: شرکت > منطقه > مدیریت > واحد
-- ============================================================================

-- ۱.۱) جدول شرکت‌ها / مناطق / مدیریت‌ها / واحدها (سلسله‌مراتب درختی)
CREATE TABLE IF NOT EXISTS `organization` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `parent_id`     BIGINT UNSIGNED NULL,                          -- والد (NULL برای ریشه)
    `org_type`      ENUM('company','region','management','unit') NOT NULL,
    `name`          VARCHAR(200) NOT NULL,
    `code`          VARCHAR(50)  NULL UNIQUE,                      -- کد اختصاصی
    `phone`         VARCHAR(50)  NULL,
    `address`       VARCHAR(500) NULL,
    `description`   TEXT NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_org_parent` (`parent_id`),
    INDEX `idx_org_type`   (`org_type`),
    INDEX `idx_org_status` (`status`),
    CONSTRAINT `fk_org_parent`
        FOREIGN KEY (`parent_id`) REFERENCES `organization`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۲: کاربران و دسترسی‌ها (Identity & RBAC)
-- ============================================================================

-- ۲.۱) جدول کاربران
CREATE TABLE IF NOT EXISTS `users` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `organization_id` BIGINT UNSIGNED NULL,
    `telegram_id`     BIGINT NULL UNIQUE,                          -- برای اپلیکیشن اندروید/تلگرام
    `username`        VARCHAR(100) NOT NULL UNIQUE,
    `password_hash`   VARCHAR(255) NOT NULL,                       -- bcrypt/argon2
    `full_name`       VARCHAR(200) NOT NULL,
    `email`           VARCHAR(200) NULL,
    `phone`           VARCHAR(50)  NULL,
    `avatar_url`      VARCHAR(500) NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `last_login_at`   TIMESTAMP NULL,
    `failed_attempts` INT NOT NULL DEFAULT 0,
    `locked_until`    TIMESTAMP NULL,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_user_org`  (`organization_id`),
    INDEX `idx_user_status`  (`status`),
    CONSTRAINT `fk_user_org`
        FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲.۲) جدول نقش‌ها (Roles)
CREATE TABLE IF NOT EXISTS `roles` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(100) NOT NULL UNIQUE,
    `display_name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `is_system`   TINYINT(1) NOT NULL DEFAULT 0,                    -- نقش‌های سیستمی قابل حذف نیستن
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲.۳) نقش-کاربر
CREATE TABLE IF NOT EXISTS `user_roles` (
    `user_id`     BIGINT UNSIGNED NOT NULL,
    `role_id`     INT    UNSIGNED NOT NULL,
    `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `assigned_by` BIGINT UNSIGNED NULL,
    PRIMARY KEY (`user_id`, `role_id`),
    CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲.۴) دسترسی‌ها (Permissions)
CREATE TABLE IF NOT EXISTS `permissions` (
    `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`         VARCHAR(150) NOT NULL UNIQUE,                    -- مثلا: line.create, defect.view
    `display_name` VARCHAR(200) NOT NULL,
    `module`       VARCHAR(50)  NOT NULL,                          -- خطوط، عیوب، تعمیرات، ایمنی، ...
    `description`  TEXT NULL,
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲.۵) دسترسی-نقش
CREATE TABLE IF NOT EXISTS `role_permissions` (
    `role_id`       INT UNSIGNED NOT NULL,
    `permission_id` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`role_id`, `permission_id`),
    CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_rp_perm` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲.۶) توکن‌های احراز هویت (JWT refresh tokens / API tokens)
CREATE TABLE IF NOT EXISTS `auth_tokens` (
    `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id`      BIGINT UNSIGNED NOT NULL,
    `token_hash`   VARCHAR(255) NOT NULL,
    `device_info`  VARCHAR(500) NULL,
    `ip_address`   VARCHAR(45)  NULL,
    `expires_at`   TIMESTAMP NOT NULL,
    `revoked`      TINYINT(1) NOT NULL DEFAULT 0,
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_at_user`  (`user_id`),
    INDEX `idx_at_exp`   (`expires_at`),
    INDEX `idx_at_revoke`(`revoked`),
    CONSTRAINT `fk_at_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲.۷) تنظیمات کاربر (User Preferences)
CREATE TABLE IF NOT EXISTS `user_settings` (
    `user_id`     BIGINT UNSIGNED PRIMARY KEY,
    `language`    VARCHAR(10)  NOT NULL DEFAULT 'fa',
    `theme`       ENUM('light','dark','auto') NOT NULL DEFAULT 'light',
    `map_type`    VARCHAR(50)  NULL DEFAULT 'satellite',
    `notifications_email` TINYINT(1) NOT NULL DEFAULT 1,
    `notifications_push`  TINYINT(1) NOT NULL DEFAULT 1,
    `pagination_size`     INT NOT NULL DEFAULT 20,
    `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_us_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۳: پرسنل (Personnel) و پیمانکاران (Contractors)
-- ============================================================================

-- ۳.۱) پرسنل داخلی
CREATE TABLE IF NOT EXISTS `personnel` (
    `id`               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `organization_id`  BIGINT UNSIGNED NOT NULL,
    `user_id`          BIGINT UNSIGNED NULL,                       -- اگه به کاربر سیستم متصل باشه
    `contract_id`      BIGINT UNSIGNED NULL,                       -- قرارداد
    `personnel_code`   VARCHAR(50) NOT NULL UNIQUE,
    `first_name`       VARCHAR(100) NOT NULL,
    `last_name`        VARCHAR(100) NOT NULL,
    `national_id`      VARCHAR(20)  NULL,                          -- کد ملی
    `position`         VARCHAR(200) NULL,
    `father_name`      VARCHAR(100) NULL,
    `mobile`           VARCHAR(50)  NULL,
    `email`            VARCHAR(200) NULL,
    `hire_date`        DATE NULL,
    `supervisor_name`  VARCHAR(200) NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_pers_org`  (`organization_id`),
    INDEX `idx_pers_user` (`user_id`),
    CONSTRAINT `fk_pers_org`  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_pers_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۳.۲) پیمانکاران (Contractors)
CREATE TABLE IF NOT EXISTS `contractors` (
    `id`               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `contractor_code`  VARCHAR(50)  NULL UNIQUE,
    `contractor_name`  VARCHAR(200) NOT NULL,
    `ceo_name`         VARCHAR(200) NULL,
    `contractor_phone` VARCHAR(50)  NULL,
    `mobile`           VARCHAR(50)  NULL,
    `address`          VARCHAR(500) NULL,
    `status`           VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_cont_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۳.۳) اکیپ‌های کاری (Crews/Teams)
CREATE TABLE IF NOT EXISTS `crews` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `contractor_id`  BIGINT UNSIGNED NULL,
    `organization_id` BIGINT UNSIGNED NOT NULL,
    `name`            VARCHAR(200) NOT NULL,
    `crew_code`       VARCHAR(50)  NULL UNIQUE,
    `supervisor_id`   BIGINT UNSIGNED NULL,                        -- سرپرست اکیپ (personnel.id)
    `vehicle_id`      VARCHAR(50)  NULL,                            -- شماره خودرو
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_crew_cont` (`contractor_id`),
    INDEX `idx_crew_org`  (`organization_id`),
    CONSTRAINT `fk_crew_cont` FOREIGN KEY (`contractor_id`) REFERENCES `contractors`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_crew_org`  FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۳.۴) اعضای اکیپ (Crew Members)
CREATE TABLE IF NOT EXISTS `crew_members` (
    `crew_id`      BIGINT UNSIGNED NOT NULL,
    `personnel_id` BIGINT UNSIGNED NOT NULL,
    `role_in_crew` VARCHAR(100) NULL,                               -- نقش در اکیپ
    `joined_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `left_at`      TIMESTAMP NULL,
    PRIMARY KEY (`crew_id`, `personnel_id`),
    CONSTRAINT `fk_cm_crew` FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_cm_pers` FOREIGN KEY (`personnel_id`) REFERENCES `personnel`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۳.۵) گواهینامه‌ها و مجوزهای پرسنل
CREATE TABLE IF NOT EXISTS `personnel_certificates` (
    `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `personnel_id`   BIGINT UNSIGNED NOT NULL,
    `certificate_name` VARCHAR(200) NOT NULL,
    `issuer`         VARCHAR(200) NULL,
    `issue_date`     DATE NULL,
    `expiry_date`    DATE NULL,
    `document_url`   VARCHAR(500) NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_pc_pers` FOREIGN KEY (`personnel_id`) REFERENCES `personnel`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۴: خطوط انتقال (Lines) و GIS
-- ============================================================================

-- ۴.۱) خطوط انتقال
CREATE TABLE IF NOT EXISTS `lines` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `line_code`       VARCHAR(50)  NOT NULL UNIQUE,                -- کد خط
    `name`            VARCHAR(200) NOT NULL,
    `voltage_kv`      DECIMAL(10,2) NULL,                          -- ولتاژ کیلوولت
    `circuit_count`   INT NOT NULL DEFAULT 1,                      -- تعداد مدار
    `conductor_type`  VARCHAR(100) NULL,                            -- نوع سیم هادی
    `length_km`       DECIMAL(10,3) NULL,                          -- طول کیلومتر
    `origin_substation_id` BIGINT UNSIGNED NULL,                    -- پست مبدا
    `dest_substation_id`   BIGINT UNSIGNED NULL,                    -- پست مقصد
    `owner_org_id`    BIGINT UNSIGNED NULL,
    `contractor_id`   BIGINT UNSIGNED NULL,                        -- پیمانکار نگهداری
    `contract_id`     BIGINT UNSIGNED NULL,                        -- قرارداد
    `geom`            LINESTRING NOT NULL,                            -- هندسه خط (GIS) - هنگام INSERT مقدار خالی بدید: ST_GeomFromText('LINESTRING EMPTY()')
    `construction_date` DATE NULL,
    `commission_date` DATE NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    SPATIAL INDEX `idx_line_geom` (`geom`),
    INDEX `idx_line_code`  (`line_code`),
    INDEX `idx_line_owner` (`owner_org_id`),
    INDEX `idx_line_cont`  (`contractor_id`),
    CONSTRAINT `fk_line_owner` FOREIGN KEY (`owner_org_id`) REFERENCES `organization`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_line_cont`  FOREIGN KEY (`contractor_id`) REFERENCES `contractors`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۴.۲) دکل‌ها (Towers)
CREATE TABLE IF NOT EXISTS `towers` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `line_id`         BIGINT UNSIGNED NOT NULL,
    `contract_id`     BIGINT UNSIGNED NULL,                        -- قرارداد
    `tower_code`      VARCHAR(50) NOT NULL,                        -- کد دکل
    `tower_number`    INT NULL,                                     -- شماره دکل
    `tower_type`      VARCHAR(20) NOT NULL,                              -- نوع دکل: کششی / آویزی
     `tower_structure` VARCHAR(100) NULL,                              -- ساختار دکل
     `tower_type_code` VARCHAR(20) NULL,                               -- کد نوع دکل
    `insulator_type`  VARCHAR(100) NULL,                            -- نوع مقره
    `gps_lat`         DECIMAL(10,7) NULL,                           -- عرض جغرافیایی
    `gps_lng`         DECIMAL(10,7) NULL,                           -- طول جغرافیایی
    `geom`            POINT NOT NULL,                                  -- هندسه نقطه (GIS) - هنگام INSERT مقدار خالی بدید: ST_GeomFromText('POINT EMPTY')
    `altitude_m`      DECIMAL(7,2) NULL,                            -- ارتفاع از سطح دریا
    `construction_date` DATE NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    SPATIAL INDEX `idx_tower_geom` (`geom`),
    UNIQUE KEY `uniq_line_tower` (`line_id`, `tower_code`),
    INDEX `idx_tower_line` (`line_id`),
    INDEX `idx_tower_type` (`tower_type`),
    CONSTRAINT `fk_tower_line` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۴.۳) ریزخطوط کیلومتری (Line Kilometer Posts)
CREATE TABLE IF NOT EXISTS `line_kilometer_posts` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `line_id`         BIGINT UNSIGNED NOT NULL,
    `km`              DECIMAL(10,3) NOT NULL,
    `gps_lat`         DECIMAL(10,7) NULL,
    `gps_lng`         DECIMAL(10,7) NULL,
    `geom`            POINT NOT NULL,
    `description`     VARCHAR(500) NULL,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_line_km` (`line_id`, `km`),
    SPATIAL INDEX `idx_kp_geom` (`geom`),
    CONSTRAINT `fk_kp_line` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۴.۴) کریدورهای معابر (Corridors)
CREATE TABLE IF NOT EXISTS `corridors` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `line_id`         BIGINT UNSIGNED NULL,
    `name`            VARCHAR(200) NOT NULL,
    `corridor_type`   VARCHAR(100) NULL,
    `geom`            LINESTRING NOT NULL,                            -- هندسه کریدور (GIS)
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    SPATIAL INDEX `idx_cor_geom` (`geom`),
    CONSTRAINT `fk_cor_line` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۵: تجهیزات (Equipment) و کلاس‌ها
-- ============================================================================

-- ۵.۱) گروه‌های تجهیزات (Equipment Classes)
CREATE TABLE IF NOT EXISTS `equipment_classes` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `parent_id`     INT UNSIGNED NULL,
    `name`          VARCHAR(200) NOT NULL,
    `code`          VARCHAR(50)  NULL UNIQUE,
    `description`   TEXT NULL,
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ec_parent` FOREIGN KEY (`parent_id`) REFERENCES `equipment_classes`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۵.۲) تجهیزات نصب‌شده روی دکل‌ها
CREATE TABLE IF NOT EXISTS `equipment` (
    `id`               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `equipment_class_id` INT UNSIGNED NOT NULL,
    `tower_id`         BIGINT UNSIGNED NULL,
    `line_id`          BIGINT UNSIGNED NULL,
    `contract_id`      BIGINT UNSIGNED NULL,                       -- قرارداد
    `serial_number`    VARCHAR(100) NULL,
    `manufacturer`     VARCHAR(200) NULL,
    `model`            VARCHAR(200) NULL,
    `install_date`     DATE NULL,
    `warranty_expiry`  DATE NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_eq_class` (`equipment_class_id`),
    INDEX `idx_eq_tower` (`tower_id`),
    INDEX `idx_eq_line`  (`line_id`),
    CONSTRAINT `fk_eq_class` FOREIGN KEY (`equipment_class_id`) REFERENCES `equipment_classes`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_eq_tower` FOREIGN KEY (`tower_id`) REFERENCES `towers`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_eq_line`  FOREIGN KEY (`line_id`)  REFERENCES `lines`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۶: بازدیدها (Inspections) و چک‌لیست‌ها
-- ============================================================================

-- ۶.۱) قالب چک‌لیست‌ها
CREATE TABLE IF NOT EXISTS `checklist_templates` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`          VARCHAR(200) NOT NULL,
    `description`   TEXT NULL,
    `applies_to`    ENUM('line','tower','equipment','all') NOT NULL DEFAULT 'tower',
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۶.۲) آیتم‌های چک‌لیست
CREATE TABLE IF NOT EXISTS `checklist_items` (
    `id`                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `template_id`         BIGINT UNSIGNED NOT NULL,
    `parent_item_id`      BIGINT UNSIGNED NULL,
    `order_index`         INT NOT NULL DEFAULT 0,
    `question`            VARCHAR(500) NOT NULL,
    `answer_type`         ENUM('yes_no','ok_defect','number','text','single_choice','multi_choice','photo_required','gps','date','signature') NOT NULL,
    `choices`             JSON NULL,                                -- گزینه‌ها برای single/multi_choice
    `is_required`         TINYINT(1) NOT NULL DEFAULT 0,
    `is_conditional`     TINYINT(1) NOT NULL DEFAULT 0,
    `condition_logic`    JSON NULL,                                 -- منطق شرطی (مثلا: if Q1=defect then show Q2)
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    INDEX `idx_ci_tpl`    (`template_id`),
    INDEX `idx_ci_parent` (`parent_item_id`),
    CONSTRAINT `fk_ci_tpl`    FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_ci_parent` FOREIGN KEY (`parent_item_id`) REFERENCES `checklist_items`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۶.۳) بازدیدها (Inspections)
CREATE TABLE IF NOT EXISTS `inspections` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `inspection_code` VARCHAR(50) NOT NULL UNIQUE,
    `line_id`         BIGINT UNSIGNED NULL,
    `tower_id`        BIGINT UNSIGNED NULL,
    `contract_id`     BIGINT UNSIGNED NULL,                        -- قرارداد
    `template_id`     BIGINT UNSIGNED NULL,
    `inspector_id`    BIGINT UNSIGNED NOT NULL,                    -- personnel.id
    `crew_id`         BIGINT UNSIGNED NULL,
    `inspection_date` DATE NOT NULL,
    `start_time`      TIME NULL,
    `end_time`        TIME NULL,
    `gps_lat`         DECIMAL(10,7) NULL,
    `gps_lng`         DECIMAL(10,7) NULL,
    `status`          ENUM('draft','in_progress','submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
    `priority`        ENUM('routine','emergency','follow_up','commissioning') NOT NULL DEFAULT 'routine',
    `weather`         VARCHAR(100) NULL,
    `notes`           TEXT NULL,
    `submitted_at`    TIMESTAMP NULL,
    `approved_at`     TIMESTAMP NULL,
    `approved_by`     BIGINT UNSIGNED NULL,                        -- users.id
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_ins_line`  (`line_id`),
    INDEX `idx_ins_tower` (`tower_id`),
    INDEX `idx_ins_status`(`status`),
    INDEX `idx_ins_date`  (`inspection_date`),
    INDEX `idx_inspector` (`inspector_id`),
    CONSTRAINT `fk_ins_line`   FOREIGN KEY (`line_id`)      REFERENCES `lines`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_ins_tower`  FOREIGN KEY (`tower_id`)     REFERENCES `towers`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_ins_tpl`    FOREIGN KEY (`template_id`)  REFERENCES `checklist_templates`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_inspector`  FOREIGN KEY (`inspector_id`) REFERENCES `personnel`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_ins_crew`  FOREIGN KEY (`crew_id`)      REFERENCES `crews`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_ins_approver` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۶.۴) پاسخ‌های چک‌لیست در هر بازدید
CREATE TABLE IF NOT EXISTS `inspection_answers` (
    `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `inspection_id`  BIGINT UNSIGNED NOT NULL,
    `checklist_item_id` BIGINT UNSIGNED NOT NULL,
    `answer_value`   VARCHAR(1000) NULL,
    `answer_numeric` DECIMAL(15,3) NULL,
    `is_defect`      TINYINT(1) NOT NULL DEFAULT 0,
    `defect_severity` ENUM('low','medium','high','critical') NULL,
    `notes`          TEXT NULL,
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_ia_ins`  (`inspection_id`),
    INDEX `idx_ia_item` (`checklist_item_id`),
    INDEX `idx_ia_defect` (`is_defect`),
    CONSTRAINT `fk_ia_ins`  FOREIGN KEY (`inspection_id`)     REFERENCES `inspections`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_ia_item` FOREIGN KEY (`checklist_item_id`)  REFERENCES `checklist_items`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۷: عیوب (Defects)
--  این بخش بر اساس فایل اکسل "اشکالات.xlsx" طراحی شده
-- ============================================================================

-- ۷.۱) دسته‌بندی عیوب (بر اساس ۳۱ شیت فایل اکسل)
CREATE TABLE IF NOT EXISTS `defect_categories` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`          VARCHAR(200) NOT NULL,                         -- مثلا: عیوب بدنه دکل فلزی مشبک مهاری
    `applies_to`    ENUM('tower','line','equipment') NOT NULL DEFAULT 'tower',
    `tower_type`    VARCHAR(20) NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۷.۲) تعریف عیوب (کاتالوگ عیوب از اکسل)
CREATE TABLE IF NOT EXISTS `defect_definitions` (
    `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `category_id`    INT UNSIGNED NOT NULL,
    `defect_code`    INT NOT NULL,                                  -- کد عیب از اکسل
    `title`          VARCHAR(500) NOT NULL,
    `description`    TEXT NULL,
    `default_priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    `default_severity` ENUM('minor','major','critical') NOT NULL DEFAULT 'minor',
    `safety_risk`    ENUM('none','low','medium','high') NOT NULL DEFAULT 'none',
    `repair_required` TINYINT(1) NOT NULL DEFAULT 1,
    `estimated_repair_hours` DECIMAL(5,2) NULL,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_defect_cat_code` (`category_id`, `defect_code`),
    INDEX `idx_dd_cat` (`category_id`),
    INDEX `idx_dd_code`(`defect_code`),
    CONSTRAINT `fk_dd_cat` FOREIGN KEY (`category_id`) REFERENCES `defect_categories`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۷.۳) عیوب ثبت‌شده در بازدیدها
CREATE TABLE IF NOT EXISTS `defects` (
    `id`                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `defect_code`       VARCHAR(50) NOT NULL UNIQUE,                -- کد رهگیری عیب
    `inspection_id`     BIGINT UNSIGNED NULL,                       -- بازدیدی که ازش کشف شده
    `checklist_answer_id` BIGINT UNSIGNED NULL,
    `defect_definition_id` BIGINT UNSIGNED NULL,
    `line_id`           BIGINT UNSIGNED NULL,
    `tower_id`          BIGINT UNSIGNED NULL,
    `contract_id`      BIGINT UNSIGNED NULL,                       -- قرارداد
    `equipment_id`      BIGINT UNSIGNED NULL,
    `title`             VARCHAR(500) NOT NULL,
    `description`       TEXT NULL,
    `defect_type`       VARCHAR(200) NULL,
    `severity`          ENUM('minor','major','critical') NOT NULL DEFAULT 'minor',
    `priority`          ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    `safety_risk`       ENUM('none','low','medium','high') NOT NULL DEFAULT 'none',
    `status`            ENUM('new','approved','in_progress','repaired','verified','deferred','rejected','cancelled') NOT NULL DEFAULT 'new',
    `discovered_by`     BIGINT UNSIGNED NOT NULL,                  -- personnel.id
    `discovered_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `approved_by`       BIGINT UNSIGNED NULL,                       -- users.id
    `approved_at`       TIMESTAMP NULL,
    `repaired_by`       BIGINT UNSIGNED NULL,                       -- personnel.id
    `repaired_at`       TIMESTAMP NULL,
    `verified_by`       BIGINT UNSIGNED NULL,
    `verified_at`      TIMESTAMP NULL,
    `gps_lat`          DECIMAL(10,7) NULL,
    `gps_lng`          DECIMAL(10,7) NULL,
    `location_desc`    VARCHAR(500) NULL,
    `notes`            TEXT NULL,
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_def_status`   (`status`),
    INDEX `idx_def_priority`  (`priority`),
    INDEX `idx_def_severity`  (`severity`),
    INDEX `idx_def_line`      (`line_id`),
    INDEX `idx_def_tower`     (`tower_id`),
    INDEX `idx_def_discover`  (`discovered_by`),
    INDEX `idx_def_date`      (`discovered_at`),
    CONSTRAINT `fk_def_ins`     FOREIGN KEY (`inspection_id`)  REFERENCES `inspections`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_ca`      FOREIGN KEY (`checklist_answer_id`) REFERENCES `inspection_answers`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_dd`      FOREIGN KEY (`defect_definition_id`) REFERENCES `defect_definitions`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_line`   FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_tower`  FOREIGN KEY (`tower_id`) REFERENCES `towers`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_eq`     FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_disc`  FOREIGN KEY (`discovered_by`) REFERENCES `personnel`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_def_approver` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_rep`    FOREIGN KEY (`repaired_by`) REFERENCES `personnel`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_def_ver`    FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۷.۴) تاریخچه تغییرات وضعیت عیب
CREATE TABLE IF NOT EXISTS `defect_status_history` (
    `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `defect_id`   BIGINT UNSIGNED NOT NULL,
    `from_status` ENUM('new','approved','in_progress','repaired','verified','deferred','rejected','cancelled') NULL,
    `to_status`   ENUM('new','approved','in_progress','repaired','verified','deferred','rejected','cancelled') NOT NULL,
    `changed_by`  BIGINT UNSIGNED NOT NULL,
    `comment`     TEXT NULL,
    `changed_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_dsh_defect` (`defect_id`),
    CONSTRAINT `fk_dsh_def` FOREIGN KEY (`defect_id`) REFERENCES `defects`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_dsh_user` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۸: تعمیرات (Maintenance) و Work Order
-- ============================================================================

-- ۸.۱) دستورکار تعمیرات
CREATE TABLE IF NOT EXISTS `work_orders` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `wo_code`         VARCHAR(50) NOT NULL UNIQUE,                  -- شماره دستورکار
    `defect_id`       BIGINT UNSIGNED NULL,                         -- عیبی که باعث شده
    `line_id`         BIGINT UNSIGNED NULL,
    `tower_id`        BIGINT UNSIGNED NULL,
    `crew_id`         BIGINT UNSIGNED NULL,
    `contractor_id`   BIGINT UNSIGNED NULL,
    `contract_id`      BIGINT UNSIGNED NULL,                       -- قرارداد
    `title`           VARCHAR(500) NOT NULL,
    `description`     TEXT NULL,
    `priority`        ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    `status`          ENUM('draft','assigned','in_progress','on_hold','completed','cancelled','verified') NOT NULL DEFAULT 'draft',
    `planned_start`   TIMESTAMP NULL,
    `planned_end`     TIMESTAMP NULL,
    `actual_start`    TIMESTAMP NULL,
    `actual_end`      TIMESTAMP NULL,
    `equipment_used`  TEXT NULL,
    `materials_used`  TEXT NULL,
    `safety_permit_no` VARCHAR(100) NULL,
    `outage_required` TINYINT(1) NOT NULL DEFAULT 0,
    `created_by`      BIGINT UNSIGNED NOT NULL,
    `assigned_to`     BIGINT UNSIGNED NULL,                          -- personnel.id مسئول
    `approved_by`     BIGINT UNSIGNED NULL,
    `closed_by`       BIGINT UNSIGNED NULL,
    `notes`           TEXT NULL,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_wo_status`   (`status`),
    INDEX `idx_wo_priority`(`priority`),
    INDEX `idx_wo_crew`    (`crew_id`),
    INDEX `idx_wo_dates`   (`planned_start`, `planned_end`),
    CONSTRAINT `fk_wo_def`    FOREIGN KEY (`defect_id`) REFERENCES `defects`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_line`  FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_tower` FOREIGN KEY (`tower_id`) REFERENCES `towers`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_crew`  FOREIGN KEY (`crew_id`) REFERENCES `crews`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_cont`  FOREIGN KEY (`contractor_id`) REFERENCES `contractors`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_assignee` FOREIGN KEY (`assigned_to`) REFERENCES `personnel`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_approver` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_wo_closer`   FOREIGN KEY (`closed_by`)   REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۸.۲) عملیات تعمیر (Maintenance Tasks)
CREATE TABLE IF NOT EXISTS `maintenance_tasks` (
    `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `work_order_id`   BIGINT UNSIGNED NOT NULL,
    `task_name`       VARCHAR(300) NOT NULL,
    `description`     TEXT NULL,
    `estimated_hours` DECIMAL(5,2) NULL,
    `actual_hours`    DECIMAL(5,2) NULL,
    `is_completed`    TINYINT(1) NOT NULL DEFAULT 0,
    `completed_at`   TIMESTAMP NULL,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_mt_wo` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۹: قراردادها (Contracts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `contracts` (
    `id`                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `contract_code`    VARCHAR(100) NOT NULL UNIQUE,
    `title`            VARCHAR(500) NOT NULL,
    `contractor_id`    BIGINT UNSIGNED NOT NULL,
    `organization_id`  BIGINT UNSIGNED NULL,
    `contract_type`    ENUM('maintenance','construction','inspection','consulting','supply') NOT NULL,
    `start_date`       DATE NOT NULL,
    `end_date`         DATE NOT NULL,
    `amount`           DECIMAL(18,2) NOT NULL DEFAULT 0,
    `currency`         VARCHAR(10) NOT NULL DEFAULT 'IRR',
    `status`           ENUM('draft','active','expired','terminated','completed') NOT NULL DEFAULT 'draft',
    `document_url`     VARCHAR(500) NULL,
    `notes`            TEXT NULL,
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_cont_contractor` (`contractor_id`),
    INDEX `idx_cont_status`     (`status`),
    INDEX `idx_cont_dates`       (`start_date`, `end_date`),
    CONSTRAINT `fk_contractor`   FOREIGN KEY (`contractor_id`)   REFERENCES `contractors`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_contract_org` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۰: فهرست بها (Price List)
-- ============================================================================

-- ۱۰.۱) فهرست‌های بها
CREATE TABLE IF NOT EXISTS `price_lists` (
    `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`           VARCHAR(200) NOT NULL,
    `version`        VARCHAR(50) NULL,
    `effective_date` DATE NOT NULL,
    `contract_id`     BIGINT UNSIGNED NULL,                       -- قرارداد
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۱۰.۲) اقلام فهرست بها
CREATE TABLE IF NOT EXISTS `price_list_items` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `price_list_id` BIGINT UNSIGNED NOT NULL,
    `code`          VARCHAR(50) NOT NULL,
    `title`         VARCHAR(500) NOT NULL,
    `unit`          VARCHAR(50) NULL,                              -- واحد (متر، عدد، ...)
    `unit_price`    DECIMAL(18,2) NOT NULL DEFAULT 0,
    `category`      VARCHAR(200) NULL,                             -- عملیات، کالا، بازدید
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    UNIQUE KEY `uniq_pli_code` (`price_list_id`, `code`),
    CONSTRAINT `fk_pli_pl` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۱۰.۳) اقلام فهرست بهای قرارداد
CREATE TABLE IF NOT EXISTS `contract_price_list_items` (
    `id`                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `contract_id`       BIGINT UNSIGNED NOT NULL,
    `price_list_item_id` BIGINT UNSIGNED NULL,
    `code`              VARCHAR(50) NOT NULL,
    `title`             VARCHAR(500) NOT NULL,
    `unit`              VARCHAR(50) NULL,
    `unit_price`        DECIMAL(18,2) NOT NULL,
    `quantity`          DECIMAL(15,3) NULL,
    `category`          VARCHAR(200) NULL,
    UNIQUE KEY `uniq_cpli_contract_code` (`contract_id`, `code`),
    CONSTRAINT `fk_cpli_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_cpli_pli` FOREIGN KEY (`price_list_item_id`) REFERENCES `price_list_items`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۱: ایمنی (Safety)
-- ============================================================================

-- ۱۱.۱) تجهیزات ایمنی فردی (PPE)
CREATE TABLE IF NOT EXISTS `safety_equipment` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`          VARCHAR(200) NOT NULL,
    `code`          VARCHAR(50)  NULL UNIQUE,
    `status`        VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۱۱.۲) حوادث و Near Miss
CREATE TABLE IF NOT EXISTS `safety_incidents` (
    `id`                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `incident_code`     VARCHAR(50) NOT NULL UNIQUE,
    `incident_type`     ENUM('accident','near_miss','unsafe_act','unsafe_condition','environmental') NOT NULL,
    `severity`          ENUM('none','minor','moderate','serious','fatal') NOT NULL DEFAULT 'none',
    `title`             VARCHAR(500) NOT NULL,
    `description`       TEXT NULL,
    `occurred_at`       TIMESTAMP NOT NULL,
    `location_lat`      DECIMAL(10,7) NULL,
    `location_lng`      DECIMAL(10,7) NULL,
    `location_desc`     VARCHAR(500) NULL,
    `line_id`           BIGINT UNSIGNED NULL,
    `tower_id`          BIGINT UNSIGNED NULL,
    `work_order_id`     BIGINT UNSIGNED NULL,
    `contract_id`       BIGINT UNSIGNED NULL,                       -- قرارداد
    `involved_personnel` JSON NULL,                                 -- آرایه‌ای از personnel.id
    `reporter_id`       BIGINT UNSIGNED NOT NULL,
    `status`            ENUM('reported','under_investigation','resolved','closed') NOT NULL DEFAULT 'reported',
    `root_cause`        TEXT NULL,
    `corrective_actions` TEXT NULL,
    `preventive_actions` TEXT NULL,
    `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_si_type` (`incident_type`),
    INDEX `idx_si_status` (`status`),
    INDEX `idx_si_date` (`occurred_at`),
    CONSTRAINT `fk_si_line` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_si_tower` FOREIGN KEY (`tower_id`) REFERENCES `towers`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_si_wo` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_si_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۱۱.۳) چک‌لیست ایمنی هر بازدید/دستورکار
CREATE TABLE IF NOT EXISTS `safety_checklists` (
    `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `related_type`   ENUM('inspection','work_order') NOT NULL,
    `related_id`     BIGINT UNSIGNED NOT NULL,
    `ppe_used`       JSON NULL,                                     -- لیست تجهیزات ایمنی استفاده‌شده
    `is_safe`        TINYINT(1) NOT NULL DEFAULT 0,
    `hazard_identified` TEXT NULL,
    `signed_by`      BIGINT UNSIGNED NULL,
    `signed_at`      TIMESTAMP NULL,
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_sc_rel` (`related_type`, `related_id`),
    CONSTRAINT `fk_sc_user` FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۲: مالی و صورت‌وضعیت (Financial)
-- ============================================================================

-- ۱۲.۱) صورت‌وضعیت
CREATE TABLE IF NOT EXISTS `invoices` (
    `id`                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `invoice_code`     VARCHAR(50) NOT NULL UNIQUE,
    `contract_id`      BIGINT UNSIGNED NOT NULL,
    `contractor_id`    BIGINT UNSIGNED NOT NULL,
    `period_start`     DATE NOT NULL,
    `period_end`       DATE NOT NULL,
    `total_amount`     DECIMAL(18,2) NOT NULL DEFAULT 0,
    `tax_amount`       DECIMAL(18,2) NOT NULL DEFAULT 0,
    `final_amount`     DECIMAL(18,2) NOT NULL DEFAULT 0,
    `status`          ENUM('draft','submitted','reviewed','approved','paid','rejected') NOT NULL DEFAULT 'draft',
    `submitted_at`    TIMESTAMP NULL,
    `approved_at`     TIMESTAMP NULL,
    `approved_by`     BIGINT UNSIGNED NULL,
    `paid_at`         TIMESTAMP NULL,
    `notes`           TEXT NULL,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_inv_contract`  (`contract_id`),
    INDEX `idx_inv_status`    (`status`),
    INDEX `idx_inv_period`    (`period_start`, `period_end`),
    CONSTRAINT `fk_inv_contract`  FOREIGN KEY (`contract_id`)   REFERENCES `contracts`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_inv_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_inv_approver` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۱۲.۲) اقلام صورت‌وضعیت
CREATE TABLE IF NOT EXISTS `invoice_items` (
    `id`                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `invoice_id`        BIGINT UNSIGNED NOT NULL,
    `work_order_id`     BIGINT UNSIGNED NULL,
    `price_list_item_id` BIGINT UNSIGNED NULL,
    `description`       VARCHAR(500) NOT NULL,
    `unit`              VARCHAR(50) NULL,
    `quantity`          DECIMAL(15,3) NOT NULL,
    `unit_price`        DECIMAL(18,2) NOT NULL,
    `total_price`       DECIMAL(18,2) NOT NULL,
    INDEX `idx_ii_inv`  (`invoice_id`),
    INDEX `idx_ii_wo`   (`work_order_id`),
    CONSTRAINT `fk_ii_inv` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_ii_wo`  FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_ii_pli` FOREIGN KEY (`price_list_item_id`) REFERENCES `price_list_items`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۳: تصاویر و فایل‌ها
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attachments` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `related_type`  ENUM('inspection','defect','work_order','tower','line','safety','invoice','user') NOT NULL,
    `related_id`    BIGINT UNSIGNED NOT NULL,
    `file_name`     VARCHAR(500) NOT NULL,
    `file_path`     VARCHAR(1000) NOT NULL,                          -- مسیر ذخیره‌سازی
    `file_url`      VARCHAR(1000) NULL,                             -- URL قابل دسترس
    `file_size`     BIGINT NULL,                                    -- بایت
    `mime_type`     VARCHAR(100) NULL,
    `image_type`    ENUM('before','after','defect','location','other','signature') NULL,
    `gps_lat`       DECIMAL(10,7) NULL,
    `gps_lng`       DECIMAL(10,7) NULL,
    `taken_at`      TIMESTAMP NULL,
    `uploaded_by`   BIGINT UNSIGNED NOT NULL,
    `uploaded_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_att_rel` (`related_type`, `related_id`),
    INDEX `idx_att_user` (`uploaded_by`),
    CONSTRAINT `fk_att_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۴: اعلان‌ها (Notifications)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `notifications` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id`       BIGINT UNSIGNED NOT NULL,
    `title`         VARCHAR(500) NOT NULL,
    `body`          TEXT NULL,
    `type`          ENUM('info','warning','error','success','defect','work_order','approval','safety','system') NOT NULL DEFAULT 'info',
    `related_type`  VARCHAR(50) NULL,
    `related_id`    BIGINT UNSIGNED NULL,
    `is_read`       TINYINT(1) NOT NULL DEFAULT 0,
    `read_at`       TIMESTAMP NULL,
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_not_user` (`user_id`),
    INDEX `idx_not_read` (`is_read`),
    INDEX `idx_not_type` (`type`),
    CONSTRAINT `fk_not_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۵: لاگ ممیزی (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `audit_log` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id`       BIGINT UNSIGNED NULL,
    `action`        VARCHAR(100) NOT NULL,                           -- create, update, delete, login, ...
    `entity_type`   VARCHAR(100) NULL,                              -- خط، عیب، تعمیر، ...
    `entity_id`     BIGINT UNSIGNED NULL,
    `old_values`    JSON NULL,
    `new_values`    JSON NULL,
    `ip_address`    VARCHAR(45) NULL,
    `user_agent`    VARCHAR(500) NULL,
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_audit_user`   (`user_id`),
    INDEX `idx_audit_action` (`action`),
    INDEX `idx_audit_entity` (`entity_type`, `entity_id`),
    INDEX `idx_audit_date`   (`created_at`),
    CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  بخش ۱۶: تنظیمات سیستم
-- ============================================================================

CREATE TABLE IF NOT EXISTS `system_settings` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key`           VARCHAR(100) NOT NULL UNIQUE,
    `value`         TEXT NULL,
    `description`   VARCHAR(500) NULL,
    `updated_by`    BIGINT UNSIGNED NULL,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ss_user` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
--  بخش ۱۷: داده‌های پیش‌فرض (Seed Data)
-- ============================================================================

-- ۱۷.۱) نقش‌های پیش‌فرض
INSERT INTO `roles` (`name`, `display_name`, `description`, `is_system`) VALUES
('super_admin',       'مدیر ارشد سیستم',       'دسترسی کامل به همه ماژول‌ها', 1),
('manager',           'مدیر',                   'مشاهده داشبورد و گزارش‌ها', 1),
('maintenance_mgr',   'مدیر تعمیرات',           'مدیریت بازدید‌ها و عیوب', 1),
('gis_specialist',    'کارشناس GIS',            'مدیریت خطوط، دکل‌ها و نقشه', 1),
('safety_officer',    'کارشناس ایمنی',           'مدیریت اطلاعات ایمنی', 1),
('contract_mgr',      'کارشناس قراردادها',      'مدیریت قراردادها و پیمانکاران', 1),
('financial',         'کارشناس مالی',           'صورت‌وضعیت و پرداخت‌ها', 1),
('contractor',        'پیمانکار',                'ثبت بازدید و عملیات', 1),
('inspector',         'بازرس',                   'ثبت بازدید و عیوب', 1),
('operator',          'اپراتور',                 'دسترسی محدود به ثبت اطلاعات', 1);

-- ۱۷.۲) دسترسی‌های اولیه (به‌صورت ماژول-عمل)
INSERT INTO `permissions` (`name`, `display_name`, `module`, `description`) VALUES
-- ماژول کاربران
('users.view',         'مشاهده کاربران',         'users',    'مشاهده لیست کاربران'),
('users.create',       'ایجاد کاربر',           'users',    'ایجاد کاربر جدید'),
('users.update',       'ویرایش کاربر',          'users',    'ویرایش اطلاعات کاربر'),
('users.delete',       'حذف کاربر',             'users',    'حذف کاربر'),
-- ماژول خطوط
('lines.view',         'مشاهده خطوط',           'lines',    'مشاهده لیست خطوط'),
('lines.create',       'ایجاد خط',              'lines',    'ایجاد خط جدید'),
('lines.update',       'ویرایش خط',             'lines',    'ویرایش اطلاعات خط'),
('lines.delete',       'حذف خط',                'lines',    'حذف خط'),
-- ماژول دکل‌ها
('towers.view',        'مشاهده دکل‌ها',          'towers',   'مشاهده لیست دکل‌ها'),
('towers.create',      'ایجاد دکل',             'towers',   'ایجاد دکل جدید'),
('towers.update',      'ویرایش دکل',            'towers',   'ویرایش اطلاعات دکل'),
('towers.delete',      'حذف دکل',               'towers',   'حذف دکل'),
-- ماژول بازدید
('inspections.view',   'مشاهده بازدیدها',       'inspections', 'مشاهده لیست بازدیدها'),
('inspections.create', 'ثبت بازدید',            'inspections', 'ثبت بازدید جدید'),
('inspections.update', 'ویرایش بازدید',         'inspections', 'ویرایش بازدید'),
('inspections.delete', 'حذف بازدید',            'inspections', 'حذف بازدید'),
('inspections.approve','تأیید بازدید',          'inspections', 'تأیید بازدید ثبت‌شده'),
-- ماژول عیوب
('defects.view',       'مشاهده عیوب',           'defects',  'مشاهده لیست عیوب'),
('defects.create',     'ثبت عیب',               'defects',  'ثبت عیب جدید'),
('defects.update',     'ویرایش عیب',            'defects',  'ویرایش عیب'),
('defects.delete',     'حذف عیب',               'defects',  'حذف عیب'),
('defects.approve',    'تأیید عیب',             'defects',  'تأیید عیب جدید'),
('defects.verify',     'راستی‌آزمایی عیب',       'defects',  'تأیید رفع عیب'),
-- ماژول تعمیرات
('maintenance.view',   'مشاهده دستورکارها',     'maintenance', 'مشاهده دستورکارهای تعمیر'),
('maintenance.create', 'ایجاد دستورکار',        'maintenance', 'ایجاد دستورکار جدید'),
('maintenance.update', 'ویرایش دستورکار',       'maintenance', 'ویرایش دستورکار'),
('maintenance.delete', 'حذف دستورکار',          'maintenance', 'حذف دستورکار'),
('maintenance.assign', 'اختصاص دستورکار',       'maintenance', 'اختصاص دستورکار به اکیپ'),
('maintenance.close',  'بستن دستورکار',         'maintenance', 'بستن دستورکار تکمیل‌شده'),
-- ماژول ایمنی
('safety.view',        'مشاهده ایمنی',           'safety',   'مشاهده اطلاعات ایمنی'),
('safety.create',     'ثبت حادثه',              'safety',   'ثبت حادثه/Near Miss'),
('safety.update',     'ویرایش حادثه',           'safety',   'ویرایش حادثه'),
('safety.delete',     'حذف حادثه',              'safety',   'حذف حادثه'),
-- ماژول قراردادها
('contracts.view',     'مشاهده قراردادها',      'contracts', 'مشاهده قراردادها'),
('contracts.create',   'ایجاد قرارداد',          'contracts', 'ایجاد قرارداد جدید'),
('contracts.update',   'ویرایش قرارداد',         'contracts', 'ویرایش قرارداد'),
('contracts.delete',   'حذف قرارداد',            'contracts', 'حذف قرارداد'),
-- ماژول مالی
('financial.view',     'مشاهده مالی',            'financial', 'مشاهده صورت‌وضعیت‌ها'),
('financial.create',   'ایجاد صورت‌وضعیت',       'financial', 'ایجاد صورت‌وضعیت'),
('financial.update',   'ویرایش صورت‌وضعیت',      'financial', 'ویرایش صورت‌وضعیت'),
('financial.approve',  'تأیید صورت‌وضعیت',       'financial', 'تأیید صورت‌وضعیت'),
('financial.pay',       'پرداخت',                'financial', 'ثبت پرداختی'),
-- ماژول گزارش‌ها
('reports.view',       'مشاهده گزارش‌ها',        'reports',  'مشاهده گزارش‌ها'),
('reports.export',     'خروجی گزارش',           'reports',  'خروجی Excel/PDF از گزارش‌ها'),
-- ماژول تنظیمات
('settings.view',      'مشاهده تنظیمات',         'settings', 'مشاهده تنظیمات سیستم'),
('settings.update',    'ویرایش تنظیمات',         'settings', 'ویرایش تنظیمات سیستم'),
-- ماژول GIS
('gis.view',           'مشاهده نقشه',            'gis',      'مشاهده نقشه GIS'),
('gis.edit',           'ویرایش نقشه',            'gis',      'ویرایش لایه‌های نقشه'),
('gis.export',         'خروجی GIS',              'gis',      'خروجی اطلاعات GIS');

-- ۱۷.۳) نقش super_admin همه دسترسی‌ها رو داره
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
WHERE r.name = 'super_admin';

-- ۱۷.۴) دسترسی‌های نقش manager
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
WHERE r.name = 'manager' AND p.name IN (
    'users.view', 'lines.view', 'towers.view', 'inspections.view',
    'defects.view', 'maintenance.view', 'safety.view', 'contracts.view',
    'financial.view', 'reports.view', 'reports.export', 'gis.view'
);

-- ۱۷.۵) دسترسی‌های نقش inspector
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
WHERE r.name = 'inspector' AND p.name IN (
    'lines.view', 'towers.view', 'inspections.view', 'inspections.create',
    'inspections.update', 'defects.view', 'defects.create', 'defects.update',
    'safety.view', 'gis.view'
);

-- ۱۷.۶) دسترسی‌های نقش contractor
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
WHERE r.name = 'contractor' AND p.name IN (
    'lines.view', 'towers.view', 'inspections.view', 'inspections.create',
    'defects.view', 'maintenance.view', 'maintenance.update',
    'safety.view', 'safety.create', 'financial.view', 'gis.view'
);

-- ۱۷.۷) دسته‌بندی عیوب (بر اساس ۳۱ شیت فایل اکسل)
INSERT INTO `defect_categories` (`name`, `applies_to`, `tower_type`) VALUES
('عیوب بدنه دکل فلزی مشبک مهاری',     'tower', 'lattice_steel'),
('عیوب بدنه تیر چوبی',                 'tower', 'wood'),
('عیوب بدنه تیر بتنی',                 'tower', 'concrete'),
('عیوب بدنه دکل تلسکوپی بتنی',         'tower', 'concrete_tele'),
('عیوب بدنه دکل تلسکوپی فلزی',         'tower', 'steel_tele'),
('عیوب زنجیر مقره‌ها',                 'tower', 'all'),
('عیوب یراق‌آلات',                      'tower', 'all'),
('عیوب جمپر',                          'tower', 'all'),
('عیوب فوندانسیون و پایه',             'tower', 'all'),
('عیوب سیستم زمین دکل',                'tower', 'all'),
('عیوب دیوار حفاظتی دکل',              'tower', 'all'),
('عیوب تابلو دکل',                     'tower', 'all'),
('عیوب نقض حریم',                      'tower', 'all'),
('عیوب برقگیر خط',                     'tower', 'all'),
('عیوب سیم هادی فاز R',                'tower', 'all'),
('عیوب سیم هادی فاز S',                'tower', 'all'),
('عیوب سیم هادی فاز T',                'tower', 'all'),
('عیوب یراق‌آلات هادی فاز R',          'tower', 'all'),
('عیوب یراق‌آلات هادی فاز S',          'tower', 'all'),
('عیوب یراق‌آلات هادی فاز T',          'tower', 'all'),
('عیوب اسپیسر بین فازی',               'tower', 'all'),
('عیوب سیم محافظ',                     'tower', 'all'),
('عیوب یراق‌آلات سیم محافظ',           'tower', 'all'),
('عیب در جاده دسترسی به محل دکل',      'tower', 'all');

-- ۱۷.۸) تنظیمات پیش‌فرض سیستم
INSERT INTO `system_settings` (`key`, `value`, `description`) VALUES
('app_name',             'سیستم مدیریت خطوط انتقال برق',  'نام برنامه'),
('app_version',          '1.0.0',                          'نسخه برنامه'),
('default_language',     'fa',                             'زبان پیش‌فرض'),
('default_timezone',     'Asia/Tehran',                    'منطقه زمانی پیش‌فرض'),
('pagination_default',   '20',                             'تعداد آیتم در هر صفحه'),
('upload_max_size_mb',   '20',                             'حداکثر حجم فایل آپلود (MB)'),
('allowed_image_types',  'jpg,jpeg,png,webp',              'فرمت‌های مجاز تصویر'),
('allowed_doc_types',    'pdf,doc,docx,xls,xlsx',          'فرمت‌های مجاز سند'),
('jwt_expiration_hours', '24',                             'مدت اعتبار توکن JWT'),
('password_min_length',  '8',                              'حداقل طول رمز عبور'),
('session_timeout_min',  '30',                             'مدت عدم فعالیت قبل از خروج (دقیقه)'),
('map_default_center_lat', '35.6892',                      'عرض جغرافیایی مرکز نقشه پیش‌فرض'),
('map_default_center_lng', '51.3890',                      'طول جغرافیایی مرکز نقشه پیش‌فرض'),
('map_default_zoom',     '7',                              'زوم پیش‌فرض نقشه'),
('backup_enabled',       '1',                              'فعال بودن بکاپ خودکار'),
('backup_frequency_hours', '24',                           'بازه بکاپ خودکار (ساعت)');

-- ۱۷.۹) گروه تجهیزات نمونه
INSERT INTO `equipment_classes` (`name`, `code`, `description`) VALUES
('مقره‌ها',         'INSULATOR', 'انواع مقره‌های شیشه‌ای، پلیمری و سرامیکی'),
('برقگیرها',        'ARRESTER',  'تجهیزات حفاظت از اضافه ولتاژ'),
('یراق‌آلات',        'FITTING',   'انواع یراق‌آلات خطوط انتقال'),
('سیم هادی',        'CONDUCTOR', 'سیم‌های هادی فاز و محافظ'),
('اسپیسر',          'SPACER',    'اسپیسرهای بین فازی'),
('کلید‌ها',         'SWITCH',     'کلیدهای خطوط انتقال'),
('ترانسفورماتور',   'TRANSFORMER', 'ترانسفورماتورهای جریان و ولتاژ'),
('خازن‌ها',         'CAPACITOR',  'خازن‌های سری و موازی'),
('تجهیزات کنترل',   'CONTROL',    'تجهیزات کنترل و مانیتورینگ'),
('ساختار فلزی',     'STRUCTURE',  'ساختارهای فلزی دکل‌ها'),
('فوندانسیون',      'FOUNDATION', 'فوندانسیون‌های دکل‌ها'),
('سیستم ارت',       'EARTHING',   'سیستم‌های ارتینگ'),
('دیوار حفاظتی',    'WALL',        'دیوارهای حفاظتی دور دکل'),
('تابلو',           'SIGN',        'تابلوهای هشدار و نشانه'),
('خار ضد پرنده',    'BIRD_GUARD',  'خارهای ضد پرنده'),
('خار ضد صعود',     'CLIMB_GUARD', 'خارهای ضد صعود غیرمجاز');

-- ============================================================================
--  پایان اسکریپت
--  تعداد جداول: ۳۲
--  تعداد نقش‌ها: ۱۰
--  تعداد دسترسی‌ها: ۴۵+
--  تعداد دسته‌بندی عیوب: ۲۴ (بر اساس فایل اکسل)
-- ============================================================================


-- v4.3.29: جداول مرجع دکل
CREATE TABLE IF NOT EXISTS `tower_structures` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`), UNIQUE KEY `uq_tower_structures_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tower_type_codes` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `title` varchar(100) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`), UNIQUE KEY `uq_tower_type_codes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ارتباط دامنه با قراردادها (4.3.38)
CREATE INDEX idx_lines_contract ON `lines` (`contract_id`);
ALTER TABLE `lines` ADD CONSTRAINT fk_lines_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_towers_contract ON `towers` (`contract_id`);
ALTER TABLE `towers` ADD CONSTRAINT fk_towers_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_personnel_contract ON `personnel` (`contract_id`);
ALTER TABLE `personnel` ADD CONSTRAINT fk_personnel_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_equipment_contract ON `equipment` (`contract_id`);
ALTER TABLE `equipment` ADD CONSTRAINT fk_equipment_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_inspections_contract ON `inspections` (`contract_id`);
ALTER TABLE `inspections` ADD CONSTRAINT fk_inspections_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_defects_contract ON `defects` (`contract_id`);
ALTER TABLE `defects` ADD CONSTRAINT fk_defects_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_work_orders_contract ON `work_orders` (`contract_id`);
ALTER TABLE `work_orders` ADD CONSTRAINT fk_work_orders_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_safety_incidents_contract ON `safety_incidents` (`contract_id`);
ALTER TABLE `safety_incidents` ADD CONSTRAINT fk_safety_incidents_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX idx_price_lists_contract ON `price_lists` (`contract_id`);
ALTER TABLE `price_lists` ADD CONSTRAINT fk_price_lists_contract FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
