import moment from "jalali-moment";

moment.locale("fa");
try {
  (moment as unknown as { loadPersian?: (opts: { dialect: string }) => void }).loadPersian?.({ dialect: "persian-modern" });
} catch { /* ignore */ }

/**
 * تبدیل دقیق تاریخ میلادی/ISO به شمسی با الگوریتم مستقل از parser کتابخانه.
 * این بخش مخصوصاً برای جلوگیری از تفسیر «1404/05/01» به‌عنوان سال 1404 میلادی است.
 */
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd;
  if (jm < 7) days += (jm - 1) * 31;
  else days += (jm - 7) * 30 + 186;
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const gd = days + 1;
  const sal_a = [0,31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30,31,30,31,31,30,31,30,31];
  let gm = 1;
  let remaining = gd;
  while (gm <= 12 && remaining > sal_a[gm]) { remaining -= sal_a[gm]; gm++; }
  return [gy, gm, remaining];
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }
function pad4(n: number): string { return String(n).padStart(4, "0"); }

/** تشخیص رکوردهای قدیمی که به‌علت باگ نسخه‌های قبل، شمسی مستقیماً داخل DATE ذخیره شده است. */
export function looksLikeLegacyJalaliStoredAsGregorian(value: string): boolean {
  const m = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return y >= 1300 && y <= 1500 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

export function toJalali(date: Date | string, format = "jYYYY/jMM/jDD"): string {
  try {
    const raw = String(date);
    const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      // legacy data: 1404-05-01 actually means Jalali 1404/05/01
      if (looksLikeLegacyJalaliStoredAsGregorian(raw)) {
        const time = m[4] ? ` ${m[4]}:${m[5] || "00"}` + (m[6] ? `:${m[6]}` : "") : "";
        if (format.includes("HH:mm")) return `${pad4(y)}/${pad2(mo)}/${pad2(d)}${time}`;
        return `${pad4(y)}/${pad2(mo)}/${pad2(d)}`;
      }
      const [jy, jm, jd] = gregorianToJalali(y, mo, d);
      if (format.includes("HH:mm")) return `${pad4(jy)}/${pad2(jm)}/${pad2(jd)}${m[4] ? ` ${m[4]}:${m[5] || "00"}` : " 00:00"}`;
      return `${pad4(jy)}/${pad2(jm)}/${pad2(jd)}`;
    }
    return moment(date).format(format);
  } catch { return String(date); }
}

export function toJalaliDateTime(date: Date | string): string {
  return toJalali(date, "jYYYY/jMM/jDD - HH:mm");
}

export function fromJalali(jalaliDate: string, _format = "jYYYY/jMM/jDD"): string {
  const normalized = fromPersianNumber(String(jalaliDate).trim()).replace(/-/g, "/");
  const m = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return normalized;
  const jy = Number(m[1]), jm = Number(m[2]), jd = Number(m[3]);
  if (jy < 1200 || jy > 1600 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return normalized;
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${pad4(gy)}-${pad2(gm)}-${pad2(gd)}${m[4] ? ` ${m[4].padStart(2, "0")}:${m[5]}` : ""}`;
}

export function todayJalali(): string { return toJalali(new Date()); }
export function toPersianNumber(num: number | string): string {
  const d = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
  return String(num).replace(/[0-9]/g, x => d[parseInt(x)]);
}
export function fromPersianNumber(str: string): string {
  const d = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
  let r = str;
  d.forEach((c, i) => { r = r.replace(new RegExp(c, "g"), String(i)); });
  return r;
}
