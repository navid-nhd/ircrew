// Date/time helpers, all working with ISO strings + minutes.

export const HOUR = 60;
export const DAY = 24 * HOUR;

export const parseIso = (iso: string): Date => new Date(iso);
export const minutesBetween = (a: string, b: string): number =>
  Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 60000);

export const hoursBetween = (a: string, b: string): number => minutesBetween(a, b) / 60;

export const addMinutes = (iso: string, minutes: number): string => {
  const d = parseIso(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
};

export const localHHMM = (iso: string): string => {
  const d = parseIso(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const localTimeMin = (iso: string): number => {
  const d = parseIso(iso);
  return d.getHours() * 60 + d.getMinutes();
};

export const calendarMonthKey = (iso: string): string => {
  const d = parseIso(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const sameCalendarMonth = (a: string, b: string): boolean =>
  calendarMonthKey(a) === calendarMonthKey(b);

export const fmtH = (mins: number): string => {
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const fmtHFromHours = (hours: number): string => fmtH(Math.round(hours * 60));

/** Window helper: returns [start, end] (ms) for "last N hours ending at ref". */
export const windowEnding = (refIso: string, hoursBack: number): [number, number] => {
  const end = parseIso(refIso).getTime();
  const start = end - hoursBack * 3600_000;
  return [start, end];
};

/** Sum a numeric mapper over entries whose [start..end] overlaps [winStart..winEnd]. */
export const sumOverlapping = <T extends { start: string; end: string }>(
  entries: T[],
  winStartMs: number,
  winEndMs: number,
  mapper: (e: T, overlapMs: number) => number,
): number => {
  let total = 0;
  for (const e of entries) {
    const s = parseIso(e.start).getTime();
    const en = parseIso(e.end).getTime();
    const a = Math.max(s, winStartMs);
    const b = Math.min(en, winEndMs);
    if (b > a) total += mapper(e, b - a);
  }
  return total;
};

/** Local night = 8h falling between 22:00 and 08:00 local time. */
export const containsLocalNight = (startIso: string, endIso: string): boolean => {
  // Iterate each calendar day touched by [start..end]; if a continuous 8h window in 22:00-08:00 fits, OK.
  const startMs = parseIso(startIso).getTime();
  const endMs = parseIso(endIso).getTime();
  // For each day boundary 22:00 → next-day 08:00 (10h window) covered fully by [start..end] for ≥8h
  let cursor = new Date(startMs);
  cursor.setHours(22, 0, 0, 0);
  if (cursor.getTime() > endMs) return false;
  while (cursor.getTime() <= endMs) {
    const winStart = cursor.getTime();
    const winEnd = new Date(cursor);
    winEnd.setDate(winEnd.getDate() + 1);
    winEnd.setHours(8, 0, 0, 0);
    const a = Math.max(winStart, startMs);
    const b = Math.min(winEnd.getTime(), endMs);
    if (b - a >= 8 * 3600_000) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
};

/** Counts local nights that fall within [startIso..endIso]. */
export const countLocalNights = (startIso: string, endIso: string): number => {
  let count = 0;
  const startMs = parseIso(startIso).getTime();
  const endMs = parseIso(endIso).getTime();
  let cursor = new Date(startMs);
  cursor.setHours(22, 0, 0, 0);
  while (cursor.getTime() <= endMs) {
    const winStart = cursor.getTime();
    const winEnd = new Date(cursor);
    winEnd.setDate(winEnd.getDate() + 1);
    winEnd.setHours(8, 0, 0, 0);
    const a = Math.max(winStart, startMs);
    const b = Math.min(winEnd.getTime(), endMs);
    if (b - a >= 8 * 3600_000) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/** WOCL = 02:00–05:59 local acclim. Returns hours of overlap with [start..end] (capped). */
export const woclOverlapHours = (startIso: string, endIso: string): number => {
  const sMs = parseIso(startIso).getTime();
  const eMs = parseIso(endIso).getTime();
  let overlap = 0;
  let cursor = new Date(sMs);
  cursor.setHours(2, 0, 0, 0);
  if (cursor.getTime() > sMs) cursor.setDate(cursor.getDate() - 1);
  while (cursor.getTime() <= eMs) {
    const wStart = cursor.getTime();
    const wEnd = new Date(cursor);
    wEnd.setHours(6, 0, 0, 0); // 06:00 = end of 02:00–05:59 inclusive
    const a = Math.max(wStart, sMs);
    const b = Math.min(wEnd.getTime(), eMs);
    if (b > a) overlap += (b - a) / 3600_000;
    cursor.setDate(cursor.getDate() + 1);
  }
  return overlap;
};
