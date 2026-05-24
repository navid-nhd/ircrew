// Native (Capacitor) upstream client. When the bundled APK runs on Android,
// there is no proxy server to talk to — so we call crew.iranair.com directly
// via @capacitor/core's CapacitorHttp. CapacitorHttp uses the native HTTP
// stack (OkHttp on Android) which bypasses CORS, manages cookies in a native
// cookie jar across requests, and handles redirects without us doing
// anything special.
//
// This mirrors what server/index.js does in Node + axios + tough-cookie +
// cheerio. The parsing logic is re-implemented with the WebView's built-in
// DOMParser so we don't ship cheerio to the phone.

import { CapacitorHttp, Capacitor, registerPlugin } from '@capacitor/core';
import type {
  Credentials, RosterResponse, RosterRow,
  FlightsResponse, FlightRow, CrewResponse, CrewRow, DutyKind,
} from './types';

// ────────────────────────────────────────────────────────────────────────────
// Custom Android HTTP plugin. crew.iranair.com uses a TLS chain rooted at an
// Iranian CA not in Android's default trust store, AND the server does not
// present the full intermediate chain — so OkHttp throws
//   "Trust anchor for certification path not found"
// when used directly via CapacitorHttp. Our native plugin (defined in
// android/.../IRCrewHttpPlugin.java) uses an OkHttp client with relaxed cert
// checks scoped strictly to *.iranair.com. On iOS / web the plugin is unset
// and we fall back to CapacitorHttp / fetch.
// ────────────────────────────────────────────────────────────────────────────
interface IRCrewHttpPlugin {
  request(opts: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    data?: string;
  }): Promise<{ status: number; data: string; url?: string }>;
  clearCookies(opts?: { host?: string }): Promise<void>;
}
const IRCrewHttp = registerPlugin<IRCrewHttpPlugin>('IRCrewHttp');
const HAS_NATIVE_PLUGIN = Capacitor.getPlatform() === 'android';

/** Wipe the cookie jar so subsequent calls start a fresh session, matching
 *  the Node server's withFreshSession pattern. No-op on web / iOS. */
async function resetSession(): Promise<void> {
  if (!HAS_NATIVE_PLUGIN) return;
  try { await IRCrewHttp.clearCookies({ host: 'crew.iranair.com' }); } catch { /* ignore */ }
}

const BASE = 'https://crew.iranair.com';
// Match the User-Agent the Node server uses verbatim. That server flow works
// end-to-end against crew.iranair.com so by sending the same UA we avoid any
// UA-conditional routing / layout difference that could trip MAC validation.
const UA = 'Mozilla/5.0 (compatible; IRCrew/1.0)';
const EPOCH = Date.UTC(2000, 0, 1);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const norm = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

const formBody = (obj: Record<string, string>): string =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

class UpstreamAuthError extends Error { __auth = true; }
class UpstreamNoDataError extends Error { __noData = true; }
class UpstreamNotFoundError extends Error {
  __notFound = true;
  __seen: number;
  constructor(message: string, seen: number) { super(message); this.__seen = seen; }
}

const isString = (x: unknown): x is string => typeof x === 'string';

// ────────────────────────────────────────────────────────────────────────────
// Tiny HTTP retry. The Iran Air upstream randomly drops mid-stream. Three
// attempts with backoff covers nearly every transient failure we see in
// practice — the server-side code does the same.
// ────────────────────────────────────────────────────────────────────────────
async function nativePost(url: string, headers: Record<string, string>, data: string): Promise<string> {
  if (HAS_NATIVE_PLUGIN) {
    const res = await IRCrewHttp.request({ url, method: 'POST', headers, data });
    return res.data ?? '';
  }
  const res = await CapacitorHttp.post({ url, headers, data, responseType: 'text' });
  return isString(res.data) ? res.data : String(res.data ?? '');
}

