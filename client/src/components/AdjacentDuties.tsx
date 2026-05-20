import { useMemo } from 'react';
import {
  Coffee, Plane, ShieldCheck, AlertTriangle, Plus, X,
  Clock, ChevronRight,
} from 'lucide-react';
import type { DutyEntry, ProposedFlight, RuleEngineResult } from '../ftl/rules/types';
import { evaluate } from '../ftl/rules/engine';
import { cn, toFaDigits } from '../lib/utils';

// Build a stable id for entries that this card manages so we can find them
// again when the user removes them. Every adjacent entry is owned by exactly
// one (candidate-index, position) tuple.
const adjId = (candidateIdx: number, kind: AdjKind, position: 'before' | 'after') =>
  `adj-${candidateIdx}-${kind}-${position}`;

type AdjKind = 'day_off' | 'sbf';

interface Props {
  candidates: ProposedFlight[];
  activeIndex: number;
  history: DutyEntry[];
  onHistoryChange: (next: DutyEntry[]) => void;
  /** Latest evaluation for the active candidate, so we can read out the rest
   *  numbers without recomputing them here. */
  result: RuleEngineResult;
  /** Honour user profile when re-evaluating "what if I added this" previews. */
  evalProfile: Parameters<typeof evaluate>[0]['profile'];
}

const ADJ_LABELS: Record<AdjKind, { fa: string; sub: string; icon: typeof Coffee; tint: string }> = {
  day_off: { fa: 'روز آزاد',  sub: 'Day Off', icon: Coffee,       tint: 'from-amber-400 to-orange-500' },
  sbf:     { fa: 'Standby',  sub: 'SBF',     icon: ShieldCheck,  tint: 'from-violet-400 to-indigo-500' },
};

// Default durations and offsets for each adjacent type. These are conservative
// defaults — the user can tweak them later from the freeform HistoryPanel.
const buildAdjEntry = (
  candidate: ProposedFlight,
  kind: AdjKind,
  position: 'before' | 'after',
  candidateIdx: number,
): DutyEntry => {
  const reporting = new Date(candidate.reportingTimeLocal);
  const arrival = candidate.estimatedArrivalLocal ? new Date(candidate.estimatedArrivalLocal) : null;

  if (position === 'before') {
    if (kind === 'day_off') {
      // Day off ends right as the flight reports — gives the engine a clean
      // "rest after off-day" calculation. Length: 24h.
      const end = reporting.toISOString();
      const start = new Date(reporting.getTime() - 24 * 3600_000).toISOString();
      return { id: adjId(candidateIdx, kind, position), kind: 'day_off', start, end, startStation: 'home', endStation: 'home' };
    }
    // SBF before — default 6h ending right at reporting.
    const end = reporting.toISOString();
    const start = new Date(reporting.getTime() - 6 * 3600_000).toISOString();
    return { id: adjId(candidateIdx, kind, position), kind: 'sbf', start, end, startStation: 'home', endStation: 'home' };
  }

  // After-flight: anchor to the estimated arrival (+30 min check-out).
  const anchor = arrival ? new Date(arrival.getTime() + 30 * 60_000) : new Date(reporting.getTime() + 8 * 3600_000);
  if (kind === 'day_off') {
    const start = anchor.toISOString();
    const end = new Date(anchor.getTime() + 24 * 3600_000).toISOString();
    return { id: adjId(candidateIdx, kind, position), kind: 'day_off', start, end, startStation: 'home', endStation: 'home' };
  }
  const start = anchor.toISOString();
  const end = new Date(anchor.getTime() + 6 * 3600_000).toISOString();
  return { id: adjId(candidateIdx, kind, position), kind: 'sbf', start, end, startStation: 'home', endStation: 'home' };
};

