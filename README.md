# 🚀 Powerline Management API v1.0

API پلتفرم مدیریت خطوط انتقال و فوق‌انتقال برق

## 📦 محتویات

```
Powerline/
├── api.php                    ← نقطه ورود اصلی
├── config.php                 ← تنظیمات (دیتابیس، JWT، آپلود و...)
├── .htaccess                  ← تنظیمات Apache
├── README.md                  ← همین فایل
├── test_api.sh                ← اسکریپت تست
│
├── lib/                       ← کلاس‌های پایه
│   ├── Database.php           ← اتصال به دیتابیس (PDO Singleton)
│   ├── Response.php           ← پاسخ JSON
│   ├── Logger.php             ← لاگ‌گیری
│   ├── Auth.php               ← احراز هویت JWT + RBAC
│   ├── Router.php             ← مسیریاب
│   └── Helpers.php            ← توابع کمکی
│
└── endpoints/                 ← endpoint‌های API
    ├── auth.php               ← احراز هویت
    ├── lines.php              ← خطوط انتقال
    ├── towers.php             ← دکل‌ها
    ├── defects.php            ← عیوب
    ├── inspections.php        ← بازدیدها
    ├── work_orders.php        ← دستورکارها
    └── dashboard.php          ← داشبورد
```

## 🚀 نصب

### قدم ۱) آپلود فایل‌ها

کل فولدر `Powerline` رو در فولدر `Powerline` روی سرور آپلود کن:

```
public_html/Powerline/
└── Powerline/   ← این فولدر رو آپلود کن
```

### قدم ۲) تنظیمات

فایل `config.php` رو باز کن و این موارد رو چک/تغییر بده:

```php
// تنظیمات دیتابیس (الان درسته)
define('DB_HOST', 'localhost');
define('DB_NAME', 'jibimar1_Powerline');
define('DB_USER', 'jibimar1_Powerline');
define('DB_PASS', 'eV6pKL7ahq1AKr06');

// ⚠️ این رو حتماً تغییر بده! (یک رشته ۶۴ کاراکتری تصادفی)
define('JWT_SECRET', 'Powerline_JWT_Secret_Key_2026_Change_Me_Please_9876543210!@#$');
```

### قدم ۳) تست

در مرورگر این آدرس رو باز کن:

```
https://jibimarket.com/Powerline/api.php
```

باید یه JSON شبیه این ببینی:

```json
{
    "success": true,
    "message": "به API پلتفرم مدیریت خطوط انتقال برق خوش آمدید",
    "data": {
        "name": "Powerline Management API",
        "version": "1.0.0",
        "endpoints": {...}
    }
}
```

## 📋 Endpointها

### 🔐 احراز هویت

| متد | URL | توضیح | توکن |
|-----|-----|-------|------|
| POST | `/auth/login` | ورود کاربر | ❌ |
| POST | `/auth/logout` | خروج کاربر | ✅ |
| POST | `/auth/refresh` | رفرش توکن | ❌ |
| GET  | `/auth/me` | اطلاعات کاربر فعلی | ✅ |
| POST | `/auth/change-password` | تغییر رمز عبور | ✅ |

**نمونه ورود:**

```bash
curl -X POST https://jibimarket.com/Powerline/api.php/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}'
```

**پاسخ:**

```json
{
    "success": true,
    "message": "ورود موفق",
    "data": {
        "user": {
            "id": 1,
            "username": "admin",
            "full_name": "مدیر سیستم",
            "email": "admin@jibimarket.com"
        },
        "tokens": {
            "access_token": "eyJ...",
            "refresh_token": "eyJ...",
            "token_type": "Bearer",
            "expires_in": 3600
        }
    }
}
```

### 〰️ خطوط

| متد | URL | توضیح | دسترسی |
|-----|-----|-------|--------|
| GET | `/lines` | لیست خطوط | `lines.view` |
| GET | `/lines/{id}` | جزئیات خط | `lines.view` |
| POST | `/lines` | ایجاد خط | `lines.create` |
| PUT | `/lines/{id}` | ویرایش خط | `lines.update` |
| DELETE | `/lines/{id}` | حذف خط | `lines.delete` |
| GET | `/lines/{id}/towers` | دکل‌های خط | `towers.view` |

