import { useMemo, useState } from 'react';
import {
  Coffee, AlertTriangle, Plus, X,
  Clock, ChevronRight, Sunrise, Sunset, Waves, SlidersHorizontal,
} from 'lucide-react';
import type { DutyEntry, ProposedFlight } from '../ftl/rules/types';
import { evaluate } from '../ftl/rules/engine';
import { cn, toFaDigits } from '../lib/utils';
import { checkLegality as sharedCheckLegality, type Legality } from '../lib/restGuard';

// All adjacency types the user can attach to a candidate. Three standby
// variants match the real OM-A SBA/SBB/SBF — picking one ALSO updates the
// candidate's precededByStandbyType+Hours so the rules engine actually
// applies its standby-reduction rule (which only reads those candidate
// fields, not the history entries).
type AdjKind = 'day_off' | 'sba' | 'sbb' | 'sbf' | 'sbc';

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
  /** Latest evaluation — currently only consumed via evalProfile for the
   *  rest-before preview inside the custom editor. */
  result?: unknown;
  evalProfile: Parameters<typeof evaluate>[0]['profile'];
}

const ADJ_META: Record<AdjKind, { fa: string; sub: string; icon: typeof Coffee; tint: string }> = {
  day_off: { fa: 'تعطیل',         sub: 'Day Off',     icon: Coffee,       tint: 'from-amber-400 to-orange-500' },
  sba:     { fa: 'آماده‌باش صبح', sub: 'SBA · ۰۰–۱۲', icon: Sunrise,      tint: 'from-sky-400 to-cyan-600' },
  sbb:     { fa: 'آماده‌باش عصر', sub: 'SBB · ۱۲–۰۰', icon: Sunset,       tint: 'from-violet-400 to-fuchsia-600' },
  sbf:     { fa: 'شناور',         sub: 'SBF · ۱۴h',   icon: Waves,        tint: 'from-indigo-400 to-blue-600' },
  sbc:     { fa: 'دلخواه',        sub: 'Custom SB',   icon: SlidersHorizontal, tint: 'from-emerald-400 to-teal-600' },
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
    if (kind === 'sbc') {
      // 'sbc' has no preset window — callers go through buildCustomSbEntry().
      // This branch only fires if a future caller misroutes; default to SBF.
      const sb = computeStandby('sbf', candidate.reportingTimeLocal);
      return { id: adjId(candidateIdx, kind, position), kind: 'sbf', start: sb.sbStartIso, end: sb.sbEndIso, startStation: 'home', endStation: 'home' };
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

const checkLegality = sharedCheckLegality;

const STANDBY_KINDS: AdjKind[] = ['sba', 'sbb', 'sbf', 'sbc'];
const isStandby = (k: AdjKind): boolean => STANDBY_KINDS.includes(k);

// Build a DutyEntry for the user-defined "custom" standby. Stored on the
// engine as kind:'sbf' (free-start) since the rules engine doesn't have a
// dedicated "custom" kind — but the chip identity uses 'sbc' so toggle()
// can find/clear it without colliding with the preset SBF chip.
function buildCustomSbEntry(
  candidateIdx: number,
  position: 'before' | 'after',
  startIso: string,
  durationH: number,
): DutyEntry {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationH * 3_600_000);
  return {
    id: adjId(candidateIdx, 'sbc', position),
    kind: 'sbf',
    start: start.toISOString(),
    end: end.toISOString(),
    startStation: 'home',
    endStation: 'home',
  };
}

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

// Build a sensible default "custom" standby window: 04:00 the day before
// reporting, 12 hours long — exactly matches the user's example of "4 AM
// till 4 PM standby for next day's flight".
function defaultCustomSb(reportingIso: string): { startIso: string; durationH: number } {
  const rep = new Date(reportingIso);
  const start = new Date(rep);
  start.setDate(start.getDate() - 1);
  start.setHours(4, 0, 0, 0);
  return { startIso: toLocalInputValue(start), durationH: 12 };
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time —
// not an ISO string with TZ. This formatter avoids the timezone-shift bug.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdjacentDuties({
  candidates, activeIndex, history, onHistoryChange, onCandidateChange,
  evalProfile,
}: Props) {
  const candidate = candidates[activeIndex];

  // Custom-standby editor state. Open is independent from "is the entry
  // saved" — the user can browse the editor without committing.
  const existingCustom = findAdj(history, activeIndex, 'sbc', 'before');
  const [customOpen, setCustomOpen] = useState<boolean>(!!existingCustom);
  const [customStart, setCustomStart] = useState<string>(() => {
    if (existingCustom) return toLocalInputValue(new Date(existingCustom.start));
    return defaultCustomSb(candidate.reportingTimeLocal).startIso;
  });
  const [customDuration, setCustomDuration] = useState<number>(() => {
    if (existingCustom) {
      return Math.round(((new Date(existingCustom.end).getTime() - new Date(existingCustom.start).getTime()) / 3_600_000) * 10) / 10;
    }
    return defaultCustomSb(candidate.reportingTimeLocal).durationH;
  });

  // Same editor state, mirrored for the AFTER slot. Default start = end of
  // candidate FDP + 12h rest, default duration = 14h (a typical SBF).
  const existingCustomAfter = findAdj(history, activeIndex, 'sbc', 'after');
  const [customAfterOpen, setCustomAfterOpen] = useState<boolean>(!!existingCustomAfter);
  const defaultAfterStart = useMemo(() => {
    const arrival = candidate.estimatedArrivalLocal
      ? new Date(candidate.estimatedArrivalLocal)
      : new Date(new Date(candidate.reportingTimeLocal).getTime() + 8 * 3_600_000);
    const restEnd = new Date(arrival.getTime() + 12 * 3_600_000);
    restEnd.setMinutes(0, 0, 0);
    return restEnd;
  }, [candidate.estimatedArrivalLocal, candidate.reportingTimeLocal]);
  const [customAfterStart, setCustomAfterStart] = useState<string>(() => {
    if (existingCustomAfter) return toLocalInputValue(new Date(existingCustomAfter.start));
    return toLocalInputValue(defaultAfterStart);
  });
  const [customAfterDuration, setCustomAfterDuration] = useState<number>(() => {
    if (existingCustomAfter) {
      return Math.round(((new Date(existingCustomAfter.end).getTime() - new Date(existingCustomAfter.start).getTime()) / 3_600_000) * 10) / 10;
    }
    return 14;
  });

  const toggle = (kind: AdjKind, position: 'before' | 'after') => {
    // Custom standby has its own editor — clicking the chip just opens/closes
    // the panel without creating an entry.
    if (kind === 'sbc' && position === 'before') {
      setCustomOpen((o) => !o);
      return;
    }
    if (kind === 'sbc' && position === 'after') {
      setCustomAfterOpen((o) => !o);
      return;
    }

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
      for (const k of ['day_off', 'sba', 'sbb', 'sbf', 'sbc'] as AdjKind[]) {
        if (k === kind) continue;
        if (h.id === adjId(activeIndex, k, position)) return false;
      }
      return true;
    });
    const entry = buildAdjEntry(candidate, kind, position, activeIndex);
    onHistoryChange([...cleared, entry]);

    // If adding a "before" standby, push the precededByStandby fields onto
    // the candidate so the rules engine actually applies its reduction.
    if (position === 'before' && isStandby(kind) && kind !== 'sbc') {
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

  const beforeActive = {
    day_off: !!findAdj(history, activeIndex, 'day_off', 'before'),
    sba:     !!findAdj(history, activeIndex, 'sba', 'before'),
    sbb:     !!findAdj(history, activeIndex, 'sbb', 'before'),
    sbf:     !!findAdj(history, activeIndex, 'sbf', 'before'),
    sbc:     !!existingCustom,
  };

  // Commit the editor → create or replace the custom-standby entry, push
  // hours onto the candidate, clear any preset before-chip in the same slot.
  const applyCustomSb = () => {
    const startMs = new Date(customStart).getTime();
    if (!Number.isFinite(startMs) || customDuration <= 0) return;
    const cleared = history.filter((h) => {
      for (const k of ['day_off', 'sba', 'sbb', 'sbf', 'sbc'] as AdjKind[]) {
        if (h.id === adjId(activeIndex, k, 'before')) return false;
      }
      return true;
    });
    // Re-construct an ISO string in LOCAL time (so the engine sees the same
    // wall-clock the user typed, regardless of TZ on the device).
    const localIso = new Date(startMs).toISOString();
    const entry = buildCustomSbEntry(activeIndex, 'before', localIso, customDuration);
    onHistoryChange([...cleared, entry]);
    const startHour = new Date(startMs).getHours();
    onCandidateChange({
      ...candidate,
      precededByStandbyType: 'home',
      precededByStandbyHours: Math.round(customDuration * 10) / 10,
      standbyStartedAtNight: startHour >= 23 || startHour < 7,
    });
  };

  const removeCustomSb = () => {
    if (!existingCustom) return;
    onHistoryChange(history.filter((h) => h.id !== existingCustom.id));
    onCandidateChange({
      ...candidate,
      precededByStandbyType: 'none',
      precededByStandbyHours: 0,
      standbyStartedAtNight: false,
    });
    setCustomOpen(false);
  };

  const isHomeBase = candidate.departureStation === 'home';

  // Legality of the user's CURRENT inputs (not the saved entry) — recomputed
  // every keystroke so the warning updates live.
  const customLegality = useMemo<Legality>(() => {
    const startMs = new Date(customStart).getTime();
    if (!Number.isFinite(startMs)) return { legal: true };
    const iso = new Date(startMs).toISOString();
    return checkLegality(history, iso, isHomeBase, adjId(activeIndex, 'sbc', 'before'));
  }, [customStart, history, isHomeBase, activeIndex]);

  const customEnd = useMemo(() => {
    const startMs = new Date(customStart).getTime();
    if (!Number.isFinite(startMs)) return null;
    return new Date(startMs + customDuration * 3_600_000);
  }, [customStart, customDuration]);

  // Rest-before preview with the user's CURRENT custom inputs (so they can
  // see the predicted FDP / rest impact before saving).
  const customPreview = useMemo(() => {
    const startMs = new Date(customStart).getTime();
    if (!Number.isFinite(startMs) || customDuration <= 0) return null;
    const base = history.filter((h) => {
      for (const k of ['day_off', 'sba', 'sbb', 'sbf', 'sbc'] as AdjKind[]) {
        if (h.id === adjId(activeIndex, k, 'before')) return false;
      }
      return true;
    });
    const entry = buildCustomSbEntry(activeIndex, 'before', new Date(startMs).toISOString(), customDuration);
    const startHour = new Date(startMs).getHours();
    const cand: ProposedFlight = {
      ...candidate,
      precededByStandbyType: 'home',
      precededByStandbyHours: Math.round(customDuration * 10) / 10,
      standbyStartedAtNight: startHour >= 23 || startHour < 7,
    };
    return evaluate({ profile: evalProfile, history: [...base, entry], proposed: cand });
  }, [customStart, customDuration, history, candidate, activeIndex, evalProfile]);

  // Compute legality for each "before" standby option. Excludes day-off
  // (day-off IS rest, so it can't violate rest-after). Excludes "after"
  // options (the engine doesn't apply rest-after-then-standby checks).
  const beforeLegality = useMemo(() => {
    const out: Record<'sba' | 'sbb' | 'sbf', Legality> = {
      sba: { legal: true }, sbb: { legal: true }, sbf: { legal: true },
    };
    for (const k of ['sba', 'sbb', 'sbf'] as const) {
      const sb = computeStandby(k, candidate.reportingTimeLocal);
      out[k] = checkLegality(history, sb.sbStartIso, isHomeBase, adjId(activeIndex, k, 'before'));
    }
    return out;
  }, [history, candidate.reportingTimeLocal, isHomeBase, activeIndex]);

  // If the currently-selected "before" standby is illegal, surface that
  // prominently above the chip grid.
  const activeIllegalBefore = (['sba', 'sbb', 'sbf'] as const)
    .find((k) => beforeActive[k] && !beforeLegality[k].legal);
  const afterActive = {
    day_off: !!findAdj(history, activeIndex, 'day_off', 'after'),
    sbf:     !!findAdj(history, activeIndex, 'sbf', 'after'),
    sbc:     !!existingCustomAfter,
  };

  const customAfterEnd = useMemo(() => {
    const ms = new Date(customAfterStart).getTime();
    if (!Number.isFinite(ms)) return null;
    return new Date(ms + customAfterDuration * 3_600_000);
  }, [customAfterStart, customAfterDuration]);

  const applyCustomAfterSb = () => {
    const startMs = new Date(customAfterStart).getTime();
    if (!Number.isFinite(startMs) || customAfterDuration <= 0) return;
    const cleared = history.filter((h) => {
      for (const k of ['day_off', 'sba', 'sbb', 'sbf', 'sbc'] as AdjKind[]) {
        if (h.id === adjId(activeIndex, k, 'after')) return false;
      }
      return true;
    });
    const entry = buildCustomSbEntry(activeIndex, 'after', new Date(startMs).toISOString(), customAfterDuration);
    onHistoryChange([...cleared, entry]);
  };

  const removeCustomAfterSb = () => {
    if (!existingCustomAfter) return;
    onHistoryChange(history.filter((h) => h.id !== existingCustomAfter.id));
    setCustomAfterOpen(false);
  };

  // Sanity check for the AFTER standby: it must start AFTER the candidate
  // FDP ends + Rest. We synthesise the candidate as a "prior duty" so the
  // same checkLegality logic applies.
  const customAfterLegality = useMemo<Legality>(() => {
    const startMs = new Date(customAfterStart).getTime();
    if (!Number.isFinite(startMs)) return { legal: true };
    const reporting = new Date(candidate.reportingTimeLocal);
    const arrival = candidate.estimatedArrivalLocal ? new Date(candidate.estimatedArrivalLocal) : null;
    const endOfFdp = arrival ? new Date(arrival.getTime() + 30 * 60_000) : new Date(reporting.getTime() + 8 * 3_600_000);
    const syntheticPrior: DutyEntry = {
      id: `synth-prior-${activeIndex}`,
      kind: 'fdp',
      start: reporting.toISOString(),
      end: endOfFdp.toISOString(),
      startStation: candidate.departureStation,
      endStation: candidate.arrivalStation,
    };
    const histWithCandidate = [...history.filter(h => h.id !== adjId(activeIndex, 'sbc', 'after')), syntheticPrior];
    return checkLegality(histWithCandidate, new Date(startMs).toISOString(), candidate.arrivalStation === 'home', adjId(activeIndex, 'sbc', 'after'));
  }, [customAfterStart, history, activeIndex, candidate]);

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

        {/* If the user picked an illegal option, lead with a clear red
            warning that explains why and what the legal alternative is. */}
        {activeIllegalBefore && (
          <IllegalWarning
            kind={activeIllegalBefore}
            legality={beforeLegality[activeIllegalBefore]}
            onClear={() => toggle(activeIllegalBefore, 'before')}
          />
        )}

        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <Chip kind="day_off" on={beforeActive.day_off} onClick={() => toggle('day_off', 'before')} />
          <Chip kind="sbf"     on={beforeActive.sbf}     onClick={() => toggle('sbf',     'before')} legality={beforeLegality.sbf} />
          <Chip kind="sba"     on={beforeActive.sba}     onClick={() => toggle('sba',     'before')} legality={beforeLegality.sba} />
          <Chip kind="sbb"     on={beforeActive.sbb}     onClick={() => toggle('sbb',     'before')} legality={beforeLegality.sbb} />
        </div>

        {/* Custom standby — full-width row that expands an editor. */}
        <button
          onClick={() => toggle('sbc', 'before')}
          className={cn(
            'w-full mb-3 flex items-center gap-2 px-3 h-11 rounded-xl text-[11.5px] font-extrabold ring-1 transition-all active:scale-[0.98]',
            beforeActive.sbc
              ? 'text-white bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md ring-white/20'
              : customOpen
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-300/60 dark:ring-emerald-700/50'
                : 'bg-white/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500/40',
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2.4} />
          <span className="flex-1 text-right">
            {beforeActive.sbc ? 'استندبای دلخواه فعال است' : 'استندبای با ساعت دلخواه'}
          </span>
          {beforeActive.sbc && existingCustom && (
            <span className="text-[10px] opacity-85 tabular-nums" dir="ltr">
              {new Date(existingCustom.start).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}–
              {new Date(existingCustom.end).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', customOpen ? '-rotate-90' : '')} />
        </button>

        {customOpen && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200 dark:ring-slate-700 p-3 mb-3 space-y-2.5">
            <div className="text-[11px] leading-relaxed opacity-80">
              زمان شروع و مدت استندبای را وارد کن. مثال: ساعت <b>۰۴:۰۰</b> صبح روز قبل از پرواز با مدت <b>۱۲</b> ساعت.
            </div>

            <div>
              <label className="block text-[10.5px] font-extrabold opacity-70 mb-1">شروع استندبای</label>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full h-10 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 px-3 text-[12.5px] font-bold tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-extrabold opacity-70 mb-1">
                مدت (ساعت) — حداکثر ۱۶
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0.5}
                  max={16}
                  step={0.5}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="flex-1 h-10 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 px-3 text-[14px] font-extrabold tabular-nums text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <input
                  type="range"
                  min={0.5}
                  max={16}
                  step={0.5}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
              </div>
              {customEnd && (
                <div className="text-[10.5px] opacity-65 mt-1 tabular-nums" dir="ltr">
                  ends ≈ {customEnd.toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>

            {!customLegality.legal && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-300 dark:ring-rose-700/50 p-2.5 text-[11px] text-rose-900 dark:text-rose-100 leading-relaxed">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" strokeWidth={2.6} />
                  <div>
                    این استندبای <b className="tabular-nums">{(customLegality.shortHours ?? 0).toFixed(1)}h</b> پیش از پایان Rest قانونی شروع می‌شود.
                    {customLegality.earliestLegalIso && (
                      <span className="block opacity-85 mt-0.5 tabular-nums" dir="ltr">
                        earliest legal start: {new Date(customLegality.earliestLegalIso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {customPreview && (() => {
              const c = customPreview.checks.find((x) => x.id === 'rest-before');
              const avail = parseHFromText(c?.value);
              const req = parseHFromText(c?.limit);
              const passing = !!(avail != null && req != null && avail >= req);
              return (
                <div className={cn(
                  'rounded-lg ring-1 px-3 py-2 flex items-center gap-2',
                  passing ? 'bg-emerald-50/80 dark:bg-emerald-950/30 ring-emerald-300/40'
                          : 'bg-amber-50/80 dark:bg-amber-950/30 ring-amber-300/40',
                )}>
                  <div className="text-[10.5px] font-extrabold opacity-80 flex-1">پیش‌نمایش Rest پیش از پرواز</div>
                  <div className="text-[11px] font-extrabold tabular-nums">
                    {avail == null || req == null ? '—' : `${fmtHours(avail)} / ${fmtHours(req)}`}
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <button
                onClick={applyCustomSb}
                className="flex-1 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-extrabold text-[12px] active:scale-[0.97] transition-transform shadow-md"
              >
                {existingCustom ? 'بروزرسانی' : 'ذخیره'}
              </button>
              {existingCustom && (
                <button
                  onClick={removeCustomSb}
                  className="h-10 px-4 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-200 font-extrabold text-[12px] ring-1 ring-rose-300/60 dark:ring-rose-700/50 active:scale-[0.97] transition-transform"
                >
                  حذف
                </button>
              )}
            </div>
          </div>
        )}

        <div className="h-px bg-slate-100 dark:bg-slate-800 my-3" />

        {/* Step 2 — after */}
        <StepHeader n="۲" title="بعد از پرواز چه چیزی هست؟" hint="برای برنامه‌ریزی روزهای بعد — مثلاً استندبای فردا" />
        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <Chip kind="day_off" on={afterActive.day_off} onClick={() => toggle('day_off', 'after')} />
          <Chip kind="sbf"     on={afterActive.sbf}     onClick={() => toggle('sbf',     'after')} />
        </div>

        {/* Custom standby AFTER — same editor pattern as the BEFORE slot. */}
        <button
          onClick={() => toggle('sbc', 'after')}
          className={cn(
            'w-full mt-1.5 flex items-center gap-2 px-3 h-11 rounded-xl text-[11.5px] font-extrabold ring-1 transition-all active:scale-[0.98]',
            afterActive.sbc
              ? 'text-white bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md ring-white/20'
              : customAfterOpen
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-300/60 dark:ring-emerald-700/50'
                : 'bg-white/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500/40',
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2.4} />
          <span className="flex-1 text-right">
            {afterActive.sbc ? 'استندبای دلخواه پس از پرواز فعال است' : 'استندبای دلخواه برای روزهای بعد'}
          </span>
          {afterActive.sbc && existingCustomAfter && (
            <span className="text-[10px] opacity-85 tabular-nums" dir="ltr">
              {new Date(existingCustomAfter.start).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
          <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', customAfterOpen ? '-rotate-90' : '')} />
        </button>

        {customAfterOpen && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200 dark:ring-slate-700 p-3 mt-2 space-y-2.5">
            <div className="text-[11px] leading-relaxed opacity-80">
              مثال: <b>استندبای فردا از ۰۴:۰۰ تا ۱۶:۰۰</b>. زمان شروع و مدت آن را وارد کن.
              این اطلاعات برای محاسبهٔ FDP پرواز بعدی (و چک Rest پس از این پرواز) استفاده می‌شود.
            </div>

            <div>
              <label className="block text-[10.5px] font-extrabold opacity-70 mb-1">شروع استندبای</label>
              <input
                type="datetime-local"
                value={customAfterStart}
                onChange={(e) => setCustomAfterStart(e.target.value)}
                className="w-full h-10 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 px-3 text-[12.5px] font-bold tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-extrabold opacity-70 mb-1">مدت (ساعت) — حداکثر ۱۶</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0.5} max={16} step={0.5}
                  value={customAfterDuration}
                  onChange={(e) => setCustomAfterDuration(Number(e.target.value))}
                  className="flex-1 h-10 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 px-3 text-[14px] font-extrabold tabular-nums text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <input
                  type="range" min={0.5} max={16} step={0.5}
                  value={customAfterDuration}
                  onChange={(e) => setCustomAfterDuration(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
              </div>
              {customAfterEnd && (
                <div className="text-[10.5px] opacity-65 mt-1 tabular-nums" dir="ltr">
                  ends ≈ {customAfterEnd.toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>

            {!customAfterLegality.legal && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-300 dark:ring-rose-700/50 p-2.5 text-[11px] text-rose-900 dark:text-rose-100 leading-relaxed">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" strokeWidth={2.6} />
                  <div>
                    این استندبای <b className="tabular-nums">{(customAfterLegality.shortHours ?? 0).toFixed(1)}h</b> پیش از پایان Rest قانونی پس از این پرواز شروع می‌شود.
                    {customAfterLegality.earliestLegalIso && (
                      <span className="block opacity-85 mt-0.5 tabular-nums" dir="ltr">
                        earliest legal start: {new Date(customAfterLegality.earliestLegalIso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={applyCustomAfterSb}
                className="flex-1 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-extrabold text-[12px] active:scale-[0.97] transition-transform shadow-md"
              >
                {existingCustomAfter ? 'بروزرسانی' : 'ذخیره'}
              </button>
              {existingCustomAfter && (
                <button
                  onClick={removeCustomAfterSb}
                  className="h-10 px-4 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-200 font-extrabold text-[12px] ring-1 ring-rose-300/60 dark:ring-rose-700/50 active:scale-[0.97] transition-transform"
                >
                  حذف
                </button>
              )}
            </div>
          </div>
        )}
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

function Chip({ kind, on, onClick, legality }: {
  kind: AdjKind; on: boolean; onClick: () => void;
  legality?: Legality;
}) {
  const meta = ADJ_META[kind];
  const Icon = meta.icon;
  const illegal = legality && !legality.legal;
  return (
    <button
      onClick={onClick}
      title={illegal ? legality?.reason ?? '' : undefined}
      className={cn(
        'flex items-center gap-1.5 px-2.5 h-11 rounded-xl text-[11.5px] font-extrabold ring-1 transition-all active:scale-95 relative',
        on
          ? `text-white bg-gradient-to-br ${meta.tint} shadow-md ring-white/20`
          : illegal
            ? 'bg-white/70 dark:bg-slate-800/40 text-rose-700 dark:text-rose-300 ring-rose-300/60 dark:ring-rose-700/50 hover:ring-rose-500/70'
            : 'bg-white/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-brand-500/40',
      )}
    >
      {on ? <X className="w-3 h-3" strokeWidth={2.6} /> : <Plus className="w-3 h-3" strokeWidth={2.6} />}
      <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
      <div className="flex-1 min-w-0 text-right">
        <div className="leading-none truncate">{meta.fa}</div>
        <div className={cn('text-[9.5px] leading-none mt-0.5', on ? 'opacity-85' : 'opacity-60')}>{meta.sub}</div>
      </div>
      {illegal && !on && (
        <span className="absolute -top-1.5 -right-1.5 grid place-items-center w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold ring-2 ring-white dark:ring-slate-900 shadow-md">
          !
        </span>
      )}
    </button>
  );
}

function IllegalWarning({ kind, legality, onClear }: {
  kind: AdjKind;
  legality: Legality;
  onClear: () => void;
}) {
  const meta = ADJ_META[kind];
  return (
    <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-300 dark:ring-rose-700/50 p-3 mb-3 text-[11.5px] leading-relaxed text-rose-900 dark:text-rose-100" dir="rtl">
      <div className="flex items-start gap-2 mb-1.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" strokeWidth={2.6} />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold mb-0.5">گزینهٔ <b>{meta.fa}</b> برای این پرواز قانونی نیست</div>
          <div className="text-[11px] opacity-90">
            {legality.reason}. این Standby <b className="tabular-nums">{(legality.shortHours ?? 0).toFixed(1)}h</b> زودتر از پایان Rest قانونی شروع می‌شود.
          </div>
          {legality.prevDutyEndIso && (
            <div className="text-[10.5px] opacity-80 mt-1.5 tabular-nums" dir="ltr">
              prev duty end: {new Date(legality.prevDutyEndIso).toLocaleString('fa-IR', { dateStyle:'short', timeStyle:'short' })} · rest ≥ {(legality.requiredRestHours ?? 0).toFixed(1)}h →{' '}
              earliest legal start: {new Date(legality.earliestLegalIso!).toLocaleString('fa-IR', { dateStyle:'short', timeStyle:'short' })}
            </div>
          )}
          <div className="text-[11px] mt-2">
            راه‌حل: یا <b>تعطیل</b> را قبل از پرواز انتخاب کن، یا <b>SBF شناور</b> با شروع پس از این زمان (در پنل پایین).
          </div>
        </div>
      </div>
      <button
        onClick={onClear}
        className="w-full mt-1 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11.5px] active:scale-[0.98] transition-transform"
      >
        حذف این انتخاب
      </button>
    </div>
  );
}

