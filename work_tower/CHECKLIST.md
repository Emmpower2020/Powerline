# چک‌لیست پروژه پلتفرم مدیریت خطوط انتقال برق

**آخرین به‌روزرسانی:** 2026-08-20  
**نسخه فعلی:** v1.3.0  
**مسیر پروژه:** `/home/z/my-project/`

---

## 📊 وضعیت کلی پروژه

| بخش | وضعیت | توضیح |
|------|-------|-------|
| دیتابیس | ✓ فعال | MariaDB با ۴۲ جدول روی sabadgame.com |
| PHP REST API | ✓ فعال | JWT + RBAC با ۴۰+ endpoint |
| اپ وب Next.js | ✓ فعال | Next.js 16 + TypeScript + Tailwind |
| اپ ویندوز | ✓ قدیمی | AppTest v2.1 (نباید استفاده شود) |
| اپ اندروید | ⏳ در صف | Flutter — شروع نشده |

---

## ✅ کارهای انجام‌شده (Chronological)

### فاز ۱: راه‌اندازی اولیه (قدیمی)
- [x] ساخت پروژه Next.js 16 با TypeScript و Tailwind CSS 4
- [x] راه‌اندازی shadcn/ui + Radix UI
- [x] افزودن فونت Vazirmatn فارسی
- [x] راه‌اندازی jalali-moment برای تاریخ شمسی
- [x] ساخت auth-context.tsx با JWT
- [x] ساخت api-client.ts با refresh token
- [x] ساخت API proxy داخلی برای حل CORS

### فاز ۲: ماژول‌های اصلی
- [x] ماژول خطوط انتقال (Lines) با ۲۳+ ستون
- [x] ماژول دکل‌ها (Towers) با نقشه GIS
- [x] ماژول بازدیدها (Inspections)
- [x] ماژول عیوب (Defects) با تأیید/راستی‌آزمایی
- [x] ماژول دستورکارها (Work Orders)
- [x] ماژول قراردادها (Contracts)
- [x] ماژول صورت‌وضعیت‌ها (Invoices)
- [x] ماژول حوادث ایمنی (Safety Incidents)
- [x] ماژول پرسنل (Personnel)
- [x] ماژول پیمانکاران (Contractors)
- [x] ماژول تجهیزات (Equipment)
- [x] ماژول لاگ ممیزی (Audit Log)
- [x] ماژول سازمان (Organization)
- [x] داشبورد با آمار و چارت‌ها
- [x] نقشه GIS با Leaflet + OpenStreetMap

### فاز ۳: جدول داده‌های حرفه‌ای (v1.0.0)
- [x] سورت ۳ حالته (none → asc → desc)
- [x] فیلتر با آیکون قیف (شامل search و multi-select)
- [x] مخفی/نمایش ستون‌ها
- [x] جابجایی ستون‌ها (با دکمه بالا/پایین)
- [x] انتخاب ردیف با چک‌باکس
- [x] خروجی CSV
- [x] کلیک راست روی ردیف
- [x] صفحه‌بندی

### فاز ۴: اصلاحات UI/UX (v1.0.0)
- [x] راست‌چین کامل منوی تنظیم ستون‌ها
- [x] راست‌چین AlertDialog (text-right)
- [x] افزودن `cursor: pointer` سراسری برای دکمه‌ها و لینک‌ها
- [x] بازگرداندن دکمه‌های کپی و حذف با تأییدیه AlertDialog
- [x] Toast notification با useToast
- [x] حذف cursor-pointer از روی دکمه‌های غیرفعال (disabled)

### فاز ۵: اصلاح داده‌ها (v1.0.1)
- [x] اصلاح `formatLineRow()` در PHP — بازگرداندن همه ۳۳ فیلد جدول lines
- [x] تغییر نام فیلد voltage به voltage_kv در LinesPage
- [x] افزودن ستون‌های جدید: tower_structure_type, circuit_length_km, tension_towers, suspension_towers, plain_terrain, semi_mountainous, mountainous, owner_org_name, contractor_name

