// OM-A 7.6 — Crew nutrition: operator must provide meals/drinks for FDPs > 6h,
// and meals must be spaced ≤ 6h apart. The watchdog flags any FDP that fails
// either rule and produces a suggested meal schedule.

import type { DutyEntry } from '../ftl/rules/types';

export interface CrewMealCheck {
  fdpId: string;
  fdpLengthMin: number;
  needsMeal: boolean;
  suggestedMealSlots: string[]; // ISOs spaced 5h apart inside the FDP
  violation: 'too-long-no-break' | 'gap-too-big' | null;
  note: string;
}

const SIX_HOURS_MIN = 6 * 60;

export function checkCrewMeals(
  fdp: DutyEntry,
  breaks: Array<{ startIso: string; endIso: string }> = [],
): CrewMealCheck {
  const startMs = new Date(fdp.start).getTime();
  const endMs = new Date(fdp.end).getTime();
  const lenMin = Math.floor((endMs - startMs) / 60_000);

  if (lenMin <= SIX_HOURS_MIN) {
    return {
      fdpId: fdp.id,
      fdpLengthMin: lenMin,
      needsMeal: false,
      suggestedMealSlots: [],
      violation: null,
      note: 'FDP ≤ ۶ ساعت — وعدهٔ غذایی الزامی نیست (طبق ۷.۶).',
    };
  }

  // Suggest meal slots every 5h (giving 1h buffer before the 6h max).
  const suggested: string[] = [];
  for (let t = startMs + 5 * 3600_000; t < endMs - 30 * 60_000; t += 5 * 3600_000) {
    suggested.push(new Date(t).toISOString());
  }

  // If breaks supplied, check max gap.
  let maxGapMin = lenMin;
  if (breaks.length > 0) {
    const sorted = [...breaks].sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
    let cursor = startMs;
    maxGapMin = 0;
    for (const br of sorted) {
      const gap = (new Date(br.startIso).getTime() - cursor) / 60_000;
      if (gap > maxGapMin) maxGapMin = gap;
      cursor = new Date(br.endIso).getTime();
    }
    const tail = (endMs - cursor) / 60_000;
    if (tail > maxGapMin) maxGapMin = tail;
  }

  const violation: CrewMealCheck['violation'] = maxGapMin > SIX_HOURS_MIN
    ? (breaks.length === 0 ? 'too-long-no-break' : 'gap-too-big')
    : null;

  const note = violation
    ? `FDP حدود ${(lenMin / 60).toFixed(1)} ساعت — حداکثر فاصلهٔ بدون غذا = ${(maxGapMin / 60).toFixed(1)}h > ۶h (۷.۶ نقض شده).`
    : `FDP حدود ${(lenMin / 60).toFixed(1)} ساعت — درخواست crew meal طبق ۷.۶ ضروری است.`;

  return {
    fdpId: fdp.id,
    fdpLengthMin: lenMin,
    needsMeal: true,
    suggestedMealSlots: suggested,
    violation,
    note,
  };
}
