// Turns the IRCrew roster (`RosterRow[]`) into FTL Checker `DutyEntry[]` so
// the rules engine can run against the user's actual month. We're conservative
// on defaults: missing fields fall back to homed values rather than throwing,
// because real upstream rows occasionally drop a time field or use ambiguous
// formats. The user can still hand-edit any imported entry via HistoryPanel.

import type { RosterRow } from './types';
import type { DutyEntry, DutyKind } from '../ftl/rules/types';
import { parseDepArrCell } from './utils';

const HOME_BASES = new Set(['THR', 'IKA', 'BND']);

/** Combine an ISO date and an HH:MM into a local datetime ISO (no Z suffix —
 *  the engine reads .getHours()/.getMinutes() which use the runtime TZ). */
const combine = (iso: string, hhmm: string): string => `${iso}T${hhmm.padEnd(5, '0')}:00`;

/** If arrival HH:MM is earlier than departure HH:MM the flight crosses
 *  midnight — advance the arrival date by one day. */
const maybeNextDay = (depIso: string, depHH: string, arrIso: string, arrHH: string): string => {
  if (depIso !== arrIso) return arrIso;
  const [dh, dm] = depHH.split(':').map(Number);
  const [ah, am] = arrHH.split(':').map(Number);
  if (ah * 60 + am >= dh * 60 + dm) return arrIso;
  const d = new Date(arrIso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const localTimeMin = (iso: string): number => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** OM-A 7.1.4.4 / 7.1.4.13.7 buckets — derived from local HH:MM. */
const classifyFdpWindow = (startIso: string, endIso: string) => {
  const s = localTimeMin(startIso);
  const e = localTimeMin(endIso);
  const isEarly = s >= 5 * 60 && s <= 5 * 60 + 59;
  const isLate = (e >= 23 * 60) || (e <= 1 * 60 + 59);
  // Night = FDP overlaps 02:00–04:59 local
  const isNight = (s <= 4 * 60 + 59 && e >= 2 * 60) || (s >= 2 * 60 && s <= 4 * 60 + 59);
  return { isEarly, isLate, isNight };
};

const ROSTER_TO_DUTY: Partial<Record<RosterRow['kind'], DutyKind>> = {
  FLIGHT:   'fdp',
  DEADHEAD: 'positioning',  // Crew flies as passenger — counts as duty, not FDP block time
  LAYOVER:  'rest',         // Mid-mission off day at outstation — NOT a HB day-off
  OFF:      'day_off',
  RSV:      'reserve',      // Reserve roster slot; the engine treats this differently from SBF
  TRAIN:    'training',
  MED:      'admin',
  PASS:     'admin',
  MEET:     'admin',
  GROUND:   'admin',
  // REJECT / OTHER → skipped (not a duty we can model)
};

export interface ConversionStats {
  imported: number;
  skipped: number;
  byKind: Partial<Record<DutyKind, number>>;
}

export interface ConversionResult {
  entries: DutyEntry[];
  stats: ConversionStats;
}

export function rosterToHistory(rows: RosterRow[]): ConversionResult {
  const entries: DutyEntry[] = [];
  const stats: ConversionStats = { imported: 0, skipped: 0, byKind: {} };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const dutyKind = ROSTER_TO_DUTY[r.kind];
    if (!dutyKind) { stats.skipped++; continue; }

    const dep = parseDepArrCell(r.depTime);
    const arr = parseDepArrCell(r.arrTime);

    // We must have at least a date — bail out if we can't even establish that.
    if (!dep.iso) { stats.skipped++; continue; }

    let startIso: string;
    let endIso: string;

    if ((dutyKind === 'fdp' || dutyKind === 'positioning') && dep.time && arr.iso && arr.time) {
      // Dead-head flights have real dep/arr times like an FDP — use them.
      startIso = combine(dep.iso, dep.time);
      const arrDate = maybeNextDay(dep.iso, dep.time, arr.iso, arr.time);
      endIso = combine(arrDate, arr.time);
    } else if (dutyKind === 'day_off') {
      // Off day: 00:00 of the date to 00:00 the next day.
      startIso = combine(dep.iso, '00:00');
      const d = new Date(dep.iso + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      endIso = combine(d.toISOString().slice(0, 10), '00:00');
    } else {
      // Reserve / training / admin without explicit times — treat as a typical
      // 08:00–16:00 block on the date so cumulative-duty windows pick it up
      // without overweighting it.
      const sH = dep.time || '08:00';
      const eH = arr.time || '16:00';
      startIso = combine(dep.iso, sH);
      endIso = combine(maybeNextDay(dep.iso, sH, arr.iso || dep.iso, eH), eH);
    }

    // Pack flight + route into the note in a parser-friendly shape so the
    // legality-scan UI can show "IR715 · THR→DXB" without a separate field.
    const depCode = (r.dep || '').toUpperCase().trim();
    const arrCode = (r.arr || '').toUpperCase().trim();
    const noteParts: string[] = [];
    if (r.fltNo) noteParts.push(r.fltNo);
    else if (r.kindLabel) noteParts.push(r.kindLabel);
    else noteParts.push(r.kind);
    if (depCode || arrCode) noteParts.push(`${depCode || '—'}→${arrCode || '—'}`);

    const entry: DutyEntry = {
      id: `roster-${i}-${dep.iso}-${r.fltNo || r.kindCode || r.kind}`,
      kind: dutyKind,
      start: startIso,
      end: endIso,
      startStation: HOME_BASES.has(depCode) ? 'home' : 'away',
      endStation: HOME_BASES.has(arrCode) ? 'home' : 'away',
      endsAtIKA: arrCode === 'IKA',
      note: noteParts.join(' · '),
    };

    if (dutyKind === 'fdp') {
      const blockMs = new Date(endIso).getTime() - new Date(startIso).getTime();
      entry.sectors = 1;
      entry.blockHours = Math.max(0.1, Math.round((blockMs / 3600_000) * 10) / 10);
      const win = classifyFdpWindow(startIso, endIso);
      entry.isEarly = win.isEarly;
      entry.isLate = win.isLate;
      entry.isNight = win.isNight;
    }

    entries.push(entry);
    stats.imported++;
    stats.byKind[dutyKind] = (stats.byKind[dutyKind] ?? 0) + 1;
  }

  // The engine sorts internally where it cares about order, but a chronological
  // history reads more naturally in the manual HistoryPanel too.
  entries.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Roster rows are per-leg. Merge legs that belong to the same FDP — two
  // consecutive FDP rows are the same duty if the next one starts within ~3h
  // of the previous one ending (typical turnaround) and they don't sit on
  // different calendar days separated by a real rest. Same-day dedupe also
  // collapses literal duplicates (some upstream views emit a row twice).
  const merged: DutyEntry[] = [];
  const TURNAROUND_GAP_MS = 3.5 * 3600_000;
  for (const e of entries) {
    if (e.kind !== 'fdp') { merged.push(e); continue; }
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'fdp') {
      const prevEnd = new Date(prev.end).getTime();
      const thisStart = new Date(e.start).getTime();
      const gap = thisStart - prevEnd;
      // Literal duplicate: same flight number and date — drop.
      if (gap < 60_000 && (prev.note ?? '').split(' · ')[0] === (e.note ?? '').split(' · ')[0]) {
        // already counted; nothing to merge.
        continue;
      }
      if (gap >= 0 && gap <= TURNAROUND_GAP_MS) {
        // Merge: extend end, count one more sector, sum block hours, append route.
        const blockAdd = e.blockHours ?? 0;
        prev.end = e.end;
        prev.sectors = (prev.sectors ?? 1) + (e.sectors ?? 1);
        prev.blockHours = Math.round(((prev.blockHours ?? 0) + blockAdd) * 10) / 10;
        // Append the next leg's route so the user sees the whole rotation.
        const prevParts = (prev.note ?? '').split(' · ');
        const nextParts = (e.note ?? '').split(' · ');
        const fltNo = prevParts[0];
        const routes = [prevParts[1], nextParts[1]].filter(Boolean).join(' › ');
        prev.note = routes ? `${fltNo} · ${routes}` : fltNo;
        prev.endStation = e.endStation;
        prev.endsAtIKA = e.endsAtIKA;
        // Re-classify night/early/late window over the merged span.
        const win = classifyFdpWindow(prev.start, prev.end);
        prev.isEarly = win.isEarly;
        prev.isLate = win.isLate;
        prev.isNight = win.isNight;
        // Conversion bookkeeping: the merged entry replaces two raw rows.
        stats.byKind.fdp = (stats.byKind.fdp ?? 1) - 1;
        continue;
      }
    }
    merged.push(e);
  }

  return { entries: merged, stats };
}