### فاز ۶: اصلاحات جدول و کپی (v1.1.0)
- [x] ستون جداگانه برای چک‌باکس انتخاب (با پس‌زمینه متمایز)
- [x] badge "X ردیف انتخاب شده" داخل نوار ابزار (نه بالای جدول)
- [x] دکمه لغو سریع انتخاب‌ها (X)
- [x] اصلاح عملکرد دکمه حذف با useRef + isDeleting state + e.preventDefault
- [x] بازنویسی handleCopy به TSV (قابل پیست در Excel)
- [x] افزودن فیلتر `is_active=1` به کوئری لیست خطوط

### فاز ۷: تغییرات دیتابیس و UI نهایی (v1.2.0)
- [x] تبدیل soft delete به **HARD DELETE** (حذف کامل از دیتابیس)
- [x] انتقال دکمه close دیالوگ از `right-4` به `left-4` (RTL)
- [x] افزودن `cursor-pointer` به دکمه close
- [x] راست‌چین DialogHeader (text-right)
- [x] تغییر justify-end به justify-start در DialogFooter (RTL)
- [x] تغییر متن "کل دکل‌ها" به "تعداد کل دکل‌ها"
- [x] تغییر بک‌گراند هدر ستون‌ها از slate-50 به **سفید** (`bg-white`)
- [x] حذف ستون‌های construction_date و commission_date از LinesPage
- [x] حذف فیلدهای construction_date و commission_date از formatLineRow() در PHP
- [x] حذف از INSERT و PUT routes در PHP
- [x] ساخت migration SQL برای DROP COLUMN + UNIQUE INDEX روی dispatch_code
- [x] اعتبارسنجی یونیک بودن dispatch_code در POST و PUT
- [x] افزودن `cursor-pointer !important` قوی‌تر به globals.css
- [x] افزودن `cursor: not-allowed` به عناصر disabled

### فاز ۸: رفع اشکالات v1.2.0 + قابلیت ویرایش (v1.2.1)
- [x] حل خطای `#1062 - Duplicate entry 'BH608'` با ساخت migration_v1.2.1.sql که مقادیر تکراری dispatch_code را NULL می‌کند
- [x] حذف پیام "soft delete" از AlertDialog تأیید حذف
- [x] افزودن `tableRef` prop به DataTable با متدهای `clearSelection` و `getSelectedRows`
- [x] clear خودکار selectedRows بعد از حذف موفق (badge "X ردیف انتخاب شده" ناپدید می‌شود)
- [x] حذف فیلدهای تاریخ ساخت/بهره‌برداری از فرم `CreateLineDialog`
- [x] افزودن دکمه ویرایش (آیکون مداد) به نوار ابزار جدول
- [x] هشدار وقتی چند ردیف انتخاب شده باشد: "لطفاً فقط یک ردیف را برای ویرایش انتخاب کنید"
- [x] پشتیبانی از حالت ویرایش در `CreateLineDialog` (editRow prop)
- [x] فیلد "کد خط" در حالت ویرایش disabled
- [x] عنوان فرم ویرایش: "ویرایش خط: [نام خط]"
- [x] استفاده از `PUT /lines/{id}` برای آپدیت

### فاز ۹: رفع اشتباه UNIQUE INDEX + اصلاحات UI (v1.2.2)
- [x] رفع اشتباه UNIQUE INDEX روی dispatch_code (چون چند خط می‌توانند dispatch_code مشترک داشته باشند - مدار مشترک)
- [x] ساخت migration_v1.2.2.sql که UNIQUE INDEX از dispatch_code را حذف می‌کند
- [x] افزودن UNIQUE INDEX `idx_lines_line_code_unique` روی line_code
- [x] حذف اعتبارسنجی یکتایی dispatch_code از POST و PUT در PHP
- [x] اصلاح دکمه close دیالوگ که روی عنوان طولانی می‌افتاد (افزودن فضا + z-20)
- [x] افزودن filterable به ستون‌های عددی: مدار، باندل، طول خط، طول مدار، تعداد دکل‌ها، دکل‌های کششی/آویزی، دشت، نیمه‌کوهستانی، صعب‌العبور
- [x] افزودن filterable به ستون "فعال" (boolean)
- [x] افزودن پراپ `wrap` به DataTableColumn برای شکستن متن در چند خط
- [x] فعال کردن wrap برای ستون‌های نام خط و نام مجموعه
- [x] افزایش عرض ستون نام خط و نام مجموعه از 200px به 240px

