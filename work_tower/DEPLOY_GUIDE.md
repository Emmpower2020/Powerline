# راهنمای Deploy اپ Next.js روی هاست اشتراکی DirectAdmin

این راهنما برای کاربرانی است که **هاست اشتراکی با DirectAdmin** دارند (نه سرور مجازی VPS).

## 📋 دو سناریو وجود دارد

### سناریو ۱: هاست شما از Node.js پشتیبانی می‌کند (بررسی کنید)
برخی هاست‌ها (مثل Hostinger، برخی پلن‌های Namecheap، پارس‌پاک، و...) در DirectAdmin ابزار "Setup Node.js App" دارند.

**بررسی:** وارد DirectAdmin شوید → در بخش "Advanced Features" یا "Software" → بگردید دنبال:
- "Setup Node.js App" یا
- "Node.js" یا
- "Passenger App"

**اگر داشتید** → از **مسیر A** استفاده کنید (Deploy روی هاست خودتان)
**اگر نداشتید** → از **مسیر B** استفاده کنید (Deploy روی Vercel رایگان — پیشنهاد می‌شود)

---

## 🛤️ مسیر A: Deploy روی هاست DirectAdmin (اگر Node.js پشتیبانی می‌شود)

### مرحله ۱: ساخت اپ Node.js در DirectAdmin

1. وارد DirectAdmin شوید
2. به بخش **Advanced Features** → **Setup Node.js App** بروید
3. روی **Create Application** کلیک کنید
4. تنظیمات زیر را وارد کنید:
   - **Application Name**: `powerline-web`
   - **Node.js Version**: `20.x` (یا بالاترین موجود)
   - **Application Mode**: `Production`
   - **Application Root**: `domains/yourdomain.com/public_html/powerline`
   - **Application URL**: `yourdomain.com` (یا سابدامین مثل `app.yourdomain.com`)
   - **Application Startup File**: `server.js`
5. روی **Create** کلیک کنید

### مرحله ۲: آپلود فایل‌های پروژه

**روش ۱: آپلود ZIP از طریق File Manager**

1. فایل `Powerline_Web_v1.3.0.zip` را روی کامپیوترتان استخراج کنید
2. وارد File Manager در DirectAdmin شوید
3. به مسیر `domains/yourdomain.com/public_html/powerline` بروید
4. همه فایل‌های استخراج‌شده را آپلود کنید

**روش ۲: استفاده از FTP (FileZilla)**

```bash
# اطلاعات FTP از DirectAdmin → Account → FTP Management
# هاست: ftp.yourdomain.com
# کاربر: your_username
# رمز: ftp_password

# در FileZilla به پوشه /domains/yourdomain.com/public_html/powerline بروید
# همه فایل‌ها به جز node_modules آپلود کنید
```

### مرحله ۳: نصب وابستگی‌ها (در DirectAdmin)

1. در صفحه "Setup Node.js App" → روی اپلیکیشن `powerline-web` کلیک کنید
2. به بخش **Run NPM Install** بروید → کلیک کنید
3. صبر کنید تا نصب کامل شود

### مرحله ۴: Build پروژه (روی کامپیوتر خودتان)

هاست اشتراکی معمولاً منابع کافی برای build ندارد. بهتر است روی کامپیوتر خودتان build بگیرید:

```bash
# روی کامپیوتر خودتان (نه سرور)
cd /path/to/Powerline_Web_v1.3.0

# نصب وابستگی‌ها
npm install --legacy-peer-deps

# Build
npm run build

# پوشه .next ساخته می‌شود
```

حالا پوشه `.next` را هم آپلود کنید (همراه با سایر فایل‌ها).

### مرحله ۵: پیکربندی Application Startup File

فایل `server.js` در ریشه پروژه بسازید:

```javascript
const { createServer } = require('http');
const next = require('next');

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(handle).listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
});
```

### مرحله ۶: تنظیم Environment Variables

در صفحه "Setup Node.js App" در DirectAdmin:

```
NODE_ENV=production
PORT=3000
```

### مرحله ۷: Restart اپلیکیشن

روی **Restart** کلیک کنید. اپ باید روی آدرس `yourdomain.com` اجرا شود.

---

## 🌟 مسیر B: Deploy روی Vercel (پیشنهاد ویژه — رایگان و بهینه)

