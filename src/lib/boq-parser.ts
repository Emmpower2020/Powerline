/**
 * boq-parser.ts — پارسر فهرست بهای کشوری v4.3.87
 *
 * فرمت استاندارد فهرست بهای کشوری (۴ ستون):
 *   شماره ردیف فصل | شرح ردیف فصل | واحد | بهای واحد
 *
 * ردیف‌های اصلی کد ملی دارند (مثل 20101) و طبقه‌بندی از متن «شرح» استخراج
 * می‌شود. ردیف‌های ضریب (کاهش/اضافه بها) کد ندارند → کد اختصاصی
 * *<کد والد>-<n> می‌گیرند و به ردیف بالایی خود وصل می‌شوند.
 *
 * مثال: «بازديد پيمايشي خط 63 کيلوولت دشت و تپه ماهور تک مداره.»
 *   → method=patrol, voltage=63, terrain=plain_hilly, circuit=1, bundle=1
 *   (نبودن باندل در شرح = تک‌باندل — طبق فهرست کشوری)
 */

export type ItemKind = "base" | "coefficient";
export type ActivityType = "inspection" | "repair" | "operation" | "service";
export type InspectionMethod = "climbing" | "patrol" | "drone";
/** گروه زمین کشوری (سه‌گانه) — دکل‌های plain/hilly هر دو به plain_hilly می‌روند */
export type TerrainGroup = "plain_hilly" | "semi_mountainous" | "impassable";
export type CoefficientKind =
  | "two_person"
  | "bundle_2"
  | "bundle_3"
  | "bundle_4"
  | "double_insulator"
  | "terrain_semi_mountainous"
  | "terrain_impassable"
  | "tower_wooden_concrete"
  | "tower_telescopic"
  | "tower_h_pole"
  | "other";

export interface ParsedBoqItem {
  code: string; // کد ملی یا اختصاصی *<parent>-<n>
  title: string;
  unit: string | null;
  unit_price: number;
  category: string;
  item_kind: ItemKind;
  chapter: number | null;
  parent_code: string | null;
  coefficient_kind: CoefficientKind | null;
  sort_order: number;
  activity_type: ActivityType | null;
  inspection_method: InspectionMethod | null;
  voltage_kv: number | null;
  circuit_count: number | null;
  bundle_count: number | null;
  terrain_type: TerrainGroup | null;
}

// ─────────────────────────────── نرمال‌سازی متن فارسی
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
const EN_DIGITS = "01234567890123456789";

export function normalizeFa(input: unknown): string {
  if (input === null || input === undefined) return "";
  let s = String(input);
  let out = "";
  for (const ch of s) {
    const d = FA_DIGITS.indexOf(ch);
    out += d >= 0 ? EN_DIGITS[d] : ch;
  }
  s = out;
  s = s.replace(/\u200c/g, " "); // نیم‌فاصله → فاصله
  s = s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه");
  s = s.replace(/أ/g, "ا").replace(/إ/g, "ا").replace(/ؤ/g, "و");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/چها ر/g, "چهار"); // غلط تایپی رایج در فهرست کشوری
  return s;
}

// ─────────────────────────────── برچسب‌های فارسی
export const CHAPTER_LABELS: Record<number, string> = {
  2: "فصل ۲ — نگهداری",
  7: "فصل ۷ — کشیک و فراخوان",
  8: "فصل ۸ — بازدید پهبادی",
  10: "فصل ۱۰ — تعمیرات",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  inspection: "بازدید",
  repair: "تعمیرات",
  operation: "عملیات",
  service: "خدمات فنی",
};

export const METHOD_LABELS: Record<string, string> = {
  climbing: "صعودی",
  patrol: "پیمایشی",
  drone: "پهبادی",
};

export const TERRAIN_GROUP_LABELS: Record<string, string> = {
  plain_hilly: "دشت و تپه‌ماهور",
  semi_mountainous: "نیمه‌کوهستانی",
  impassable: "صعب‌العبور",
};

export const COEFFICIENT_KIND_LABELS: Record<string, string> = {
  two_person: "بازدید دو نفره",
  bundle_2: "اضافه بها دو باندل",
  bundle_3: "اضافه بها سه باندل",
  bundle_4: "اضافه بها چهار باندل",
  double_insulator: "مقره دوبل",
  terrain_semi_mountainous: "اضافه بها نیمه‌کوهستانی",
  terrain_impassable: "اضافه بها صعب‌العبور",
  tower_wooden_concrete: "کاهش بها تیر چوبی/بتنی",
  tower_telescopic: "کاهش بها دکل تلسکوپی",
  tower_h_pole: "کاهش بها پایه H",
  other: "سایر",
};

