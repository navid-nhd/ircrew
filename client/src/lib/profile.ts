// Persisted, per-crew-code profile. Stores the user's own position so the
// header can render a correct honorific without re-querying the proxy on every
// launch. Updated lazily by RosterTab whenever fresh roster data comes in.

import type { RosterRow } from './types';

const STORE_PREFIX = 'ircrew.profile.v1.';

export interface UserProfile {
  /** Raw position code as it appears in the roster (e.g. "IP", "FA2"). */
  position: string;
  /** When this was last refreshed (ms since epoch). */
  updatedAt: number;
}

const key = (code: string) => STORE_PREFIX + code.toUpperCase();

export const profileStore = {
  load(code: string): UserProfile | null {
    try {
      const raw = localStorage.getItem(key(code));
      return raw ? (JSON.parse(raw) as UserProfile) : null;
    } catch { return null; }
  },
  save(code: string, p: UserProfile): void {
    try { localStorage.setItem(key(code), JSON.stringify(p)); } catch { /* quota */ }
  },
};

/** Pick the most common position across roster rows that have one — robust
 *  against the occasional empty / odd row. Returns "" if none seen. */
export function derivePositionFromRoster(rows: RosterRow[]): string {
  const tally = new Map<string, number>();
  for (const r of rows) {
    const p = (r.pos ?? '').trim().toUpperCase();
    if (!p) continue;
    tally.set(p, (tally.get(p) ?? 0) + 1);
  }
  let best = ''; let bestN = 0;
  for (const [p, n] of tally) if (n > bestN) { best = p; bestN = n; }
  return best;
}