const findAdj = (history: DutyEntry[], candidateIdx: number, kind: AdjKind, position: 'before' | 'after') =>
  history.find((h) => h.id === adjId(candidateIdx, kind, position));

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
  // Engine writes "12.50h" or "12.50" or "≥12.00h" etc.
  const m = s.match(/(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

export function AdjacentDuties({
  candidates, activeIndex, history, onHistoryChange, result, evalProfile,
}: Props) {
  const candidate = candidates[activeIndex];

  const toggle = (kind: AdjKind, position: 'before' | 'after') => {
    const existing = findAdj(history, activeIndex, kind, position);
    if (existing) {
      onHistoryChange(history.filter((h) => h.id !== existing.id));
      return;
    }
    // If a different adjacent kind already occupies that slot, replace it —
    // before/after slots are mutually exclusive to keep the model coherent.
    const otherKind: AdjKind = kind === 'day_off' ? 'sbf' : 'day_off';
    const cleared = history.filter((h) => h.id !== adjId(activeIndex, otherKind, position));
    onHistoryChange([...cleared, buildAdjEntry(candidate, kind, position, activeIndex)]);
  };

  // Pull the rest-before check out of the engine's result. When no prior duty
  // is recorded the engine writes an 'info' message; we surface that too.
  const restCheck = result.checks.find((c) => c.id === 'rest-before');
  const restAvailable = parseHFromText(restCheck?.value);
  const restRequired = parseHFromText(restCheck?.limit);

  // What would minimum rest become if the user added a day-off vs a standby
  // immediately before the flight? Run two cheap previews so the user can see
  // the impact before committing.
  const previewBeforeOff = useMemo(() => {
    const next = [...history.filter((h) => h.id !== adjId(activeIndex, 'sbf', 'before')),
      buildAdjEntry(candidate, 'day_off', 'before', activeIndex)];
    return evaluate({ profile: evalProfile, history: next, proposed: candidate });
  }, [history, candidate, activeIndex, evalProfile]);
  const previewBeforeSby = useMemo(() => {
    const next = [...history.filter((h) => h.id !== adjId(activeIndex, 'day_off', 'before')),
      buildAdjEntry(candidate, 'sbf', 'before', activeIndex)];
    return evaluate({ profile: evalProfile, history: next, proposed: candidate });
  }, [history, candidate, activeIndex, evalProfile]);

  const previewRest = (r: RuleEngineResult) => {
    const c = r.checks.find((x) => x.id === 'rest-before');
    return { req: parseHFromText(c?.limit), avail: parseHFromText(c?.value), status: c?.status };
  };
  const offPrev = previewRest(previewBeforeOff);
  const sbyPrev = previewRest(previewBeforeSby);

  return (
    <div className="space-y-3 text-slate-900 dark:text-slate-100" dir="rtl">
      {/* INTRO: what is this section + how to use it */}
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
              {candidate.label || `کاندید #${toFaDigits(activeIndex + 1)}`} ·
              {' '}<span className="tabular-nums">{candidate.reportingTimeLocal.slice(0, 10)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-brand-500/8 ring-1 ring-brand-500/20 px-3 py-2.5 mb-3 text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200">
          <b className="text-brand-700 dark:text-brand-300">این بخش چه کاری می‌کند؟</b>
          {' '}اگر می‌خواهی بدانی روز قبل یا بعد از این پرواز <b>تعطیل</b> یا <b>آماده‌باش</b> داشته باشی، آن را اضافه کن.
          اپ تأثیرش بر <b>حداقل Rest قانونی</b> را همان لحظه نشان می‌دهد.
        </div>

        {/* Step 1 */}
        <StepHeader n="۱" title="قبل از پرواز چه چیزی اضافه شود؟" hint="اختیاری — اگر روز قبل آزادی" />
        <SlotRow
          active={{
            day_off: !!findAdj(history, activeIndex, 'day_off', 'before'),
            sbf:     !!findAdj(history, activeIndex, 'sbf',     'before'),
          }}
          onToggle={(k) => toggle(k, 'before')}
        />

        <div className="h-px bg-slate-100 dark:bg-slate-800 my-3" />

        {/* Step 2 */}
        <StepHeader n="۲" title="بعد از پرواز چه چیزی اضافه شود؟" hint="اختیاری — برای محاسبهٔ Rest روز بعد" />
        <SlotRow
          active={{
            day_off: !!findAdj(history, activeIndex, 'day_off', 'after'),
            sbf:     !!findAdj(history, activeIndex, 'sbf',     'after'),
          }}
          onToggle={(k) => toggle(k, 'after')}
        />
      </div>

      {/* Min rest read-out — step 3 */}
      <div className="surface rounded-2xl p-3.5 animate-rise">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[11px] font-extrabold grid place-items-center shrink-0">۳</span>
          <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <div className="text-[12.5px] font-extrabold flex-1">نتیجه: حداقل Rest قبل از این پرواز</div>
          <RestBadge status={restCheck?.status} />
        </div>
        <div className="text-[11px] opacity-70 mb-3 leading-relaxed">
          مقدار <b>«در دسترس»</b> باید بزرگ‌تر یا برابر <b>«موردنیاز»</b> باشد تا پرواز قانونی شود.
          هر گزینه‌ای که در بالا اضافه کنی، این عددها به‌روز می‌شوند.
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

        <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/40">
          <div className="text-[11px] font-bold opacity-70 mb-2 flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            پیش‌نمایش اثر گزینه‌های قبل از پرواز
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PreviewChip
              icon={Coffee} fa="+ روز آزاد" sub="Day Off"
              avail={offPrev.avail} req={offPrev.req}
              passing={!!(offPrev.avail != null && offPrev.req != null && offPrev.avail >= offPrev.req)}
            />
            <PreviewChip
              icon={ShieldCheck} fa="+ Standby" sub="SBF 6h"
              avail={sbyPrev.avail} req={sbyPrev.req}
              passing={!!(sbyPrev.avail != null && sbyPrev.req != null && sbyPrev.avail >= sbyPrev.req)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

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

function SlotRow({ active, onToggle }: {
  active: Record<AdjKind, boolean>;
  onToggle: (k: AdjKind) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5 flex-wrap">
      <Chip kind="day_off" on={active.day_off} onClick={() => onToggle('day_off')} />
      <Chip kind="sbf"     on={active.sbf}     onClick={() => onToggle('sbf')} />
    </div>
  );
}

function Chip({ kind, on, onClick }: { kind: AdjKind; on: boolean; onClick: () => void }) {
  const meta = ADJ_LABELS[kind];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 flex items-center gap-1 px-2.5 h-9 rounded-xl text-[11px] font-extrabold ring-1 transition-all active:scale-95',
        on
          ? `text-white bg-gradient-to-br ${meta.tint} shadow-md ring-white/20`
          : 'bg-white/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700',
      )}
    >
      {on ? <X className="w-3 h-3" strokeWidth={2.6} /> : <Plus className="w-3 h-3" strokeWidth={2.6} />}
      <Icon className="w-3 h-3" strokeWidth={2.4} />
      <span>{meta.fa}</span>
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

function PreviewChip({ icon: Icon, fa, sub, avail, req, passing }: {
  icon: typeof Coffee; fa: string; sub: string;
  avail: number | null; req: number | null; passing: boolean;
}) {
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
        <div className="text-[11px] font-extrabold leading-tight truncate">{fa}</div>
        <div className="text-[10px] opacity-60 leading-none">{sub}</div>
      </div>
      <div className="text-[11px] font-extrabold tabular-nums shrink-0">
        {avail == null || req == null ? '—' : `${fmtHours(avail)} / ${fmtHours(req)}`}
      </div>
    </div>
  );
}

// Suppress unused-import warning for Plane (kept for future flight glyph use).
void Plane;
