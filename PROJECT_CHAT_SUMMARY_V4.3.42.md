# Powerline Web — Project Chat Summary v4.3.42

## این مرحله
تمرکز مرحله روی تکمیل بخش «پیمانکاران» و استانداردسازی وضعیت بود.

### پیمانکاران
جدول و فرم پیمانکاران به شکل ساده نگه داشته شد:
- ID
- کد پیمانکار (`contractor_code`)
- نام پیمانکار (`name`)
- مدیرعامل (`ceo_name`)
- تلفن (`phone`)
- موبایل (`mobile`)
- آدرس (`address`)
- وضعیت (`status`)
- ایجاد (`created_at`)
- آخرین ویرایش (`updated_at`)

فیلدهای قدیمی دیتابیس مثل `legal_id`، `contact_person`، `email` و `bank_account` برای سازگاری نگه داشته شده‌اند، ولی در UI پیمانکاران نمایش داده نمی‌شوند.

### استاندارد وضعیت
تمام فیلدهای فعالیتی قبلی که `is_active` داشتند به `status VARCHAR(30)` تبدیل می‌شوند تا وضعیت‌های آینده بدون تغییر ساختار قابل اضافه شدن باشند.
مقادیر فعلی:
- `active` = فعال (سبز)
- `inactive` = غیرفعال (قرمز)

ستون‌های تجاریِ از قبل موجود مثل وضعیت قرارداد (draft/active/expired/...) تغییر ماهیت داده‌ای نداده‌اند؛ فقط `is_active`های فعالیتی استاندارد شده‌اند.

### سلامت داده
DataTable یک ستون پیش‌فرض «سلامت داده» دارد. اگر ردیف اطلاعات مشکل‌دار داشته باشد، `data_quality` یا `quality_issues` می‌تواند آن را نمایش دهد؛ در غیر این صورت وضعیت سالم نمایش داده می‌شود.

### قراردادها
ثبت قرارداد در فرانت‌اند/بک‌اند اصلاح شده:
- عنوان قرارداد الزامی
- پیمانکار الزامی
- اعتبارسنجی وجود پیمانکار
- اعتبارسنجی تاریخ‌ها
- کنترل نوع قرارداد
- مدیریت خطای کد قرارداد/کلید خارجی با پاسخ قابل فهم به‌جای Internal Server Error عمومی

### فایل SQL
`database/migration_v4.3.42_status_and_contractors.sql`
برای تبدیل `is_active` به `status` و افزودن `ceo_name` به پیمانکاران و انتقال `contact_person` قدیمی به `ceo_name` است.

### بررسی فنی
تمام فایل‌های PHP موجود در `Powerline/` با `php -l` بررسی شدند و خطای Syntax نداشتند.
Build کامل Next.js در این محیط اجرا نشد چون وابستگی‌های npm نصب/قابل تکمیل نبودند.

### فایل‌های اصلی تغییر یافته
- `src/components/create-dialogs.tsx`
- `src/components/pages/generic-module-page.tsx`
- `src/components/data-table.tsx`
- `src/components/generic-bulk-actions.tsx`
- `Powerline/endpoints/modules.php`
- `Powerline/endpoints/lines.php`
- `database/schema.sql`
- `database/create_conductors_v3.5.0.sql`
- `database/migration_v4.3.42_status_and_contractors.sql`
- `VERSION.md` → 4.3.42

نسخه فعلی: **Powerline Web v4.3.42**