async function nativeGet(url: string, headers: Record<string, string>): Promise<string> {
  if (HAS_NATIVE_PLUGIN) {
    const res = await IRCrewHttp.request({ url, method: 'GET', headers });
    return res.data ?? '';
  }
  const res = await CapacitorHttp.get({ url, headers, responseType: 'text' });
  return isString(res.data) ? res.data : String(res.data ?? '');
}

async function postForm(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await nativePost(url, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      }, formBody(body));
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(700 * attempt + Math.random() * 300);
    }
  }
  throw lastErr ?? new Error('upstream POST failed');
}

async function getHtml(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await nativeGet(url, {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        ...extraHeaders,
      });
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(700 * attempt + Math.random() * 300);
    }
  }
  throw lastErr ?? new Error('upstream GET failed');
}

// Build a short text snippet of an HTML response so the user-facing error
// can include real diagnostic info we can read from a screenshot, instead
// of just "GridViewFlt not found". Strips long whitespace runs.
const snippet = (html: string, max = 220): string => {
  if (!html) return '<empty body>';
  const s = html.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + ' … (' + s.length + ' chars total)';
};

const parseHtml = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

// ────────────────────────────────────────────────────────────────────────────
// Roster parsing (CrewDelivery.dll) — mirrors server-side classifyFlt + parseRoster.
// ────────────────────────────────────────────────────────────────────────────
function classifyFlt(fltNo: string): { kind: DutyKind; code: string; label: string } {
  const f = norm(fltNo);
  if (!f) return { kind: 'OTHER', code: '', label: '' };
  const upper = f.toUpperCase();
  // RST / REST: match as a word anywhere — the FltNo may be blank with
  // the code living in the Status column instead. Must precede OFF.
  if (/\b(RST|REST)\b/.test(upper)) return { kind: 'RST', code: 'RST', label: f || 'Rest' };
  // OFC / OFFICE: same word-boundary detection.
  if (/\b(OFC|OFFICE)\b/.test(upper)) return { kind: 'OFC', code: 'OFC', label: f || 'Office Duty' };
  if (/^(OFF|DO\b)/.test(upper)) return { kind: 'OFF',    code: 'OFF', label: f || 'Off day' };
  if (/^(RSV|STBY|RES\b)/.test(upper)) return { kind: 'RSV',    code: 'RSV', label: f || 'Reserve' };
  if (/^(REC|RC\b|TRN|TRG|TRAIN|GS\b|SIM|CRM|OPC|LPC|EME|GROUND)/.test(upper))
                                       return { kind: 'TRAIN',  code: upper.split(/\s+/)[0], label: f };
  if (/^(MED|MDC|MDL|MEDICAL)/.test(upper))     return { kind: 'MED',    code: 'MED', label: f || 'Medical' };
  if (/^(PSP|PASS(?:PORT)?)/.test(upper))       return { kind: 'PASS',   code: 'PSP', label: f || 'Passport' };
  if (/^(MTG|MEET(?:ING)?)/.test(upper))        return { kind: 'MEET',   code: 'MTG', label: f || 'Meeting' };
  if (/^(REJ|SCK|SICK|REF|REFUSE)/.test(upper)) return { kind: 'REJECT', code: upper.split(/\s+/)[0], label: f || 'Rejected' };
  if (/^(GND|GROUND|GR\b)/.test(upper))         return { kind: 'GROUND', code: 'GND', label: f || 'Grounded' };
  // Layover: forced off-day during a multi-day mission AWAY from Home Base.
  if (/^(LAYOVER|L\/O|LO\b)/.test(upper)) {
    return { kind: 'LAYOVER', code: 'L/O', label: f || 'Layover' };
  }
  // Dead-head / Positioning (crew flies as passenger). DH715 / D/H 715 /
  // IR715/DH / POS — all classify the same way. Pre-empt FLIGHT match.
  if (/^POS(\b|\d)/.test(upper) ||
      /(^|\s|\/)D[\s\/.-]*H\b/.test(upper) ||
      /^DH\s*\d/.test(upper)) {
    const m2 = upper.match(/(\d{2,5})/);
    return { kind: 'DEADHEAD', code: m2 ? 'DH' + m2[1] : 'DH', label: f };
  }
  const m = upper.match(/^([A-Z]{1,3})?\s*(\d{2,5})\b/);
  if (m) return { kind: 'FLIGHT', code: (m[1] || '') + m[2], label: f };
  return { kind: 'OTHER', code: upper.split(' ')[0], label: f };
}