**پارامترهای query برای `/lines`:**
- `page` (default: 1) - شماره صفحه
- `page_size` (default: 20) - اندازه صفحه
- `search` - جستجو در کد/نام
- `line_type` - فیلتر بر اساس نوع (انتقال، فوق توزیع، توزیع — مقادیر فارسی مطابق enum دیتابیس)
- `is_active` - فیلتر فعال/غیرفعال

**نمونه ایجاد خط:**

```bash
curl -X POST https://jibimarket.com/Powerline/api.php/lines \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "line_code": "L-002",
        "name": "خط انتقال ۶۳ کیلوولت منطقه ۲",
        "line_type": "فوق توزیع",
        "voltage_kv": 63,
        "circuit_count": 1,
        "conductor_type": "Lynx",
        "length_km": 25.5,
        "owner_org_id": 1,
        "contractor_id": 1,
        "path": [
            {"lng": 51.3890, "lat": 35.6892},
            {"lng": 51.4000, "lat": 35.7000}
        ]
    }'
```

### 🗼 دکل‌ها

| متد | URL | توضیح | دسترسی |
|-----|-----|-------|--------|
| GET | `/towers` | لیست دکل‌ها | `towers.view` |
| GET | `/towers/{id}` | جزئیات دکل | `towers.view` |
| POST | `/towers` | ایجاد دکل | `towers.create` |
| PUT | `/towers/{id}` | ویرایش دکل | `towers.update` |
| DELETE | `/towers/{id}` | حذف دکل | `towers.delete` |
| GET | `/towers/nearby?lat=X&lng=Y&radius=Z` | دکل‌های نزدیک | `towers.view` |

### 🐛 عیوب

| متد | URL | توضیح | دسترسی |
|-----|-----|-------|--------|
| GET | `/defects` | لیست عیوب | `defects.view` |
| GET | `/defects/{id}` | جزئیات عیب | `defects.view` |
| POST | `/defects` | ثبت عیب | `defects.create` |
| PUT | `/defects/{id}` | ویرایش عیب | `defects.update` |
| POST | `/defects/{id}/approve` | تأیید عیب | `defects.approve` |
| POST | `/defects/{id}/verify` | راستی‌آزمایی | `defects.verify` |
| DELETE | `/defects/{id}` | حذف عیب | `defects.delete` |
| GET | `/defect-categories` | دسته‌بندی‌ها | (هر کاربر) |
| GET | `/defect-definitions` | تعاریف عیوب | (هر کاربر) |

### 🔍 بازدیدها

| متد | URL | توضیح | دسترسی |
|-----|-----|-------|--------|
| GET | `/inspections` | لیست بازدیدها | `inspections.view` |
| GET | `/inspections/{id}` | جزئیات بازدید | `inspections.view` |
| POST | `/inspections` | ثبت بازدید | `inspections.create` |
| POST | `/inspections/{id}/approve` | تأیید بازدید | `inspections.approve` |

### 🛠️ دستورکارها

| متد | URL | توضیح | دسترسی |
|-----|-----|-------|--------|
| GET | `/work-orders` | لیست دستورکارها | `maintenance.view` |
| GET | `/work-orders/{id}` | جزئیات دستورکار | `maintenance.view` |
| POST | `/work-orders` | ایجاد دستورکار | `maintenance.create` |
| POST | `/work-orders/{id}/assign` | اختصاص به اکیپ | `maintenance.assign` |
| POST | `/work-orders/{id}/start` | شروع کار | `maintenance.update` |
| POST | `/work-orders/{id}/complete` | تکمیل | `maintenance.update` |
| POST | `/work-orders/{id}/close` | بستن نهایی | `maintenance.close` |

### 📊 داشبورد

| متد | URL | توضیح |
|-----|-----|-------|
| GET | `/dashboard/stats` | آمار کلی |
| GET | `/dashboard/recent-defects` | آخرین عیوب |
| GET | `/dashboard/defects-by-category` | عیوب بر اساس دسته |

## 🔐 احراز هویت

API از **JWT (JSON Web Token)** استفاده می‌کنه:

1. **ورود**: کاربر با `POST /auth/login` لاگین می‌کنه و `access_token` + `refresh_token` می‌گیره
2. **استفاده**: در همه درخواست‌ها (به‌جز login و refresh)، هدر `Authorization: Bearer TOKEN` ارسال می‌شه
3. **رفرش**: وقتی `access_token` منقضی شد (بعد از ۱ ساعت)، با `POST /auth/refresh` و `refresh_token`، توکن جدید می‌گیره
4. **خروج**: `POST /auth/logout` توکن رو باطل می‌کنه

