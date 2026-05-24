import { useMemo } from 'react';
import {
  toJalaali, toGregorian, jalaaliMonthLength,
} from 'jalaali-js';

interface Props {
  value: string;          // ISO datetime
  onChange: (iso: string) => void;
  withTime?: boolean;
  /** Earliest year (Jalali) to show. Default = current - 5. */
  minJYear?: number;
  /** Latest year (Jalali) to show. Default = current + 2. */
  maxJYear?: number;
}

const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

const toFa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Persian (Jalali) date+time picker — four selects so EVERY value is
 * reachable on every locale:
 *
 *   ‏ سال / ماه / روز / ساعت (۰۰–۲۳) / دقیقه (۰۰–۵۵ step 5)
 *
 * Avoids the native <input type="time"> which renders as a 12-hour AM/PM
 * spinner in many browser/locale combos and hides midnight (00:00).
 */
export default function PersianDateTime({
  value, onChange, withTime = true, minJYear, maxJYear,
}: Props) {
  const date = value ? new Date(value) : new Date();

  // Convert the Gregorian date to Jalali parts for display
  const { jy, jm, jd, hh, mm } = useMemo(() => {
    const j = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return {
      jy: j.jy,
      jm: j.jm,
      jd: j.jd,
      hh: date.getHours(),
      mm: date.getMinutes(),
    };
  }, [date.getTime()]);

  // Bounds for the year dropdown
  const todayJ = useMemo(() => {
    const t = new Date();
    return toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }, []);
  const yMin = minJYear ?? (todayJ.jy - 5);
  const yMax = maxJYear ?? (todayJ.jy + 2);

  // Days available in the chosen Jalali month/year
  const daysInMonth = jalaaliMonthLength(jy, jm);

  const emit = (parts: { jy: number; jm: number; jd: number; hh: number; mm: number }) => {
    // Clamp day to month length first
    const len = jalaaliMonthLength(parts.jy, parts.jm);
    const safeDay = Math.min(parts.jd, len);
    const g = toGregorian(parts.jy, parts.jm, safeDay);
    const d = new Date(g.gy, g.gm - 1, g.gd, parts.hh, parts.mm, 0, 0);
    onChange(d.toISOString());
  };

  const setY = (y: number) => emit({ jy: y, jm, jd, hh, mm });
  const setM = (m: number) => emit({ jy, jm: m, jd, hh, mm });
  const setD = (d: number) => emit({ jy, jm, jd: d, hh, mm });
  const setH = (h: number) => emit({ jy, jm, jd, hh: h, mm });
  const setMin = (mi: number) => emit({ jy, jm, jd, hh, mm: mi });

  // Year list, descending (newest first)
  const years: number[] = [];
  for (let y = yMax; y >= yMin; y--) years.push(y);

  // Minute steps — 5 minutes is granular enough for crew scheduling and
  // keeps the dropdown short (12 items).
  const minuteOptions: number[] = [];
  for (let m = 0; m <= 55; m += 5) minuteOptions.push(m);
  // Always include the current minute so an externally-set odd value stays
  // visible (e.g. when initial value is 04:23).
  if (!minuteOptions.includes(mm)) {
    minuteOptions.push(mm);
    minuteOptions.sort((a, b) => a - b);
  }

  const hourOptions: number[] = [];
  for (let h = 0; h <= 23; h++) hourOptions.push(h);

  return (
    <div className="pdt-wrap">
      <select className="pdt-part" value={jy} onChange={(e) => setY(Number(e.target.value))} aria-label="سال">
        {years.map((y) => (
          <option key={y} value={y}>{toFa(y)}</option>
        ))}
      </select>
      <select className="pdt-part pdt-month" value={jm} onChange={(e) => setM(Number(e.target.value))} aria-label="ماه">
        {PERSIAN_MONTHS.map((name, i) => (
          <option key={i} value={i + 1}>{name}</option>
        ))}
      </select>
      <select className="pdt-part" value={jd} onChange={(e) => setD(Number(e.target.value))} aria-label="روز">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{toFa(d)}</option>
        ))}
      </select>
      {withTime && (
        <div className="pdt-time-group" dir="ltr">
          <select className="pdt-part pdt-hh" value={hh} onChange={(e) => setH(Number(e.target.value))} aria-label="ساعت">
            {hourOptions.map((h) => (
              <option key={h} value={h}>{pad2(h)}</option>
            ))}
          </select>
          <span className="pdt-sep">:</span>
          <select className="pdt-part pdt-mm" value={mm} onChange={(e) => setMin(Number(e.target.value))} aria-label="دقیقه">
            {minuteOptions.map((m) => (
              <option key={m} value={m}>{pad2(m)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