function parsePeriods(html: string): string[] {
  const doc = parseHtml(html);
  const opts = doc.querySelectorAll('select[name="Period"] option');
  const periods: string[] = [];
  opts.forEach((opt) => {
    const v = norm(opt.textContent);
    if (v) periods.push(v);
  });
  return periods;
}

function parseRoster(html: string): { rangeLabel: string; rows: RosterRow[] } {
  const doc = parseHtml(html);
  let rangeLabel = '';
  let headers: string[] | null = null;
  const rows: RosterRow[] = [];

  doc.querySelectorAll('table tr').forEach((tr) => {
    const tds = Array.from(tr.querySelectorAll('td')).map((td) => norm(td.textContent));
    if (!tds.length) {
      const txt = norm(tr.textContent);
      if (txt.startsWith('Schedule of')) rangeLabel = txt;
      return;
    }
    if (!headers && /^Status$/i.test(tds[0]) && tds.includes('FltNo')) {
      headers = tds;
      return;
    }
    if (!headers) return;
    if (tds.length < headers.length) return;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = tds[i] ?? ''; });
    // FltNo first; if it doesn't classify (often blank for OFC/RST rows),
    // try Status, then Action. Mirrors server/index.js parseRoster.
    let cls = classifyFlt(row.FltNo);
    if (cls.kind === 'OTHER' || !cls.kind) {
      const alt = classifyFlt(row.Status);
      if (alt.kind && alt.kind !== 'OTHER') cls = alt;
    }
    if (cls.kind === 'OTHER' || !cls.kind) {
      const alt = classifyFlt(row.Action);
      if (alt.kind && alt.kind !== 'OTHER') cls = alt;
    }
    rows.push({
      status:   row.Status,
      action:   row.Action,
      crew:     row.Crew,
      pos:      row.Pos,
      dep:      row.Dep,
      arr:      row.Arr,
      depTime:  row.DepTime,
      arrTime:  row.ArrTime,
      fltNo:    row.FltNo,
      acType:   row.ACType,
      acReg:    row.ACReg,
      tip:      row.Tip,
      fltMate:  row.FltMate,
      kind:     cls.kind as RosterRow['kind'],
      kindCode: cls.code,
      kindLabel: cls.label,
    });
  });
  return { rangeLabel, rows };
}

// ────────────────────────────────────────────────────────────────────────────
// FlightCrew.aspx parsing — ASP.NET WebForms postback dance.
// ────────────────────────────────────────────────────────────────────────────
interface AspxState {
  vs: string; vsg: string; ev: string; vse: string; html: string;
}

function extractAspxState(html: string): AspxState {
  const doc = parseHtml(html);
  const v = (n: string): string =>
    (doc.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)?.value ?? '';
  return {
    vs:  v('__VIEWSTATE'),
    vsg: v('__VIEWSTATEGENERATOR'),
    ev:  v('__EVENTVALIDATION'),
    vse: v('__VIEWSTATEENCRYPTED'),
    html,
  };
}