## 🛡️ امنیت

### موارد رعایت‌شده:

- ✅ **JWT** برای احراز هویت (با HMAC-SHA256)
- ✅ **RBAC** کامل — نقش‌ها + دسترسی‌ها
- ✅ **Prepared Statements** برای جلوگیری از SQL injection
- ✅ **CORS** قابل تنظیم
- ✅ **Rate Limiting** برای ورود (۵ تلاش ناموفق = ۱۵ دقیقه قفل)
- ✅ **Soft Delete** برای حذف (حذف فیزیکی نمی‌کنه)
- ✅ **Audit Log** در سطح عملیات
- ✅ **Password Hashing** با bcrypt

### ⚠️ نکات مهم:

1. **حتماً `JWT_SECRET` رو تغییر بده!** کلید پیش‌فرض رو برات ساختم ولی نباید استفاده بشه.

2. **در محیط تولید (production)، `DEBUG_MODE` رو 0 بذار.**

3. **CORS رو محدود کن** — به‌جای `*`، فقط دامنه‌های مجاز رو قرار بده:
   ```php
   define('CORS_ALLOW_ORIGIN', 'https://jibimarket.com,https://app.jibimarket.com');
   ```

4. **HTTPS الزامی** — توکن‌ها نباید روی HTTP منتقل بشن.

5. **پسورد admin رو تغییر بده** — الان `admin123` هست که برای تست خوبه ولی برای تولید خطرناکه.

## 🧪 تست

### تست با curl:

```bash
# ورود
curl -X POST https://jibimarket.com/Powerline/api.php/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}'

# با توکن، لیست خطوط
curl -H "Authorization: Bearer TOKEN" \
    https://jibimarket.com/Powerline/api.php/lines
```

### تست با اسکریپت:

```bash
chmod +x test_api.sh
./test_api.sh
```

### تست در Postman:

1. یک Environment بساز با متغیر `token`
2. درخواست Login بزن
3. در تب Tests این کد رو اضافه کن:
   ```javascript
   pm.environment.set('token', jsonResponse.data.tokens.access_token);
   ```
4. در بقیه درخواست‌ها هدر `Authorization: Bearer {{token}}` رو اضافه کن

## 📊 ساختار پاسخ

### پاسخ موفق:

```json
{
    "success": true,
    "message": "...",
    "data": {...}
}
```

### پاسخ خطا:

```json
{
    "success": false,
    "error": {
        "code": 404,
        "message": "..."
    }
}
```

### پاسخ صفحه‌بندی‌شده:

```json
{
    "success": true,
    "data": [...],
    "pagination": {
        "page": 1,
        "page_size": 20,
        "total": 100,
        "total_pages": 5,
        "has_next": true,
        "has_prev": false
    }
}
```

## 🎯 کدهای HTTP

| کد | توضیح |
|-----|-------|
| 200 | موفق |
| 201 | ساخته شد |
| 204 | بدون محتوا (مثلاً OPTIONS) |
| 400 | درخواست نامعتبر |
| 401 | احراز هویت نشده |
| 403 | دسترسی نداری |
| 404 | پیدا نشد |
| 409 | تکراری (Conflict) |
| 500 | خطای سرور |

## 🚀 مرحله بعد

بعد از تست API، می‌ریم سراغ:
1. **به‌روزرسانی اپ ویندوز** برای اتصال به این API
2. **ساخت اپ اندروید** برای کارهای میدانی
3. **افزودن ماژول‌های بیشتر** (گزارش‌گیری، فایل آپلود، و...)

## ❓ عیب‌یابی

### خطای ۴۰۱ (Unauthorized)
- توکن ارسال نشده یا نامعتبره
- هدر `Authorization: Bearer TOKEN` رو چک کن

### خطای ۴۰۳ (Forbidden)
- کاربر دسترسی لازم رو نداره
- با admin لاگین کن (admin همه دسترسی‌ها رو داره)

### خطای ۵۰۰ (Internal Server Error)
- یه مشکلی در سرور هست
- فایل `api.log` رو چک کن

### خطای "Database connection failed"
- اطلاعات دیتابیس در `config.php` رو چک کن
