import type {
  Credentials, RosterResponse, FlightsResponse, CrewResponse,
} from './types';
import { cache, cacheKey } from './cache';

// The proxy URL is configurable so the bundled Android shell can point at a
// hosted backend instead of the dev `/api` path. We read it lazily so the user
// can change it from Settings without a full reload.
const DEFAULT_API_BASE = '/api';
const API_BASE_STORE = 'ircrew.apiBase.v1';

export const apiBase = {
  get(): string {
    try { return localStorage.getItem(API_BASE_STORE) || DEFAULT_API_BASE; }
    catch { return DEFAULT_API_BASE; }
  },
  set(url: string): void {
    const trimmed = (url || '').trim().replace(/\/$/, '');
    try {
      if (!trimmed) localStorage.removeItem(API_BASE_STORE);
      else localStorage.setItem(API_BASE_STORE, trimmed);
    } catch { /* ignore */ }
  },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ApiError extends Error {
  status: number;
  noData?: boolean;
  notFound?: boolean;
  seenCount?: number;
  constructor(message: string, opts: {
    status: number;
    noData?: boolean;
    notFound?: boolean;
    seenCount?: number;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.noData = opts.noData;
    this.notFound = opts.notFound;
    this.seenCount = opts.seenCount;
  }
}

interface ApiErrorBody {
  ok?: false;
  error?: string;
  noData?: boolean;
  notFound?: boolean;
  seenCount?: number;
}

async function postOnce(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(apiBase.get() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

// Auto-retry on 502 (upstream-gateway failure surfaced by our proxy after its
// own retries exhausted). Often the previous attempt populated the server-side
// session cache, so the next try is fast. 404 = stable failure (no data /
// not found) — don't retry.
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let lastErr: ApiError | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const res = await postOnce(path, body, signal);
    const data = await res.json().catch(() => ({ ok: false, error: 'Invalid server response' } as ApiErrorBody));
    if (res.ok && (data as { ok?: boolean }).ok !== false) return data as T;

    const errBody = data as ApiErrorBody;
    lastErr = new ApiError(errBody.error || `Request failed (${res.status})`, {
      status: res.status,
      noData: errBody.noData,
      notFound: errBody.notFound,
      seenCount: errBody.seenCount,
    });
    const isTransient = res.status === 502 || res.status === 504;
    if (!isTransient || attempt === 3) break;
    await sleep(700 * attempt);
  }
  throw lastErr ?? new Error('Request failed');
}

export interface FetchOpts {
  signal?: AbortSignal;
  /** If true, skip cache lookup and force a fresh request (refresh button). */
  forceFresh?: boolean;
}

// A thin "fetch-with-cache" wrapper used by the flight/crew endpoints. We
// always serve the cached value first when available; if it's still warm we
// don't hit the network at all, otherwise we revalidate in the background and
// return the cached value to the caller.
async function cachedPost<T>(
  path: string, body: unknown, key: string, opts: FetchOpts = {},
): Promise<{ data: T; fromCache: boolean; stale: boolean; storedAt: number | null }> {
  if (!opts.forceFresh) {
    const hit = cache.get<T>(key);
    if (hit && !hit.stale) {
      return { data: hit.value, fromCache: true, stale: false, storedAt: hit.storedAt };
    }
  }
  try {
    const data = await post<T>(path, body, opts.signal);
    cache.set(key, data);
    return { data, fromCache: false, stale: false, storedAt: Date.now() };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    // Network failure: surface stale-but-readable cache when we have one, so the
    // offline shell can still show "last known" data. The caller can decide
    // whether to display a freshness warning.
    const stale = cache.get<T>(key);
    if (stale) return { data: stale.value, fromCache: true, stale: true, storedAt: stale.storedAt };
    throw e;
  }
}

export const api = {
  login: (creds: Credentials) =>
    post<{ ok: true; periods: string[] }>('/login', creds),

  roster: (creds: Credentials, period: string, opts: FetchOpts = {}) =>
    cachedPost<RosterResponse>(
      '/roster', { ...creds, period },
      cacheKey('roster', creds.code, period), opts,
    ),

  flightsOnDate: (creds: Credentials, date: string, opts: FetchOpts = {}) =>
    cachedPost<FlightsResponse>(
      '/flight-crew/flights', { ...creds, date },
      cacheKey('flights', creds.code, date), opts,
    ),

  crewOnFlight: (creds: Credentials, date: string, eventTarget: string, eventArgument: string, opts: FetchOpts = {}) =>
    cachedPost<CrewResponse>(
      '/flight-crew/crew', { ...creds, date, eventTarget, eventArgument },
      cacheKey('crew', creds.code, date, eventTarget, eventArgument), opts,
    ),

  crewByFlight: (creds: Credentials, date: string, fltNo: string, acType?: string, opts: FetchOpts = {}) =>
    cachedPost<CrewResponse>(
      '/flight-crew/by-flight', { ...creds, date, fltNo, acType },
      cacheKey('crew-by-flt', creds.code, date, fltNo, acType ?? ''), opts,
    ),
};
