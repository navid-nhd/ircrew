// OM-A 7.1.3 + Table 7.1 — Acclimatization state resolver.
//
// State semantics:
//   B = acclimatized to the time zone of departure (home / reference base)
//   D = acclimatized to the time zone of destination
//   X = unknown / not acclimatized to either (the conservative state — FDP
//       must be computed against the more limiting of B and D reference times)
//
// Iran Air OM-A Table 7.1 fixes the state as a function of two inputs:
//   ΔTZ = absolute hours difference between departure and arrival local times
//   T   = elapsed hours since reference time of the last duty period
//
// The matrix (paraphrased from the OM-A Persian translation):
//   ΔTZ <  4h          → always B regardless of T
//   ΔTZ 4-6h, T<48h    → B; T 48-72h → X; T ≥72h → D
//   ΔTZ 6-9h, T<48h    → B; T 48-72h → X; T ≥72h → D
//   ΔTZ 9-12h, T<48h   → B; T 48-72h → X; T 72-96h → X; T ≥96h → D
//   ΔTZ >12h (rare)    → X until rest at destination ≥3 local nights

import type { DutyEntry } from '../ftl/rules/types';

export type AcclState = 'B' | 'D' | 'X';

export interface AcclResolution {
  state: AcclState;
  /** Hours since the reference activity (rounded to nearest 0.5h). */
  elapsedHours: number;
  /** Absolute time-zone delta in hours used in the lookup. */
  tzDelta: number;
  /** Plain Persian explanation showing the lookup row. */
  reason: string;
}

/** Round to half-hour resolution — OM-A buckets are at 24h granularity, half
 *  hour is plenty and reads cleaner on the UI. */
const round = (h: number) => Math.round(h * 2) / 2;

/** Resolve acclimatization state for a proposed FDP given the most recent
 *  meaningful duty (or arrival into the new time zone). Caller supplies the
 *  ΔTZ in hours between the *current* reference time and the *previous* one. */
export function resolveAcclimatization(
  proposedStartIso: string,
  lastDuty: DutyEntry | null,
  tzDeltaHours: number,
): AcclResolution {
  const tz = Math.abs(tzDeltaHours);
  if (!lastDuty || tz < 4) {
    return {
      state: 'B',
      elapsedHours: 0,
      tzDelta: tz,
      reason: tz < 4
        ? `اختلاف زمانی ${tz.toFixed(1)} ساعت کمتر از ۴ — همیشه acclimatized (B).`
        : 'سابقهٔ Duty قبلی ثبت نشده — به‌صورت پیش‌فرض B.',
    };
  }
  const elapsed = round((new Date(proposedStartIso).getTime() - new Date(lastDuty.end).getTime()) / 3_600_000);

  // Picks the threshold table row matching tz.
  const rows: Array<{ upTo: number; bandT: Array<{ upTo: number; state: AcclState }> }> = [
    { upTo: 6,  bandT: [{ upTo: 48, state: 'B' }, { upTo: 72, state: 'X' }, { upTo: Infinity, state: 'D' }] },
    { upTo: 9,  bandT: [{ upTo: 48, state: 'B' }, { upTo: 72, state: 'X' }, { upTo: Infinity, state: 'D' }] },
    { upTo: 12, bandT: [{ upTo: 48, state: 'B' }, { upTo: 96, state: 'X' }, { upTo: Infinity, state: 'D' }] },
    { upTo: Infinity, bandT: [{ upTo: 72, state: 'X' }, { upTo: Infinity, state: 'X' }] },
  ];
  const row = rows.find((r) => tz <= r.upTo)!;
  const band = row.bandT.find((b) => elapsed <= b.upTo)!;

  const reason = `ΔTZ ≈ ${tz.toFixed(1)}h، گذشته از پایان Duty قبلی ≈ ${elapsed.toFixed(1)}h → بر اساس جدول ۷.۱ وضعیت ${band.state}.`;
  return { state: band.state, elapsedHours: elapsed, tzDelta: tz, reason };
}

/** Persian short label for the state. */
export const acclLabelFa = (s: AcclState): string =>
  s === 'B' ? 'سازگار با مبدأ (B)'
    : s === 'D' ? 'سازگار با مقصد (D)'
      : 'نامعلوم — محافظه‌کارانه (X)';
