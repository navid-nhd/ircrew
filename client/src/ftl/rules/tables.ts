// OM-A Chapter 7 lookup tables.
// All times in HH:MM. Time brackets are inclusive on both ends, in local Reference Time.

export type TimeBracket = { from: string; to: string };
export type FdpRow = { bracket: TimeBracket; bySectors: Record<number, string | null> };

// minute helpers
export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Inclusive check that a time-of-day in minutes (0..1439) is inside a bracket [from..to]; supports overnight brackets.
export const inBracket = (timeMin: number, fromHHMM: string, toHHMM: string): boolean => {
  const f = toMin(fromHHMM);
  const t = toMin(toHHMM);
  if (f <= t) return timeMin >= f && timeMin <= t;
  return timeMin >= f || timeMin <= t; // overnight wrap
};

// ────────────────────────────────────────────────────────────────────────────
// Table 7.2 — Maximum daily FDP for ACCLIMATIZED crew (no extension).
// Rows by start-of-FDP at reference time, columns by sectors (1-2, 3..10).
// ────────────────────────────────────────────────────────────────────────────
export const TABLE_7_2: FdpRow[] = [
  { bracket: { from: '06:00', to: '13:29' }, bySectors: { 2: '13:00', 3: '12:30', 4: '12:00', 5: '11:30', 6: '11:00', 7: '10:30', 8: '10:00', 9: '09:30', 10: '09:00' } },
  { bracket: { from: '13:30', to: '13:59' }, bySectors: { 2: '12:45', 3: '12:15', 4: '11:45', 5: '11:15', 6: '10:45', 7: '10:15', 8: '09:45', 9: '09:15', 10: '09:00' } },
  { bracket: { from: '14:00', to: '14:29' }, bySectors: { 2: '12:30', 3: '12:00', 4: '11:30', 5: '11:00', 6: '10:30', 7: '10:00', 8: '09:30', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '14:30', to: '14:59' }, bySectors: { 2: '12:15', 3: '11:45', 4: '11:15', 5: '10:45', 6: '10:15', 7: '09:45', 8: '09:15', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '15:00', to: '15:29' }, bySectors: { 2: '12:00', 3: '11:30', 4: '11:00', 5: '10:30', 6: '10:00', 7: '09:30', 8: '09:00', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '15:30', to: '15:59' }, bySectors: { 2: '11:45', 3: '11:15', 4: '10:45', 5: '10:15', 6: '09:45', 7: '09:15', 8: '09:00', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '16:00', to: '16:29' }, bySectors: { 2: '11:30', 3: '11:00', 4: '10:30', 5: '10:00', 6: '09:30', 7: '09:00', 8: '09:00', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '16:30', to: '16:59' }, bySectors: { 2: '11:15', 3: '10:45', 4: '10:15', 5: '09:45', 6: '09:15', 7: '09:00', 8: '09:00', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '17:00', to: '04:59' }, bySectors: { 2: '11:00', 3: '10:30', 4: '10:00', 5: '09:30', 6: '09:00', 7: '09:00', 8: '09:00', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '05:00', to: '05:14' }, bySectors: { 2: '12:00', 3: '11:30', 4: '11:00', 5: '10:30', 6: '10:00', 7: '09:30', 8: '09:00', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '05:15', to: '05:29' }, bySectors: { 2: '12:15', 3: '11:45', 4: '11:15', 5: '10:45', 6: '10:15', 7: '09:45', 8: '09:15', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '05:30', to: '05:44' }, bySectors: { 2: '12:30', 3: '12:00', 4: '11:30', 5: '11:00', 6: '10:30', 7: '10:00', 8: '09:30', 9: '09:00', 10: '09:00' } },
  { bracket: { from: '05:45', to: '05:59' }, bySectors: { 2: '12:45', 3: '12:15', 4: '11:45', 5: '11:15', 6: '10:45', 7: '10:15', 8: '09:45', 9: '09:15', 10: '09:00' } },
];

