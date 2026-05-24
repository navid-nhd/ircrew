import { useMemo } from 'react';
import { Plane, GraduationCap, Stethoscope, BookUser, Users2, Ban, Briefcase, Armchair, Palmtree, Building2, Moon } from 'lucide-react';
import type { RosterRow, DutyKind } from '../lib/types';
import {
  jalaliFromIso, isoFromJalali, jalaaliMonthLength, persianWeekdayIndex,
  toFaDigits, cn,
} from '../lib/utils';

const PERSIAN_WEEKDAYS_SHORT = ['ش','ی','د','س','چ','پ','ج'];
const PERSIAN_WEEKDAYS_FULL  = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];
const JAL_MONTHS = [
  '', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
const GREG_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

interface Props {
  rows: RosterRow[];
  periodStartIso: string;
  todayIso: string;
  selectedIso: string;
  onSelect: (iso: string) => void;
}

type Kind = DutyKind | 'NONE';

interface CellData {
  empty: boolean;
  iso?: string;
  jd?: number;
  isToday?: boolean;
  isSelected?: boolean;
  isFriday?: boolean;
  kind?: Kind;
  flightCount?: number;
  firstFlightCode?: string;
}

// Higher-priority kinds win for a given day's dominant indicator.
const KIND_PRIORITY: Kind[] = ['FLIGHT', 'DEADHEAD', 'REJECT', 'GROUND', 'OFC', 'TRAIN', 'MED', 'PASS', 'MEET', 'RSV', 'LAYOVER', 'RST', 'OFF', 'OTHER'];
function dominantKind(events: RosterRow[]): Kind {
  if (!events.length) return 'NONE';
  for (const k of KIND_PRIORITY) {
    if (events.some((e) => e.kind === k)) return k;
  }
  return 'NONE';
}

export function MonthCalendar({ rows, periodStartIso, todayIso, selectedIso, onSelect }: Props) {
  const dayMap = useMemo(() => {
    const m = new Map<string, RosterRow[]>();
    for (const r of rows) {
      const iso = r.depTime.slice(0, 10);
      if (!iso) continue;
      const arr = m.get(iso);
      if (arr) arr.push(r); else m.set(iso, [r]);
    }
    return m;
  }, [rows]);

  const { jy, jm } = jalaliFromIso(periodStartIso);
  if (!jy) return null;

  const daysInMonth = jalaaliMonthLength(jy, jm);
  const firstIso = isoFromJalali(jy, jm, 1);
  const lastIso  = isoFromJalali(jy, jm, daysInMonth);
  const firstCol = persianWeekdayIndex(firstIso);
  const totalCells = Math.ceil((firstCol + daysInMonth) / 7) * 7;

  // Build a Gregorian month range label (Jalali months usually span 2 Greg. months).
  const fd = new Date(firstIso + 'T00:00:00Z');
  const ld = new Date(lastIso  + 'T00:00:00Z');
  const fm = fd.getUTCMonth();
  const lm = ld.getUTCMonth();
  const fy = fd.getUTCFullYear();
  const ly = ld.getUTCFullYear();
  const gregRange =
    fm === lm && fy === ly ? `${GREG_MONTHS[fm]} ${fy}` :
    fy === ly              ? `${GREG_MONTHS[fm]} – ${GREG_MONTHS[lm]} ${fy}` :
                             `${GREG_MONTHS[fm]} ${fy} – ${GREG_MONTHS[lm]} ${ly}`;

  const cells: CellData[] = [];
  for (let i = 0; i < totalCells; i++) {
    const col = i % 7;
    const dayNum = i - firstCol + 1;
    if (dayNum < 1 || dayNum > daysInMonth) { cells.push({ empty: true }); continue; }
    const iso = isoFromJalali(jy, jm, dayNum);
    const events = dayMap.get(iso) ?? [];
    const kind = dominantKind(events);
    const flightEvents = events.filter((e) => e.kind === 'FLIGHT');
    cells.push({
      empty: false,
      iso, jd: dayNum,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      isFriday: col === 6,
      kind,
      flightCount: flightEvents.length,
      firstFlightCode: flightEvents[0]?.kindCode,
    });
  }

  return (
    <div className="glass rounded-3xl p-4 animate-spring">
      <div className="flex items-start justify-between mb-3 px-0.5 gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-extrabold tracking-tight leading-none">
              {JAL_MONTHS[jm]}
            </span>
            <span className="text-[14px] font-bold tabular-nums tracking-[0.08em] opacity-70 leading-none">
              {toFaDigits(jy)}
            </span>
          </div>
          <div className="text-[11px] opacity-55 mt-1.5 tracking-wider font-semibold truncate">
            {gregRange}
          </div>
        </div>
        <Legend />
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {PERSIAN_WEEKDAYS_SHORT.map((wd, i) => (
          <div
            key={i}
            title={PERSIAN_WEEKDAYS_FULL[i]}
            className={cn(
              'text-center text-[11px] font-bold py-1 tracking-wider',
              i === 6 ? 'text-rose-500/80' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (c.empty) return <div key={i} className="aspect-square" />;
          return <Cell key={c.iso} c={c} onClick={() => onSelect(c.iso!)} />;
        })}
      </div>
    </div>
  );
}

interface CellStyle {
  bg: string;
  text: string;
  iconColor: string;
  Icon: typeof Plane | null;
  label: string;
}

const CELL_STYLES: Record<Exclude<Kind, 'NONE'>, CellStyle> = {
  FLIGHT: {
    bg: 'bg-gradient-to-br from-emerald-400 via-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/25 ring-1 ring-emerald-300/40',
    text: '', iconColor: '', Icon: Plane, label: '',
  },
  DEADHEAD: {
    // Same visual weight as a flight (still a duty), but violet tone so the
    // user can tell at a glance they are not the operating crew.
    bg: 'bg-gradient-to-br from-violet-400 via-violet-600 to-fuchsia-700 text-white shadow-lg shadow-violet-900/25 ring-1 ring-violet-300/40',
    text: '', iconColor: '', Icon: Armchair, label: 'D/H',
  },
  LAYOVER: {
    // Soft teal so a layover (rest at outstation) reads as restful but is
    // still visually distinct from a Home-Base OFF day (amber).
    bg: 'bg-gradient-to-br from-teal-100 to-cyan-200 dark:from-teal-950/55 dark:to-cyan-900/40 ring-1 ring-teal-300/40 dark:ring-teal-700/40',
    text: 'text-teal-800 dark:text-teal-200',
    iconColor: 'text-teal-700 dark:text-teal-300',
    Icon: Palmtree, label: 'L/O',
  },
  OFC: {
    // Saturated blue — clearly "office", clearly NOT neutral grey.
    bg: 'bg-gradient-to-br from-blue-200 to-blue-300 dark:from-blue-900/60 dark:to-blue-800/45 ring-1 ring-blue-400/50 dark:ring-blue-600/45',
    text: 'text-blue-900 dark:text-blue-100',
    iconColor: 'text-blue-700 dark:text-blue-200',
    Icon: Building2, label: 'OFC',
  },
  RST: {
    // Bolder indigo-to-purple "deep sleep" tone — unmistakable vs OFF
    // (amber) and LAYOVER (teal).
    bg: 'bg-gradient-to-br from-indigo-200 to-purple-300 dark:from-indigo-900/60 dark:to-purple-900/45 ring-1 ring-indigo-400/50 dark:ring-indigo-600/45',
    text: 'text-indigo-900 dark:text-indigo-100',
    iconColor: 'text-indigo-700 dark:text-indigo-200',
    Icon: Moon, label: 'RST',
  },
  TRAIN: {
    bg: 'bg-gradient-to-br from-sky-100 to-sky-200 dark:from-sky-950/55 dark:to-sky-900/40 ring-1 ring-sky-300/40 dark:ring-sky-700/40',
    text: 'text-sky-800 dark:text-sky-200',
    iconColor: 'text-sky-700 dark:text-sky-300',
    Icon: GraduationCap, label: 'REC',
  },
  MED: {
    bg: 'bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-950/55 dark:to-rose-900/40 ring-1 ring-rose-300/40 dark:ring-rose-700/40',
    text: 'text-rose-800 dark:text-rose-200',
    iconColor: 'text-rose-700 dark:text-rose-300',
    Icon: Stethoscope, label: 'MED',
  },
  PASS: {
    bg: 'bg-gradient-to-br from-cyan-100 to-cyan-200 dark:from-cyan-950/55 dark:to-cyan-900/40 ring-1 ring-cyan-300/40 dark:ring-cyan-700/40',
    text: 'text-cyan-800 dark:text-cyan-200',
    iconColor: 'text-cyan-700 dark:text-cyan-300',
    Icon: BookUser, label: 'PSP',
  },
  MEET: {
    bg: 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/60 dark:to-slate-700/40 ring-1 ring-slate-300/40 dark:ring-slate-700/40',
    text: 'text-slate-800 dark:text-slate-200',
    iconColor: 'text-slate-600 dark:text-slate-300',
    Icon: Users2, label: 'MTG',
  },
  REJECT: {
    bg: 'bg-gradient-to-br from-orange-100 to-red-200 dark:from-orange-950/55 dark:to-red-900/40 ring-1 ring-orange-300/40 dark:ring-orange-700/40',
    text: 'text-red-800 dark:text-orange-200',
    iconColor: 'text-orange-700 dark:text-orange-300',
    Icon: Ban, label: 'REF',
  },
  GROUND: {
    bg: 'bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-900/55 dark:to-amber-950/45 ring-1 ring-amber-700/40 dark:ring-amber-700/40',
    text: 'text-amber-900 dark:text-amber-100',
    iconColor: 'text-amber-800 dark:text-amber-200',
    Icon: Briefcase, label: 'GND',
  },
  RSV: {
    bg: 'bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-950/60 dark:to-violet-900/40 ring-1 ring-violet-300/30 dark:ring-violet-700/30',
    text: 'text-violet-800 dark:text-violet-200',
    iconColor: '', Icon: null, label: 'RSV',
  },
  OFF: {
    bg: 'bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-950/60 dark:to-amber-900/40 ring-1 ring-amber-300/30 dark:ring-amber-700/30',
    text: 'text-amber-800 dark:text-amber-200',
    iconColor: '', Icon: null, label: 'OFF',
  },
  OTHER: {
    bg: 'bg-slate-50 dark:bg-slate-800/30 ring-1 ring-slate-200 dark:ring-slate-700/30',
    text: 'text-slate-700 dark:text-slate-300',
    iconColor: '', Icon: null, label: '·',
  },
};

function Cell({ c, onClick }: { c: CellData; onClick: () => void }) {
  const isFlight = c.kind === 'FLIGHT';
  const isDH     = c.kind === 'DEADHEAD';
  const isNone   = c.kind === 'NONE';
  const style = !isNone ? CELL_STYLES[c.kind as Exclude<Kind, 'NONE'>] : null;
  const Icon = style?.Icon ?? null;
  // Short label under the day number: flight code for FLIGHT, "D/H" for
  // DEADHEAD, the kind's short label for everything else.
  const tag = isFlight
    ? c.firstFlightCode ?? ''
    : isDH
      ? 'D/H'
      : style?.label ?? '';

  return (
    <button
      onClick={onClick}
      aria-label={`روز ${c.jd}`}
      className={cn(
        // No overflow:hidden — the multi-flight rose badge needs to extend
        // outside the cell border, and at this design scale the corner icon
        // fits cleanly inside anyway.
        'relative aspect-square rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        style?.bg,
        style?.text,
        isNone && 'text-slate-400 dark:text-slate-500',
        c.isToday && !c.isSelected && 'ring-2 ring-offset-1 ring-brand-500 ring-offset-white dark:ring-offset-slate-900 ring-pulse',
        c.isSelected && 'ring-[3px] ring-brand-500 dark:ring-brand-400 scale-[1.12] z-10 shadow-[0_8px_30px_-4px_rgba(16,185,129,0.55)]',
        !c.isSelected && 'hover:scale-[1.06] active:scale-95',
      )}
    >
      {/* Inner shine for filled cells */}
      {(isFlight || isDH) && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/25 via-transparent to-transparent pointer-events-none" />
      )}

      {/* CONTENT — vertical stack, day number lives in the LOWER half so the
          corner icon has guaranteed empty space in the upper-left. */}
      <div className="relative h-full flex flex-col items-center justify-end pb-[3px] sm:pb-1">
        <span
          className={cn(
            'font-black tabular-nums tracking-wide leading-none',
            'text-[13px] sm:text-[16px]',
            (isFlight || isDH) && 'drop-shadow',
          )}
        >
          {toFaDigits(c.jd!)}
        </span>
        {tag && (
          <span
            className={cn(
              'mt-0.5 sm:mt-1 text-[8.5px] sm:text-[9.5px] font-extrabold tabular-nums tracking-[0.04em] leading-none whitespace-nowrap max-w-full truncate px-1',
              isFlight && 'opacity-95 drop-shadow',
              !isFlight && !isDH && (style?.iconColor || style?.text || ''),
            )}
          >
            {tag}
          </span>
        )}
      </div>

      {/* Corner icon — small enough to fit, large enough to recognise.
          Sized so it cannot reach the day number sitting in the lower half. */}
      {Icon && (
        <Icon
          className={cn(
            'absolute top-[3px] left-[3px] sm:top-1 sm:left-1',
            'w-[10px] h-[10px] sm:w-3 sm:h-3 opacity-85 pointer-events-none',
            isFlight && '-scale-x-100 drop-shadow',
            (isFlight || isDH) ? '' : style?.iconColor,
          )}
          strokeWidth={2.8}
        />
      )}

      {/* Multi-flight badge — extends outside the cell border (the relative
          parent has no overflow clip so this still shows). */}
      {c.flightCount! > 1 && (isFlight || isDH) && (
        <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-white text-[8.5px] font-extrabold grid place-items-center leading-none shadow-md ring-2 ring-white dark:ring-slate-900 animate-pulse">
          {toFaDigits(c.flightCount!)}
        </span>
      )}
    </button>
  );
}

function Legend() {
  const items: Array<{ color: string; label: string }> = [
    { color: 'bg-emerald-500', label: 'پرواز' },
    { color: 'bg-violet-500',  label: 'D/H'   },
    { color: 'bg-teal-500',    label: 'L/O'   },
    { color: 'bg-indigo-600',  label: 'RST'   },
    { color: 'bg-blue-600',    label: 'OFC'   },
    { color: 'bg-sky-500',     label: 'دوره'  },
    { color: 'bg-rose-500',    label: 'پزشکی' },
    { color: 'bg-cyan-500',    label: 'گذرنامه' },
    { color: 'bg-slate-500',   label: 'جلسه' },
    { color: 'bg-orange-500',  label: 'رد پرواز' },
    { color: 'bg-amber-800',   label: 'گراند' },
    { color: 'bg-violet-500',  label: 'آماده' },
    { color: 'bg-amber-500',   label: 'تعطیل' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 justify-end max-w-[58%]">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1 text-[10px] font-bold opacity-70 bg-white/40 dark:bg-slate-900/40 backdrop-blur rounded-full px-1.5 py-0.5 ring-1 ring-slate-200/50 dark:ring-slate-700/30">
          <span className={cn('w-1.5 h-1.5 rounded-full', it.color)} />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
