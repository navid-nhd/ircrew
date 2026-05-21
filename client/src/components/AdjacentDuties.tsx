import { useMemo } from 'react';
import {
  Coffee, ShieldCheck, AlertTriangle, Plus, X,
  Clock, ChevronRight, Sunrise, Sunset, Waves,
} from 'lucide-react';
import type { DutyEntry, ProposedFlight, RuleEngineResult } from '../ftl/rules/types';
import { evaluate } from '../ftl/rules/engine';
import { cn, toFaDigits } from '../lib/utils';

// All adjacency types the user can attach to a candidate. Three standby
// variants match the real OM-A SBA/SBB/SBF — picking one ALSO updates the
// candidate's precededByStandbyType+Hours so the rules engine actually
// applies its standby-reduction rule (which only reads those candidate
// fields, not the history entries).
type AdjKind = 'day_off' | 'sba' | 'sbb' | 'sbf';

const adjId = (candidateIdx: number, kind: AdjKind, position: 'before' | 'after') =>
  `adj-${candidateIdx}-${kind}-${position}`;

interface Props {
  candidates: ProposedFlight[];
  activeIndex: number;
  history: DutyEntry[];
  onHistoryChange: (next: DutyEntry[]) => void;
  /** Update the active candidate. Required so toggling a standby chip can
   *  write precededByStandbyType/Hours onto the candidate. */
  onCandidateChange: (next: ProposedFlight) => void;
  /** Latest evaluation for the active candidate. */
  result: RuleEngineResult;
  evalProfile: Parameters<typeof evaluate>[0]['profile'];
}

const ADJ_META: Record<AdjKind, { fa: string; sub: string; icon: typeof Coffee; tint: string }> = {
  day_off: { fa: 'تعطیل',         sub: 'Day Off',     icon: Coffee,       tint: 'from-amber-400 to-orange-500' },
  sba:     { fa: 'آماده‌باش صبح', sub: 'SBA · ۰۰–۱۲', icon: Sunrise,      tint: 'from-sky-400 to-cyan-600' },
  sbb:     { fa: 'آماده‌باش عصر', sub: 'SBB · ۱۲–۰۰', icon: Sunset,       tint: 'from-violet-400 to-fuchsia-600' },
  sbf:     { fa: 'شناور',         sub: 'SBF · ۱۴h',   icon: Waves,        tint: 'from-indigo-400 to-blue-600' },
};

interface StandbyComputation {
  sbHours: number;
  sbStartIso: string;
  sbEndIso: string;
}

/** Compute the standby window length + boundaries given the FLIGHT's
 *  reporting time. Mirrors the real OM-A SBA/SBB/SBF definitions:
 *    SBA = 00:00–12:00 local
 *    SBB = 12:00 same day → 02:00 next day (14h ceiling)
 *    SBF = free-start, 14h ceiling, ending at reporting
 */
function computeStandby(variant: 'sba' | 'sbb' | 'sbf', reportingIso: string): StandbyComputation {
  const rep = new Date(reportingIso);
  if (variant === 'sba') {
    const dayStart = new Date(rep); dayStart.setHours(0, 0, 0, 0);
    const noon = new Date(rep);     noon.setHours(12, 0, 0, 0);
    const end = rep.getTime() < noon.getTime() ? rep : noon;
    return {
      sbHours: Math.max(0, (end.getTime() - dayStart.getTime()) / 3_600_000),
      sbStartIso: dayStart.toISOString(),
      sbEndIso: end.toISOString(),
    };
  }
  if (variant === 'sbb') {
    const sbStart = new Date(rep);
    // SBB window: 12:00 same day if reporting after noon, else previous noon
    sbStart.setHours(12, 0, 0, 0);
    if (rep.getHours() < 12) sbStart.setDate(sbStart.getDate() - 1);
    const ceiling = new Date(sbStart.getTime() + 14 * 3_600_000);
    const end = rep.getTime() < ceiling.getTime() ? rep : ceiling;
    return {
      sbHours: Math.max(0, (end.getTime() - sbStart.getTime()) / 3_600_000),
      sbStartIso: sbStart.toISOString(),
      sbEndIso: end.toISOString(),
    };
  }
  // sbf — 14h ending exactly at reporting
  const start = new Date(rep.getTime() - 14 * 3_600_000);
  return {
    sbHours: 14,
    sbStartIso: start.toISOString(),
    sbEndIso: rep.toISOString(),
  };
}

