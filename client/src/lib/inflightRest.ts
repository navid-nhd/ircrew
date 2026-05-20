// OM-A 7.1.4.8 — In-flight Rest planner.
//
// Iran Air OM-A 7.1.4.8.1 specifies fleet-specific rest-facility classes:
//   • A330 Zone A    → treated as Class 3
//   • B747 Upper Deck → treated as Class 2
//   • Bunk facility   → Class 1
//
// Constraints encoded here:
//   • Rest may start no earlier than 30 min after departure
//   • Rest must end no later than 30 min before arrival
//   • Rest only during cruise; not during climb/descent
//   • Cabin crew minimum rest follows Table 7.6 (already in the engine)
//   • Partitioning between crew groups must be uniform (we produce evenly-split
//     blocks; the rest splitter component allows manual override)

import type { RestClass } from '../ftl/rules/tables';

export type RestFacilityClass = RestClass; // 1 | 2 | 3
export type Fleet = 'A330-zoneA' | 'B747-upperDeck' | 'Bunk-Class1' | 'unknown';

export interface IfrPlanInput {
  /** Block-off (estimated departure) — local ISO. */
  etdIso: string;
  /** Block-on (estimated arrival) — local ISO. */
  etaIso: string;
  /** How many crew groups should share the rest evenly (typically 2). */
  groupCount: 1 | 2 | 3;
  fleet: Fleet;
}

export interface IfrPlanGroup {
  groupIndex: number;
  restStartIso: string;
  restEndIso: string;
  restMinutes: number;
}

export interface IfrPlan {
  facilityClass: RestFacilityClass;
  /** Earliest legal rest start: ETD + 30 min. */
  earliestStartIso: string;
  /** Latest legal rest end: ETA − 30 min. */
  latestEndIso: string;
  /** Total restable window length in minutes. */
  windowMinutes: number;
  /** Per-group blocks. */
  groups: IfrPlanGroup[];
  /** Persian note flagging any sub-optimal allocation. */
  note: string;
}

const FLEET_CLASS: Record<Fleet, RestFacilityClass> = {
  'Bunk-Class1':     1,
  'B747-upperDeck':  2,
  'A330-zoneA':      3,
  unknown:           3,
};

export function planInflightRest(input: IfrPlanInput): IfrPlan {
  const etdMs = new Date(input.etdIso).getTime();
  const etaMs = new Date(input.etaIso).getTime();
  const earliest = etdMs + 30 * 60_000;
  const latest = etaMs - 30 * 60_000;
  const windowMin = Math.max(0, Math.floor((latest - earliest) / 60_000));

  const perGroupMin = Math.floor(windowMin / input.groupCount);
  const groups: IfrPlanGroup[] = [];
  for (let i = 0; i < input.groupCount; i++) {
    const start = earliest + i * perGroupMin * 60_000;
    const end = start + perGroupMin * 60_000;
    groups.push({
      groupIndex: i + 1,
      restStartIso: new Date(start).toISOString(),
      restEndIso: new Date(end).toISOString(),
      restMinutes: perGroupMin,
    });
  }

  let note = `پنجرهٔ مفید استراحت ≈ ${Math.floor(windowMin / 60)}h ${windowMin % 60}min، تقسیم بین ${input.groupCount} گروه.`;
  if (windowMin < input.groupCount * 60) {
    note += ' هشدار: کمتر از ۶۰ دقیقه برای هر گروه — ممکن است Table 7.6 برقرار نشود.';
  }

  return {
    facilityClass: FLEET_CLASS[input.fleet],
    earliestStartIso: new Date(earliest).toISOString(),
    latestEndIso: new Date(latest).toISOString(),
    windowMinutes: windowMin,
    groups,
    note,
  };
}

export const fleetLabelFa: Record<Fleet, string> = {
  'A330-zoneA':     'A330 — Zone A',
  'B747-upperDeck': 'B747 — Upper Deck',
  'Bunk-Class1':    'Bunk (Class 1)',
  unknown:          'نامشخص',
};
