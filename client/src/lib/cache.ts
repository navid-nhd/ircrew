// Two-layer cache:
//   • memory  — short TTL (default 60s). Keeps date-navigation snappy without
//     hammering the upstream proxy when the user flicks between days.
//   • persistent (localStorage) — longer TTL (default 2h). Lets the offline
//     Android shell render the most recent roster/flight pages even when the
//     proxy is unreachable. Stale entries are kept until the next write so the
//     UI can still show "last known" data with a freshness hint.

const MEM_TTL = 60_000;
const DISK_TTL = 2 * 3600_000;
const STORE_PREFIX = 'ircrew.cache.v1.';

interface Entry<T> { value: T; expiresAt: number; storedAt: number }

const mem = new Map<string, Entry<unknown>>();

const readDisk = <T>(key: string): Entry<T> | null => {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as Entry<T>;
  } catch { return null; }
};

const writeDisk = <T>(key: string, entry: Entry<T>): void => {
  try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(entry)); } catch { /* quota */ }
};

export interface CacheHit<T> { value: T; storedAt: number; stale: boolean }

export const cache = {
  get<T>(key: string, opts: { memTtl?: number; diskTtl?: number } = {}): CacheHit<T> | null {
    const memTtl = opts.memTtl ?? MEM_TTL;
    const diskTtl = opts.diskTtl ?? DISK_TTL;
    const now = Date.now();

    const m = mem.get(key) as Entry<T> | undefined;
    if (m && m.expiresAt > now) return { value: m.value, storedAt: m.storedAt, stale: false };

    const d = readDisk<T>(key);
    if (d) {
      // promote disk hit back into memory so subsequent same-tab reads are O(1)
      mem.set(key, { value: d.value, expiresAt: now + memTtl, storedAt: d.storedAt });
      const stale = d.storedAt + diskTtl < now;
      return { value: d.value, storedAt: d.storedAt, stale };
    }
    return null;
  },

  set<T>(key: string, value: T, opts: { memTtl?: number; diskTtl?: number } = {}): void {
    const memTtl = opts.memTtl ?? MEM_TTL;
    const now = Date.now();
    const entry: Entry<T> = { value, expiresAt: now + memTtl, storedAt: now };
    mem.set(key, entry);
    writeDisk(key, entry);
  },

  invalidate(prefix?: string): void {
    if (!prefix) { mem.clear(); return; }
    for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORE_PREFIX + prefix)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  },
};

export const cacheKey = (...parts: Array<string | number>): string =>
  parts.map((p) => String(p)).join('|');