function buildAdjEntry(
  candidate: ProposedFlight,
  kind: AdjKind,
  position: 'before' | 'after',
  candidateIdx: number,
): DutyEntry {
  const reporting = new Date(candidate.reportingTimeLocal);
  const arrival = candidate.estimatedArrivalLocal ? new Date(candidate.estimatedArrivalLocal) : null;

  if (position === 'before') {
    if (kind === 'day_off') {
      const end = reporting.toISOString();
      const start = new Date(reporting.getTime() - 24 * 3_600_000).toISOString();
      return { id: adjId(candidateIdx, kind, position), kind: 'day_off', start, end, startStation: 'home', endStation: 'home' };
    }
    // Standby before: use the real SBA/SBB/SBF window calculator.
    const sb = computeStandby(kind, candidate.reportingTimeLocal);
    // Engine DutyKind is "sba" | "sbb" | "sbf" — identical names, lucky.
    return { id: adjId(candidateIdx, kind, position), kind, start: sb.sbStartIso, end: sb.sbEndIso, startStation: 'home', endStation: 'home' };
  }

  // After-flight: anchor at arrival + 30min Check-out
  const anchor = arrival ? new Date(arrival.getTime() + 30 * 60_000) : new Date(reporting.getTime() + 8 * 3_600_000);
  if (kind === 'day_off') {
    const start = anchor.toISOString();
    const end = new Date(anchor.getTime() + 24 * 3_600_000).toISOString();
    return { id: adjId(candidateIdx, kind, position), kind: 'day_off', start, end, startStation: 'home', endStation: 'home' };
  }
  // After-flight standby (only SBF makes sense post-FDP) — 14h block.
  const start = anchor.toISOString();
  const end = new Date(anchor.getTime() + 14 * 3_600_000).toISOString();
  return { id: adjId(candidateIdx, kind, position), kind: 'sbf', start, end, startStation: 'home', endStation: 'home' };
}

const findAdj = (history: DutyEntry[], candidateIdx: number, kind: AdjKind, position: 'before' | 'after') =>
  history.find((h) => h.id === adjId(candidateIdx, kind, position));

const STANDBY_KINDS: AdjKind[] = ['sba', 'sbb', 'sbf'];
const isStandby = (k: AdjKind): boolean => STANDBY_KINDS.includes(k);

