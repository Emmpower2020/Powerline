# Powerline Web v4.3.30 — Schema Aligned Tower References

این نسخه بر اساس ساختار واقعی دیتابیس فعلی `sabadga2_Powerline.sql` تنظیم شده است.

## اصلاحات اصلی
- جدول `lines` فقط از ستون `tower_structure` استفاده می‌کند. ارجاع به `tower_structure_type` حذف شد.
- جدول `towers` از `tower_type_code` استفاده می‌کند.
- دو جدول مرجع `tower_structures` و `tower_type_codes` ایجاد/Seed می‌شوند.
- ساختار خط بعد از وجود دکل فعال، از پرتکرارترین `towers.tower_structure` محاسبه می‌شود.
- بعد از وجود دکل فعال، `lines.tower_structure` در API قابل ویرایش نیست.
- فرم افزودن/ویرایش خط از `tower_structure` استفاده می‌کند.
- عملیات گروهی خطوط نیز فقط `tower_structure` را تغییر می‌دهد.
- ستون قدیمی `tower_type` در جدول `towers` فعلاً در دیتابیس حذف نمی‌شود، چون در SQL فعلی وجود دارد و بعضی گزارش‌های قدیمی ممکن است از آن استفاده کنند؛ از UI مدیریت دکل برای آن استفاده نمی‌شود.
- Migration قدیمی 4.3.29 که `tower_structure_type` را فرض می‌کرد از بسته حذف شده است.

### اصلاح نهایی مدل دکل
- `tower_structure` = ساختار دکل (مشبک فلزی، تیر چوبی و ...)
- `tower_type` = نوع دکل (آویزی / کششی)
- `tower_type_code` = کد نوع دکل (NN، CC، AA و ...)
- `foundation_type` از مدل دکل حذف شد.
- برای دیتابیس‌های قبلی، migration جدید `database/migration_v4.3.31_tower_type_semantics.sql` این تغییر را اعمال می‌کند.
