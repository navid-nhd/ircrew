import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import { HttpCookieAgent, HttpsCookieAgent } from 'http-cookie-agent/http';
import { mockLogin, mockRoster, mockFlights, mockCrew, mockCrewByFlight } from './mock.js';

const isDemo = (code) => (code || '').toUpperCase() === 'DEMO';

const PORT = process.env.PORT || 3001;
const BASE = 'https://crew.iranair.com';
const UA = 'Mozilla/5.0 (compatible; IRCrew/1.0)';
const TIMEOUT = 30000;
const EPOCH = Date.UTC(2000, 0, 1);

const app = express();
app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Network-level errors that warrant a retry. The upstream (Iran Air's IIS)
// and its path to us regularly drops mid-stream connections; these are the
// codes Node surfaces when that happens.
const RETRIABLE_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN',
  'EPIPE', 'ENETUNREACH', 'ECONNABORTED', 'ERR_STREAM_PREMATURE_CLOSE',
]);

const RETRIABLE_MSG_RE = /socket hang up|read ECONNRESET|aborted|premature close/i;

function isRetriable(err) {
  const code = err.code || err.cause?.code || '';
  if (RETRIABLE_CODES.has(code)) return true;
  if (typeof err.message === 'string' && RETRIABLE_MSG_RE.test(err.message)) return true;
  if (typeof err.cause?.message === 'string' && RETRIABLE_MSG_RE.test(err.cause.message)) return true;
  return false;
}

// Exponential backoff with jitter — 0.5s, 1s, 2s, 4s, 8s (+ up to 500ms random).
function backoff(attempt) {
  const base = Math.min(8000, 500 * Math.pow(2, attempt - 1));
  return base + Math.random() * 500;
}