### فاز ۱۰: اصلاحات فرم + عرض خودکار ستون‌ها (v1.2.3)
- [x] اصلاح چیدمان فرم CreateLineDialog: نام خط و نام مجموعه به تمام عرض (full width) منتقل شدند
- [x] کد خط و کد دیسپاچینگ در گرید ۲ ستونه (مقادیر کوتاه)
- [x] پاک کردن error و submitting state هر بار که فرم باز می‌شود (useEffect با [open, editRow])
- [x] افزودن تابع `getColumnWidth` به DataTable برای محاسبه خودکار عرض ستون‌ها
- [x] حداقل عرض = عرض متن هدر + آیکون‌ها + padding (با min 80px)
- [x] حداکثر عرض = بزرگ‌ترین محتوای سلول + padding (با cap 400px)
- [x] ستون‌های wrap: cap به 320px
- [x] تخمین عرض برای اعداد با toLocaleString("fa-IR") و برای badgeها با badge label
- [x] حذف عرض‌های صریح از LinesPage (اجازه محاسبه خودکار)
- [x] افزودن try-catch در اطراف INSERT در lines.php برای مدیریت خطای UNIQUE Constraint
- [x] پیام واضح برای خطای تکراری بودن line_code یا dispatch_code

### فاز ۱۱: اصلاح عرض نام خط + تغییر نام مجموعه خط (v1.2.4)
- [x] افزایش عرض ستون نام خط از 260px به 420px (با wrap) — حل مشکل شکسته شدن متن در ۴ ردیف
- [x] افزایش عرض ستون نام مجموعه خط به 420px (با wrap)
- [x] اصلاح منطق `getColumnWidth`: وقتی کاربر width صریح تعیین کرده، آن بدون تغییر اعمال می‌شود (باگ قبلی: cap به 320px)
- [x] تغییر ترتیب فیلدها در فرم: ابتدا "نام مجموعه خط" سپس "نام خط"
- [x] تغییر نام "نام مجموعه" به "نام مجموعه خط" در جدول LinesPage
- [x] تغییر label فرم CreateLineDialog از "نام مجموعه" به "نام مجموعه خط"

### فاز ۱۲: فشرده‌سازی عرض + اصلاح جستجوی فیلتر (v1.2.5)
- [x] کاهش padding هر سلول از `p-3` (12px) به `p-2` (8px) — در همه th و td و checkbox header
- [x] کاهش padding محاسبه‌شده در `getColumnWidth` از 24px به 16px
- [x] کاهش عرض آیکون‌ها در محاسبه از 40px به 36px
- [x] کاهش حداکثر عرض ستون‌های بدون wrap از 400px به 220px (ستون‌های کوتاه)
- [x] افزایش حداکثر عرض ستون‌های wrap از 320px به 600px (نام خط)
- [x] حداقل عرض از 80px به 70px کاهش یافت
- [x] افزایش عرض ستون نام خط از 420px به 560px
- [x] افزایش عرض ستون نام مجموعه خط به 560px
- [x] اصلاح کار نکردن جستجوی داخل فیلتر: افزودن تابع `getFilteredUniqueValues` که جستجوی لحظه‌ای را فعال می‌کند
- [x] افزودن `autoFocus` به کادر جستجوی فیلتر
- [x] افزودن پیام "موردی یافت نشد" وقتی جستجو نتیجه‌ای ندارد

### فاز ۱۳: ریشه‌ای اصلاح عرض با table-layout: fixed (v1.2.6)
- [x] **حل ریشه‌ای مشکل عدم اعمال عرض ستون‌ها**: افزودن کلاس `table-fixed` به المان `<table>`
- [x] با `table-layout: fixed`، مرورگر عرض‌های تعیین‌شده در `getColumnWidth` را به‌طور کامل رعایت می‌کند
- [x] ستون نام خط حالا واقعاً 560px عرض می‌گیرد (قبلاً به 120-180px فشرده می‌شد)
- [x] ستون‌های بدون عرض صریح، فضای باقی‌مانده را مساوی تقسیم می‌کنند

