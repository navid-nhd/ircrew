import { useState } from 'react';
import {
  Plane, BedDouble, ShieldAlert, MapPin, ChevronDown, Loader2, Users, AlertTriangle,
  GraduationCap, Stethoscope, BookUser, Users2, Ban, Briefcase, Archive, Info, Armchair, Palmtree,
  Building2, Moon,
} from 'lucide-react';
import type { Credentials, RosterRow, CrewResponse } from '../lib/types';
import { parseDepArrCell, weekdayFa, jalaliShort, toFaDigits, cn } from '../lib/utils';
import { api, ApiError } from '../lib/api';

const JAL_MONTHS_FA: Record<number, string> = {
  1: 'فروردین', 2: 'اردیبهشت', 3: 'خرداد', 4: 'تیر', 5: 'مرداد', 6: 'شهریور',
  7: 'مهر', 8: 'آبان', 9: 'آذر', 10: 'دی', 11: 'بهمن', 12: 'اسفند',
};
const GREG_MONTHS_EN_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const GREG_MONTHS_EN_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
import { CrewList } from './CrewList';

interface Props {
  row: RosterRow;
  isToday: boolean;
  creds: Credentials;
}

const KIND = {
  OFF: {
    accent: 'from-amber-400 to-orange-500',
    pill: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800 dark:from-amber-950/50 dark:to-amber-900/40 dark:text-amber-200',
    icon: BedDouble, label: 'تعطیل',
    cell: 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/40 dark:to-amber-900/20 ring-1 ring-amber-300/30 dark:ring-amber-800/30',
    glow: '',
  },
  RSV: {
    accent: 'from-violet-400 to-indigo-500',
    pill: 'bg-gradient-to-br from-violet-100 to-violet-200 text-violet-800 dark:from-violet-950/50 dark:to-violet-900/40 dark:text-violet-200',
    icon: ShieldAlert, label: 'آماده‌باش',
    cell: 'bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/40 dark:to-violet-900/20 ring-1 ring-violet-300/30 dark:ring-violet-800/30',
    glow: '',
  },
  FLIGHT: {
    accent: 'from-emerald-400 to-teal-600',
    pill: 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-800 dark:from-emerald-950/50 dark:to-emerald-900/40 dark:text-emerald-200',
    icon: Plane, label: 'پرواز',
    cell: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-emerald-900/20 ring-1 ring-emerald-300/40 dark:ring-emerald-800/40',
    glow: 'shadow-[0_8px_28px_-10px_rgba(16,185,129,0.45)]',
  },
  DEADHEAD: {
    // Crew flies as passenger (positioning). Distinct violet tone — clearly
    // not an operational flight, but still a duty (counts toward FDP).
    accent: 'from-violet-400 to-fuchsia-600',
    pill: 'bg-gradient-to-br from-violet-100 to-fuchsia-200 text-violet-800 dark:from-violet-950/55 dark:to-fuchsia-900/40 dark:text-violet-200',
    icon: Armchair, label: 'دِدهد (D/H)',
    cell: 'bg-gradient-to-br from-violet-100 to-fuchsia-50 dark:from-violet-950/40 dark:to-fuchsia-900/20 ring-1 ring-violet-300/40 dark:ring-violet-700/40',
    glow: 'shadow-[0_8px_28px_-10px_rgba(139,92,246,0.35)]',
  },
  LAYOVER: {
    // Forced rest at the destination during a multi-day mission. NOT a
    // home-base day-off (so it shouldn't count toward 7-day/month rule).
    accent: 'from-teal-400 to-cyan-600',
    pill: 'bg-gradient-to-br from-teal-100 to-cyan-200 text-teal-800 dark:from-teal-950/55 dark:to-cyan-900/40 dark:text-teal-200',
    icon: Palmtree, label: 'لِی‌اُور (L/O)',
    cell: 'bg-gradient-to-br from-teal-100 to-cyan-50 dark:from-teal-950/40 dark:to-cyan-900/20 ring-1 ring-teal-300/40 dark:ring-teal-700/40',
    glow: '',
  },
  OFC: {
    // Office duty (HQ shifts). Counts as duty but is sedentary — neutral
    // slate tone with a building icon makes the distinction clear.
    accent: 'from-slate-400 to-slate-600',
    pill: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800 dark:from-slate-800/60 dark:to-slate-700/40 dark:text-slate-200',
    icon: Building2, label: 'دفتری (OFC)',
    cell: 'bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/50 dark:to-slate-900/30 ring-1 ring-slate-300/40 dark:ring-slate-700/40',
    glow: '',
  },
  RST: {
    // Compulsory rest period (post-flight or general rest day). Indigo so
    // it reads "calm/sleep" without being confused with OFF (amber) or
    // LAYOVER (teal).
    accent: 'from-indigo-400 to-blue-600',
    pill: 'bg-gradient-to-br from-indigo-100 to-blue-200 text-indigo-800 dark:from-indigo-950/55 dark:to-blue-900/40 dark:text-indigo-200',
    icon: Moon, label: 'استراحت (RST)',
    cell: 'bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-950/40 dark:to-blue-900/20 ring-1 ring-indigo-300/40 dark:ring-indigo-700/40',
    glow: '',
  },
  TRAIN: {
    accent: 'from-sky-400 to-blue-600',
    pill: 'bg-gradient-to-br from-sky-100 to-sky-200 text-sky-800 dark:from-sky-950/50 dark:to-sky-900/40 dark:text-sky-200',
    icon: GraduationCap, label: 'دورهٔ بازآموزی',
    cell: 'bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-950/40 dark:to-sky-900/20 ring-1 ring-sky-300/40 dark:ring-sky-800/40',
    glow: 'shadow-[0_8px_28px_-10px_rgba(14,165,233,0.35)]',
  },
  MED: {
    accent: 'from-rose-400 to-pink-600',
    pill: 'bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 dark:from-rose-950/50 dark:to-rose-900/40 dark:text-rose-200',
    icon: Stethoscope, label: 'معاینات پزشکی',
    cell: 'bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950/40 dark:to-rose-900/20 ring-1 ring-rose-300/40 dark:ring-rose-800/40',
    glow: 'shadow-[0_8px_28px_-10px_rgba(244,63,94,0.35)]',
  },
  PASS: {
    accent: 'from-cyan-400 to-teal-600',
    pill: 'bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-800 dark:from-cyan-950/50 dark:to-cyan-900/40 dark:text-cyan-200',
    icon: BookUser, label: 'تمدید گذرنامه',
    cell: 'bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-950/40 dark:to-cyan-900/20 ring-1 ring-cyan-300/40 dark:ring-cyan-800/40',
    glow: 'shadow-[0_8px_28px_-10px_rgba(6,182,212,0.35)]',
  },
  MEET: {
    accent: 'from-slate-400 to-zinc-600',
    pill: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 dark:from-slate-800/60 dark:to-slate-700/40 dark:text-slate-200',
    icon: Users2, label: 'جلسه',
    cell: 'bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/50 dark:to-slate-900/20 ring-1 ring-slate-300/40 dark:ring-slate-700/40',
    glow: '',
  },
  REJECT: {
    accent: 'from-orange-400 to-red-500',
    pill: 'bg-gradient-to-br from-orange-100 to-red-200 text-red-800 dark:from-orange-950/55 dark:to-red-900/40 dark:text-orange-200',
    icon: Ban, label: 'پرواز رد شده',
    cell: 'bg-gradient-to-br from-orange-100 to-red-50 dark:from-orange-950/40 dark:to-red-950/20 ring-1 ring-orange-300/40 dark:ring-orange-800/40',
    glow: 'shadow-[0_8px_28px_-10px_rgba(249,115,22,0.35)]',
  },
  GROUND: {
    accent: 'from-amber-700 to-amber-900',
    pill: 'bg-gradient-to-br from-amber-200 to-amber-300 text-amber-900 dark:from-amber-900/55 dark:to-amber-950/45 dark:text-amber-100',
    icon: Briefcase, label: 'گراند (دفتر)',
    cell: 'bg-gradient-to-br from-amber-200 to-amber-100 dark:from-amber-900/40 dark:to-amber-950/30 ring-1 ring-amber-700/40 dark:ring-amber-700/40',
    glow: '',
  },
  OTHER: {
    accent: 'from-slate-400 to-slate-500',
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    icon: MapPin, label: 'سایر',
    cell: 'bg-slate-50/60 dark:bg-slate-800/20',
    glow: '',
  },
} as const;

