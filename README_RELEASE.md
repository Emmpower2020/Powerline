# سیستم مدیریت خطوط ایلیا — Powerline EAM/CMMS Web v4.2.7

**تاریخ انتشار:** 2026-08-25

## محتویات

- **src/** — کد فرانت‌اند Next.js 16 + React 19 + TypeScript
- **api_powerline/** — بک‌اند PHP (DirectAdmin / Apache + PHP 8.2+)
- **prisma/** — Prisma ORM schema (برای dev локال)
- **database/** — اسکریپت‌های SQL مایگریشن (برای دیتابیس اصلی MySQL)
- **public/** — فایل‌های استاتیک (favicon، logo، robots.txt)
- **examples/** — نمونه‌های WebSocket و غیره
- **tests/** — اسکریپت‌های تست runtime
- **mini-services/** — سرویس‌های کمکی
- فایل‌های پیکربندی: package.json, tsconfig.json, next.config.ts, tailwind.config.ts, ...

## نصب و راه‌اندازی

### ۱) فرانت‌اند (Next.js)

```bash
# نصب وابستگی‌ها
bun install   # یا: npm install

# کپی فایل env
cp .env.example .env
# سپس DATABASE_URL را در .env تنظیم کنید

# حالت توسعه
bun dev       # یا: npm run dev
# → http://localhost:3000

# بیلد پروداکشن
bun run build
bun start
```

### ۲) بک‌اند PHP (روی هاست DirectAdmin)

نکته: راهنمای کامل در فایل **DEPLOY_GUIDE.md** در همین پوشه آمده است.

خلاصه:
۱. پوشه api_powerline/ را در هاست آپلود کنید
۲. فایل api_powerline/config.php را با اطلاعات دیتابیس MySQL خود پر کنید
۳. اسکریپت‌های database/schema.sql و سایر مایگریشن‌ها را روی MySQL اجرا کنید
۴. در فرانت‌اند، آدرس API را در src/lib/api-config.ts تنظیم کنید

## نسخه

**v4.2.4**

نشان نسخه در پایین سایدبار برنامه (داخلی) قابل مشاهده است.

## لاگ تغییرات

فایل VERSION.md را برای تاریخچه کامل نسخه‌ها ببینید.
