// OM-A 7.1.2.1 — Roster must be published ≥14 days before the start of the month.
// OM-A 7.1.2.2 / 7.5 — Any change > 90 minutes after publication must have a
// recorded reason. We can't see the reason from the public proxy, but we can
// detect the slot change and let the user open a pre-filled complaint email.
//
// Approach: every successful roster fetch is snapshotted into localStorage,
// keyed by (crewCode, period). The next fetch diffs against the previous
// snapshot and produces a list of changes worth flagging.

import type { RosterResponse, RosterRow } from './types';
import { parseDepArrCell } from './utils';

const STORE_PREFIX = 'ircrew.rosterSnap.v1.';

interface Snapshot {
  storedAt: number;
  rangeLabel: string;
  rows: RosterRow[];
}

const key = (code: string, period: string) => `${STORE_PREFIX}${code.toUpperCase()}::${period}`;

export interface RosterChange {
  /** Unique identity of the row across snapshots, derived from depTime+fltNo. */
  rowKey: string;
  kind: 'added' | 'removed' | 'shifted' | 'replaced';
  /** Minutes of shift (when kind = 'shifted'). */
  shiftedByMin?: number;
  /** Whether the shift exceeds the 90-minute reporting threshold. */
  exceeds90Min: boolean;
  oldRow?: RosterRow;
  newRow?: RosterRow;
  reference: string;
  message: string;
}

export interface RosterAuditResult {
  /** When the new snapshot was fetched. */
  fetchedAt: number;
  /** Whether a prior snapshot existed for comparison. */
  hadPrevious: boolean;
  /** When the user FIRST saw this roster (used for the 14-day-publication check). */
  firstSeenAt: number;
  /** Publication-window violation, if applicable. */
  publicationViolation: { daysBeforeMonth: number; periodStart: string } | null;
  changes: RosterChange[];
}

const rowKeyOf = (r: RosterRow): string => {
  const dep = parseDepArrCell(r.depTime);
  return `${dep.iso || r.depTime}::${(r.fltNo || r.kindCode || '').toUpperCase().trim()}`;
};

const minBetween = (aIso: string, bIso: string): number =>
  Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000);

/** Persist the new snapshot and return what changed vs. the previous one. */
export function auditRoster(
  crewCode: string,
  period: string,
  response: RosterResponse,
): RosterAuditResult {
  const k = key(crewCode, period);
  let prev: Snapshot | null = null;
  let firstSeen = Date.now();
  try {
    const raw = localStorage.getItem(k);
    if (raw) {
      const parsed = JSON.parse(raw) as { snapshot: Snapshot; firstSeenAt: number };
      prev = parsed.snapshot;
      firstSeen = parsed.firstSeenAt;
    }
  } catch { /* ignore */ }

  const now = Date.now();
  const newSnap: Snapshot = { storedAt: now, rangeLabel: response.rangeLabel, rows: response.rows };

  // Detect publication-window violation. The period string is "YYYY-MM-DD till YYYY-MM-DD".
  const periodStartMatch = period.match(/^(\d{4}-\d{2}-\d{2})/);
  let publicationViolation: RosterAuditResult['publicationViolation'] = null;
  if (periodStartMatch && !prev) {
    const periodStartMs = new Date(periodStartMatch[1] + 'T00:00:00').getTime();
    const daysBefore = (periodStartMs - now) / 86_400_000;
    if (daysBefore < 14 && daysBefore > -1) {
      publicationViolation = {
        daysBeforeMonth: Math.round(daysBefore * 10) / 10,
        periodStart: periodStartMatch[1],
      };
    }
  }

  const changes: RosterChange[] = [];
  if (prev) {
    const prevByKey = new Map(prev.rows.map((r) => [rowKeyOf(r), r] as const));
    const newByKey = new Map(response.rows.map((r) => [rowKeyOf(r), r] as const));

    for (const [k, oldRow] of prevByKey) {
      const newRow = newByKey.get(k);
      if (!newRow) {
        changes.push({
          rowKey: k, kind: 'removed', oldRow,
          exceeds90Min: false,
          reference: '7.1.2.2',
          message: `پرواز ${oldRow.fltNo || k} از روستر حذف شد.`,
        });
        continue;
      }
      const oldDep = parseDepArrCell(oldRow.depTime);
      const newDep = parseDepArrCell(newRow.depTime);
      const oldIso = oldDep.iso && oldDep.time ? `${oldDep.iso}T${oldDep.time}:00` : '';
      const newIso = newDep.iso && newDep.time ? `${newDep.iso}T${newDep.time}:00` : '';
      if (oldIso && newIso && oldIso !== newIso) {
        const shifted = minBetween(oldIso, newIso);
        changes.push({
          rowKey: k, kind: 'shifted', oldRow, newRow,
          shiftedByMin: shifted,
          exceeds90Min: Math.abs(shifted) > 90,
          reference: Math.abs(shifted) > 90 ? '7.1.2.2' : '7.1.2',
          message: Math.abs(shifted) > 90
            ? `پرواز ${oldRow.fltNo || k} ${Math.abs(shifted)} دقیقه ${shifted > 0 ? 'به تعویق' : 'جلو'} افتاد — بیش از سقف ۹۰ دقیقه (۷.۱.۲.۲).`
            : `پرواز ${oldRow.fltNo || k} ${Math.abs(shifted)} دقیقه جابه‌جا شد.`,
        });
      } else if (oldRow.fltNo !== newRow.fltNo || oldRow.dep !== newRow.dep || oldRow.arr !== newRow.arr) {
        changes.push({
          rowKey: k, kind: 'replaced', oldRow, newRow,
          exceeds90Min: false,
          reference: '7.1.2.2',
          message: `جزئیات پرواز ${oldRow.fltNo || k} تغییر کرد (${oldRow.dep}→${oldRow.arr} ⇒ ${newRow.dep}→${newRow.arr}).`,
        });
      }
    }
    for (const [k, newRow] of newByKey) {
      if (!prevByKey.has(k)) {
        changes.push({
          rowKey: k, kind: 'added', newRow,
          exceeds90Min: false,
          reference: '7.1.2.2',
          message: `پرواز جدید ${newRow.fltNo || k} به روستر اضافه شد.`,
        });
      }
    }
  }

  try {
    localStorage.setItem(k, JSON.stringify({ snapshot: newSnap, firstSeenAt: firstSeen }));
  } catch { /* quota */ }

  return {
    fetchedAt: now,
    hadPrevious: !!prev,
    firstSeenAt: firstSeen,
    publicationViolation,
    changes,
  };
}

/** Quick read for the UI without writing a new snapshot. */
export function lastAudit(crewCode: string, period: string): RosterAuditResult | null {
  // We don't persist the audit itself, just the snapshot — re-deriving would
  // need a second response. UI calls auditRoster() directly on each fetch.
  void crewCode; void period;
  return null;
}
