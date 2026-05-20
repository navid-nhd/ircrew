import { useEffect, useMemo, useState } from 'react';
import {
  Plane, Clock, Sunrise, MapPin, Briefcase, CheckCircle2, PenLine,
} from 'lucide-react';
import type { RosterRow } from '../lib/types';
import { parseDepArrCell, toFaDigits, weekdayFa, cn, formatJalaliFull } from '../lib/utils';

// "Today's Briefing" — hero card pinned at the top of the Roster tab whenever
// there's an FDP starting in the next 24h. Counts down to report time, shows
// the route, a sector summary, and a small prep checklist persisted per
// crew code so the user can tick items off in the lead-up to the flight.

interface Props {
  rows: RosterRow[];
  crewCode: string;
}

const PREP_KEY = (code: string, fdpId: string) => `ircrew.prep.v1.${code.toUpperCase()}.${fdpId}`;

const DEFAULT_CHECKLIST = [
  'یونیفرم آماده',
  'پاسپورت / مدارک',
  'شارژ گوشی و هدفون',
  'بریفینگ پرواز خوانده شد',
] as const;

interface PrepState { checked: boolean[] }

function loadPrep(crewCode: string, fdpId: string): PrepState {
  try {
    const raw = localStorage.getItem(PREP_KEY(crewCode, fdpId));
    if (!raw) return { checked: DEFAULT_CHECKLIST.map(() => false) };
    const p = JSON.parse(raw) as PrepState;
    if (Array.isArray(p.checked) && p.checked.length === DEFAULT_CHECKLIST.length) return p;
    return { checked: DEFAULT_CHECKLIST.map(() => false) };
  } catch { return { checked: DEFAULT_CHECKLIST.map(() => false) }; }
}
function savePrep(crewCode: string, fdpId: string, state: PrepState): void {
  try { localStorage.setItem(PREP_KEY(crewCode, fdpId), JSON.stringify(state)); } catch { /* ignore */ }
}