### فاز ۱۴: تنظیم دقیق عرض ستون نام خط (v1.2.7)
- [x] کاهش عرض ستون نام خط از 560px به **360px** (560px خیلی زیاد بود)
- [x] کاهش عرض ستون نام مجموعه خط هم به 360px
- [x] این تنظیم با `table-layout: fixed` حالا به‌درستی اعمال می‌شود

### فاز ۱۵: کاهش عرض به 340px + وسط‌چین ستون‌های عددی (v1.2.8)
- [x] کاهش عرض ستون نام خط از 360px به **340px**
- [x] کاهش عرض ستون نام مجموعه خط هم به 340px
- [x] افزودن `align: "center"` به ستون‌های عددی (که نتیجه دلخواه نداد و در v1.2.9 برگشت داده شد)

### فاز ۱۶: راست‌چین کردن همه ستون‌ها (v1.2.9)
- [x] تنظیم `align: "right"` برای همه ۲۵ ستون در LinesPage
- [x] به‌روزرسانی منطق `DataTable` در `th`: پیش‌فرض `text-right`، با استثنا برای `center` و `left`
- [x] به‌روزرسانی منطق `DataTable` در `td`: پیش‌فرض `text-right`
- [x] حذف منطق قدیمی که `type === "number"` را به‌طور خودکار چپ‌چین می‌کرد

### فاز ۱۷: انتقال سورت به پنجره فیلتر (v1.3.0) ← **نسخه فعلی**
- [x] حذف آیکون سورت از هدر ستون‌ها (همه هدرها حالا در یک راستا هستند)
- [x] افزودن بخش "مرتب‌سازی" به داخل پنجره فیلتر با ۳ گزینه:
  - صعودی (↑)
  - نزولی (↓)
  - حذف (⇅)
- [x] دکمه فعال با رنگ بنفش `bg-indigo-600 text-white` متمایز می‌شود
- [x] فقط ستون‌های `sortable: true` بخش سورت را نمایش می‌دهند
- [x] بهبور آیکون فیلتر: وقتی ستون سورت یا فیلتر شده باشد، بنفش می‌شود
- [x] بهبور دکمه "پاک کردن": هم فیلتر و هم سورت را پاک می‌کند
- [x] تغییر title آیکون از "فیلتر" به "فیلتر و سورت"

---

## ⏳ کارهای باقی‌مانده

### اولویت بالا
- [ ] اجرای migration_v1.2.2.sql روی دیتابیس سرور (حذف UNIQUE از dispatch_code + افزودن به line_code)
- [ ] تست نهایی عملکرد دکمه حذف (باید ردیف واقعاً از دیتابیس حذف شود)
- [ ] تست عملکرد دکمه ویرایش (باید ردیف آپدیت شود)
- [ ] تست cursor: pointer در همه دکمه‌ها (خصوصاً Dashboard Layout)
- [ ] تست فرم ویرایش با همه فیلدها
- [ ] تست عدم همپوشانی دکمه close با عنوان در حالت‌های طولانی

### اولویت متوسط
- [ ] ارتقای GenericModulePage به جدول حرفه‌ای (فعلاً فقط Lines ارتقا یافته)
- [ ] افزودن onCopy/onDelete/onEdit به GenericModulePage
- [ ] افزودن AlertDialog تأیید حذف به GenericModulePage
- [ ] افزودن قابلیت ویرایش به سایر ماژول‌ها (قرارداد، پرسنل، ...)
- [ ] افزودن فیلد dispatch_code یونیک به فرم افزودن خط با inline validation

### اولویت پایین
- [ ] ساخت اپ اندروید با Flutter
- [ ] گزارش‌گیری پیشرفته با فیلتر
- [ ] چارت‌های پیشرفته داشبورد
- [ ] قابلیت export به PDF
- [ ] پشتیبان‌گیری خودکار دیتابیس
- [ ] لاگ تغییرات (audit log) برای همه ماژول‌ها

---

## 🐛 مشکلات شناخته‌شده

