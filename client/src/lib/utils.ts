import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';
export { jalaaliMonthLength };

export function parseDepArrCell(s: string): { iso: string; time: string; weekday: string; jalali: string } {
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\w{3})\s+(\d{4}\/\d{2}\/\d{2})/);
  if (!m) return { iso: '', time: '', weekday: '', jalali: '' };
  return { iso: m[1], time: m[2], weekday: m[3], jalali: m[4] };
}

const WEEKDAY_FA: Record<string, string> = {
  Sat: 'شنبه', Sun: 'یکشنبه', Mon: 'دوشنبه', Tue: 'سه‌شنبه',
  Wed: 'چهارشنبه', Thu: 'پنج‌شنبه', Fri: 'جمعه',
};
const WEEKDAY_FA_SHORT: Record<string, string> = {
  Sat: 'شـ', Sun: 'یکـ', Mon: 'دو', Tue: 'سهـ',
  Wed: 'چهـ', Thu: 'پنـ', Fri: 'جـ',
};
export const weekdayFa = (en: string) => WEEKDAY_FA[en] ?? en;
export const weekdayFaShort = (en: string) => WEEKDAY_FA_SHORT[en] ?? en;

const JAL_MONTHS_FA: Record<number, string> = {
  1: 'فروردین', 2: 'اردیبهشت', 3: 'خرداد', 4: 'تیر', 5: 'مرداد', 6: 'شهریور',
  7: 'مهر', 8: 'آبان', 9: 'آذر', 10: 'دی', 11: 'بهمن', 12: 'اسفند',
};
const JAL_MONTHS_FA_SHORT: Record<number, string> = {
  1: 'فرو', 2: 'ارد', 3: 'خرد', 4: 'تیر', 5: 'مرد', 6: 'شهـ',
  7: 'مهـ', 8: 'آبا', 9: 'آذر', 10: 'دی', 11: 'بهـ', 12: 'اسـ',
};

export function jalaliShort(jal: string): string {
  const m = jal.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return jal;
  const [, y, mo, d] = m;
  return `${Number(d)} ${JAL_MONTHS_FA[Number(mo)]} ${y}`;
}

export function jalaliFromIso(iso: string): { jy: number; jm: number; jd: number } {
  const parts = String(iso ?? '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || y < 1700 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) {
    return { jy: 0, jm: 0, jd: 0 };
  }
  return toJalaali(y, m, d);
}

export function isoFromJalali(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

export function periodLabelFa(p: string): string {
  // "2026-04-21 till 2026-05-21" → "ارد ۱۴۰۵ — خرد ۱۴۰۵"
  const m = p.match(/^(\d{4}-\d{2}-\d{2})\s+till\s+(\d{4}-\d{2}-\d{2})$/);
  if (!m) return p;
  const a = jalaliFromIso(m[1]);
  const b = jalaliFromIso(m[2]);
  if (a.jm === b.jm && a.jy === b.jy) return `${JAL_MONTHS_FA[a.jm]} ${a.jy}`;
  return `${JAL_MONTHS_FA[a.jm]} – ${JAL_MONTHS_FA[b.jm]} ${b.jy}`;
}

export function periodLabelGregorianFa(p: string): string {
  const m = p.match(/^(\d{4}-\d{2}-\d{2})\s+till\s+(\d{4}-\d{2}-\d{2})$/);
  return m ? `${m[1]} – ${m[2]}` : p;
}

export function dateToOffset(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const EPOCH = Date.UTC(2000, 0, 1);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
}

export const todayIso = (): string => {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export function cn(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ');
}

export function formatJalaliFull(iso: string): string {
  if (!iso) return '';
  const { jy, jm, jd } = jalaliFromIso(iso);
  if (!jy) return '';
  return `${jd} ${JAL_MONTHS_FA[jm]} ${jy}`;
}

export function shortJalaliBadge(iso: string): { day: string; month: string; year: string } {
  const { jy, jm, jd } = jalaliFromIso(iso);
  if (!jy) return { day: '', month: '', year: '' };
  return { day: String(jd), month: JAL_MONTHS_FA_SHORT[jm], year: String(jy) };
}

// Saturday-indexed weekday for Persian calendar (0=Sat ... 6=Fri)
export function persianWeekdayIndex(iso: string): number {
  const d = new Date(iso + 'T00:00:00Z');
  return (d.getUTCDay() + 1) % 7;
}

const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
export const toFaDigits = (n: number | string): string =>
  String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

export const greetingFa = (): string => {
  const h = new Date().getHours();
  if (h < 5)  return 'شب بخیر';
  if (h < 12) return 'صبح بخیر';
  if (h < 17) return 'ظهر بخیر';
  if (h < 20) return 'عصر بخیر';
  return 'شب بخیر';
};
