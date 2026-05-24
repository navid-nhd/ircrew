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

/**
 * A simple, dependency-light Persian (Jalali) date+time picker.
 * Shows three selects (year / month / day) plus a native HTML time input.
 * Stores the value internally as an ISO datetime string.
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

  // Year list, descending (newest first)
  const years: number[] = [];
  for (let y = yMax; y >= yMin; y--) years.push(y);

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
        // Two compact 24h selects in a unified pill — keeps the "single time
        // field" look but every value is reachable (including 00:00/00:30
        // which the native <input type="time"> hides under 12-hour AM/PM
        // on some Persian-locale browsers).
        <span className="pdt-time pdt-time-split" dir="ltr">
          <select
            className="pdt-time-cell"
            value={hh}
            onChange={(e) => emit({ jy, jm, jd, hh: Number(e.target.value), mm })}
            aria-label="ساعت"
          >
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
            ))}
          </select>
          <span className="pdt-time-sep">:</span>
          <select
            className="pdt-time-cell"
            value={mm}
            onChange={(e) => emit({ jy, jm, jd, hh, mm: Number(e.target.value) })}
            aria-label="دقیقه"
          >
            {(() => {
              const opts: number[] = [];
              for (let m = 0; m <= 55; m += 5) opts.push(m);
              if (!opts.includes(mm)) { opts.push(mm); opts.sort((a, b) => a - b); }
              return opts.map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ));
            })()}
          </select>
        </span>
      )}
    </div>
  );
}