const fmtHours = (h: number): string => {
  if (!Number.isFinite(h)) return '—';
  const sign = h < 0 ? '−' : '';
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${sign}${toFaDigits(hh)}:${toFaDigits(String(mm).padStart(2, '0'))}`;
};

const parseHFromText = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = s.match(/(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

export function AdjacentDuties({
  candidates, activeIndex, history, onHistoryChange, onCandidateChange,
  result, evalProfile,
}: Props) {
  const candidate = candidates[activeIndex];

  const toggle = (kind: AdjKind, position: 'before' | 'after') => {
    const existing = findAdj(history, activeIndex, kind, position);
    if (existing) {
      // Removing: drop the history entry. If it was a "before" standby,
      // also clear the candidate's precededByStandby state.
      onHistoryChange(history.filter((h) => h.id !== existing.id));
      if (position === 'before' && isStandby(kind)) {
        onCandidateChange({
          ...candidate,
          precededByStandbyType: 'none',
          precededByStandbyHours: 0,
          standbyStartedAtNight: false,
        });
      }
      return;
    }
    // Adding. First clear any other adjacency in the SAME slot — one
    // option per position is the model.
    const cleared = history.filter((h) => {
      for (const k of ['day_off', 'sba', 'sbb', 'sbf'] as AdjKind[]) {
        if (k === kind) continue;
        if (h.id === adjId(activeIndex, k, position)) return false;
      }
      return true;
    });
    const entry = buildAdjEntry(candidate, kind, position, activeIndex);
    onHistoryChange([...cleared, entry]);

    // If adding a "before" standby, push the precededByStandby fields onto
    // the candidate so the rules engine actually applies its reduction.
    if (position === 'before' && isStandby(kind)) {
      const sb = computeStandby(kind as 'sba' | 'sbb' | 'sbf', candidate.reportingTimeLocal);
      const sbStartHour = new Date(sb.sbStartIso).getHours();
      onCandidateChange({
        ...candidate,
        precededByStandbyType: 'home',
        precededByStandbyHours: Math.round(sb.sbHours * 10) / 10,
        standbyStartedAtNight: sbStartHour >= 23 || sbStartHour < 7,
      });
    }
    // If adding a "before" day-off and the previous selection was a
    // standby, clear the standby state.
    if (position === 'before' && kind === 'day_off') {
      onCandidateChange({
        ...candidate,
        precededByStandbyType: 'none',
        precededByStandbyHours: 0,
        standbyStartedAtNight: false,
      });
    }
  };

  const restCheck = result.checks.find((c) => c.id === 'rest-before');
  const restAvailable = parseHFromText(restCheck?.value);
  const restRequired = parseHFromText(restCheck?.limit);

  // Live preview — what would the rest-before number become for each
  // possible "before" choice? Cheap because evaluate() is pure.
  const previewFor = useMemo(() => {
    const make = (k: AdjKind | null) => {
      if (k === null) return result;
      const base = history.filter((h) => {
        for (const x of ['day_off', 'sba', 'sbb', 'sbf'] as AdjKind[]) {
          if (h.id === adjId(activeIndex, x, 'before')) return false;
        }
        return true;
      });
      const next = [...base, buildAdjEntry(candidate, k, 'before', activeIndex)];
      let cand = candidate;
      if (isStandby(k)) {
        const sb = computeStandby(k as 'sba' | 'sbb' | 'sbf', candidate.reportingTimeLocal);
        cand = { ...candidate, precededByStandbyType: 'home', precededByStandbyHours: Math.round(sb.sbHours * 10) / 10 };
      } else {
        cand = { ...candidate, precededByStandbyType: 'none', precededByStandbyHours: 0 };
      }
      return evaluate({ profile: evalProfile, history: next, proposed: cand });
    };
    return {
      day_off: make('day_off'),
      sba: make('sba'),
      sbb: make('sbb'),
      sbf: make('sbf'),
    };
  }, [history, candidate, activeIndex, evalProfile, result]);

  const beforeActive = {
    day_off: !!findAdj(history, activeIndex, 'day_off', 'before'),
    sba:     !!findAdj(history, activeIndex, 'sba', 'before'),
    sbb:     !!findAdj(history, activeIndex, 'sbb', 'before'),
    sbf:     !!findAdj(history, activeIndex, 'sbf', 'before'),
  };
  const afterActive = {
    day_off: !!findAdj(history, activeIndex, 'day_off', 'after'),
    sbf:     !!findAdj(history, activeIndex, 'sbf', 'after'),
  };

  return (
    <div className="space-y-3 text-slate-900 dark:text-slate-100" dir="rtl">
      {/* INTRO + STEPS */}
      <div className="surface rounded-2xl p-3.5 ring-1 ring-brand-500/15 shadow-md shadow-brand-900/5 animate-rise">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 grid place-items-center shrink-0">
            <Clock className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-extrabold leading-tight truncate">
              برنامه‌ریزی پیش از / پس از پرواز
            </div>
            <div className="text-[11px] opacity-65 truncate mt-0.5">
              {candidate.label || `کاندید #${toFaDigits(activeIndex + 1)}`} · <span className="tabular-nums">{candidate.reportingTimeLocal.slice(0, 10)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-brand-500/8 ring-1 ring-brand-500/20 px-3 py-2.5 mb-3 text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200">
          <b className="text-brand-700 dark:text-brand-300">این بخش چه می‌کند؟</b>
          {' '}اگر روز قبل از پرواز <b>تعطیل</b> داشتی یا <b>آماده‌باش</b> بودی، آن را اینجا اضافه کن.
          اپ بلافاصله <b>سقف FDP و حداقل Rest</b> را با احتساب آن دوباره محاسبه می‌کند.
        </div>

        {/* Step 1 — before */}
        <StepHeader n="۱" title="قبل از پرواز چه چیزی داشتی؟" hint="اختیاری — یک گزینه" />
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <Chip kind="day_off" on={beforeActive.day_off} onClick={() => toggle('day_off', 'before')} />
          <Chip kind="sbf"     on={beforeActive.sbf}     onClick={() => toggle('sbf',     'before')} />
          <Chip kind="sba"     on={beforeActive.sba}     onClick={() => toggle('sba',     'before')} />
          <Chip kind="sbb"     on={beforeActive.sbb}     onClick={() => toggle('sbb',     'before')} />
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-800 my-3" />

        {/* Step 2 — after */}
        <StepHeader n="۲" title="بعد از پرواز چه چیزی هست؟" hint="فقط برای ثبت — روی این پرواز اثر مستقیم ندارد" />
        <div className="flex items-center gap-2 flex-wrap">
          <Chip kind="day_off" on={afterActive.day_off} onClick={() => toggle('day_off', 'after')} />
          <Chip kind="sbf"     on={afterActive.sbf}     onClick={() => toggle('sbf',     'after')} />
        </div>
      </div>

      {/* Step 3 — result */}
      <div className="surface rounded-2xl p-3.5 animate-rise">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-extrabold grid place-items-center shrink-0">۳</span>
          <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <div className="text-[12.5px] font-extrabold flex-1">حداقل Rest پیش از پرواز</div>
          <RestBadge status={restCheck?.status} />
        </div>
        <div className="text-[11px] opacity-70 mb-3 leading-relaxed">
          مقدار <b>«در دسترس»</b> باید بزرگ‌تر یا برابر <b>«موردنیاز»</b> باشد.
          گزینه‌های بالا را تغییر بده تا تأثیرشان را زنده ببینی.
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <RestStat label="در دسترس" value={restAvailable} unit="h" tone={
            restAvailable != null && restRequired != null && restAvailable >= restRequired
              ? 'good' : restAvailable != null ? 'bad' : 'neutral'
          } />
          <RestStat label="موردنیاز" value={restRequired} unit="h" tone="neutral" />
        </div>
        {restCheck?.message && (
          <div className="mt-2.5 text-[11.5px] opacity-75 leading-relaxed">
            {restCheck.message}
          </div>
        )}

        {/* Previews — what each choice would do, even when not selected. */}
        <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/40">
          <div className="text-[11px] font-bold opacity-70 mb-2 flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            پیش‌نمایش اثر هر گزینه (قبل از پرواز)
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['day_off', 'sba', 'sbb', 'sbf'] as AdjKind[]).map((k) => {
              const r = previewFor[k];
              const c = r.checks.find((x) => x.id === 'rest-before');
              const avail = parseHFromText(c?.value);
              const req = parseHFromText(c?.limit);
              const passing = !!(avail != null && req != null && avail >= req);
              return (
                <PreviewChip
                  key={k}
                  kind={k}
                  avail={avail} req={req}
                  passing={passing}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───── atoms ─────

function StepHeader({ n, title, hint }: { n: string; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-extrabold grid place-items-center shrink-0">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-extrabold leading-tight">{title}</div>
        <div className="text-[10.5px] opacity-65 leading-tight mt-0.5">{hint}</div>
      </div>
    </div>
  );
}

function Chip({ kind, on, onClick }: { kind: AdjKind; on: boolean; onClick: () => void }) {
  const meta = ADJ_META[kind];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 h-11 rounded-xl text-[11.5px] font-extrabold ring-1 transition-all active:scale-95',
        on
          ? `text-white bg-gradient-to-br ${meta.tint} shadow-md ring-white/20`
          : 'bg-white/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-brand-500/40',
      )}
    >
      {on ? <X className="w-3 h-3" strokeWidth={2.6} /> : <Plus className="w-3 h-3" strokeWidth={2.6} />}
      <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
      <div className="flex-1 min-w-0 text-right">
        <div className="leading-none truncate">{meta.fa}</div>
        <div className={cn('text-[9.5px] leading-none mt-0.5', on ? 'opacity-85' : 'opacity-60')}>{meta.sub}</div>
      </div>
    </button>
  );
}

