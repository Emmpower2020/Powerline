import moment from "jalali-moment";

moment.locale("fa");
try {
  (moment as unknown as { loadPersian?: (opts: { dialect: string }) => void }).loadPersian?.({ dialect: "persian-modern" });
} catch { /* ignore */ }

export function toJalali(date: Date | string, format = "jYYYY/jMM/jDD"): string {
  try { return moment(date).format(format); } catch { return String(date); }
}
export function toJalaliDateTime(date: Date | string): string {
  try { return moment(date).format("jYYYY/jMM/jDD - HH:mm"); } catch { return String(date); }
}
export function fromJalali(jalaliDate: string, format = "jYYYY/jMM/jDD"): string {
  try { return moment(jalaliDate, format).format("YYYY-MM-DD"); } catch { return jalaliDate; }
}
export function todayJalali(): string { return moment().format("jYYYY/jMM/jDD"); }
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