async function aspxLogin(code: string, pass: string): Promise<string> {
  const r1 = await getHtml(`${BASE}/Crew/Login.aspx?ReturnUrl=%2fCrew%2fFlightCrew.aspx`);
  const st = extractAspxState(r1);
  if (!st.vs) {
    throw new Error(`Login.aspx VIEWSTATE not found. Body: ${snippet(r1)}`);
  }
  const r2 = await postForm(
    `${BASE}/Crew/Login.aspx?ReturnUrl=%2fCrew%2fFlightCrew.aspx`,
    {
      __EVENTTARGET: '', __EVENTARGUMENT: '',
      __VIEWSTATE: st.vs, __VIEWSTATEGENERATOR: st.vsg, __EVENTVALIDATION: st.ev,
      'Login1$UserName': code, 'Login1$Password': pass, 'Login1$LoginButton': 'Log In',
    },
    { Referer: `${BASE}/Crew/Login.aspx?ReturnUrl=%2fCrew%2fFlightCrew.aspx`, Origin: BASE },
  );
  if (/Login1\$LoginButton/.test(r2) && /Login In|Log In/i.test(r2) && !/Crew In Flight/i.test(r2)) {
    throw new UpstreamAuthError('Authentication failed (FlightCrew.aspx).');
  }
  // After a successful login the redirect should land on FlightCrew.aspx,
  // which contains the GridViewFlt grid. If it doesn't, the redirect / cookie
  // chain broke — surface this distinctly so we can debug.
  if (!/GridViewFlt|CalendarDate/i.test(r2)) {
    throw new Error(`Login redirect did NOT land on FlightCrew.aspx. Body: ${snippet(r2)}`);
  }
  return r2;
}

async function aspxPostback(state: AspxState, eventTarget: string, eventArgument: string): Promise<AspxState> {
  const body: Record<string, string> = {
    __EVENTTARGET: eventTarget,
    __EVENTARGUMENT: eventArgument,
    __VIEWSTATE: state.vs,
    __VIEWSTATEGENERATOR: state.vsg,
    __EVENTVALIDATION: state.ev,
    // Server-side code includes __VIEWSTATEENCRYPTED unconditionally (even
    // empty); some ASP.NET versions are picky if the field is absent from
    // the form. Match that behaviour exactly.
    __VIEWSTATEENCRYPTED: state.vse ?? '',
  };
  // ASP.NET WebForms validates postback origin via Referer. The Node server
  // sends this same header — without it the upstream returns a page WITHOUT
  // GridViewFlt and our parse fails with the "GridViewFlt پیدا نشد" error.
  const html = await postForm(`${BASE}/Crew/FlightCrew.aspx`, body, {
    Referer: `${BASE}/Crew/FlightCrew.aspx`,
    Origin: BASE,
  });
  return extractAspxState(html);
}

const dateToOffset = (yyyyMmDd: string): number => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000);
};

/** Offset of the 1st of the same calendar month as the given date. Used to
 *  send a "V<startOffset>" navigation postback before clicking a day cell,
 *  so the calendar control renders the target month and EventValidation
 *  accepts the day argument. */
const monthStartOffset = (yyyyMmDd: string): number => {
  const [y, m] = yyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, 1) - EPOCH) / 86_400_000);
};

/** Walk the calendar from a known current month to the target month, one
 *  V postback per step (the only navigation args ASP.NET EnableEventValidation
 *  registers per render), then click the target day. Returns the new state
 *  AND the YYYY-MM of the now-visible month so the caller can update its
 *  session cache. */
