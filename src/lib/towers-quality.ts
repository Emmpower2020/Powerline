/**
 * تشخیص خطاها و اطلاعات ناقص رکوردهای دکل (سلامت داده) — v2.1.0
 *
 * قواعد بررسی:
 *  ۱) مختصات GPS ثبت نشده باشد
 *  ۲) شماره دکل (tower_number) ثبت نشده باشد
 *  ۳) نوع دکل (کششی/آویزی) مشخص نباشد
 *  ۴) دکل به هیچ خطی متصل نباشد
 *  ۵) v3.0.0: سرپرست خط دکل باید در جدول پرسنل (با نقش سرپرست اکیپ) موجود باشد
 *     (طبق درخواست کاربر: «اگه دیدی اسم سرپرست یا کارشناس با بخش پرسنل همخوانی نداره به عنوان خطا بیار»)
 */

export interface TowerIssueContext {
  /** نام‌های مجاز سرپرست خط (سرپرست‌های اکیپ از جدول پرسنل) — اگر null باشد بررسی انجام نمی‌شود (پرسنل هنوز لود نشده) */
  validSupervisors?: Set<string> | null;
}

export function getTowerIssues(row: any, ctx?: TowerIssueContext): string[] {
  const issues: string[] = [];

  if (row?.gps_lat == null || row?.gps_lng == null) {
    issues.push("مختصات GPS ثبت نشده است");
  }
  if (row?.tower_number == null) {
    issues.push("شماره دکل ثبت نشده است");
  }
  if (!row?.tower_type) {
    issues.push("نوع دکل (کششی/آویزی) مشخص نیست");
  }
  if (row?.line_id == null) {
    issues.push("به هیچ خطی متصل نیست");
  }

  // ۵) v3.0.0: همخوانی سرپرست خط با جدول پرسنل
  if (ctx?.validSupervisors) {
    const sup = (row?.line_supervisor || "").trim();
    if (sup && !ctx.validSupervisors.has(sup)) {
      issues.push(`سرپرست خط «${sup}» در جدول پرسنل (سرپرست اکیپ) یافت نشد`);
    }
  }

  return issues;
}
