import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, X, CalendarDays, Sunrise } from 'lucide-react';
import {
  jalaliFromIso, isoFromJalali, jalaaliMonthLength,
  persianWeekdayIndex, toFaDigits, cn, todayIso,
} from '../lib/utils';

// Custom Jalali date picker built for IRCrew's mobile-first design.
//   • Full-width 7×6 grid with square day cells (no third-party library).
//   • Month / year navigation arrows + a one-tap "today" button.
//   • Today + selected + Friday cells get distinct styling.
//   • Year-grid quick navigation for years far in the past.

const MONTHS_FA = [
  '', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

interface Props {
  /** ISO date currently selected (YYYY-MM-DD, Gregorian). */
  iso: string;
  /** Called when the user taps a day. */
  onPick: (iso: string) => void;
  onClose: () => void;
}

type View = 'days' | 'years';

export function PersianDatePickerSheet({ iso, onPick, onClose }: Props) {
  const initialJalali = jalaliFromIso(iso);
  const todayJalali = jalaliFromIso(todayIso());
  const [view, setView] = useState<View>('days');
  // The month currently being displayed (independent of the selected date).
  const [viewYear, setViewYear] = useState(initialJalali.jy);
  const [viewMonth, setViewMonth] = useState(initialJalali.jm);

  // Build the 42-cell grid for the displayed month.
  const grid = useMemo(() => {
    const daysInMonth = jalaaliMonthLength(viewYear, viewMonth);
    const firstIso = isoFromJalali(viewYear, viewMonth, 1);
    const firstCol = persianWeekdayIndex(firstIso); // 0=Saturday … 6=Friday
    const totalCells = Math.ceil((firstCol + daysInMonth) / 7) * 7;
    const cells: Array<{ jd: number; iso: string; isFriday: boolean } | null> = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstCol + 1;
      if (dayNum < 1 || dayNum > daysInMonth) { cells.push(null); continue; }
      const dayIso = isoFromJalali(viewYear, viewMonth, dayNum);
      cells.push({ jd: dayNum, iso: dayIso, isFriday: i % 7 === 6 });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const stepMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m > 12) { m -= 12; y += 1; }
    if (m < 1)  { m += 12; y -= 1; }
    setViewMonth(m); setViewYear(y);
  };

  const goToday = () => {
    setViewYear(todayJalali.jy); setViewMonth(todayJalali.jm); setView('days');
    onPick(todayIso());
  };

  return (
    <div className="fixed inset-0 z-40 grid items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-rise" />
      <div
        className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header strip */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto absolute right-1/2 translate-x-1/2 top-2" />
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 grid place-items-center shrink-0">
            <CalendarDays className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 pt-1 min-w-0">
            <div className="text-[15px] font-extrabold leading-tight">انتخاب تاریخ</div>
            <div className="text-[11.5px] opacity-65 leading-tight mt-0.5">تقویم شمسی</div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month / year navigation row */}
        <div className="px-4 pb-2 flex items-center gap-2">
          <button
            onClick={() => stepMonth(1)}
            aria-label="ماه قبل"
            className="w-10 h-10 grid place-items-center rounded-xl bg-slate-100 dark:bg-slate-800/60 active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView(view === 'days' ? 'years' : 'days')}
            className="flex-1 h-10 rounded-xl bg-gradient-to-br from-brand-500/10 to-brand-700/5 ring-1 ring-brand-500/20 active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <span className="text-[15px] font-extrabold">{MONTHS_FA[viewMonth]}</span>
            <span className="text-[14px] font-bold opacity-70 tabular-nums">{toFaDigits(viewYear)}</span>
          </button>
          <button
            onClick={() => stepMonth(-1)}
            aria-label="ماه بعد"
            className="w-10 h-10 grid place-items-center rounded-xl bg-slate-100 dark:bg-slate-800/60 active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {view === 'days' && (
          <>
            {/* Weekday headings */}
            <div className="px-3 grid grid-cols-7 gap-1.5 mb-1">
              {WEEKDAYS_SHORT.map((wd, i) => (
                <div
                  key={i}
                  className={cn(
                    'text-center text-[11px] font-bold py-1.5 tracking-wider',
                    i === 6 ? 'text-rose-500/80' : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="px-3 pb-3 grid grid-cols-7 gap-1.5">
              {grid.map((c, i) => {
                if (!c) return <div key={i} className="aspect-square" />;
                const isSelected = c.iso === iso;
                const isToday = c.iso === todayIso();
                return (
                  <button
                    key={c.iso}
                    onClick={() => onPick(c.iso)}
                    className={cn(
                      'relative aspect-square rounded-xl flex items-center justify-center transition-all',
                      'text-[15px] font-extrabold tabular-nums',
                      isSelected
                        ? 'bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-900/30 ring-2 ring-brand-500/40 scale-[1.05]'
                        : isToday
                          ? 'ring-2 ring-brand-500 text-brand-700 dark:text-brand-300 bg-white dark:bg-slate-900'
                          : c.isFriday
                            ? 'text-rose-500 bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-100/70 dark:hover:bg-rose-900/40'
                            : 'text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/50 hover:bg-brand-500/10 dark:hover:bg-brand-900/30',
                      'active:scale-95',
                    )}
                  >
                    {toFaDigits(c.jd)}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {view === 'years' && (
          <div className="px-3 pb-3">
            <div className="grid grid-cols-4 gap-1.5 max-h-[40vh] overflow-y-auto no-scrollbar">
              {Array.from({ length: 20 }, (_, i) => todayJalali.jy + 5 - i).map((y) => (
                <button
                  key={y}
                  onClick={() => { setViewYear(y); setView('days'); }}
                  className={cn(
                    'h-12 rounded-xl text-[14px] font-extrabold tabular-nums transition-all active:scale-95',
                    y === viewYear
                      ? 'bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 hover:bg-brand-500/15',
                  )}
                >
                  {toFaDigits(y)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={goToday}
            className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[13px] font-extrabold flex items-center justify-center gap-1.5 active:scale-[0.99]"
          >
            <Sunrise className="w-4 h-4" strokeWidth={2.4} />
            امروز
          </button>
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white text-[13px] font-extrabold active:scale-[0.99]"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
