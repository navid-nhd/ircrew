// OM-A 7.1.3 — Window of Circadian Low (WOCL) projector.
//
// WOCL is the 02:00–05:59 local-time band in the crew's CURRENT acclimatization
// frame. When acclimatized to the base (B), it's 02:00–05:59 of base time.
// When acclimatized to destination (D), it's 02:00–05:59 of destination time.
// When unknown (X), it must be evaluated in BOTH frames and the more limiting
// is used — so we return both bands for the UI to overlay.

import type { AcclState } from './acclimatization';

export interface WoclBand {
  /** ISO datetime when the WOCL band starts on the queried day (local). */
  startIso: string;
  /** ISO datetime when the WOCL band ends. */
  endIso: string;
  /** Hour-of-day in the projected frame (always 2 — kept for clarity). */
  startHourLocal: number;
  endHourLocal: number;
  /** Frame label (B / D) used to compute the band. */
  frame: 'B' | 'D';
}

const WOCL_START_HOUR = 2;
const WOCL_END_HOUR = 6;   // exclusive — 02:00–05:59 inclusive

/** Project the WOCL band(s) for a given calendar day in the user's current
 *  acclimatization state. ΔTZ is signed: positive means destination is ahead
 *  of base (eastbound), negative means west. */
export function projectWoclForDay(
  isoDate: string,
  state: AcclState,
  tzDeltaHours: number,
): WoclBand[] {
  const bands: WoclBand[] = [];
  if (state === 'B' || state === 'X') {
    bands.push(buildBand(isoDate, 'B', 0));
  }
  if (state === 'D' || state === 'X') {
    bands.push(buildBand(isoDate, 'D', tzDeltaHours));
  }
  return bands;
}

function buildBand(isoDate: string, frame: 'B' | 'D', offsetHours: number): WoclBand {
  // Start at local midnight on the queried date, then move to 02:00 + offset.
  const day = new Date(isoDate + 'T00:00:00');
  const start = new Date(day.getTime() + (WOCL_START_HOUR - offsetHours) * 3_600_000);
  const end = new Date(day.getTime() + (WOCL_END_HOUR - offsetHours) * 3_600_000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startHourLocal: WOCL_START_HOUR,
    endHourLocal: WOCL_END_HOUR,
    frame,
  };
}

/** Compute how many hours of a given FDP fall inside the projected WOCL.
 *  Used by FDP-sector-cap calculations (Table 7.3) and by the dashboard. */
export function woclOverlapHours(
  fdpStartIso: string, fdpEndIso: string,
  bands: WoclBand[],
): number {
  const s = new Date(fdpStartIso).getTime();
  const e = new Date(fdpEndIso).getTime();
  let total = 0;
  for (const band of bands) {
    const bs = new Date(band.startIso).getTime();
    const be = new Date(band.endIso).getTime();
    const ov = Math.max(0, Math.min(e, be) - Math.max(s, bs));
    total += ov;
  }
  return total / 3_600_000;
}
