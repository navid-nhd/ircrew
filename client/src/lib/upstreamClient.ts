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
// Masquerade as desktop Chrome so the upstream serves the desktop layout
// (some ASP.NET WebForms apps render a stripped mobile view to Android UAs
// which doesn't include GridViewFlt — the grid we need to parse).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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

async function postForm(url: string, body: Record<string, string>): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await nativePost(url, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      }, formBody(body));
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(700 * attempt + Math.random() * 300);
    }
  }
  throw lastErr ?? new Error('upstream POST failed');
}

async function getHtml(url: string): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await nativeGet(url, { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' });
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(700 * attempt + Math.random() * 300);
    }
  }
  throw lastErr ?? new Error('upstream GET failed');
}

const parseHtml = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

// ────────────────────────────────────────────────────────────────────────────
// Roster parsing (CrewDelivery.dll) — mirrors server-side classifyFlt + parseRoster.
// ────────────────────────────────────────────────────────────────────────────
function classifyFlt(fltNo: string): { kind: DutyKind; code: string; label: string } {
  const f = norm(fltNo);
  if (!f) return { kind: 'OTHER', code: '', label: '' };
  const upper = f.toUpperCase();
  if (/^(OFF|DO\b|REST)/.test(upper)) return { kind: 'OFF',    code: 'OFF', label: f || 'Off day' };
  if (/^(RSV|STBY|RES\b)/.test(upper)) return { kind: 'RSV',    code: 'RSV', label: f || 'Reserve' };
  if (/^(REC|RC\b|TRN|TRG|TRAIN|GS\b|SIM|CRM|OPC|LPC|EME|GROUND)/.test(upper))
                                       return { kind: 'TRAIN',  code: upper.split(/\s+/)[0], label: f };
  if (/^(MED|MDC|MDL|MEDICAL)/.test(upper))     return { kind: 'MED',    code: 'MED', label: f || 'Medical' };
  if (/^(PSP|PASS(?:PORT)?)/.test(upper))       return { kind: 'PASS',   code: 'PSP', label: f || 'Passport' };
  if (/^(MTG|MEET(?:ING)?)/.test(upper))        return { kind: 'MEET',   code: 'MTG', label: f || 'Meeting' };
  if (/^(REJ|SCK|SICK|REF|REFUSE)/.test(upper)) return { kind: 'REJECT', code: upper.split(/\s+/)[0], label: f || 'Rejected' };
  if (/^(GND|GROUND|GR\b)/.test(upper))         return { kind: 'GROUND', code: 'GND', label: f || 'Grounded' };
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
    const cls = classifyFlt(row.FltNo);
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
  if (!st.vs) throw new Error('Could not parse Login.aspx');
  const r2 = await postForm(`${BASE}/Crew/Login.aspx?ReturnUrl=%2fCrew%2fFlightCrew.aspx`, {
    __EVENTTARGET: '', __EVENTARGUMENT: '',
    __VIEWSTATE: st.vs, __VIEWSTATEGENERATOR: st.vsg, __EVENTVALIDATION: st.ev,
    'Login1$UserName': code, 'Login1$Password': pass, 'Login1$LoginButton': 'Log In',
  });
  if (/Login1\$LoginButton/.test(r2) && /Login In|Log In/i.test(r2) && !/Crew In Flight/i.test(r2)) {
    throw new UpstreamAuthError('Authentication failed (FlightCrew.aspx).');
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
  };
  if (state.vse) body.__VIEWSTATEENCRYPTED = state.vse;
  const html = await postForm(`${BASE}/Crew/FlightCrew.aspx`, body);
  return extractAspxState(html);
}

const dateToOffset = (yyyyMmDd: string): number => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000);
};

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
  await resetSession();
  const home = await aspxLogin(creds.code, creds.pass);
  let state = extractAspxState(home);
  const offset = dateToOffset(date);
  state = await aspxPostback(state, 'CalendarDate', String(offset));
  // If the page came back without GridViewFlt at all, our session is broken —
  // surface that as a real error rather than pretending the date has no flights.
  if (!/GridViewFlt/i.test(state.html)) {
    if (/Login1\$LoginButton/i.test(state.html)) {
      throw new UpstreamAuthError('نشست شما منقضی شده. لطفاً خارج و دوباره وارد شوید.');
    }
    throw new Error('پاسخ سرور Iran Air قابل تشخیص نیست (GridViewFlt پیدا نشد).');
  }
  const grid = parseFlightGrid(state.html);
  return { ok: true, date, headers: grid.headers, flights: grid.flights };
}

export async function nativeCrewOnFlight(
  creds: Credentials, date: string, eventTarget: string, eventArgument: string,
): Promise<CrewResponse> {
  await resetSession();
  const home = await aspxLogin(creds.code, creds.pass);
  let state = extractAspxState(home);
  const offset = dateToOffset(date);
  state = await aspxPostback(state, 'CalendarDate', String(offset));
  state = await aspxPostback(state, eventTarget, eventArgument || '');
  const cg = parseCrewGrid(state.html);
  const fg = parseFlightGrid(state.html);
  return { ok: true, date, headers: cg.headers, crew: cg.crew, flights: fg.flights };
}

export async function nativeCrewByFlight(
  creds: Credentials, date: string, fltNo: string,
): Promise<CrewResponse> {
  await resetSession();
  const home = await aspxLogin(creds.code, creds.pass);
  let state = extractAspxState(home);
  const offset = dateToOffset(date);
  state = await aspxPostback(state, 'CalendarDate', String(offset));
  // Distinguish "session/parse broken" from "date legitimately has no flights".
  if (!/GridViewFlt/i.test(state.html)) {
    if (/Login1\$LoginButton/i.test(state.html)) {
      throw new UpstreamAuthError('نشست شما منقضی شده. خارج و دوباره وارد شوید.');
    }
    throw new Error('پاسخ سرور Iran Air قابل تشخیص نیست (GridViewFlt پیدا نشد).');
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
  const cg = parseCrewGrid(state.html);
  return { ok: true, date, headers: cg.headers, crew: cg.crew, flights: fg.flights };
}

export { UpstreamAuthError, UpstreamNoDataError, UpstreamNotFoundError };
