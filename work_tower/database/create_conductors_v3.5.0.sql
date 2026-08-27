-- مهاجرت v3.5.0 — ماژول جدید «انواع سیم‌ها» (Conductors)
-- منبع: Conductors Standard.xlsx — ۱۵ سیم استاندارد ACSR
-- نام ستون‌ها انگلیسی (مطابق اکسل) — نمایش فارسی در برنامه انجام می‌شود

CREATE TABLE IF NOT EXISTS `conductors` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'نام سیم (Fox, Lynx, ...)',
  `type` varchar(50) DEFAULT 'ACSR' COMMENT 'نوع هادی',
  `type_code` varchar(50) DEFAULT NULL,
  `standard` varchar(50) DEFAULT NULL COMMENT 'استاندارد (BS/ASTM)',
  `core_type` varchar(50) DEFAULT NULL COMMENT 'نوع هسته',
  `material_outer` varchar(50) DEFAULT NULL COMMENT 'ماده رو',
  `material_inner` varchar(50) DEFAULT NULL COMMENT 'ماده داخل',
  `stranding_outer` varchar(50) DEFAULT NULL COMMENT 'تاوده رو (Nos/mm)',
  `stranding_inner` varchar(50) DEFAULT NULL COMMENT 'تاوده داخل',
  `sectional_area_outer` decimal(10,2) DEFAULT NULL COMMENT 'سطح مقطع رو',
  `sectional_area_all` decimal(10,2) DEFAULT NULL COMMENT 'سطح مقطع کل',
  `overall_diameter_all` decimal(10,2) DEFAULT NULL COMMENT 'قطر کل',
  `overall_diameter_inner` decimal(10,2) DEFAULT NULL COMMENT 'قطر داخل',
  `diameter_code_all` varchar(20) DEFAULT NULL,
  `diameter_code_inner` varchar(20) DEFAULT NULL,
  `weight_all` decimal(10,2) DEFAULT NULL COMMENT 'وزن کل',
  `weight_inner` decimal(10,2) DEFAULT NULL COMMENT 'وزن داخل',
  `weight_outer` decimal(10,2) DEFAULT NULL COMMENT 'وزن رو',
  `ultimate_strength` decimal(12,2) DEFAULT NULL COMMENT 'تنش نهایی',
  `resistance` decimal(10,5) DEFAULT NULL COMMENT 'مقاومت اهمی',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `conductors`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_conductor_name` (`name`);

ALTER TABLE `conductors`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

-- درج ۱۵ سیم از اکسل — اجرای مجدد امن (اول پاک می‌کند)
DELETE FROM `conductors` WHERE `name` IN ('Fox', 'Mink', 'Dog', 'Hyena', 'Partridge', 'Oriole', 'Lynx', 'Hawk', 'Peacock', 'Squab', 'Drake', 'Canary', 'Cardinal', 'Curlew', 'Martin');

INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Fox', 'ACSR', 'ACSR', 'Bs', 'GS', 'Alum.', 'Steel', '6/2.79', '1/2.79', 36.68, 42.8, 8.37, 2.79, '084', '028', 148.0, 100.7, 47.69, 1340.0, 0.7822, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Mink', 'ACSR', 'ACSR', 'BS', 'GS', 'Alum.', 'Steel', '6/3.66', '1/3.66', 63.12, 72.6, 10.98, 3.66, '110', '037', 255.0, 173.2, 82.06, 2220.0, 0.4546, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Dog', 'ACSR', 'ACSR', 'Bs', 'GS', 'Alum.', 'Steel', '6/4.72', '7/1.57', 105.0, 118.5, 14.15, 4.71, '142', '047', 394.0, 288.1, 106.2, 3330.0, 0.2733, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Hyena', 'ACSR', 'ACSR', 'Bs', 'GS', 'Alum.', 'Steel', '7/4.39', '7/1.93', 106.0, 126.5, 14.57, 5.79, '146', '058', 451.0, 290.8, 160.5, 4180.0, 0.2707, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Partridge', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '26/2.573', '7/2.002', 135.2, 157.2, 16.29, 6.006, '163', '060', 546.5, 374.4, 172.1, 5130.0, 0.2136, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Oriole', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '30/2.69', '7/2.69', 170.5, 210.3, 18.83, 8.07, '188', '081', 784.6, 473.5, 311.1, 7870.0, 0.1698, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Lynx', 'ACSR', 'ACSR', 'Bs', 'GS', 'Alum.', 'Steel', '30/2.79', '7/2.79', 183.4, 226.2, 19.53, 8.37, '195', '084', 842.0, 507.0, 335.4, 8140.0, 0.1576, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Hawk', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '26/3.439', '7/2.675', 241.7, 280.8, 21.78, 8.025, '218', '080', 976.5, 669.2, 307.3, 8850.0, 0.1196, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Peacock', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '24/4.034', '7/2.69', 306.6, 346.5, 24.21, 8.07, '242', '081', 1161.0, 849.9, 310.8, 9790.0, 0.09413, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Squab', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '26/3.874', '7/3.012', 306.6, 356.4, 24.53, 9.036, '245', '090', 1239.0, 849.1, 389.6, 11000.0, 0.09422, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Drake', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '26/4.442', '7/3.454', 402.8, 468.6, 28.13, 10.36, '281', '104', 1628.0, 1116.0, 512.3, 14300.0, 0.07167, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Canary', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '54/3.279', '7/3.279', 456.3, 515.1, 29.51, 9.837, '295', '098', 1725.0, 1264.0, 461.3, 14500.0, 0.06332, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Cardinal', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '54/3.376', '3/3.376', 483.4, 546.1, 30.39, 10.13, '304', '101', 1828.0, 1339.0, 488.9, 15400.0, 0.05973, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Curlew', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '54/3.513', '7/3.513', 523.7, 691.3, 31.62, 10.54, '316', '105', 1980.0, 1450.0, 529.5, 16600.0, 0.05518, 1);
INSERT INTO `conductors` (`name`, `type`, `type_code`, `standard`, `core_type`, `material_outer`, `material_inner`, `stranding_outer`, `stranding_inner`, `sectional_area_outer`, `sectional_area_all`, `overall_diameter_all`, `overall_diameter_inner`, `diameter_code_all`, `diameter_code_inner`, `weight_all`, `weight_inner`, `weight_outer`, `ultimate_strength`, `resistance`, `is_active`) VALUES ('Martin', 'ACSR', 'ACSR', 'ASTM', 'GS', 'Alum.', 'Steel', '54/4.018', '19/2.41', 684.8, 771.4, 36.16, 12.05, '362', '121', 2584.0, 1906.0, 678.4, 21000.0, 0.04238, 1);

-- بررسی نتیجه
SELECT `id`, `name`, `type`, `standard`, `sectional_area_all`, `ultimate_strength` FROM `conductors` ORDER BY `id`;
