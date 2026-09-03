/**
 * منبع واحد حقیقت برای نسخه برنامه
 */
export const APP_VERSION = "v4.3.76";

/** تاریخ انتشار نسخه فعلی */
export const APP_VERSION_DATE = "2026-09-03";

/** مسلسل کوتاه برای نشان دادن در سایدبار */
export function versionBadge(): string {
  return APP_VERSION;
}
