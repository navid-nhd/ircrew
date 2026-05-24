import { useMemo, useState } from 'react';
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, X, CalendarDays, Clock, Check,
} from 'lucide-react';
import {
  jalaliFromIso, isoFromJalali, jalaaliMonthLength,
  persianWeekdayIndex, toFaDigits, cn, todayIso,
} from '../lib/utils';

// Bottom-sheet date+time picker. Combines the calendar grid from
// PersianDatePickerSheet with a stepper time picker (HH up/down, MM up/down).
// All values are reachable — midnight = 00:00 is literally typeable by tapping
// the down arrow on the hour stepper.

const MONTHS_FA = [
  '', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

interface Props {
  /** Current selected value (ISO datetime string). */
  value: string;
  /** Called when the user confirms with "تأیید" — emits an ISO datetime. */
  onChange: (iso: string) => void;
  onClose: () => void;
}

const splitIso = (iso: string) => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { dateIso, hh: d.getHours(), mm: d.getMinutes() };
};

const composeIso = (dateIso: string, hh: number, mm: number): string => {
  // dateIso is YYYY-MM-DD in LOCAL terms — split and rebuild via local-tz Date.
  const [y, m, d] = dateIso.split('-').map(Number);
  const out = new Date(y, m - 1, d, hh, mm, 0, 0);
  return out.toISOString();
};