export function circuitLabel(n: number | null | undefined): string | null {
  if (n === 1) return "تک‌مداره";
  if (n === 2) return "دو مداره";
  if (n === 4) return "چهارمداره";
  return n ? `${n} مداره` : null;
}

export function bundleLabel(n: number | null | undefined): string | null {
  if (n === 1) return "تک‌باندل";
  if (n === 2) return "دو باندل";
  if (n === 3) return "سه باندل";
  if (n === 4) return "چهار باندل";
  return null;
}

// ─────────────────────────────── فصل از کد
export function chapterOf(code: string): number | null {
  const c = code.replace(/^\*+/, "").trim();
  if (!c) return null;
  if (/^10\d{4,}$/.test(c)) return 10; // 100101..102608 و *1010001
  if (/^2\d{4}$/.test(c)) return 2;
  if (/^7\d{4}$/.test(c)) return 7;
  if (/^8\d{4}$/.test(c)) return 8;
  return null;
}

// ─────────────────────────────── تشخیص نوع ضریب (ردیف بدون کد)
const COEF_RULES: Array<[RegExp, CoefficientKind]> = [
  [/تیر چوبی و بتنی/, "tower_wooden_concrete"],
  [/تلسکوپی/, "tower_telescopic"],
  [/پایه H/, "tower_h_pole"],
  [/دو نفره/, "two_person"],
  [/مقره دوبل/, "double_insulator"],
  [/دو باندل/, "bundle_2"],
  [/سه باندل/, "bundle_3"],
  [/چهار باندل/, "bundle_4"],
  [/نیمه کوهستانی/, "terrain_semi_mountainous"],
  [/صعب العبور و باتلاقی/, "terrain_impassable"],
];

export function detectCoefficientKind(title: string): CoefficientKind | null {
  const t = normalizeFa(title);
  if (!t.includes("کاهش بها") && !t.includes("اضافه بها")) return null;
  for (const [pat, kind] of COEF_RULES) {
    if (pat.test(t)) return kind;
  }
  return "other";
}

export function isCoefficientTitle(title: string): boolean {
  const t = normalizeFa(title);
  return t.includes("کاهش بها") || t.includes("اضافه بها");
}

// ─────────────────────────────── پارس ردیف اصلی
export interface BaseClassification {
  chapter: number | null;
  activity_type: ActivityType | null;
  inspection_method: InspectionMethod | null;
  voltage_kv: number | null;
  circuit_count: number | null;
  bundle_count: number | null;
  terrain_type: TerrainGroup | null;
}

export function parseBaseClassification(code: string, rawTitle: string): BaseClassification {
  const t = normalizeFa(rawTitle);
  const chapter = chapterOf(code);
  const out: BaseClassification = {
    chapter,
    activity_type: null,
    inspection_method: null,
    voltage_kv: null,
    circuit_count: null,
    bundle_count: null,
    terrain_type: null,
  };

  // روش بازدید
  if (/پیمایشی/.test(t)) out.inspection_method = "patrol";
  else if (/صعودی/.test(t)) out.inspection_method = "climbing";
  else if (/پهپاد/.test(t)) out.inspection_method = "drone";

  // نوع فعالیت — کلیدواژه با اولویت، سپس fallback فصل
  if (out.inspection_method || /بازدید/.test(t)) out.activity_type = "inspection";
  else if (/کشیک|فراخوان|اعزام/.test(t)) out.activity_type = "operation";
  else if (/اندازه گیری|آزمون|ترموویژن|کرونا|جمع اوری و ثبت|برداشت اطلاعات|فلش|مکاتبات|پیگیری|اخذ مجوز|گزارش تحلیلی/.test(t))
    out.activity_type = "service";
  else if (/تعویض|نصب|اصلاح|سرویس|جوش|رنگ|پاکسازی|پاک تراشی|درخت زنی|شاخه زنی|حمل|ترمیم|تعمیر|حفر|خواباندن|کوبیدن|برکناری|قطع|افزایش مدت/.test(t))
    out.activity_type = "repair";
  else
    out.activity_type =
      ({ 7: "operation", 8: "inspection", 10: "repair", 2: "service" } as Record<number, ActivityType>)[chapter ?? 0] ?? null;

  // ولتاژ («فوق توزیع» = ۶۳؛ «کلیه سطوح» = NULL)
  const vm = t.match(/(\d{2,3})\s*کیلوولت/);
  if (vm) out.voltage_kv = parseInt(vm[1], 10);
  else if (t.includes("فوق توزیع")) out.voltage_kv = 63;

  // مدار
  if (/تک مداره|تکمداره/.test(t)) out.circuit_count = 1;
  else if (/دو مداره|دومداره/.test(t)) out.circuit_count = 2;
  else if (/چهار مداره|چهارمداره/.test(t)) out.circuit_count = 4;

  // باندل — صریح؛ نبودنش در اقلام مداردار/بازدید = تک‌باندل (قاعده کشوری)
  if (/یک باندل|یگ باندل|تک باندل|تکباندل/.test(t)) out.bundle_count = 1;
  else if (/دو باندل|دوباندل/.test(t)) out.bundle_count = 2;
  else if (/سه باندل|سهباندل/.test(t)) out.bundle_count = 3;
  else if (/چهار باندل|چهارباندل/.test(t)) out.bundle_count = 4;
  else if (out.circuit_count !== null || out.inspection_method !== null) out.bundle_count = 1;

  // نوع زمین — گروه‌بندی سه‌گانه کشوری
  if (/دشت و تپه ماهور|در دشت/.test(t)) out.terrain_type = "plain_hilly";
  else if (/نیمه کوهستانی|جنگل/.test(t)) out.terrain_type = "semi_mountainous";
  else if (/صعب العبور|باتلاقی|شالیزار/.test(t)) out.terrain_type = "impassable";

  return out;
}

