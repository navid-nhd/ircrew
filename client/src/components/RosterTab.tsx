import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, RefreshCw, Plane, BedDouble, ShieldAlert, AlertTriangle, Clock,
  CalendarDays, List,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Credentials, RosterResponse, RosterRow } from '../lib/types';
import {
  periodLabelFa, periodLabelGregorianFa, todayIso, cn,
  parseDepArrCell, weekdayFa, jalaliShort,
} from '../lib/utils';
import { DayCard } from './DayCard';
import { MonthCalendar } from './MonthCalendar';
import { derivePositionFromRoster, profileStore } from '../lib/profile';

interface Props {
  creds: Credentials;
  /** Called once we have roster rows so the App can update the header's
   *  honorific to match the user's actual role. */
  onPositionLearned?: (pos: string) => void;
}

type ViewMode = 'calendar' | 'list';

export function RosterTab({ creds, onPositionLearned }: Props) {
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [view, setView] = useState<ViewMode>('calendar');
  const [selectedIso, setSelectedIso] = useState<string>(todayIso());
  const dayDetailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.login(creds);
        setPeriods(r.periods);
        if (r.periods.length) setPeriod(r.periods[0]);
      } catch (e) { setErr(e instanceof Error ? e.message : 'خطا در دریافت دوره‌ها.'); }
    })();
  }, [creds]);

  useEffect(() => {
    if (!period) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await api.roster(creds, period, { signal: ctrl.signal, forceFresh: refreshTick > 0 });
        if (ctrl.signal.aborted) return;
        setData(r.data);
        const pos = derivePositionFromRoster(r.data.rows);
        if (pos) {
          profileStore.save(creds.code, { position: pos, updatedAt: Date.now() });
          onPositionLearned?.(pos);
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setErr(e instanceof Error ? e.message : 'خطا در دریافت برنامه.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [period, creds, refreshTick]);

  const periodStartIso = useMemo(() => (period.match(/^\d{4}-\d{2}-\d{2}/) ?? [''])[0], [period]);
  const periodEndIso   = useMemo(() => {
    const m = period.match(/till\s+(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }, [period]);

  // Whenever the period changes, snap selectedDate into the period.
  useEffect(() => {
    if (!periodStartIso) return;
    const today = todayIso();
    const inPeriod = today >= periodStartIso && (!periodEndIso || today <= periodEndIso);
    setSelectedIso(inPeriod ? today : periodStartIso);
  }, [periodStartIso, periodEndIso]);

  const stats = useMemo(() => {
    const acc = { off: 0, rsv: 0, flt: 0, other: 0, mins: 0 };
    for (const r of data?.rows ?? []) {
      if (r.kind === 'OFF') acc.off++;
      else if (r.kind === 'RSV') acc.rsv++;
      else if (r.kind === 'FLIGHT') {
        acc.flt++;
        const dt = parseDepArrCell(r.depTime).time;
        const at = parseDepArrCell(r.arrTime).time;
        if (dt && at) {
          const [dh, dm] = dt.split(':').map(Number);
          const [ah, am] = at.split(':').map(Number);
          let mins = (ah * 60 + am) - (dh * 60 + dm);
          if (mins < 0) mins += 24 * 60;
          acc.mins += mins;
        }
      } else acc.other++;
    }
    return acc;
  }, [data]);

  const selectedRows = useMemo<RosterRow[]>(() => {
    if (!data?.rows) return [];
    return data.rows.filter((r) => r.depTime.slice(0, 10) === selectedIso);
  }, [data, selectedIso]);

  const today = todayIso();
  const hours = Math.floor(stats.mins / 60);
  const minutes = stats.mins % 60;

  const onPickDate = (iso: string) => {
    setSelectedIso(iso);
    // Wait two frames so React has committed and DayCards have laid out,
    // then compute precise scroll y from the live header height.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = dayDetailRef.current;
        if (!el) return;
        const header = document.querySelector('header');
        const headerH = header?.getBoundingClientRect().height ?? 64;
        const elTop = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, elTop - headerH - 6), behavior: 'smooth' });
      });
    });
  };

  return (
    <section className="pt-3">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowPicker(true)}
          className="flex-1 surface rounded-2xl px-4 py-3 flex items-center gap-3 text-right active:scale-[0.99] transition-transform"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-700/10 grid place-items-center shrink-0">
            <Clock className="w-4 h-4 text-brand-700 dark:text-brand-400" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] opacity-60 leading-none mb-1">دوره</div>
            <div className="text-[14px] font-extrabold truncate">
              {period ? periodLabelFa(period) : 'انتخاب دوره'}
            </div>
            {period && (
              <div className="text-[11px] opacity-50 tabular-nums truncate mt-0.5 tracking-wider">
                {periodLabelGregorianFa(period)}
              </div>
            )}
          </div>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </button>
        <button
          onClick={() => setRefreshTick((t) => t + 1)}
          aria-label="بازخوانی"
          className={cn(
            'w-12 h-12 grid place-items-center rounded-2xl surface active:scale-95 transition-all',
            loading && 'opacity-60',
          )}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      <HeroStats flt={stats.flt} off={stats.off} rsv={stats.rsv} hours={hours} minutes={minutes} />

      {err && (
        <div className="surface rounded-xl px-3 py-3 my-3 text-[13px] text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}
      {data?.warning && (
        <div className="surface rounded-xl px-3 py-2 mt-3 text-[12px] flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4" /> {data.warning}
        </div>
      )}

      <div className="flex items-center gap-1 mt-4 surface rounded-full p-1 max-w-fit mx-auto">
        <ViewBtn icon={CalendarDays} label="نمای ماهانه" active={view === 'calendar'} onClick={() => setView('calendar')} />
        <ViewBtn icon={List}         label="نمای فهرست"  active={view === 'list'}     onClick={() => setView('list')} />
      </div>

      {loading && !data && (
        <div className="mt-3 space-y-2.5">
          {[0,1,2,3].map((i) => <div key={i} className="skeleton h-[100px]" />)}
        </div>
      )}

      {data && view === 'calendar' && (
        <>
          <div className="mt-3">
            <MonthCalendar
              rows={data.rows}
              periodStartIso={periodStartIso}
              todayIso={today}
              selectedIso={selectedIso}
              onSelect={onPickDate}
            />
          </div>

          <div className="mt-4">
            <SelectedDayHeader iso={selectedIso} count={selectedRows.length} />
            <div ref={dayDetailRef} className="space-y-2.5 mt-2.5">
              {selectedRows.length === 0 && (
                <div className="surface rounded-2xl p-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
                  برنامه‌ای برای این روز ثبت نشده است.
                </div>
              )}
              {selectedRows.map((r, i) => (
                <DayCard
                  key={`${selectedIso}-${i}`}
                  row={r}
                  isToday={selectedIso === today}
                  creds={creds}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {data && view === 'list' && (
        <div className="mt-3 space-y-2.5">
          {data.rows.map((r, i) => {
            const iso = r.depTime.slice(0, 10);
            return (
              <DayCard key={`${iso}-${i}`} row={r} isToday={iso === today} creds={creds} />
            );
          })}
          {!data.rows.length && (
            <div className="surface rounded-2xl p-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
              برنامه‌ای برای این دوره ثبت نشده است.
            </div>
          )}
        </div>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-40 grid items-end" onClick={() => setShowPicker(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-rise" />
          <div
            className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
              <div className="text-[16px] font-extrabold">انتخاب دوره</div>
              <div className="text-[12px] opacity-60">یکی از دوره‌های ماهانه را انتخاب کنید</div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-3 pb-3 no-scrollbar">
              {periods.map((p) => {
                const active = p === period;
                return (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setShowPicker(false); }}
                    className={cn(
                      'w-full text-right py-3 px-3 rounded-xl flex items-center justify-between gap-2',
                      active
                        ? 'bg-gradient-to-l from-brand-100/80 to-brand-50 dark:from-brand-900/40 dark:to-brand-950/30 text-brand-700 dark:text-brand-300 font-extrabold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/60',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">{periodLabelFa(p)}</div>
                      <div className="text-[11px] opacity-50 tabular-nums truncate tracking-wider">{periodLabelGregorianFa(p)}</div>
                    </div>
                    {active && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ViewBtn({ icon: Icon, label, active, onClick }: {
  icon: typeof CalendarDays; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all',
        active
          ? 'bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-md shadow-brand-900/20'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100',
      )}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
      {label}
    </button>
  );
}

function SelectedDayHeader({ iso, count }: { iso: string; count: number }) {
  const dt = new Date(iso + 'T00:00:00Z');
  const wdEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()];
  return (
    <div className="flex items-end gap-2 px-1">
      <div>
        <div className="text-[11px] opacity-60 leading-none mb-1">روز انتخاب‌شده</div>
        <div className="text-[15px] font-extrabold">{weekdayFa(wdEn)}</div>
        <div className="text-[11px] opacity-70 tabular-nums tracking-wider mt-0.5">{iso}</div>
      </div>
      <div className="flex-1" />
      <div className="text-[11px] opacity-60">
        {count > 0 ? <>تعداد رویداد: <span className="tabular-nums font-bold">{count}</span></> : 'بدون رویداد'}
      </div>
    </div>
  );
}

function HeroStats({ flt, off, rsv, hours, minutes }: {
  flt: number; off: number; rsv: number; hours: number; minutes: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl text-white p-4 ring-1 ring-white/15 shimmer-sweep animate-spring shadow-2xl shadow-brand-900/40">
      {/* Animated gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500 via-brand-700 to-brand-950 animate-gradient" />
      {/* Aurora overlays */}
      <div className="absolute -top-16 -right-12 w-52 h-52 rounded-full bg-emerald-300/30 blur-3xl animate-float" />
      <div className="absolute -bottom-16 -left-12 w-52 h-52 rounded-full bg-teal-400/25 blur-3xl animate-float" style={{ animationDelay: '-2s' }} />
      <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full bg-amber-300/15 blur-2xl" />
      {/* Decorative slowly spinning plane glyph */}
      <Plane className="absolute -bottom-4 -right-4 w-28 h-28 text-white/5 -scale-x-100 animate-spin-slow" strokeWidth={1} />

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] opacity-80 font-bold tracking-[0.1em]">FLIGHT HOURS</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] bg-white/10 rounded-full px-2 py-1 backdrop-blur ring-1 ring-white/15">
            مجموع
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 mb-4 tabular-nums tracking-[0.04em] drop-shadow-lg">
          <span className="text-[48px] font-black leading-none">{hours}</span>
          <span className="text-[13px] opacity-80 font-semibold">h</span>
          <span className="text-[26px] font-extrabold leading-none mr-1">{String(minutes).padStart(2, '0')}</span>
          <span className="text-[13px] opacity-80 font-semibold">m</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <HeroStat icon={Plane}       label="پرواز"  enLabel="Flights"   value={flt} accent="from-emerald-300 to-emerald-500" />
          <HeroStat icon={ShieldAlert} label="آماده"  enLabel="Reserve"   value={rsv} accent="from-violet-300 to-violet-500" />
          <HeroStat icon={BedDouble}   label="تعطیل"  enLabel="Off"       value={off} accent="from-amber-300 to-amber-500" />
        </div>
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, enLabel, value, accent }: {
  icon: typeof Plane; label: string; enLabel: string; value: number; accent: string;
}) {
  return (
    <div className="relative bg-white/10 backdrop-blur-md rounded-xl px-2.5 py-2 ring-1 ring-white/15 overflow-hidden">
      <div className={`absolute -top-4 -right-4 w-14 h-14 rounded-full bg-gradient-to-br ${accent} opacity-30 blur-xl`} />
      <div className="relative flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${accent} grid place-items-center shadow-md shrink-0`}>
          <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.6} />
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-[18px] font-black tabular-nums leading-none">{value}</div>
          <div className="text-[10px] opacity-75 leading-tight font-bold truncate">{label}</div>
          <div className="text-[9px] opacity-50 leading-none tracking-wider uppercase">{enLabel}</div>
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warning from this file's local mini helper.
void jalaliShort;
