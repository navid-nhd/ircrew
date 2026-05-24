// Shared helper that mirrors OM-A 7.1.4.13: how soon AFTER the most recent
// duty in `history` is the crew member legally allowed to start their next
// duty (including a Standby)?
//
//   Required Rest = max(baseRequired, previous-duty duration)
//     baseRequired = 12h at Home Base, 10h away
//   Rest-start offset after the previous duty:
//     +1h at THR / BND (home), +2h at IKA, 0h elsewhere
//
// Returns `null` when the history has no qualifying prior duty (in which
// case any start time is legal). Used by AdjacentDuties' standby legality
// check AND by ResultsPanel's "earliest legal standby" info banner.

import type { DutyEntry } from '../ftl/rules/types';

export interface NextDutyEarliest {
  /** When the next duty / standby could legally start. */
  earliestIso: string;
  /** End of the most recent qualifying prior duty. */
  priorEndIso: string;
  /** Required rest hours after the prior duty (max of 12h/10h floor and prevDur). */
  requiredHours: number;
}

const DUTY_KINDS_FOR_REST = ['fdp', 'positioning', 'training', 'admin', 'airport_sb'] as const;

export function earliestLegalNextDuty(
  history: DutyEntry[],
  isHomeBase: boolean,
  excludeId?: string,
): NextDutyEarliest | null {
  const lastDuty = [...history]
    .filter((h) => h.id !== excludeId && DUTY_KINDS_FOR_REST.includes(h.kind as typeof DUTY_KINDS_FOR_REST[number]))
    .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];
  if (!lastDuty) return null;

  const prevDur = (new Date(lastDuty.end).getTime() - new Date(lastDuty.start).getTime()) / 3_600_000;
  const baseRequired = isHomeBase ? 12 : 10;
  const required = Math.max(baseRequired, prevDur);
  const offsetH = lastDuty.endStation === 'home' ? (lastDuty.endsAtIKA ? 2 : 1) : 0;
  const earliestMs = new Date(lastDuty.end).getTime() + (offsetH + required) * 3_600_000;
  return {
    earliestIso: new Date(earliestMs).toISOString(),
    priorEndIso: lastDuty.end,
    requiredHours: Math.round(required * 10) / 10,
  };
}

export interface Legality {
  legal: boolean;
  shortHours?: number;
  earliestLegalIso?: string;
  prevDutyEndIso?: string;
  requiredRestHours?: number;
  reason?: string;
}

/** Same shape that AdjacentDuties expects. Compares a proposed start
 *  against `earliestLegalNextDuty` and emits a Legality verdict. */
export function checkLegality(
  history: DutyEntry[],
  proposedStartIso: string,
  isHomeBase: boolean,
  excludeId?: string,
): Legality {
  const earliest = earliestLegalNextDuty(history, isHomeBase, excludeId);
  if (!earliest) return { legal: true };
  const startMs = new Date(proposedStartIso).getTime();
  const earliestMs = new Date(earliest.earliestIso).getTime();
  if (startMs >= earliestMs) {
    return {
      legal: true,
      earliestLegalIso: earliest.earliestIso,
      requiredRestHours: earliest.requiredHours,
      prevDutyEndIso: earliest.priorEndIso,
    };
  }
  return {
    legal: false,
    shortHours: (earliestMs - startMs) / 3_600_000,
    earliestLegalIso: earliest.earliestIso,
    prevDutyEndIso: earliest.priorEndIso,
    requiredRestHours: earliest.requiredHours,
    reason: 'Rest قانونی پس از Duty قبلی هنوز کامل نشده',
  };
}