// ─────────────────────────────── پردازش ردیف‌های فرمت استاندارد
export interface RawBoqRow {
  code: string; // ممکن است خالی باشد (ردیف ضریب)
  title: string;
  unit: string | null;
  unit_price: number | null;
}

/** ردیف خام اکسل استاندارد → اقلام کامل با کد اختصاصی و والد */
export function processStandardBoqRows(rawRows: RawBoqRow[]): {
  items: ParsedBoqItem[];
  warnings: string[];
} {
  const items: ParsedBoqItem[] = [];
  const warnings: string[] = [];
  let parentCode: string | null = null;
  const coefSeq: Record<string, number> = {};
  let sort = 0;

  for (const raw of rawRows) {
    const title = String(raw.title ?? "").trim();
    if (!title) continue;
    sort += 1;
    const code = String(raw.code ?? "").trim();
    const price = typeof raw.unit_price === "number" && isFinite(raw.unit_price) ? raw.unit_price : 0;
    if (raw.unit_price === null || raw.unit_price === undefined || !isFinite(Number(raw.unit_price))) {
      warnings.push(`ردیف ${sort}: قیمت خالی/نامعتبر — صفر ثبت شد (${title.slice(0, 40)}…)`);
    }

    if (code) {
      // ── ردیف اصلی (کد ملی) ──
      parentCode = code;
      const cls = parseBaseClassification(code, title);
      items.push({
        code,
        title,
        unit: raw.unit || null,
        unit_price: price,
        category: CHAPTER_LABELS[cls.chapter ?? 0] ?? "",
        item_kind: "base",
        parent_code: null,
        coefficient_kind: null,
        sort_order: sort,
        ...cls,
      });
    } else {
      // ── ردیف ضریب (بدون کد) → کد اختصاصی *<والد>-<n> ──
      if (!parentCode) {
        warnings.push(`ردیف ${sort}: ضریب بدون ردیف والد — نادیده گرفته شد (${title.slice(0, 40)}…)`);
        continue;
      }
      coefSeq[parentCode] = (coefSeq[parentCode] ?? 0) + 1;
      const privateCode = `*${parentCode}-${coefSeq[parentCode]}`;
      const chapter = chapterOf(parentCode);
      items.push({
        code: privateCode,
        title,
        unit: raw.unit || null,
        unit_price: price,
        category: CHAPTER_LABELS[chapter ?? 0] ?? "",
        item_kind: "coefficient",
        parent_code: parentCode,
        coefficient_kind: detectCoefficientKind(title) ?? "other",
        sort_order: sort,
        chapter,
        activity_type: null,
        inspection_method: null,
        voltage_kv: null,
        circuit_count: null,
        bundle_count: null,
        terrain_type: null,
      });
    }
  }
  return { items, warnings };
}

// ─────────────────────────────── کمکی‌های عددی اکسل
/** مقدار عددی سلول اکسل (رشته/عدد/ارقام فارسی) → number | null */
export function parseExcelNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = normalizeFa(v).replace(/[^\d.\-+]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
