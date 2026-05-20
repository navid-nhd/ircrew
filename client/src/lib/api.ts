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

export type ApiFailKind =
  | 'network'         // fetch itself threw (proxy unreachable / dev server down / DNS / TLS)
  | 'truncated'       // connection dropped mid-response — body wasn't valid JSON
  | 'upstream-down'   // proxy returned 502/504 — Iran Air or our proxy can't reach it
  | 'auth'            // proxy returned 401 — credentials are wrong
  | 'no-data'         // proxy returned 404 with noData=true (date out of retention)
  | 'not-found'       // proxy returned 404 with notFound=true (flight not in grid)
  | 'server-error'    // any other 5xx
  | 'client-error';   // 400 / other unexpected status

export class ApiError extends Error {
  status: number;
  kind: ApiFailKind;
  noData?: boolean;
  notFound?: boolean;
  seenCount?: number;
  constructor(message: string, opts: {
    status: number;
    kind: ApiFailKind;
    noData?: boolean;
    notFound?: boolean;
    seenCount?: number;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.kind = opts.kind;
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

// Map an HTTP status + body shape onto a typed ApiError so the UI can react
// without parsing English strings. Persian message is what the user actually
// sees in the error toast / login screen.
function classifyHttpError(status: number, body: ApiErrorBody, hasJson: boolean): ApiError {
  if (status === 401) {
    return new ApiError('کد یا رمز عبور نادرست است.', { status, kind: 'auth' });
  }
  if (status === 404 && body.noData) {
    return new ApiError(body.error || 'برای این تاریخ داده‌ای ثبت نشده.', { status, kind: 'no-data', noData: true });
  }
  if (status === 404 && body.notFound) {
    return new ApiError(body.error || 'موردی پیدا نشد.', { status, kind: 'not-found', notFound: true, seenCount: body.seenCount });
  }
  if (status === 502 || status === 504) {
    return new ApiError(
      body.error || 'سرور Iran Air در دسترس نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید (سامانه معمولاً بین ۲۰ تا ۸ صبح خاموش است).',
      { status, kind: 'upstream-down' },
    );
  }
  if (status >= 500) {
    return new ApiError(
      hasJson
        ? (body.error || `خطای سرور (${status}).`)
        : 'ارتباط با سرور Iran Air قطع شد. این معمولاً وقتی پیش می‌آید که سامانه پاسخ کند می‌دهد — چند ثانیه دیگر دوباره تلاش کنید.',
      { status, kind: hasJson ? 'server-error' : 'truncated' },
    );
  }
  if (status >= 400) {
    return new ApiError(body.error || `درخواست نامعتبر (${status}).`, { status, kind: 'client-error' });
  }
  // 2xx but body empty / unparseable — treat as truncated so the user gets a
  // retry-friendly message rather than a confusing logical failure.
  return new ApiError(
    body.error || 'پاسخ سرور به‌طور کامل دریافت نشد. لطفاً چند ثانیه صبر کنید و دوباره تلاش کنید.',
    { status, kind: hasJson ? 'server-error' : 'truncated' },
  );
}

// Auto-retry on 502/504 (upstream-gateway failure) AND on truncated responses
// (dev-server restart in the middle of a slow Iran Air round-trip). 404 = stable
// failure, don't retry.
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let lastErr: ApiError | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

    let res: Response;
    try {
      res = await postOnce(path, body, signal);
    } catch (netErr) {
      // fetch() itself threw — the dev proxy is down, DNS is broken, the
      // mobile device lost the LAN, the user toggled airplane mode mid-tap…
      // Re-throw with the typed error so the UI can show a useful message
      // instead of an opaque "Invalid server response".
      if (netErr instanceof DOMException && netErr.name === 'AbortError') throw netErr;
      lastErr = new ApiError(
        'به سرور دسترسی نیست. آدرس پراکسی را در تنظیمات بررسی کنید، یا با حالت نمایشی ادامه دهید.',
        { status: 0, kind: 'network' },
      );
      if (attempt === 3) break;
      await sleep(700 * attempt);
      continue;
    }

    // Read the body once, then try to JSON-parse it. If parsing fails we still
    // have the raw text to log; the user sees a "truncated response" message.
    const raw = await res.text().catch(() => '');
    let parsed: ApiErrorBody | null = null;
    let hasJson = false;
    if (raw) {
      try { parsed = JSON.parse(raw) as ApiErrorBody; hasJson = true; }
      catch { /* leave parsed as null */ }
    }

    if (res.ok && hasJson && (parsed as { ok?: boolean })?.ok !== false) {
      return parsed as unknown as T;
    }

    lastErr = classifyHttpError(res.status, parsed ?? {}, hasJson);

    const isTransient = lastErr.kind === 'upstream-down' || lastErr.kind === 'truncated';
    if (!isTransient || attempt === 3) break;
    await sleep(700 * attempt);
  }
  throw lastErr ?? new ApiError('درخواست با خطا مواجه شد.', { status: 0, kind: 'network' });
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