export function PersianDateTimeSheet({ value, onChange, onClose }: Props) {
  const initial = splitIso(value);
  const [dateIso, setDateIso] = useState(initial.dateIso);
  const [hh, setHh] = useState(initial.hh);
  const [mm, setMm] = useState(initial.mm);

  const initialJ = jalaliFromIso(dateIso);
  const todayJ = jalaliFromIso(todayIso());
  const [viewYear, setViewYear] = useState(initialJ.jy || todayJ.jy);
  const [viewMonth, setViewMonth] = useState(initialJ.jm || todayJ.jm);
  const [view, setView] = useState<'days' | 'years'>('days');

  const grid = useMemo(() => {
    const daysInMonth = jalaaliMonthLength(viewYear, viewMonth);
    const firstIso = isoFromJalali(viewYear, viewMonth, 1);
    const firstCol = persianWeekdayIndex(firstIso);
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

  const bumpHour = (delta: number) => setHh((prev) => (prev + delta + 24) % 24);
  const bumpMin  = (delta: number) => setMm((prev) => (prev + delta * 5 + 60) % 60);

  const confirm = () => {
    onChange(composeIso(dateIso, hh, mm));
    onClose();
  };

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const selectedJ = jalaliFromIso(dateIso);

  return (
    <div className="fixed inset-0 z-[60] grid items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-rise" />
      <div
        className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise text-slate-900 dark:text-slate-100 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Drag handle + header */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto absolute right-1/2 translate-x-1/2 top-2" />
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 grid place-items-center shrink-0">
            <CalendarDays className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 pt-1 min-w-0">
            <div className="text-[15px] font-extrabold leading-tight">انتخاب تاریخ و ساعت</div>
            <div className="text-[11.5px] opacity-65 leading-tight mt-0.5 tabular-nums">
              {toFaDigits(selectedJ.jd)} {MONTHS_FA[selectedJ.jm]} {toFaDigits(selectedJ.jy)} ·{' '}
              <span dir="ltr">{pad2(hh)}:{pad2(mm)}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month nav */}
        <div className="px-4 pb-2 flex items-center gap-2">
          <button onClick={() => stepMonth(1)} aria-label="ماه قبل"
            className="w-10 h-10 grid place-items-center rounded-xl bg-slate-100 dark:bg-slate-800/60 active:scale-95">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setView(view === 'days' ? 'years' : 'days')}
            className="flex-1 h-10 rounded-xl bg-gradient-to-br from-brand-500/10 to-brand-700/5 ring-1 ring-brand-500/20 active:scale-[0.99] flex items-center justify-center gap-2">
            <span className="text-[15px] font-extrabold">{MONTHS_FA[viewMonth]}</span>
            <span className="text-[14px] font-bold opacity-70 tabular-nums">{toFaDigits(viewYear)}</span>
          </button>
          <button onClick={() => stepMonth(-1)} aria-label="ماه بعد"
            className="w-10 h-10 grid place-items-center rounded-xl bg-slate-100 dark:bg-slate-800/60 active:scale-95">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {view === 'days' && (
          <>
            <div className="px-3 grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS_SHORT.map((wd, i) => (
                <div key={i} className={cn(
                  'text-center text-[11px] font-bold py-1 tracking-wider',
                  i === 6 ? 'text-rose-500/80' : 'text-slate-400 dark:text-slate-500',
                )}>{wd}</div>
              ))}
            </div>
            <div className="px-3 pb-2 grid grid-cols-7 gap-1">
              {grid.map((c, i) => {
                if (!c) return <div key={i} className="aspect-square" />;
                const isSelected = c.iso === dateIso;
                const isToday = c.iso === todayIso();
                return (
                  <button key={c.iso}
                    onClick={() => setDateIso(c.iso)}
                    className={cn(
                      'relative aspect-square rounded-lg flex items-center justify-center transition-all',
                      'text-[14px] font-extrabold tabular-nums',
                      isSelected
                        ? 'bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-900/30 ring-2 ring-brand-500/40 scale-[1.05]'
                        : isToday
                          ? 'ring-2 ring-brand-500 text-brand-700 dark:text-brand-300 bg-white dark:bg-slate-900'
                          : c.isFriday
                            ? 'text-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                            : 'text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/50',
                      'active:scale-95',
                    )}>
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
              {Array.from({ length: 20 }, (_, i) => todayJ.jy + 5 - i).map((y) => (
                <button key={y}
                  onClick={() => { setViewYear(y); setView('days'); }}
                  className={cn(
                    'h-12 rounded-xl text-[14px] font-extrabold tabular-nums transition-all active:scale-95',
                    y === viewYear
                      ? 'bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100',
                  )}>
                  {toFaDigits(y)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Time picker — big, two steppers + quick-pick chips ─── */}
        <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-br from-brand-500/10 via-brand-600/5 to-transparent ring-1 ring-brand-500/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span className="text-[12.5px] font-extrabold opacity-80">ساعت</span>
            <div className="flex-1" />
            <div className="text-[26px] font-black tabular-nums leading-none" dir="ltr">
              {toFaDigits(pad2(hh))}<span className="opacity-50 mx-1">:</span>{toFaDigits(pad2(mm))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" dir="ltr">
            {/* Hour stepper */}
            <Stepper label="HOUR / ساعت" value={pad2(hh)} onUp={() => bumpHour(+1)} onDown={() => bumpHour(-1)} />
            {/* Minute stepper */}
            <Stepper label="MIN / دقیقه" value={pad2(mm)} onUp={() => bumpMin(+1)} onDown={() => bumpMin(-1)} step="۵" />
          </div>

          {/* Quick picks — including midnight (00:00) */}
          <div className="mt-3 grid grid-cols-4 gap-1.5" dir="ltr">
            {[[0,0],[6,0],[12,0],[18,0],[3,0],[9,0],[15,0],[21,0]].map(([h, m]) => (
              <button key={`${h}:${m}`}
                onClick={() => { setHh(h); setMm(m); }}
                className={cn(
                  'h-9 rounded-lg text-[12px] font-extrabold tabular-nums transition-all active:scale-95',
                  hh === h && mm === m
                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md'
                    : 'bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 text-slate-700 dark:text-slate-200',
                )}>
                {pad2(h)}:{pad2(m)}
              </button>
            ))}
          </div>
        </div>

        {/* Action bar */}
        <div className="px-4 pb-3 flex gap-2" dir="rtl">
          <button onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[13px] font-extrabold active:scale-[0.99]">
            لغو
          </button>
          <button onClick={confirm}
            className="flex-[2] h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white text-[13.5px] font-extrabold active:scale-[0.99] flex items-center justify-center gap-1.5 shadow-md shadow-brand-900/20">
            <Check className="w-4 h-4" strokeWidth={2.8} />
            تأیید
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact +/- stepper component used for HH and MM.
function Stepper({ label, value, onUp, onDown, step }: {
  label: string; value: string; onUp: () => void; onDown: () => void; step?: string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
      <div className="text-[9.5px] font-bold opacity-60 text-center pt-1.5 tracking-wider">
        {label}{step ? ` · گام ${step}` : ''}
      </div>
      <div className="flex items-stretch">
        <button onClick={onDown}
          className="w-12 h-14 grid place-items-center text-brand-600 dark:text-brand-400 active:bg-brand-500/15 transition-colors">
          <ChevronDown className="w-5 h-5" strokeWidth={2.8} />
        </button>
        <div className="flex-1 grid place-items-center text-[34px] font-black tabular-nums leading-none">
          {value}
        </div>
        <button onClick={onUp}
          className="w-12 h-14 grid place-items-center text-brand-600 dark:text-brand-400 active:bg-brand-500/15 transition-colors">
          <ChevronUp className="w-5 h-5" strokeWidth={2.8} />
        </button>
      </div>
    </div>
  );
}

// Inline trigger button — shows current date+time and opens the sheet on tap.
interface ButtonProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}

export function PersianDateTimeButton({ value, onChange, placeholder = 'انتخاب تاریخ و ساعت' }: ButtonProps) {
  const [open, setOpen] = useState(false);
  const d = value ? new Date(value) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  let label = placeholder;
  if (d) {
    const j = jalaliFromIso(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    label = `${toFaDigits(j.jd)} ${MONTHS_FA[j.jm]} ${toFaDigits(j.jy)}`;
  }
  const timeLabel = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '--:--';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-stretch gap-2 rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 hover:ring-emerald-500 dark:hover:ring-emerald-500 transition-all overflow-hidden active:scale-[0.99]"
      >
        <div className="w-11 grid place-items-center bg-gradient-to-br from-brand-500 to-brand-800 text-white">
          <CalendarDays className="w-4 h-4" strokeWidth={2.4} />
        </div>
        <div className="flex-1 flex items-center gap-3 px-3 py-2 min-w-0" dir="rtl">
          <div className="flex-1 text-right min-w-0">
            <div className="text-[12.5px] font-extrabold truncate">{label}</div>
            <div className="text-[10px] opacity-60 font-bold tracking-wider">تاریخ شمسی</div>
          </div>
          <div className="shrink-0 text-left">
            <div className="text-[16px] font-black tabular-nums leading-none" dir="ltr">{toFaDigits(timeLabel)}</div>
            <div className="text-[10px] opacity-60 font-bold mt-1 text-center">ساعت</div>
          </div>
        </div>
      </button>
      {open && (
        <PersianDateTimeSheet
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