async function aspxSelectCalendarDate(
  state: AspxState,
  yyyyMmDd: string,
  fromMonth: string,
): Promise<{ state: AspxState; nowVisibleMonth: string }> {
  const dayOffset = dateToOffset(yyyyMmDd);
  const [targetYear, targetMonth] = yyyyMmDd.split('-').map(Number);
  const [curYearStr, curMonthStr] = fromMonth.split('-');
  let curYear = Number(curYearStr);
  let curMonth = Number(curMonthStr);

  let s = state;
  const MAX_STEPS = 24;
  let steps = 0;
  while ((curYear !== targetYear || curMonth !== targetMonth) && steps < MAX_STEPS) {
    const cursorAbs = curYear * 12 + curMonth;
    const targetAbs = targetYear * 12 + targetMonth;
    const goForward = cursorAbs < targetAbs;
    if (goForward) {
      curMonth += 1;
      if (curMonth > 12) { curMonth = 1; curYear += 1; }
    } else {
      curMonth -= 1;
      if (curMonth < 1) { curMonth = 12; curYear -= 1; }
    }
    const stepIso = `${curYear}-${String(curMonth).padStart(2, '0')}-01`;
    const stepOff = monthStartOffset(stepIso);
    s = await aspxPostback(s, 'CalendarDate', `V${stepOff}`);
    steps += 1;
  }

  s = await aspxPostback(s, 'CalendarDate', String(dayOffset));
  return { state: s, nowVisibleMonth: `${curYear}-${String(curMonth).padStart(2, '0')}` };
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory session cache. We log into Iran Air's FlightCrew.aspx once per
// session and reuse the .ASPXAUTH cookie + the post-login VIEWSTATE for ~10
// minutes. Without this, every date change rebuilt the entire session — a
// 6-month-old date pick used to take 8-15 seconds; cached it's ~1.5 seconds.
// ────────────────────────────────────────────────────────────────────────────
interface FlightCrewSession {
  state: AspxState;
  visibleMonth: string;   // YYYY-MM the calendar is currently rendering
  expiresAt: number;
  credsHash: string;      // bound to credentials so a re-login swaps it
}
let flightCrewSession: FlightCrewSession | null = null;
const SESSION_TTL = 10 * 60 * 1000;

const hashCreds = (c: Credentials): string => `${c.code}::${c.pass.length}`;
const currentLocalMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Get a valid FlightCrew session, performing a fresh login if needed. */
async function obtainFlightCrewSession(creds: Credentials): Promise<FlightCrewSession> {
  const wantHash = hashCreds(creds);
  if (
    flightCrewSession &&
    flightCrewSession.expiresAt > Date.now() &&
    flightCrewSession.credsHash === wantHash
  ) {
    return flightCrewSession;
  }
  await resetSession();
  const home = await aspxLogin(creds.code, creds.pass);
  flightCrewSession = {
    state: extractAspxState(home),
    visibleMonth: currentLocalMonth(),
    expiresAt: Date.now() + SESSION_TTL,
    credsHash: wantHash,
  };
  return flightCrewSession;
}

function dropFlightCrewSession(): void { flightCrewSession = null; }

/** Public reset hook — called by the auth layer when credentials change so a
 *  new account's first request doesn't accidentally hit the previous user's
 *  cached session state. */
export function resetUpstreamSession(): void { dropFlightCrewSession(); }

function parseGridById(html: string, id: string): { headers: string[]; rows: Array<Record<string, string>>; rawTrs: HTMLTableRowElement[] } {
  const doc = parseHtml(html);
  const grid = doc.querySelector(`#${id}`);
  if (!grid) return { headers: [], rows: [], rawTrs: [] };
  const trs = Array.from(grid.querySelectorAll('tr')) as HTMLTableRowElement[];
  if (trs.length < 2) return { headers: [], rows: [], rawTrs: trs };
  const headers = Array.from(trs[0].querySelectorAll('th, td')).map((c) => norm(c.textContent));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < trs.length; i++) {
    const tds = Array.from(trs[i].querySelectorAll('td'));
    if (!tds.length) continue;
    const obj: Record<string, string> = {};
    tds.forEach((c, ci) => {
      const key = headers[ci] || `c${ci}`;
      obj[key] = norm(c.textContent);
    });
    rows.push(obj);
  }
  return { headers, rows, rawTrs: trs };
}