export function TodaysBriefing({ rows, crewCode }: Props) {
  // Find the next FDP that starts in the next 24h.
  const nextFlight = useMemo(() => {
    const now = Date.now();
    const horizon = now + 24 * 3600_000;
    let best: { row: RosterRow; startMs: number; dep: ReturnType<typeof parseDepArrCell>; arr: ReturnType<typeof parseDepArrCell> } | null = null;
    for (const r of rows) {
      if (r.kind !== 'FLIGHT') continue;
      const dep = parseDepArrCell(r.depTime);
      const arr = parseDepArrCell(r.arrTime);
      if (!dep.iso || !dep.time) continue;
      const startMs = new Date(`${dep.iso}T${dep.time}:00`).getTime();
      if (Number.isNaN(startMs)) continue;
      if (startMs < now - 30 * 60_000) continue;  // already departed >30min ago
      if (startMs > horizon) continue;
      if (!best || startMs < best.startMs) best = { row: r, startMs, dep, arr };
    }
    return best;
  }, [rows]);

  // Live countdown — re-render every 30s.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!nextFlight) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [nextFlight]);
  void tick;

  if (!nextFlight) return null;

  const { row, startMs, dep, arr } = nextFlight;
  const fdpId = `${dep.iso}-${row.fltNo}`;
  const reportMs = startMs - 60 * 60_000;  // assume ~1h before block-off for reporting
  const msUntilReport = reportMs - Date.now();
  const isReportPassed = msUntilReport < 0;

  const countdown = formatCountdown(Math.abs(msUntilReport));

  return (
    <div className="relative overflow-hidden rounded-3xl mb-3 text-white shadow-2xl shadow-brand-900/30 ring-1 ring-white/15 animate-spring" dir="rtl">
      {/* Animated gradient + glow blobs */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-950 animate-gradient" />
      <div className="absolute -top-16 -right-12 w-52 h-52 rounded-full bg-emerald-300/25 blur-3xl animate-float" />
      <div className="absolute -bottom-16 -left-12 w-52 h-52 rounded-full bg-teal-400/20 blur-3xl animate-float" style={{ animationDelay: '-2s' }} />
      <Plane className="absolute -bottom-6 -right-6 w-28 h-28 text-white/6 -scale-x-100 animate-spin-slow" strokeWidth={1} />

      <div className="relative p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur grid place-items-center ring-1 ring-white/20 shrink-0">
            <Sunrise className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] opacity-85 font-bold tracking-[0.15em] uppercase">پروازِ پیشِ رو</div>
            <div className="text-[13.5px] font-extrabold leading-tight truncate">
              {weekdayFa(dep.weekday)} · {formatJalaliFull(dep.iso)}
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className="rounded-2xl bg-white/12 backdrop-blur ring-1 ring-white/15 px-4 py-3 mb-3">
          <div className="text-[10.5px] opacity-80 font-bold tracking-[0.18em] mb-1.5">
            {isReportPassed ? 'گذشته از زمان حضور' : 'تا زمان حضور'}
          </div>
          <div className="flex items-baseline gap-1.5 tabular-nums drop-shadow-lg">
            <CountdownBlock value={countdown.h} unit="h" />
            <span className="text-[20px] opacity-60 leading-none">:</span>
            <CountdownBlock value={countdown.m} unit="m" />
          </div>
          <div className="text-[11px] opacity-80 mt-1.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>زمان حضور تخمینی: <span className="font-bold tabular-nums">{fmtTime(reportMs)}</span></span>
            <span className="opacity-50">·</span>
            <span>Block-off: <span className="font-bold tabular-nums">{dep.time}</span></span>
          </div>
        </div>

        {/* Route */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3" dir="ltr">
          <div className="text-center">
            <div className="text-[26px] font-black tracking-[0.14em] tabular-nums leading-none pr-[0.14em]">{row.dep || '—'}</div>
            <div className="text-[10.5px] opacity-85 font-bold tabular-nums tracking-wider mt-1">{dep.time}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-px bg-white/40" />
            <Plane className="w-4 h-4 text-white -scale-x-0" strokeWidth={2.6} />
            <span className="w-6 h-px bg-white/40" />
          </div>
          <div className="text-center">
            <div className="text-[26px] font-black tracking-[0.14em] tabular-nums leading-none pr-[0.14em]">{row.arr || '—'}</div>
            <div className="text-[10.5px] opacity-85 font-bold tabular-nums tracking-wider mt-1">{arr.time}</div>
          </div>
        </div>

        {/* Flight meta strip */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {row.fltNo && (
            <span className="text-[11px] font-extrabold tabular-nums tracking-wider bg-white/15 ring-1 ring-white/20 rounded-full px-2.5 py-1">
              {row.fltNo}
            </span>
          )}
          {row.acType && (
            <span className="text-[11px] font-extrabold tracking-wider bg-white/15 ring-1 ring-white/20 rounded-full px-2.5 py-1">
              {row.acType}
            </span>
          )}
          {row.acReg && (
            <span className="text-[11px] font-bold tabular-nums tracking-wider bg-white/10 ring-1 ring-white/15 rounded-full px-2.5 py-1 opacity-85">
              {row.acReg}
            </span>
          )}
          {row.fltMate && (
            <span className="text-[11px] font-semibold bg-white/10 ring-1 ring-white/15 rounded-full px-2.5 py-1 opacity-85 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {row.fltMate}
            </span>
          )}
        </div>

        {/* Prep checklist */}
        <PrepChecklist crewCode={crewCode} fdpId={fdpId} />
      </div>
    </div>
  );
}

function CountdownBlock({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="text-[40px] sm:text-[44px] font-black leading-none">{toFaDigits(String(value).padStart(2, '0'))}</span>
      <span className="text-[12px] opacity-80 font-bold mr-1">{unit}</span>
    </span>
  );
}

function PrepChecklist({ crewCode, fdpId }: { crewCode: string; fdpId: string }) {
  const [state, setState] = useState(() => loadPrep(crewCode, fdpId));
  const toggle = (i: number) => {
    setState((prev) => {
      const next = { checked: [...prev.checked] };
      next.checked[i] = !next.checked[i];
      savePrep(crewCode, fdpId, next);
      return next;
    });
  };
  const done = state.checked.filter(Boolean).length;
  const total = DEFAULT_CHECKLIST.length;
  return (
    <div className="rounded-2xl bg-white/12 ring-1 ring-white/15 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Briefcase className="w-3.5 h-3.5 opacity-90" />
        <div className="text-[11.5px] font-extrabold flex-1">آماده‌سازی</div>
        <span className="text-[10.5px] opacity-85 font-bold tabular-nums">
          {toFaDigits(done)}/{toFaDigits(total)}
        </span>
      </div>
      <div className="space-y-1.5">
        {DEFAULT_CHECKLIST.map((label, i) => {
          const checked = state.checked[i];
          return (
            <button
              key={label}
              onClick={() => toggle(i)}
              className={cn(
                'w-full text-right flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all active:scale-[0.98]',
                checked
                  ? 'bg-white/20 ring-1 ring-white/30'
                  : 'bg-white/8 ring-1 ring-white/15 hover:bg-white/14',
              )}
            >
              <span className={cn(
                'w-4 h-4 rounded-md grid place-items-center shrink-0 transition-all',
                checked ? 'bg-emerald-400 text-emerald-900' : 'bg-white/20 ring-1 ring-white/30',
              )}>
                {checked ? <CheckCircle2 className="w-3 h-3" strokeWidth={3} /> : null}
              </span>
              <span className={cn('text-[11.5px] flex-1 truncate', checked && 'opacity-70 line-through')}>{label}</span>
              {!checked && <PenLine className="w-3 h-3 opacity-50" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${toFaDigits(String(d.getHours()).padStart(2, '0'))}:${toFaDigits(String(d.getMinutes()).padStart(2, '0'))}`;
}

function formatCountdown(ms: number): { h: number; m: number } {
  const totalMin = Math.floor(ms / 60_000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