| مشکل | اولویت | توضیح |
|------|--------|-------|
| صفحه ویرایش فقط برای خطوط فعال است | متوسط | سایر ماژول‌ها هنوز ویرایش ندارند |
| برخی ماژول‌ها از جدول حرفه‌ای استفاده نمی‌کنند | متوسط | GenericModulePage |
| نقشه GIS ممکن است در مرورگرهای قدیمی نمایش داده نشود | پایین | Leaflet نیاز به Internet دارد |

---

## 📦 فایل‌های بکاپ

| نسخه | فایل | تاریخ | توضیح |
|------|------|-------|-------|
| v1.0.0 | Powerline_Web_v1.0.0.zip | 2026-08-20 | نسخه پایه با جدول حرفه‌ای |
| v1.0.1 | Powerline_Web_v1.0.1.zip | 2026-08-20 | اصلاح formatLineRow |
| v1.0.1 | api_fix_v1.0.1_lines.zip | 2026-08-20 | فقط lines.php |
| v1.1.0 | Powerline_Web_v1.1.0.zip | 2026-08-20 | اصلاحات چک‌باکس و کپی TSV |
| v1.1.0 | api_fix_v1.1.0_lines.zip | 2026-08-20 | فقط lines.php |
| v1.2.0 | Powerline_Web_v1.2.0.zip | 2026-08-20 | HARD DELETE + cursor fix |
| v1.2.0 | api_fix_v1.2.0.zip | 2026-08-20 | فقط lines.php + migration |
| v1.2.0 | migration_v1.2.0.sql | 2026-08-20 | DROP COLUMN (با خطای duplicate مواجه شد) |
| v1.2.1 | Powerline_Web_v1.2.1.zip | 2026-08-20 | دکمه ویرایش + رفع اشکالات |
| v1.2.1 | migration_v1.2.1.sql | 2026-08-20 | پاک کردن duplicate + UNIQUE INDEX (اشتباه) |
| v1.2.2 | Powerline_Web_v1.2.2.zip | 2026-08-20 | رفع اشتباه UNIQUE + اصلاحات UI |
| v1.2.2 | migration_v1.2.2.sql | 2026-08-20 | حذف UNIQUE از dispatch_code + افزودن به line_code |
| v1.2.3 | Powerline_Web_v1.2.3.zip | 2026-08-20 | اصلاحات فرم + عرض خودکار ستون‌ها |
| v1.2.4 | Powerline_Web_v1.2.4.zip | 2026-08-20 | عرض نام خط 420px + تغییر نام مجموعه خط |
| v1.2.5 | Powerline_Web_v1.2.5.zip | 2026-08-20 | فشرده‌سازی عرض + اصلاح جستجوی فیلتر |
| v1.2.6 | Powerline_Web_v1.2.6.zip | 2026-08-20 | ریشه‌ای اصلاح عرض با table-layout: fixed |
| v1.2.7 | Powerline_Web_v1.2.7.zip | 2026-08-20 | تنظیم دقیق عرض نام خط به 360px |
| v1.2.8 | Powerline_Web_v1.2.8.zip | 2026-08-20 | عرض 340px + وسط‌چین ستون‌های عددی |
| v1.2.9 | Powerline_Web_v1.2.9.zip | 2026-08-20 | راست‌چین کردن همه ستون‌ها |
| v1.3.0 | Powerline_Web_v1.3.0.zip | 2026-08-20 | انتقال سورت به پنجره فیلتر + حذف آیکون سورت از هدر |

---

## 🗂 ساختار پروژه