export function DayCard({ row, isToday, creds }: Props) {
  const dep = parseDepArrCell(row.depTime);
  const arr = parseDepArrCell(row.arrTime);
  const t = KIND[row.kind] ?? KIND.OTHER;
  const Icon = t.icon;
  const isFlight = row.kind === 'FLIGHT';

  // Jalali day + month from the cell's embedded "yyyy/mm/dd" jalali string.
  const jalParts = (dep.jalali || '0/0/0').split('/').map(Number);
  const jalaliDayNum = jalParts[2] || 0;
  const jalaliMonthNum = jalParts[1] || 0;
  const jalaliMonthFa = JAL_MONTHS_FA[jalaliMonthNum] ?? '';

  // Gregorian month name from the ISO date.
  const gregMonthIdx = Number((dep.iso || '0000-00-00').slice(5, 7)) - 1;
  const gregMonthFull = GREG_MONTHS_EN_FULL[gregMonthIdx] ?? '';
  const gregMonthShort = GREG_MONTHS_EN_SHORT[gregMonthIdx] ?? '';

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errKind, setErrKind] = useState<'none' | 'noData' | 'notFound' | 'network'>('none');
  const [errMsg, setErrMsg] = useState<string>('');
  const [data, setData] = useState<CrewResponse | null>(null);

  const toggle = async () => {
    if (!isFlight) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (data || loading) return;
    setLoading(true); setErrKind('none'); setErrMsg('');
    try {
      const r = await api.crewByFlight(creds, dep.iso, row.kindCode, row.acType);
      setData(r.data);
    } catch (e) {
      if (e instanceof ApiError && e.noData) {
        setErrKind('noData');
        setErrMsg(e.message);
      } else if (e instanceof ApiError && e.notFound) {
        setErrKind('notFound');
        setErrMsg(e.message);
      } else {
        setErrKind('network');
        setErrMsg(e instanceof Error ? e.message : 'خطا در دریافت خدمه.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      'glass rounded-2xl overflow-hidden animate-spring',
      isFlight && t.glow,
      isToday && 'ring-2 ring-brand-500/60 shadow-brand-500/20',
    )}>
      <button
        onClick={toggle}
        disabled={!isFlight}
        className={cn(
          // Mobile-first padding/gaps — on 360-px screens the previous p-3.5
          // + gap-3 + 88-px date column + 36-px chevron added up to more than
          // viewport width, forcing horizontal scroll inside the card.
          'w-full text-right p-2.5 sm:p-3.5 flex gap-2 sm:gap-3 items-stretch transition-colors min-w-0',
          isFlight && 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30 active:scale-[0.997]',
          !isFlight && 'cursor-default',
        )}
      >
        <div className={cn('w-1 sm:w-1.5 rounded-full bg-gradient-to-b shrink-0', t.accent)} />

        <div className={cn(
          // Smaller date column on phones, full size from sm: up.
          'w-[60px] sm:w-[88px] shrink-0 grid place-items-center rounded-xl py-1.5 sm:py-2 px-1 sm:px-1.5',
          t.cell,
        )}>
          <div className="text-[10px] sm:text-[11px] font-bold opacity-75 leading-none">
            {weekdayFa(dep.weekday)}
          </div>
          <div className="text-[22px] sm:text-[30px] font-black leading-none my-1 sm:my-1.5 tracking-wide">
            {toFaDigits(jalaliDayNum)}
          </div>
          <div className="text-[10px] sm:text-[11px] font-bold opacity-80 leading-tight text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
            {jalaliMonthFa}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-1.5 flex-wrap">
            <span className={cn('inline-flex items-center gap-1 text-[10.5px] sm:text-[11px] font-bold rounded-full px-1.5 sm:px-2 py-0.5', t.pill)}>
              <Icon className="w-3 h-3" strokeWidth={2.5} />
              {t.label}
            </span>
            {isToday && (
              <span className="text-[10.5px] sm:text-[11px] font-extrabold text-white bg-gradient-to-br from-brand-500 to-brand-700 rounded-full px-1.5 sm:px-2 py-0.5 shadow-sm">
                امروز
              </span>
            )}
          </div>

          <div className="text-[11px] sm:text-[12px] opacity-80 truncate">
            {weekdayFa(dep.weekday)} · <span className="tabular-nums">{jalaliShort(dep.jalali)}</span>
          </div>

          {isFlight ? (
            <FlightRoute
              isoDate={dep.iso} weekdayEn={dep.weekday} gregMonthFull={gregMonthFull} gregMonthShort={gregMonthShort}
              depCode={row.dep} arrCode={row.arr}
              depTime={dep.time} arrTime={arr.time}
              fltNo={row.fltNo} acType={row.acType} acReg={row.acReg}
            />
          ) : (
            <div className="text-[11px] opacity-60 tabular-nums mt-1">
              {dep.time} – {arr.time}
            </div>
          )}
        </div>

        {isFlight && (
          <div className="self-center grid place-items-center w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">
            <ChevronDown
              className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-300', expanded && 'rotate-180')}
              strokeWidth={2.4}
            />
          </div>
        )}
      </button>

      {isFlight && (
        <div className={cn(
          'grid transition-all duration-300 ease-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}>
          <div className="overflow-hidden">
            <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 my-2 text-[12px] font-bold opacity-70">
                <Users className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                خدمهٔ پرواز
                {data && <span className="opacity-50 font-normal">({data.crew.length})</span>}
              </div>

              {loading && (
                <div className="flex items-center justify-center py-4 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
              {errKind === 'noData' && (
                <div className="text-[12px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <Archive className="w-4 h-4 mt-[1px] opacity-70 shrink-0" />
                  <div className="leading-relaxed">{errMsg}</div>
                </div>
              )}
              {errKind === 'notFound' && (
                <div className="text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-[1px] opacity-80 shrink-0" />
                  <div className="leading-relaxed">{errMsg}</div>
                </div>
              )}
              {errKind === 'network' && (
                <div className="text-[12px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-[1px] shrink-0" />
                  <div className="leading-relaxed">{errMsg}</div>
                </div>
              )}
              {data && !loading && errKind === 'none' && (
                <CrewList crew={data.crew} headers={data.headers} dense />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WEEKDAY_EN_FULL: Record<string, string> = {
  Sat: 'Saturday', Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday',
  Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday',
};

function FlightRoute({
  isoDate, weekdayEn, gregMonthFull, gregMonthShort,
  depCode, arrCode, depTime, arrTime, fltNo, acType, acReg,
}: {
  isoDate: string; weekdayEn: string;
  gregMonthFull: string; gregMonthShort: string;
  depCode: string; arrCode: string; depTime: string; arrTime: string;
  fltNo: string; acType: string; acReg: string;
}) {
  return (
    <div className="mt-2 surface-muted rounded-xl p-3">
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200/60 dark:border-slate-700/40 gap-2" dir="ltr">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] font-bold tabular-nums tracking-[0.18em] opacity-85">
            {isoDate}
          </span>
          <span className="text-[11px] font-extrabold tracking-[0.1em] uppercase text-brand-700 dark:text-brand-400">
            {gregMonthShort}
          </span>
        </div>
        <span className="text-[11px] font-medium tracking-[0.08em] opacity-60 truncate">
          {WEEKDAY_EN_FULL[weekdayEn] ?? weekdayEn} · {gregMonthFull}
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" dir="ltr">
        <div className="text-center shrink-0">
          <div className="text-[17px] sm:text-[22px] font-black tracking-[0.1em] sm:tracking-[0.18em] tabular-nums leading-none pr-[0.1em] sm:pr-[0.18em] text-gradient-brand">
            {depCode || '—'}
          </div>
          <div className="text-[10.5px] sm:text-[11.5px] opacity-80 font-bold tabular-nums tracking-[0.1em] sm:tracking-[0.16em] mt-1 sm:mt-1.5 pr-[0.1em] sm:pr-[0.16em]">
            {depTime}
          </div>
        </div>
        {/* Middle: dashed-line + plane bridge. The min-w-0 + shrinking
            segments keep this from forcing horizontal overflow on phones. */}
        <div className="flex items-center gap-1 flex-1 min-w-0 relative px-0.5 sm:px-1">
          <span className="flex-1 min-w-0 border-t-2 border-dashed border-brand-400/50 dark:border-brand-600/50" />
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-brand-500/30 rounded-full blur-md" />
            <Plane className="relative w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 drop-shadow" strokeWidth={2.6} />
          </div>
          <span className="flex-1 min-w-0 border-t-2 border-dashed border-brand-400/50 dark:border-brand-600/50" />
        </div>
        <div className="text-center shrink-0">
          <div className="text-[17px] sm:text-[22px] font-black tracking-[0.1em] sm:tracking-[0.18em] tabular-nums leading-none pr-[0.1em] sm:pr-[0.18em] text-gradient-brand">
            {arrCode || '—'}
          </div>
          <div className="text-[10.5px] sm:text-[11.5px] opacity-80 font-bold tabular-nums tracking-[0.1em] sm:tracking-[0.16em] mt-1 sm:mt-1.5 pr-[0.1em] sm:pr-[0.16em]">
            {arrTime}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 flex-wrap" dir="ltr">
        <span className="text-[12px] font-bold tabular-nums tracking-[0.14em] bg-white dark:bg-slate-900 rounded-md px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-700">
          {fltNo}
        </span>
        {acType && (
          <span className="text-[12px] opacity-70 tracking-[0.1em] bg-white dark:bg-slate-900 rounded-md px-2 py-0.5 ring-1 ring-slate-200 dark:ring-slate-700">
            {acType}
          </span>
        )}
        {acReg && (
          <span className="text-[12px] opacity-60 tabular-nums tracking-[0.12em]">{acReg}</span>
        )}
      </div>
    </div>
  );
}