// ────────────────────────────────────────────────────────────────────────────
// Table 7.3 — FDP extension WITHOUT in-flight rest. null = "Not allowed".
// Columns: 1-2, 3, 4, 5 sectors.
// ────────────────────────────────────────────────────────────────────────────
export const TABLE_7_3: FdpRow[] = [
  { bracket: { from: '06:00', to: '06:14' }, bySectors: { 2: null, 3: null, 4: null, 5: null } },
  { bracket: { from: '06:15', to: '06:29' }, bySectors: { 2: '13:15', 3: '12:45', 4: '12:15', 5: '11:45' } },
  { bracket: { from: '06:30', to: '06:44' }, bySectors: { 2: '13:30', 3: '13:00', 4: '12:30', 5: '12:00' } },
  { bracket: { from: '06:45', to: '06:59' }, bySectors: { 2: '13:45', 3: '13:15', 4: '12:45', 5: '12:15' } },
  { bracket: { from: '07:00', to: '13:29' }, bySectors: { 2: '14:00', 3: '13:30', 4: '13:00', 5: '12:30' } },
  { bracket: { from: '13:30', to: '13:59' }, bySectors: { 2: '13:45', 3: '13:15', 4: '12:45', 5: null } },
  { bracket: { from: '14:00', to: '14:29' }, bySectors: { 2: '13:30', 3: '13:00', 4: '12:30', 5: null } },
  { bracket: { from: '14:30', to: '14:59' }, bySectors: { 2: '13:15', 3: '12:45', 4: '12:15', 5: null } },
  { bracket: { from: '15:00', to: '15:29' }, bySectors: { 2: '13:00', 3: '12:30', 4: '12:00', 5: null } },
  { bracket: { from: '15:30', to: '15:59' }, bySectors: { 2: '12:45', 3: null, 4: null, 5: null } },
  { bracket: { from: '16:00', to: '16:29' }, bySectors: { 2: '12:30', 3: null, 4: null, 5: null } },
  { bracket: { from: '16:30', to: '16:59' }, bySectors: { 2: '12:15', 3: null, 4: null, 5: null } },
  { bracket: { from: '17:00', to: '17:29' }, bySectors: { 2: '12:00', 3: null, 4: null, 5: null } },
  { bracket: { from: '17:30', to: '17:59' }, bySectors: { 2: '11:45', 3: null, 4: null, 5: null } },
  { bracket: { from: '18:00', to: '18:29' }, bySectors: { 2: '11:30', 3: null, 4: null, 5: null } },
  { bracket: { from: '18:30', to: '18:59' }, bySectors: { 2: '11:15', 3: null, 4: null, 5: null } },
  { bracket: { from: '19:00', to: '05:59' }, bySectors: { 2: null, 3: null, 4: null, 5: null } },
];

// ────────────────────────────────────────────────────────────────────────────
// Table 7.4 — FDP with in-flight rest, Flight Crew (general).
// Table 7.5 — Same, when FDP includes 1 sector >9h continuous and ≤2 sectors.
// Table 7.6 — Cabin crew minimum in-flight rest by FDP duration & rest class.
// ────────────────────────────────────────────────────────────────────────────
export type RestClass = 1 | 2 | 3;
export type ExtraPilots = 1 | 2;

export const TABLE_7_4: Record<RestClass, Record<ExtraPilots, string>> = {
  3: { 1: '14:00', 2: '15:00' },
  2: { 1: '15:00', 2: '16:00' },
  1: { 1: '16:00', 2: '17:00' },
};

export const TABLE_7_5: Record<RestClass, Record<ExtraPilots, string>> = {
  3: { 1: '15:00', 2: '16:00' },
  2: { 1: '16:00', 2: '17:00' },
  1: { 1: '17:00', 2: '18:00' },
};

// rows: maxFdp upper bound (HH:MM); cols: minimum in-flight rest by class
export const TABLE_7_6: { upTo: string; rest: Record<RestClass, string | null> }[] = [
  { upTo: '14:30', rest: { 1: '01:30', 2: '01:30', 3: '01:30' } },
  { upTo: '15:00', rest: { 1: '01:45', 2: '02:00', 3: '02:20' } },
  { upTo: '15:30', rest: { 1: '02:00', 2: '02:20', 3: '02:40' } },
  { upTo: '16:00', rest: { 1: '02:15', 2: '02:40', 3: '03:00' } },
  { upTo: '16:30', rest: { 1: '02:35', 2: '03:00', 3: null } },
  { upTo: '17:00', rest: { 1: '03:00', 2: '03:25', 3: null } },
  { upTo: '17:30', rest: { 1: '03:25', 2: null, 3: null } },
  { upTo: '18:00', rest: { 1: '03:50', 2: null, 3: null } },
];