**چرا Vercel؟**
- سازنده Next.js است → بهترین پشتیبانی را دارد
- رایگان (پلن Hobby)
- SSL خودکار
- CDN جهانی (سریع)
- Deploy خودکار با Git Push
- پشتیبانی از API Routes (پروکسی CORS شما کار می‌کند)

### مرحله ۱: ساخت حساب Vercel

1. به [vercel.com](https://vercel.com) بروید
2. با حساب GitHub/GitLab/Bitbucket ثبت‌نام کنید
3. روی **Add New Project** کلیک کنید

### مرحله ۲: آپلود کد روی GitHub

اگه کد روی GitHub ندارید:

```bash
# روی کامپیوتر خودتان
cd /path/to/Powerline_Web_v1.3.0

# ساخت ریپوی Git
git init
git add .
git commit -m "Initial commit"

# به GitHub پوش کنید
git remote add origin https://github.com/your-username/powerline.git
git branch -M main
git push -u origin main
```

### مرحله ۳: Import روی Vercel

1. در داشبورد Vercel → **Import Project**
2. ریپوی `powerline` را انتخاب کنید
3. تنظیمات:
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build` (پیش‌فرض)
   - **Output Directory**: `.next` (پیش‌فرض)
   - **Install Command**: `npm install --legacy-peer-deps` (مهم!)
4. روی **Deploy** کلیک کنید

### مرحله ۴: تنظیم Environment Variables

در داشبورد Vercel → Project → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/proxy` |

(بدون نیاز به تغییر — فایل `src/lib/api-config.ts` قبلاً این را تنظیم کرده)

### مرحله ۵: تنظیم دامنه دلخواه (اختیاری)

1. در داشبورد Vercel → Project → Settings → Domains
2. دامنه خود را اضافه کنید (مثلا `app.yourdomain.com`)
3. در DirectAdmin → DNS Management → یک رکورد CNAME اضافه کنید:
   ```
   Type: CNAME
   Name: app
   Target: cname.vercel-dns.com
   ```
4. صبر کنید تا DNS تنظیم شود (می‌تواند ۱-۲۴ ساعت طول بکشد)
5. Vercel به‌طور خودکار SSL نصب می‌کند

### مرحله ۶: تست

به آدرس `your-app.vercel.app` (یا دامنه دلخواه) بروید.

API از طریق پروکسی داخلی به `https://sabadgame.com/Powerline/api_powerline/api.php` وصل می‌شود — مشکل CORS حل شده.

---

## 🔄 آپدیت‌های بعدی روی Vercel

وقتی کد جدیدی ساختید:

```bash
# روی کامپیوتر خودتان
cd /path/to/powerline

# تغییرات را ذخیره کنید
git add .
git commit -m "v1.3.1 - جدید: ..."

# به GitHub پوش کنید
git push

# Vercel به‌طور خودکار Detect می‌کند و دوباره Deploy می‌کند!
# (۳۰ ثانیه تا ۲ دقیقه)
```

---

## 🚀 مسیر C: Cloudflare Pages یا Netlify (جایگزین Vercel)

اگه Vercel دوست نداشتید:

### Cloudflare Pages
1. به [pages.cloudflare.com](https://pages.cloudflare.com) بروید
2. ریپو GitHub را Connect کنید
3. Framework: **Next.js**
4. Build Command: `npm run build`
5. Output: `.next`

### Netlify
1. به [netlify.com](https://netlify.com) بروید
2. **Add new site** → **Import from Git**
3. Framework: **Next.js**
4. Build Command: `npm run build`

---

## 📊 مقایسه روش‌ها

| روش | هزینه | سرعت | پیچیدگی | توصیه |
|------|-------|------|---------|-------|
| هاست DirectAdmin (با Node.js) | رایگان (هاست موجود) | متوسط | زیاد | اگر هاست Node.js دارد |
| **Vercel** ⭐ | رایگان | بسیار سریع | کم | **پیشنهاد اول** |
| Cloudflare Pages | رایگان | بسیار سریع | کم | جایگزین خوب |
| Netlify | رایگان | سریع | کم | جایگزین |
| سرور مجازی VPS | ماهانه $5+ | سریع | زیاد | اگه کنترل کامل می‌خواهید |

---

## 🎯 توصیه نهایی

با توجه به وضعیت شما (هاست DirectAdmin برای PHP + API روی sabadgame.com):

### ✅ بهترین راه‌حل: Vercel برای فرانت + هاست فعلی برای API

```
┌─────────────────────────┐       ┌─────────────────────────┐
│  Vercel (رایگان)         │       │  هاست DirectAdmin شما    │
│  - Next.js Frontend     │ ←──→  │  - PHP REST API          │
│  - app.yourdomain.com   │       │  - sabadgame.com         │
│  - SSL خودکار            │       │  - MariaDB دیتابیس       │
└─────────────────────────┘       └─────────────────────────┘
```

**مزایا:**
1. هزینه: $0 (هر دو رایگان)
2. سرعت: Vercel CDN جهانی دارد
3. نگهداری: آپدیت با Git Push
4. امنیت: SSL رایگان
5. هیچ تغییری در API لازم نیست (پروکسی CORS کار می‌کند)

---

## 📋 چک‌لیست نهایی

### اگر Vercel انتخاب کردید:

- [ ] حساب GitHub ساختید
- [ ] کد را روی GitHub پوش کردید
- [ ] حساب Vercel ساختید
- [ ] پروژه را Import کردید
- [ ] `npm install --legacy-peer-deps` را در Install Command تنظیم کردید
- [ ] Deploy اول موفق بود
- [ ] اپ در `your-app.vercel.app` باز شد
- [ ] صفحه لاگین نمایش داده شد
- [ ] لاگین با حساب admin انجام شد
- [ ] جدول خطوط نمایش داده شد
- [ ] (اختیاری) دامنه دلخواه را تنظیم کردید

### اگر هاست DirectAdmin با Node.js انتخاب کردید:

- [ ] وجود "Setup Node.js App" در DirectAdmin را بررسی کردید
- [ ] اپ Node.js ساختید
- [ ] فایل‌ها را آپلود کردید
- [ ] `npm install` را اجرا کردید
- [ ] روی کامپیوتر خودتان `npm run build` کردید
- [ ] پوشه `.next` را آپلود کردید
- [ ] فایل `server.js` را ساختید
- [ ] Environment Variables را تنظیم کردید
- [ ] Restart کردید
- [ ] اپ در `yourdomain.com` باز شد

---

## 🆘 رفع اشکال

### مشکل: صفحه سفید در Vercel

```bash
# بررسی Build Logs در داشبورد Vercel
# اگر خطای peer dependency بود:
# در Settings → Install Command تغییر دهید به:
npm install --legacy-peer-deps
```

### مشکل: خطای API در Vercel

اگه خطای CORS یا 404 از API:
- مطمئن شوید آدرس `https://sabadgame.com/Powerline/api_powerline/api.php` درست است
- در فایل `src/app/api/proxy/[...path]/route.ts` بررسی کنید

### مشکل: نقشه GIS نمایش داده نمی‌شود

Vercel و Cloudflare Pages به طور پیش‌فرض به OpenStreetMap دسترسی دارند. اگر نه، در `next.config.ts` اضافه کنید:

```javascript
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'tile.openstreetmap.org' },
    ],
  },
};
```

### مشکل: هاست DirectAdmin از Node.js پشتیبانی نمی‌کند

به پشتیبانی هاست خود تیکت بزنید و بپرسید «آیا Node.js پشتیبانی می‌شود؟». اگر نه، از Vercel استفاده کنید (بهترین راه‌حل).

---

## 💡 نکات مهم

1. **PHP API شما دست‌نخورده باقی می‌ماند** — روی sabadgame.com باقی می‌ماند و هیچ تغییری لازم ندارد.

2. **دیتابیس MariaDB** هم روی هاست فعلی باقی می‌ماند.

3. **پروکسی CORS** در `src/app/api/proxy/[...path]/route.ts` از درخواست‌های فرانت به API شما می‌رود و مشکل CORS را حل می‌کند. این پروکسی هم روی Vercel و هم روی هاست Node.js کار می‌کند.

4. **Environment Variables**: در Vercel می‌توانید متغیرهای محیطی تنظیم کنید بدون نیاز به rebuild. در هاست DirectAdmin باید فایل `.env` را آپلود کنید.

5. **Custom Domain**: در Vercel می‌توانید چندین دامنه به یک پروژه وصل کنید (مثلا `app.yourdomain.com` و `yourdomain.com`).

---

## 📞 پشتیبانی

اگه با مشکلی مواجه شدید:
1. **Vercel**: لاگ‌های Build در داشبورد Vercel → Project → Deployments → View Logs
2. **DirectAdmin**: لاگ‌ها در بخش "Setup Node.js App" → View Logs
3. **API**: اگه API مشکل دارد، لاگ‌های PHP در `/api_powerline/api.log`