function RestStat({ label, value, unit, tone }: {
  label: string; value: number | null; unit: string; tone: 'good' | 'bad' | 'neutral';
}) {
  const toneCls =
    tone === 'good' ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-300/40' :
    tone === 'bad'  ? 'from-rose-50 to-rose-100 dark:from-rose-900/30 dark:to-rose-950/40 text-rose-800 dark:text-rose-200 ring-rose-300/40' :
                       'from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-900/30 text-slate-700 dark:text-slate-200 ring-slate-200/60';
  return (
    <div className={cn('rounded-xl bg-gradient-to-br ring-1 px-3 py-2.5', toneCls)}>
      <div className="text-[10px] opacity-70 font-bold tracking-wider">{label}</div>
      <div className="text-[20px] font-black tabular-nums leading-none mt-1">
        {value == null ? '—' : fmtHours(value)}
        <span className="text-[11px] opacity-60 font-bold mr-0.5">{value == null ? '' : unit}</span>
      </div>
    </div>
  );
}

function RestBadge({ status }: { status?: string }) {
  if (status === 'pass') return <span className="text-[10px] font-extrabold tracking-wider rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">OK</span>;
  if (status === 'fail') return <span className="text-[10px] font-extrabold tracking-wider rounded-full px-2 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />FAIL</span>;
  if (status === 'warn') return <span className="text-[10px] font-extrabold tracking-wider rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">WARN</span>;
  return <span className="text-[10px] opacity-60 font-bold">INFO</span>;
}

function PreviewChip({ kind, avail, req, passing }: {
  kind: AdjKind; avail: number | null; req: number | null; passing: boolean;
}) {
  const meta = ADJ_META[kind];
  const Icon = meta.icon;
  return (
    <div className={cn(
      'rounded-xl px-2.5 py-2 ring-1 flex items-center gap-2',
      passing ? 'bg-emerald-50/70 dark:bg-emerald-950/30 ring-emerald-300/30'
              : 'bg-rose-50/70 dark:bg-rose-950/30 ring-rose-300/30',
    )}>
      <div className={cn(
        'w-7 h-7 grid place-items-center rounded-lg shrink-0',
        passing ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
      )}>
        <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-extrabold leading-tight truncate">{meta.fa}</div>
        <div className="text-[10px] opacity-60 leading-none">{meta.sub}</div>
      </div>
      <div className="text-[11px] font-extrabold tabular-nums shrink-0">
        {avail == null || req == null ? '—' : `${fmtHours(avail)}/${fmtHours(req)}`}
      </div>
    </div>
  );
}