// ────────────────────────────────────────────────────────────────────────────
// Table 7.1 — Acclimatization state.
// Returns 'B', 'D', or 'X' depending on TZ diff (h) and time elapsed since
// reporting at the reference time.
// ────────────────────────────────────────────────────────────────────────────
export type AcclimatizationState = 'B' | 'D' | 'X';

export const TABLE_7_1 = (tzDiffHours: number, elapsedHours: number): AcclimatizationState => {
  // rows by tz diff
  let row: AcclimatizationState[];
  if (tzDiffHours < 4)         row = ['B', 'D', 'D', 'D', 'D'];
  else if (tzDiffHours <= 6)   row = ['B', 'X', 'D', 'D', 'D'];
  else if (tzDiffHours <= 9)   row = ['B', 'X', 'X', 'D', 'D'];
  else                          row = ['B', 'X', 'X', 'X', 'D'];

  // columns: <48, 48-71:59, 72-95:59, 96-119:59, ≥120
  let col: number;
  if (elapsedHours < 48)        col = 0;
  else if (elapsedHours < 72)   col = 1;
  else if (elapsedHours < 96)   col = 2;
  else if (elapsedHours < 120)  col = 3;
  else                          col = 4;

  return row[col];
};

// ────────────────────────────────────────────────────────────────────────────
// Table 7.7 — Reporting time at airport (Check-in) prior to departure.
// Table 7.8 — Reporting on board.
// Returns minutes for the requested combination.
// ────────────────────────────────────────────────────────────────────────────
export type CrewKind = 'flight' | 'cabin';
export type AircraftBody = 'narrow' | 'wide';
export type FlightScope = 'domestic' | 'international';
export type StationKind = 'home' | 'away';

const HM = (h: number, m: number) => h * 60 + m;

export const TABLE_7_7 = (
  station: StationKind,
  scope: FlightScope,
  body: AircraftBody,
  crew: CrewKind,
): number => {
  if (station === 'home') {
    if (scope === 'domestic') {
      if (body === 'narrow') return crew === 'flight' ? HM(1, 0) : HM(1, 0);
      return crew === 'flight' ? HM(1, 0) : HM(1, 30);
    }
    return crew === 'flight' ? HM(1, 30) : HM(2, 0);
  }
  if (scope === 'domestic') return HM(1, 0);
  return HM(1, 30);
};

export const TABLE_7_8 = (
  station: StationKind,
  scope: FlightScope,
  body: AircraftBody,
  crew: CrewKind,
): number => {
  if (station === 'home') {
    if (scope === 'domestic') {
      if (body === 'narrow') return crew === 'flight' ? HM(0, 45) : HM(0, 50);
      return crew === 'flight' ? HM(0, 45) : HM(1, 10);
    }
    return crew === 'flight' ? HM(1, 0) : HM(1, 30);
  }
  if (scope === 'domestic') return HM(0, 45);
  return HM(1, 0);
};

// ────────────────────────────────────────────────────────────────────────────
// Table 7.9 — Minimum local nights of rest at HOME BASE to compensate for
// time-zone differences (rotation involving ≥4h TZ diff).
// rows: max TZ diff hours during rotation; cols: hours elapsed since reporting
// for the FIRST FDP of the rotation.
// ────────────────────────────────────────────────────────────────────────────
export const TABLE_7_9 = (tzMaxDiffHours: number, elapsedSinceFirstReportH: number): number => {
  // first row 4≤d≤6, second 6<d≤9, third 9<d≤12
  let row: number[];
  if (tzMaxDiffHours <= 6)       row = [2, 2, 3, 3];
  else if (tzMaxDiffHours <= 9)  row = [2, 3, 3, 4];
  else                            row = [2, 3, 4, 5];

  let col: number;
  if (elapsedSinceFirstReportH < 48)       col = 0;
  else if (elapsedSinceFirstReportH < 72)  col = 1;
  else if (elapsedSinceFirstReportH < 96)  col = 2;
  else                                      col = 3;

  return row[col];
};

// ────────────────────────────────────────────────────────────────────────────
// Bracket lookup helper used by FDP tables.
// ────────────────────────────────────────────────────────────────────────────
export const lookupFdpRow = (rows: FdpRow[], startTimeMin: number): FdpRow | null => {
  for (const r of rows) {
    if (inBracket(startTimeMin, r.bracket.from, r.bracket.to)) return r;
  }
  return null;
};
