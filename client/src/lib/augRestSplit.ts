// OM-A 7.1.4.8 — Augmented Crew Rest Splitter.
//
// When the FDP is extended using augmented crew + an in-flight rest facility,
// the rest must be divided "uniformly within each group" between the available
// rest classes. This helper takes the IFR window from the planner and the
// number of crew groups (typically 2: cockpit + cabin, or 2 cabin sub-groups
// for very long flights) and produces evenly-partitioned blocks.

import { cabinMinInflightRest } from '../ftl/rules/engine';
import type { RestFacilityClass } from './inflightRest';

export interface SplitInput {
  /** Inputs from planInflightRest(). */
  earliestRestStartIso: string;
  latestRestEndIso: string;
  groupCount: 2 | 3;
  facilityClass: RestFacilityClass;
  /** FDP length HH:MM — needed to look up Table 7.6 cabin minimum. */
  fdpHHMM: string;
  /** True if this is a cabin assignment (Table 7.6 applies). */
  isCabin: boolean;
}

export interface SplitGroup {
  index: number;
  startIso: string;
  endIso: string;
  minutes: number;
}

export interface SplitResult {
  groups: SplitGroup[];
  perGroupMinutes: number;
  /** Persian explanation including any Table 7.6 violations. */
  note: string;
  /** True when every group meets the minimum cabin in-flight rest in Table 7.6. */
  meetsTable76: boolean;
}

export function splitAugmentedRest(input: SplitInput): SplitResult {
  const sMs = new Date(input.earliestRestStartIso).getTime();
  const eMs = new Date(input.latestRestEndIso).getTime();
  const windowMin = Math.max(0, Math.floor((eMs - sMs) / 60_000));
  const per = Math.floor(windowMin / input.groupCount);

  const groups: SplitGroup[] = [];
  for (let i = 0; i < input.groupCount; i++) {
    const start = sMs + i * per * 60_000;
    const end = start + per * 60_000;
    groups.push({
      index: i + 1,
      startIso: new Date(start).toISOString(),
      endIso: new Date(end).toISOString(),
      minutes: per,
    });
  }

  let meetsTable76 = true;
  let note = `بازهٔ مفید استراحت ${(windowMin / 60).toFixed(1)}h، هر گروه ${(per / 60).toFixed(1)}h.`;
  if (input.isCabin) {
    const minRequired = cabinMinInflightRest(input.fdpHHMM, input.facilityClass);
    if (minRequired) {
      const [rh, rm] = minRequired.split(':').map(Number);
      const requiredMin = rh * 60 + (rm || 0);
      meetsTable76 = per >= requiredMin;
      note += meetsTable76
        ? ` — هر گروه ≥ حداقل Table 7.6 (${minRequired}).`
        : ` — هر گروه < حداقل Table 7.6 (${minRequired}). Class بهتر لازم است.`;
    } else {
      meetsTable76 = false;
      note += ` — Class ${input.facilityClass} برای این FDP در Table 7.6 پاسخگو نیست.`;
    }
  }

  return { groups, perGroupMinutes: per, note, meetsTable76 };
}