const makeClient = () => {
  const jar = new CookieJar();
  // Keep-alive agents: re-use a single TCP+TLS connection across all the
  // round-trips a single endpoint needs (login → viewstate → postback → postback).
  // This is the single biggest reliability win on a flaky link — every fresh
  // TCP+TLS handshake is a chance for the network to drop a packet.
  const agentOpts = {
    cookies: { jar },
    keepAlive: true,
    keepAliveMsecs: 30_000,
    maxSockets: 4,
    maxFreeSockets: 2,
    scheduling: 'lifo',
  };
  const httpAgent  = new HttpCookieAgent(agentOpts);
  const httpsAgent = new HttpsCookieAgent(agentOpts);

  const inst = axios.create({
    httpAgent, httpsAgent,
    timeout: TIMEOUT,
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': '*/*',
      Connection: 'keep-alive',
    },
    decompress: true,
    validateStatus: () => true,
    maxRedirects: 5,
  });

  inst.interceptors.response.use(undefined, async (err) => {
    const cfg = err.config || {};
    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
    if (isRetriable(err) && cfg.__retryCount <= 5) {
      const delay = backoff(cfg.__retryCount);
      console.warn(`[retry ${cfg.__retryCount}] ${err.code || err.message} ← ${cfg.method?.toUpperCase()} ${cfg.url} (waiting ${Math.round(delay)}ms)`);
      // If the socket was killed mid-read, the keep-alive pool may have a poisoned
      // socket. Tear it down so the next attempt forces a brand-new connection.
      try { httpsAgent.destroy(); httpAgent.destroy(); } catch {}
      await sleep(delay);
      return inst.request(cfg);
    }
    throw err;
  });

  // Hold a reference to the agents/jar so callers can tear them down or
  // snapshot cookies for cross-request caching.
  inst.__agents = { httpAgent, httpsAgent };
  inst.__jar = jar;
  return inst;
};

// ────────────────────────────────────────────────────────────────────────────
// ASPX session cache. The upstream's /Crew/Login.aspx is the most fragile
// endpoint — every successful trip means we beat the network lottery. So we
// cache the .ASPXAUTH cookie per-credential and reuse it across requests,
// turning a 4-hop flow into a 3-hop flow (or even 2-hop for repeat calls).
// ────────────────────────────────────────────────────────────────────────────
const SESSION_TTL_MS = 15 * 60 * 1000;
/** @type {Map<string, { cookies: string[], expiry: number }>} */
const aspxSessionCache = new Map();
const sessionKey = (code, pass) =>
  crypto.createHash('sha256').update(`${code}:${pass}`).digest('hex');

async function tryReuseAspxSession(client, code, pass) {
  const key = sessionKey(code, pass);
  const cached = aspxSessionCache.get(key);
  if (!cached || cached.expiry <= Date.now()) return null;
  // Inject cached cookies into this client's jar.
  for (const c of cached.cookies) {
    try { await client.__jar.setCookie(c, BASE); } catch {}
  }
  // Verify by fetching FlightCrew.aspx — if we land on the page (not the
  // login form), the cached session is still good.
  const r = await client.get(`${BASE}/Crew/FlightCrew.aspx`);
  if (typeof r.data === 'string' && /formDelivery|GridViewFlt|CalendarDate/.test(r.data)) {
    return r.data;
  }
  aspxSessionCache.delete(key);
  return null;
}

async function saveAspxSession(client, code, pass) {
  try {
    const cookies = await client.__jar.getCookies(BASE);
    aspxSessionCache.set(sessionKey(code, pass), {
      cookies: cookies.map((c) => c.toString()),
      expiry: Date.now() + SESSION_TTL_MS,
    });
  } catch {}
}

function invalidateAspxSession(code, pass) {
  aspxSessionCache.delete(sessionKey(code, pass));
}

// Retry an entire endpoint flow (with a fresh client/session each attempt).
// The session cache is NOT invalidated between outer retries — if the cached
// cookie is bad, tryReuseAspxSession() already detects it (login-form HTML)
// and purges itself. Otherwise we want to keep using the warm session.
async function withFreshSession(fn, { attempts = 3, label = '' } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const client = makeClient();
    try {
      const result = await fn(client);
      return result;
    } catch (e) {
      lastErr = e;
      console.warn(`[outer retry ${i}/${attempts}] ${label}: ${e.code || e.message}`);
      if (i < attempts) await sleep(800 + Math.random() * 700);
    } finally {
      try { client.__agents?.httpAgent?.destroy?.(); client.__agents?.httpsAgent?.destroy?.(); } catch {}
    }
  }
  throw lastErr;
}

const formBody = (obj) => new URLSearchParams(obj).toString();

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

// ---------- Roster (CrewDelivery.dll) ----------

async function ddlPostStep1(client, code, pass) {
  const res = await client.post(`${BASE}/CrewDelivery.dll`, formBody({
    Code: code, Pass: pass, TableType: 'DETAIL',
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return res.data;
}

function parsePeriods(html) {
  const $ = cheerio.load(html);
  const periods = [];
  $('select[name="Period"] option').each((_, el) => {
    const v = norm($(el).text());
    if (v) periods.push(v);
  });
  return periods;
}

async function ddlPostStep2(client, code, pass, period) {
  const res = await client.post(`${BASE}/CrewDelivery.dll`, formBody({
    Code: code, Pass: pass, TableType: 'DETAIL', Period: period,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return res.data;
}

function classifyFlt(fltNo) {
  const f = norm(fltNo);
  if (!f) return { status: 'OTHER', code: '', label: '' };
  const upper = f.toUpperCase();
  if (/^(OFF|DO\b|REST)/.test(upper)) return { status: 'OFF',   code: 'OFF', label: f || 'Off day' };
  if (/^(RSV|STBY|RES\b)/.test(upper)) return { status: 'RSV',   code: 'RSV', label: f || 'Reserve' };
  if (/^(REC|RC\b|TRN|TRG|TRAIN|GS\b|SIM|CRM|OPC|LPC|EME|GROUND)/.test(upper))
                                       return { status: 'TRAIN', code: upper.split(/\s+/)[0], label: f };
  if (/^(MED|MDC|MDL|MEDICAL)/.test(upper))   return { status: 'MED',    code: 'MED', label: f || 'Medical' };
  if (/^(PSP|PASS(?:PORT)?)/.test(upper))     return { status: 'PASS',   code: 'PSP', label: f || 'Passport' };
  if (/^(MTG|MEET(?:ING)?)/.test(upper))      return { status: 'MEET',   code: 'MTG', label: f || 'Meeting' };
  if (/^(REJ|SCK|SICK|REF|REFUSE)/.test(upper)) return { status: 'REJECT', code: upper.split(/\s+/)[0], label: f || 'Rejected' };
  if (/^(GND|GROUND|GR\b)/.test(upper))         return { status: 'GROUND', code: 'GND', label: f || 'Grounded' };
  // Real flight: e.g. "IR715" or "IRA715" or "715"
  const m = upper.match(/^([A-Z]{1,3})?\s*(\d{2,5})\b/);
  if (m) return { status: 'FLIGHT', code: (m[1] || '') + m[2], label: f };
  return { status: 'OTHER', code: upper.split(' ')[0], label: f };
}

function parseRoster(html) {
  const $ = cheerio.load(html);
  let rangeLabel = '';
  const rows = [];
  let headers = null;

  $('table tr').each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find('td').toArray().map((td) => norm($(td).text()));
    if (!tds.length) {
      const txt = norm($tr.text());
      if (txt.startsWith('Schedule of')) rangeLabel = txt;
      return;
    }
    if (!headers && /^Status$/i.test(tds[0]) && tds.includes('FltNo')) {
      headers = tds;
      return;
    }
    if (!headers) return;
    if (tds.length < headers.length) return;

    const row = {};
    headers.forEach((h, i) => { row[h] = tds[i] ?? ''; });
    const cls = classifyFlt(row.FltNo);
    rows.push({
      status: row.Status,
      action: row.Action,
      crew: row.Crew,
      pos: row.Pos,
      dep: row.Dep,
      arr: row.Arr,
      depTime: row.DepTime,
      arrTime: row.ArrTime,
      fltNo: row.FltNo,
      acType: row.ACType,
      acReg: row.ACReg,
      tip: row.Tip,
      fltMate: row.FltMate,
      kind: cls.status,
      kindCode: cls.code,
      kindLabel: cls.label,
    });
  });
  return { rangeLabel, rows };
}

app.post('/api/login', async (req, res) => {
  try {
    const { code, pass } = req.body;
    if (!code || !pass) return res.status(400).json({ ok: false, error: 'code and pass required' });
    if (isDemo(code)) return res.json(mockLogin());
    const periods = await withFreshSession(async (client) => {
      const html = await ddlPostStep1(client, code, pass);
      if (!/select.+name="Period"/i.test(html)) {
        const e = new Error('Login failed (server did not return roster periods).');
        e.__auth = true;
        throw e;
      }
      return parsePeriods(html);
    }, { label: '/api/login' });
    res.json({ ok: true, periods });

    // Fire-and-forget: pre-warm the ASPX session cache in the background so
    // the user's first visit to the Flight Crew tab is fast.
    setImmediate(async () => {
      if (aspxSessionCache.has(sessionKey(code, pass))) return; // already warm
      const client = makeClient();
      try {
        await aspxLogin(client, code, pass);
        console.log('[prewarm] ASPX session cached for', code);
      } catch (e) {
        console.warn('[prewarm] failed:', e.code || e.message);
      } finally {
        try { client.__agents?.httpAgent?.destroy?.(); client.__agents?.httpsAgent?.destroy?.(); } catch {}
      }
    });
  } catch (e) {
    if (e.__auth) return res.status(401).json({ ok: false, error: e.message });
    res.status(502).json({ ok: false, error: friendlyError(e) });
  }
});

app.post('/api/roster', async (req, res) => {
  try {
    const { code, pass, period } = req.body;
    if (!code || !pass || !period) return res.status(400).json({ ok: false, error: 'code, pass, period required' });
    if (isDemo(code)) return res.json(mockRoster(period));
    const parsed = await withFreshSession(async (client) => {
      await ddlPostStep1(client, code, pass);
      const html = await ddlPostStep2(client, code, pass, period);
      return parseRoster(html);
    }, { label: '/api/roster' });
    if (!parsed.rows.length) return res.json({ ok: true, ...parsed, warning: 'No rows found.' });
    res.json({ ok: true, ...parsed });
  } catch (e) {
    res.status(502).json({ ok: false, error: friendlyError(e) });
  }
});

// ---------- Flight Crew (FlightCrew.aspx) ----------

async function aspxLogin(client, code, pass) {
  // Try cached session first — saves a hostile /Crew/Login.aspx round-trip.
  const reused = await tryReuseAspxSession(client, code, pass);
  if (reused) return reused;

  const r1 = await client.get(`${BASE}/Crew/Login.aspx?ReturnUrl=%2fCrew%2fFlightCrew.aspx`);
  const $ = cheerio.load(r1.data);
  const vs = $('input[name="__VIEWSTATE"]').val();
  const vsg = $('input[name="__VIEWSTATEGENERATOR"]').val();
  const ev = $('input[name="__EVENTVALIDATION"]').val();
  if (!vs) throw new Error('Could not parse Login.aspx');
  const r2 = await client.post(
    `${BASE}/Crew/Login.aspx?ReturnUrl=%2fCrew%2fFlightCrew.aspx`,
    formBody({
      __EVENTTARGET: '', __EVENTARGUMENT: '',
      __VIEWSTATE: vs, __VIEWSTATEGENERATOR: vsg, __EVENTVALIDATION: ev,
      'Login1$UserName': code, 'Login1$Password': pass, 'Login1$LoginButton': 'Log In',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  if (/Login1\$LoginButton/.test(r2.data) && /Login In|Log In/i.test(r2.data) && !/Crew In Flight/i.test(r2.data)) {
    throw new Error('Authentication failed (FlightCrew.aspx).');
  }
  await saveAspxSession(client, code, pass);
  return r2.data;
}

function extractAspxState(html) {
  const $ = cheerio.load(html);
  return {
    vs: $('input[name="__VIEWSTATE"]').val(),
    vsg: $('input[name="__VIEWSTATEGENERATOR"]').val(),
    ev: $('input[name="__EVENTVALIDATION"]').val(),
    vse: $('input[name="__VIEWSTATEENCRYPTED"]').val() ?? '',
    html,
  };
}

const dateToOffset = (yyyyMmDd) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
};

async function aspxPostback(client, state, eventTarget, eventArgument, extra = {}) {
  const body = {
    __EVENTTARGET: eventTarget,
    __EVENTARGUMENT: eventArgument,
    __VIEWSTATE: state.vs,
    __VIEWSTATEGENERATOR: state.vsg,
    __EVENTVALIDATION: state.ev,
    ...extra,
  };
  if (state.vse !== undefined) body.__VIEWSTATEENCRYPTED = state.vse;
  const r = await client.post(`${BASE}/Crew/FlightCrew.aspx`, formBody(body), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}/Crew/FlightCrew.aspx` },
  });
  return extractAspxState(r.data);
}

function parseFlightGrid(html) {
  const $ = cheerio.load(html);
  const $grid = $('#GridViewFlt');
  if (!$grid.length) return { headers: [], flights: [] };
  const rows = $grid.find('tr').toArray();
  if (rows.length < 2) return { headers: [], flights: [] };

  const headers = $(rows[0]).find('th, td').toArray().map((c) => norm($(c).text()));
  const flights = [];
  for (let i = 1; i < rows.length; i++) {
    const $r = $(rows[i]);
    const cells = $r.find('td').toArray();
    if (!cells.length) continue;
    const obj = { _rowIndex: i - 1 };
    const $select = $r.find('a, input[type="submit"]').first();
    if ($select.length) {
      const onclick = $select.attr('href') || $select.attr('onclick') || '';
      const m = onclick.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]\)/);
      if (m) { obj._eventTarget = m[1]; obj._eventArgument = m[2]; }
    }
    cells.forEach((c, ci) => {
      const key = headers[ci] || `c${ci}`;
      obj[key] = norm($(c).text());
    });
    flights.push(obj);
  }
  return { headers, flights };
}

function parseCrewGrid(html) {
  const $ = cheerio.load(html);
  const $grid = $('#GridViewCrew');
  if (!$grid.length) return { headers: [], crew: [] };
  const rows = $grid.find('tr').toArray();
  if (rows.length < 2) return { headers: [], crew: [] };
  const headers = $(rows[0]).find('th, td').toArray().map((c) => norm($(c).text()));
  const crew = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = $(rows[i]).find('td').toArray();
    if (!cells.length) continue;
    const obj = {};
    cells.forEach((c, ci) => {
      const key = headers[ci] || `c${ci}`;
      obj[key] = norm($(c).text());
    });
    crew.push(obj);
  }
  return { headers, crew };
}

app.post('/api/flight-crew/flights', async (req, res) => {
  try {
    const { code, pass, date } = req.body;
    if (!code || !pass || !date) return res.status(400).json({ ok: false, error: 'code, pass, date required' });
    if (isDemo(code)) return res.json(mockFlights(date));
    const grid = await withFreshSession(async (client) => {
      const homeHtml = await aspxLogin(client, code, pass);
      let state = extractAspxState(homeHtml);
      const offset = dateToOffset(date);
      state = await aspxPostback(client, state, 'CalendarDate', String(offset));
      return parseFlightGrid(state.html);
    }, { label: '/api/flight-crew/flights' });
    res.json({ ok: true, date, ...grid });
  } catch (e) {
    console.error('[flight-crew/flights] giving up:', e.code || e.message);
    res.status(502).json({ ok: false, error: friendlyError(e) });
  }
});

app.post('/api/flight-crew/crew', async (req, res) => {
  try {
    const { code, pass, date, eventTarget, eventArgument } = req.body;
    if (!code || !pass || !date || !eventTarget) {
      return res.status(400).json({ ok: false, error: 'code, pass, date, eventTarget required' });
    }
    if (isDemo(code)) return res.json(mockCrew(date, eventArgument));
    const result = await withFreshSession(async (client) => {
      const homeHtml = await aspxLogin(client, code, pass);
      let state = extractAspxState(homeHtml);
      const offset = dateToOffset(date);
      state = await aspxPostback(client, state, 'CalendarDate', String(offset));
      state = await aspxPostback(client, state, eventTarget, eventArgument || '');
      return { crewGrid: parseCrewGrid(state.html), fltGrid: parseFlightGrid(state.html) };
    }, { label: '/api/flight-crew/crew' });
    res.json({ ok: true, date, flights: result.fltGrid.flights, ...result.crewGrid });
  } catch (e) {
    res.status(502).json({ ok: false, error: friendlyError(e) });
  }
});

// Lookup crew for a known flight number on a date in one call (used by the
// inline "expand crew" affordance on the Roster tab).
app.post('/api/flight-crew/by-flight', async (req, res) => {
  try {
    const { code, pass, date, fltNo, acType } = req.body;
    if (!code || !pass || !date || !fltNo) {
      return res.status(400).json({ ok: false, error: 'code, pass, date, fltNo required' });
    }
    if (isDemo(code)) return res.json(mockCrewByFlight(date, fltNo, acType));
    const result = await withFreshSession(async (client) => {
      const homeHtml = await aspxLogin(client, code, pass);
      let state = extractAspxState(homeHtml);
      const offset = dateToOffset(date);
      state = await aspxPostback(client, state, 'CalendarDate', String(offset));
      const fltGrid = parseFlightGrid(state.html);

      // Upstream archives only ~recent flight crew data. If the grid is empty,
      // the date is outside the upstream's retention window.
      if (fltGrid.flights.length === 0) {
        const e = new Error('Past date: the upstream system does not store flight crew data for this day.');
        e.__noData = true;
        throw e;
      }

      const match = fltGrid.flights.find((f) => matchFlightRow(f, fltNo));
      if (!match || !match._eventTarget) {
        const e = new Error(`Flight "${fltNo}" not found among ${fltGrid.flights.length} flights on this date.`);
        e.__notFound = true;
        e.__seen = fltGrid.flights.length;
        throw e;
      }
      state = await aspxPostback(client, state, match._eventTarget, match._eventArgument || '');
      return { crewGrid: parseCrewGrid(state.html) };
    }, { label: '/api/flight-crew/by-flight' });
    res.json({ ok: true, date, fltNo, ...result.crewGrid });
  } catch (e) {
    if (e.__noData) {
      return res.status(404).json({
        ok: false,
        noData: true,
        error: 'برای این تاریخ، اطلاعات خدمهٔ پرواز در سامانه ثبت نیست. (سامانه فقط داده‌های اخیر را نگه می‌دارد.)',
      });
    }
    if (e.__notFound) {
      return res.status(404).json({
        ok: false,
        notFound: true,
        seenCount: e.__seen ?? 0,
        error: `پرواز «${fltNo}» در فهرست ${e.__seen ?? 0} پرواز این روز پیدا نشد.`,
      });
    }
    res.status(502).json({ ok: false, error: friendlyError(e) });
  }
});

// Normalise a flight-number-ish string to {prefix, num} where digits have no
// leading zeros. Lets us match the roster's "IR459" against the upstream
// grid's "IR 0459" (and vice-versa), or against bare "459".
function normaliseFlt(s) {
  if (!s) return null;
  const upper = String(s).toUpperCase().replace(/\s+/g, '');
  const m = upper.match(/^([A-Z]{0,3})0*(\d+)/);
  if (!m) return null;
  return { prefix: m[1] || '', num: m[2] };
}

function fltKeysEqual(a, b) {
  if (!a || !b || !a.num || !b.num) return false;
  if (a.num !== b.num) return false;
  // Same digits. If either side lacks a prefix, that's fine (bare flight no.).
  if (!a.prefix || !b.prefix) return true;
  return a.prefix === b.prefix;
}

// True if any of the row's stringy fields encodes a flight number equal to `wanted`.
function matchFlightRow(row, wanted) {
  const w = normaliseFlt(wanted);
  if (!w) return false;
  // Prefer explicit FltNo-like fields first; fall back to all stringy values.
  const preferred = ['FltNo', 'Flt', 'Flight', 'FlightNo', 'FltNum', 'Number'];
  for (const k of preferred) {
    if (typeof row[k] === 'string' && fltKeysEqual(w, normaliseFlt(row[k]))) return true;
  }
  for (const v of Object.values(row)) {
    if (typeof v === 'string' && fltKeysEqual(w, normaliseFlt(v))) return true;
  }
  return false;
}

function friendlyError(e) {
  const code = e.code || e.cause?.code || '';
  if (RETRIABLE_CODES.has(code) || RETRIABLE_MSG_RE.test(e.message || '')) {
    return 'سرور Iran Air پاسخ نمی‌دهد. لطفاً دوباره تلاش کنید.';
  }
  return e.message || 'Unknown error';
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`IRCrew proxy listening on http://localhost:${PORT}`));
