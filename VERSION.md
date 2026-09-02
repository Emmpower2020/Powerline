# Powerline Web — v4.3.56 (2026-09-02)

## اصلاح این نسخه: خطای «انواع ساختار دکل» و «انواع کد دکل»

### مشکل
هر دو صفحه مرجع دکل (و کمبوباکس‌های ساختار/کد نوع دکل در فرم‌ها) خطای Internal Server Error می‌دادند.

### دلیل
جداول `tower_structures` و `tower_type_codes` در دیتابیس واقعی ستون **`is_active`** (tinyint) دارند
ولی بک‌اند روی ستون **`status`** (varchar) کوئری می‌زد → خطای MySQL «Unknown column status» → پاسخ 500.

### راه‌حل (سازگاری با هر دو ساختار دیتابیس — بدون نیاز به تغییر دیتابیس)
- بک‌اند موقع اجرا با `SHOW COLUMNS` تشخیص می‌دهد هر جدول `status` دارد یا `is_active`
  و کوئری/درج/ویرایش را با ستون واقعی انجام می‌دهد.
- شامل: `tower-references`، CRUD کامل `tower-structures` و `tower-type-codes`، بخش bootstrap.
- همان مشکل در **انواع سیم‌ها (conductors)** هم اصلاح شد (bootstrap + ایجاد/ویرایش + نمایش وضعیت).

## فایل‌های تغییریافده
- Powerline/endpoints/modules.php (فقط بک‌اند)
- src/lib/version.ts ، package.json (نمایش نسخه v4.3.56)

## نکته استقرار
- ⚠️ فقط `Powerline/endpoints/modules.php` روی هاست جایگزین شود — همین یک فایل کافی است.
- این بسته بر پایه بسته v4.3.56 شما ساخته شده؛ همه اصلاحات فرانتند تا v4.3.54 داخل آن موجود است.
