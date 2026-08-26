/**
 * تشخیص خطاها و تناقض‌های داده‌ای رکوردهای خطوط (سلامت داده)
 *
 * قواعد بررسی:
 *  ۱) تعداد کل دکل‌ها باید برابر جمع دکل‌های کششی + آویزی باشد (اگر هر سه ثبت شده باشند)
 *  ۲) جمع دکل‌های به تفکیک منطقه (دشت + نیمه‌کوهستانی + صعب‌العبور) باید با تعداد کل برابر باشد (اگر هر چهار مقدار ثبت شده باشند)
 *  ۳) طول خط نباید خالی باشد
 *  ۴) ولتاژ نباید خالی باشد
 *  ۵) تعداد کل دکل‌ها نباید خالی باشد
 *  ۶) v3.0.0: سرپرست خط باید در جدول پرسنل (با نقش سرپرست اکیپ) موجود باشد
 *  ۷) v3.0.0: کارشناس خط باید در جدول پرسنل (با نقش کارشناس خط) موجود باشد
 *     (طبق درخواست کاربر: «اگه دیدی اسم سرپرست یا کارشناس با بخش پرسنل همخوانی نداره به عنوان خطا بیار»)
 */

export interface LineIssueContext {
  /** نام‌های مجاز سرپرست خط (سرپرست‌های اکیپ از جدول پرسنل) — اگر null باشد بررسی انجام نمی‌شود (پرسنل هنوز لود نشده) */
  validSupervisors?: Set<string> | null;
  /** نام‌های مجاز کارشناس خط (کارشناس‌های خط از جدول پرسنل) — اگر null باشد بررسی انجام نمی‌شود */
  validExperts?: Set<string> | null;
}

export function getLineIssues(row: any, ctx?: LineIssueContext): string[] {
  const issues: string[] = [];
  const fa = (n: number) => n.toLocaleString("fa-IR");

  const total = row?.total_towers;
  const tension = row?.tension_towers;
  const suspension = row?.suspension_towers;

  // ۱) تناقض تعداد: کل ≠ کششی + آویزی
  if (total != null && tension != null && suspension != null) {
    const sum = Number(tension) + Number(suspension);
    if (Number(total) !== sum) {
      issues.push(`تعداد کل دکل (${fa(Number(total))}) با جمع کششی + آویزی (${fa(sum)}) برابر نیست`);
    }
  }

  // ۲) تناقض منطقه: دشت + نیمه‌کوهستانی + صعب‌العبور ≠ کل
  const plain = row?.plain_terrain;
  const semi = row?.semi_mountainous;
  const mountain = row?.mountainous;
  if (total != null && plain != null && semi != null && mountain != null) {
    const terrainSum = Number(plain) + Number(semi) + Number(mountain);
    if (Number(total) !== terrainSum) {
      issues.push(`جمع دکل‌های دشت + نیمه‌کوهستانی + صعب‌العبور (${fa(terrainSum)}) با تعداد کل (${fa(Number(total))}) برابر نیست`);
    }
  }

  // ۳ تا ۵) اطلاعات ناقص
  if (row?.length_km == null || Number(row.length_km) === 0) {
    issues.push("طول خط ثبت نشده است");
  }
  if (row?.voltage_kv == null) {
    issues.push("ولتاژ ثبت نشده است");
  }
  if (row?.total_towers == null) {
    issues.push("تعداد کل دکل‌ها ثبت نشده است");
  }

  // ۶ و ۷) v3.0.0: همخوانی مسئولین با جدول پرسنل
  if (ctx?.validSupervisors) {
    const sup = (row?.line_supervisor || "").trim();
    if (sup && !ctx.validSupervisors.has(sup)) {
      issues.push(`سرپرست خط «${sup}» در جدول پرسنل (سرپرست اکیپ) یافت نشد`);
    }
  }
  if (ctx?.validExperts) {
    const exp = (row?.line_expert || "").trim();
    if (exp && !ctx.validExperts.has(exp)) {
      issues.push(`کارشناس خط «${exp}» در جدول پرسنل (کارشناس خط) یافت نشد`);
    }
  }

  return issues;
}
