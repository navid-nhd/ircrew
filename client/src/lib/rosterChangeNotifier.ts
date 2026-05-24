// Persistent "unseen roster changes" log per (crewCode, period).
//
// MENTAL MODEL
// The existing rosterAudit.ts produces a diff every time a roster is
// re-fetched. Without persistence, the diff disappears as soon as the user
// scrolls or switches tabs — so a change posted overnight is invisible by
// breakfast. This module keeps the diff alive across sessions, hashed so we
// can tell "I've seen these specific changes" from "new changes arrived".
//
// FLOW
//   1. RosterTab fetches a roster → auditor produces RosterChange[]
//   2. recordChanges(code, period, changes) saves them in localStorage,
//      tagged with a content hash + timestamp + seen:false
//   3. The new RosterChangeBanner reads from here, shows unseen items
//   4. User taps "خواندم" → markSeen(code, period) flips seen:true
//   5. Same hash arriving again ⇒ ignored (already-seen). New hash ⇒
//      banner reappears with the new items.

import type { RosterChange } from './rosterAudit';

const STORE_PREFIX = 'ircrew.rosterChanges.v1.';

const key = (code: string, period: string): string =>
  `${STORE_PREFIX}${code.toUpperCase()}::${period}`;

export interface StoredChangeBatch {
  hash: string;             // content hash so we can dedupe identical batches
  changes: RosterChange[];  // raw changes to display
  recordedAt: number;       // ms epoch
  seen: boolean;
}

function djb2Hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

function hashChanges(changes: RosterChange[]): string {
  if (changes.length === 0) return '0';
  const norm = changes
    .map((c) => `${c.kind}|${c.rowKey}|${c.shiftedByMin ?? ''}|${c.reference}`)
    .sort()
    .join('@');
  return djb2Hash(norm);
}

/** Save a batch of changes for (code, period). Returns true if anything was
 *  actually recorded (i.e. this hash isn't already present + seen). */
export function recordChanges(
  code: string, period: string, changes: RosterChange[],
): boolean {
  if (changes.length === 0) return false;
  const hash = hashChanges(changes);
  try {
    const raw = localStorage.getItem(key(code, period));
    if (raw) {
      const existing = JSON.parse(raw) as StoredChangeBatch;
      if (existing.hash === hash) {
        // Same set as last time — don't overwrite the seen flag.
        return false;
      }
    }
    const batch: StoredChangeBatch = {
      hash, changes, recordedAt: Date.now(), seen: false,
    };
    localStorage.setItem(key(code, period), JSON.stringify(batch));
    return true;
  } catch {
    return false;
  }
}

export function loadChanges(code: string, period: string): StoredChangeBatch | null {
  try {
    const raw = localStorage.getItem(key(code, period));
    if (!raw) return null;
    return JSON.parse(raw) as StoredChangeBatch;
  } catch { return null; }
}

export function markSeen(code: string, period: string): void {
  const batch = loadChanges(code, period);
  if (!batch) return;
  try {
    localStorage.setItem(key(code, period), JSON.stringify({ ...batch, seen: true }));
  } catch { /* ignore */ }
}

/** Total unseen changes across all known periods for this crew code —
 *  useful for a future "global notification badge". */
export function countUnseenAcrossPeriods(code: string): number {
  const prefix = STORE_PREFIX + code.toUpperCase() + '::';
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        const b = JSON.parse(localStorage.getItem(k) ?? '') as StoredChangeBatch;
        if (!b.seen) total += b.changes.length;
      } catch { /* ignore corrupt */ }
    }
  } catch { /* ignore */ }
  return total;
}