```
/home/z/my-project/
├── src/
│   ├── app/
│   │   ├── api/proxy/[...path]/route.ts  ← proxy داخلی برای حل CORS
│   │   ├── globals.css                   ← استایل سراسری + cursor pointer
│   │   ├── layout.tsx                    ← layout اصلی با Toaster
│   │   └── page.tsx                      ← صفحه اصلی با routing داخلی
│   ├── components/
│   │   ├── ui/                           ← shadcn/ui components
│   │   │   ├── button.tsx                ← دکمه با cursor-pointer
│   │   │   ├── dialog.tsx                ← دیالوگ با close در سمت چپ
│   │   │   ├── alert-dialog.tsx          ← AlertDialog RTL
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── lines-page.tsx            ← صفحه خطوط (پیشرفته‌ترین) - با ویرایش
│   │   │   ├── inspections-work-orders-page.tsx
│   │   │   └── generic-module-page.tsx   ← قرارداد، ایمنی، پرسنل، ...
│   │   ├── data-table.tsx                ← جدول حرفه‌ای با tableRef
│   │   ├── dashboard-layout.tsx          ← سایدبار ۱۹ ماژول
│   │   ├── create-line-dialog.tsx        ← فرم افزودن/ویرایش خط
│   │   └── create-dialogs.tsx            ← فرم‌های دیگر
│   └── lib/
│       ├── api-client.ts                 ← کلاینت API
│       ├── api-config.ts                 ← پیکربندی endpoints
│       ├── auth-context.tsx              ← احراز هویت
│       └── jalali.ts                     ← تاریخ شمسی
├── download/
│   ├── api_powerline/                    ← PHP API
│   │   └── endpoints/lines.php           ← endpoint خطوط
│   ├── database/
│   │   ├── schema.sql                    ← ساختار دیتابیس
│   │   ├── migration_v1.2.0.sql          ← migration v1.2.0 (drop columns)
│   │   ├── migration_v1.2.1.sql          ← migration v1.2.1 (dispatch_code unique — اشتباه)
│   │   ├── migration_v1.2.2.sql          ← migration v1.2.2 (rollback + line_code unique)
│   │   └── ...
│   ├── Powerline_Web_v*.zip             ← بکاپ‌های نسخه‌بندی‌شده
│   ├── VERSION.md                       ← تاریخچه نسخه‌ها
│   └── CHECKLIST.md                     ← همین فایل
└── scripts/
    ├── build_backup.sh                   ← اسکریپت ساخت بکاپ
    └── check_db_fields.py                ← اسکریپت بررسی دیتابیس
```

---

## 🔧 دستورات مفید

```bash
# ساخت بکاپ جدید با ورژن دلخواه
bash /home/z/my-project/scripts/build_backup.sh <version>

# مثال: bash /home/z/my-project/scripts/build_backup.sh 1.3.0

# Type check پروژه
cd /home/z/my-project && npx tsc --noEmit

# اجرای محیط توسعه
npm run dev

# بیلد production
npm run build
```

---

## 📝 نکات مهم

1. **نام‌گذاری نسخه‌ها**: از Semantic Versioning استفاده می‌شود
   - `MAJOR` (مثلاً v2.0.0): تغییرات بزرگ یا ناسازگار
   - `MINOR` (مثلاً v1.1.0): افزودن قابلیت یا رفع چند اشکال
   - `PATCH` (مثلاً v1.0.1): رفع یک اشکال جزئی

2. **قبل از اعمال هر نسخه روی سرور**:
   - اگر migration SQL وجود دارد، روی دیتابیس اعمال کنید
   - فایل PHP جدید را در مسیر `api_powerline/endpoints/` آپلود کنید
   - کدهای frontend را build و deploy کنید
   - مرورگر را با `Ctrl+Shift+R` ریفرش کنید

3. **برای rollback به نسخه قبلی**:
   - فایل ZIP نسخه قبلی را extract کنید
   - فایل‌های `src/` را در پروژه کپی کنید
   - فایل `endpoints/lines.php` نسخه قبلی را روی سرور آپلود کنید
   - مرورگر را ریفرش کنید

4. **اشکالات یا ویژگی‌های جدید**:
   - در لیست "کارهای باقی‌مانده" اضافه کنید
   - شماره TODO را به آن اختصاص دهید
   - بعد از انجام، آن را به "کارهای انجام‌شده" منتقل کنید

## v4.3.30 — Schema Alignment
- [x] `lines` uses only `tower_structure` for tower structure; `tower_structure_type` removed from active code.
- [x] `towers` uses `tower_type_code` as the active tower type code field.
- [x] Reference tables `tower_structures` and `tower_type_codes` seeded with requested values.
- [x] Line structure sync uses the most frequent active tower structure.
- [x] Line tower structure becomes server-side locked once active towers exist.
