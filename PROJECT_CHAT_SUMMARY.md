# خلاصه وضعیت پروژه Powerline Web — نسخه 4.3.38

## هدف این نوبت
رفع باگ «ویرایش فقط یک ردیف امکان‌پذیر است» در جدول‌هایی که به‌دلیل باقی‌ماندن انتخاب‌های قبلی بین صفحات/فیلترها، تعداد انتخاب بیشتر از چیزی که کاربر روی صفحه می‌بیند محاسبه می‌شد؛ و اضافه‌کردن ارتباط «قرارداد» به موجودیت‌های عملیاتی پروژه.

## باگ انتخاب/ویرایش
- فایل اصلی اصلاح‌شده: `src/components/data-table.tsx`
- انتخاب‌ها برای عملیات گروهی همچنان بین صفحات حفظ می‌شوند.
- اما برای ویرایش/کپی، فقط ردیف‌های انتخاب‌شده در صفحه فعلی (`paginated`) محاسبه می‌شوند.
- بنابراین انتخاب یک ردیف در صفحه فعلی دیگر به‌خاطر انتخاب‌های قدیمی در صفحه/فیلتر دیگر، خطای «چند ردیف انتخاب شده» نمی‌دهد.
- این اصلاح در خود کامپوننت مشترک DataTable انجام شده و تمام بخش‌هایی که از آن استفاده می‌کنند از همان منطق بهره می‌برند.

## قرارداد
برای این موجودیت‌ها `contract_id` nullable اضافه و در API/فرم/جدول پشتیبانی شد:
- خطوط
- دکل‌ها
- مدارها
- پرسنل
- تجهیزات
- بازدیدها
- عیوب
- دستورکارها
- حوادث ایمنی
- فهرست بها

نکته: `contract_id` اختیاری است تا داده‌های قدیمی بدون قرارداد معتبر بمانند؛ اتصال FK با `ON DELETE SET NULL` طراحی شده تا حذف قرارداد، سوابق عملیاتی را پاک نکند.

### فایل‌های اصلی مرتبط
- `src/components/contract-select.tsx`
- `src/hooks/use-contract-options.ts`
- `src/components/pages/generic-module-page.tsx`
- `src/components/create-line-dialog.tsx`
- `src/components/towers/create-tower-dialog.tsx`
- `src/components/pages/circuits-page.tsx`
- `src/components/pages/personnel-page.tsx`
- `src/components/defects/create-defect-dialog.tsx`
- `src/components/pages/defects-page.tsx`
- `src/components/pages/inspections-work-orders-page.tsx`
- `src/components/create-dialogs.tsx`
- `src/components/pages/price-lists-page.tsx`

### Backend
- `Powerline/endpoints/lines.php`
- `Powerline/endpoints/towers.php`
- `Powerline/endpoints/modules.php`
- `Powerline/endpoints/defects.php`
- `Powerline/endpoints/inspections.php`
- `Powerline/endpoints/work_orders.php`

APIهای خواندن، ایجاد و ویرایش موجودیت‌های بالا برای `contract_id`/`contract_title` به‌روزرسانی شده‌اند و برای قرارداد در فرم‌ها از کمبوباکس جست‌وجوشو استفاده می‌شود.

## دیتابیس
- `database/migration_v4.3.38_contract_scope.sql` برای دیتابیس موجود و اجرای مجدد مقاوم است.
- `database/schema.sql` برای نصب تازه با ستون‌های `contract_id` و FK/indexهای مرتبط به‌روزرسانی شده است.
- اقلام فهرست بها (`price_list_items`) ستون جداگانه قرارداد نمی‌گیرند؛ قرارداد از فهرست والد (`price_lists.contract_id`) به ارث می‌رسد و در جدول اقلام نمایش داده می‌شود.

## بررسی‌ها
- تمام فایل‌های PHP پروژه با `php -l` بررسی شدند و بدون خطای Syntax هستند.
- `npm run build` اجرا نشد چون وابستگی‌های Node (`node_modules`) در محیط موجود نبودند. تلاش برای `npm install` به دلیل timeout کامل نشد؛ بنابراین Build نهایی Next.js را نمی‌توانستم در این محیط تأیید کنم.
- `tsc` نیز به‌دلیل نبود وابستگی‌های پروژه خطاهای مربوط به module/type dependency داد، نه یک خطای مشخص جدید در منطق قرارداد یا انتخاب.

## نسخه
- نسخه پروژه: `4.3.38`
- `package.json` و `VERSION.md` به‌روزرسانی شده‌اند.

## فایل نهایی
فایل ZIP نهایی باید با نام `Github_fixed_powerline_v4.3.38.zip` در کنار این خلاصه قرار داشته باشد.
