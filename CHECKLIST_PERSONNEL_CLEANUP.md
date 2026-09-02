# چک‌لیست پاکسازی جدول personnel – v4.3.64

- [x] `organization_id` حفظ شد.
- [x] `personnel_type` حفظ شد و در رابط کاربری به‌عنوان «سمت» نمایش داده می‌شود.
- [x] `position` حذف شد.
- [x] `phone` حذف شد؛ `mobile` باقی ماند.
- [x] `hire_date` حفظ شد؛ `collaboration_start` حذف شد.
- [x] `contract_end_date` حذف شد.
- [x] API CRUD و Bulk Import اصلاح شد.
- [x] فرم و جدول پرسنل اصلاح شد.
- [x] کمبوباکس سرپرست/کارشناس خط فقط بر اساس `personnel_type` کار می‌کند.
- [x] schema.sql و Dump دیتابیس اصلاح شدند.
- [ ] قبل از تغییر دیتابیس واقعی Backup بگیرید.
- [ ] migration را یک بار روی دیتابیس واقعی اجرا کنید.
- [ ] سورس جدید را Deploy کنید.
- [ ] ایجاد، ویرایش، حذف، Import و کمبوباکس‌های مرتبط را تست کنید.