function parseFlightGrid(html: string): { headers: string[]; flights: FlightRow[] } {
  const parsed = parseGridById(html, 'GridViewFlt');
  const flights: FlightRow[] = parsed.rows.map((obj, idx) => {
    const flight: FlightRow = { _rowIndex: idx };
    Object.assign(flight, obj);
    // Pull postback target/arg out of the row's anchor or submit input.
    const tr = parsed.rawTrs[idx + 1]; // +1 because rawTrs includes the header
    const sel = tr?.querySelector('a, input[type="submit"]');
    if (sel) {
      const onclick = sel.getAttribute('href') ?? sel.getAttribute('onclick') ?? '';
      const m = onclick.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]\)/);
      if (m) { flight._eventTarget = m[1]; flight._eventArgument = m[2]; }
    }
    return flight;
  });
  return { headers: parsed.headers, flights };
}

function parseCrewGrid(html: string): { headers: string[]; crew: CrewRow[] } {
  const parsed = parseGridById(html, 'GridViewCrew');
  return { headers: parsed.headers, crew: parsed.rows };
}

function normaliseFlt(s: string | undefined): { prefix: string; num: string } | null {
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\s+/g, '');
  const m = upper.match(/^([A-Z]{0,3})0*(\d+)/);
  if (!m) return null;
  return { prefix: m[1] || '', num: m[2] };
}

function fltKeysEqual(a: { prefix: string; num: string } | null, b: { prefix: string; num: string } | null): boolean {
  if (!a || !b || !a.num || !b.num) return false;
  if (a.num !== b.num) return false;
  if (!a.prefix || !b.prefix) return true;
  return a.prefix === b.prefix;
}

function matchFlightRow(row: FlightRow, wanted: string): boolean {
  const w = normaliseFlt(wanted);
  if (!w) return false;
  const preferred = ['FltNo', 'Flt', 'Flight', 'FlightNo', 'FltNum', 'Number'];
  for (const k of preferred) {
    const v = row[k];
    if (typeof v === 'string' && fltKeysEqual(w, normaliseFlt(v))) return true;
  }
  for (const v of Object.values(row)) {
    if (typeof v === 'string' && fltKeysEqual(w, normaliseFlt(v))) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Public endpoint shims — same shapes as the server's /api/* responses so the
// rest of the app doesn't need to know whether we're native or proxied.
// ────────────────────────────────────────────────────────────────────────────

export async function nativeLogin(creds: Credentials): Promise<{ ok: true; periods: string[] }> {
  await resetSession();
  const html = await postForm(`${BASE}/CrewDelivery.dll`, {
    Code: creds.code, Pass: creds.pass, TableType: 'DETAIL',
  });
  if (!/select.+name="Period"/i.test(html)) {
    throw new UpstreamAuthError('Login failed (server did not return roster periods).');
  }
  return { ok: true, periods: parsePeriods(html) };
}

export async function nativeRoster(creds: Credentials, period: string): Promise<RosterResponse> {
  await resetSession();
  // Step 1 is required to seed the cookie/session; step 2 returns the schedule.
  await postForm(`${BASE}/CrewDelivery.dll`, {
    Code: creds.code, Pass: creds.pass, TableType: 'DETAIL',
  });
  const html = await postForm(`${BASE}/CrewDelivery.dll`, {
    Code: creds.code, Pass: creds.pass, TableType: 'DETAIL', Period: period,
  });
  const parsed = parseRoster(html);
  return { ok: true, rangeLabel: parsed.rangeLabel, rows: parsed.rows };
}

export async function nativeFlightsOnDate(creds: Credentials, date: string): Promise<FlightsResponse> {
  // Use cached session when possible — falls back to a full re-login if the
  // first attempt returns no GridViewFlt (session expired, cookies stale, …).
  const runOnce = async () => {
    const session = await obtainFlightCrewSession(creds);
    const { state, nowVisibleMonth } = await aspxSelectCalendarDate(
      session.state, date, session.visibleMonth,
    );
    // Persist the navigated state so the NEXT date change can walk from this
    // visible month instead of paying the full login again.
    session.state = state;
    session.visibleMonth = nowVisibleMonth;
    return state;
  };
  let state = await runOnce();
  if (!/GridViewFlt/i.test(state.html)) {
    if (/Login1\$LoginButton/i.test(state.html)) {
      // Session legitimately died — clear cache and retry exactly once.
      dropFlightCrewSession();
      state = await runOnce();
    }
  }
  if (!/GridViewFlt/i.test(state.html)) {
    if (/Login1\$LoginButton/i.test(state.html)) {
      throw new UpstreamAuthError('نشست شما منقضی شده. لطفاً خارج و دوباره وارد شوید.');
    }
    throw new Error(`GridViewFlt missing. Server returned: ${snippet(state.html)}`);
  }
  const grid = parseFlightGrid(state.html);
  return { ok: true, date, headers: grid.headers, flights: grid.flights };
}

export async function nativeCrewOnFlight(
  creds: Credentials, date: string, eventTarget: string, eventArgument: string,
): Promise<CrewResponse> {
  const session = await obtainFlightCrewSession(creds);
  const { state: stateAtDate, nowVisibleMonth } = await aspxSelectCalendarDate(
    session.state, date, session.visibleMonth,
  );
  session.state = stateAtDate;
  session.visibleMonth = nowVisibleMonth;
  // Postback for the selected flight row.
  const state = await aspxPostback(stateAtDate, eventTarget, eventArgument || '');
  session.state = state;
  const cg = parseCrewGrid(state.html);
  const fg = parseFlightGrid(state.html);
  return { ok: true, date, headers: cg.headers, crew: cg.crew, flights: fg.flights };
}

export async function nativeCrewByFlight(
  creds: Credentials, date: string, fltNo: string,
): Promise<CrewResponse> {
  const session = await obtainFlightCrewSession(creds);
  const result = await aspxSelectCalendarDate(session.state, date, session.visibleMonth);
  session.state = result.state;
  session.visibleMonth = result.nowVisibleMonth;
  let state = result.state;
  if (!/GridViewFlt/i.test(state.html)) {
    if (/Login1\$LoginButton/i.test(state.html)) {
      // Stale session — drop cache, retry once.
      dropFlightCrewSession();
      const fresh = await obtainFlightCrewSession(creds);
      const r2 = await aspxSelectCalendarDate(fresh.state, date, fresh.visibleMonth);
      fresh.state = r2.state;
      fresh.visibleMonth = r2.nowVisibleMonth;
      state = r2.state;
    }
  }
  if (!/GridViewFlt/i.test(state.html)) {
    if (/Login1\$LoginButton/i.test(state.html)) {
      throw new UpstreamAuthError('نشست شما منقضی شده. خارج و دوباره وارد شوید.');
    }
    throw new Error(`GridViewFlt missing. Server returned: ${snippet(state.html)}`);
  }
  const fg = parseFlightGrid(state.html);
  if (fg.flights.length === 0) {
    throw new UpstreamNoDataError('برای این تاریخ، اطلاعات خدمهٔ پرواز در سامانه ثبت نیست.');
  }
  const match = fg.flights.find((f) => matchFlightRow(f, fltNo));
  if (!match || !match._eventTarget) {
    throw new UpstreamNotFoundError(
      `پرواز «${fltNo}» در فهرست ${fg.flights.length} پرواز این روز پیدا نشد.`,
      fg.flights.length,
    );
  }
  state = await aspxPostback(state, match._eventTarget, match._eventArgument || '');
  // Keep cached session current after the row-select postback.
  if (flightCrewSession) flightCrewSession.state = state;
  const cg = parseCrewGrid(state.html);
  return { ok: true, date, headers: cg.headers, crew: cg.crew, flights: fg.flights };
}

export { UpstreamAuthError, UpstreamNoDataError, UpstreamNotFoundError };
