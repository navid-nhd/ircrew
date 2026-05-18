// Realistic Iran Air-style fake data for demo mode.
// Activates when client sends code === 'DEMO'.

import { toJalaali } from 'jalaali-js';

const pad = (n) => String(n).padStart(2, '0');
const z = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function jalaliFor(d) {
  const { jy, jm, jd } = toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function buildPeriods() {
  // Last 12 periods, monthly windows roughly 21st->20th
  const today = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 21));
    const start = new Date(end); start.setUTCMonth(start.getUTCMonth() - 1); start.setUTCDate(21);
    out.push(`${z(start)} till ${z(end)}`);
  }
  return out;
}

// Iran Air domestic + international (representative)
const DEST_PAIRS = [
  { dep: 'THR', arr: 'MHD', acType: 'A320', dur: 100, fltNo: 'IR452' },
  { dep: 'MHD', arr: 'THR', acType: 'A320', dur: 100, fltNo: 'IR453' },
  { dep: 'THR', arr: 'ISF', acType: 'A319', dur: 60,  fltNo: 'IR234' },
  { dep: 'ISF', arr: 'THR', acType: 'A319', dur: 60,  fltNo: 'IR235' },
  { dep: 'THR', arr: 'KIH', acType: 'ATR72',dur: 110, fltNo: 'IR3322' },
  { dep: 'KIH', arr: 'THR', acType: 'ATR72',dur: 110, fltNo: 'IR3323' },
  { dep: 'THR', arr: 'IST', acType: 'A330', dur: 195, fltNo: 'IR715' },
  { dep: 'IST', arr: 'THR', acType: 'A330', dur: 220, fltNo: 'IR716' },
  { dep: 'THR', arr: 'DXB', acType: 'A330', dur: 130, fltNo: 'IR653' },
  { dep: 'DXB', arr: 'THR', acType: 'A330', dur: 145, fltNo: 'IR654' },
  { dep: 'THR', arr: 'NJF', acType: 'A320', dur: 110, fltNo: 'IR3404' },
  { dep: 'NJF', arr: 'THR', acType: 'A320', dur: 120, fltNo: 'IR3405' },
];

const REG_BY_TYPE = {
  'A320':  ['EP-IEC','EP-IEE','EP-IEH'],
  'A319':  ['EP-IEA','EP-IEB'],
  'A330':  ['EP-IJA','EP-IJB'],
  'ATR72': ['EP-ITA','EP-ITF','EP-ITQ'],
};

function dayInRange(periodStr) {
  const m = periodStr.match(/^(\d{4}-\d{2}-\d{2}) till (\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  return { start: new Date(m[1] + 'T00:00:00Z'), end: new Date(m[2] + 'T00:00:00Z') };
}

function timeStamp(d, h, m) {
  const x = new Date(d);
  x.setUTCHours(h, m, 0, 0);
  const iso = `${z(x)} ${pad(h)}:${pad(m)}`;
  const dow = DOW[x.getUTCDay()];
  return `${iso} ${dow} ${jalaliFor(x)}`;
}

function buildRoster(period) {
  const range = dayInRange(period);
  if (!range) return { rangeLabel: '', rows: [] };
  const rows = [];
  let date = new Date(range.start);

  // Seed pattern: alternate between flight pairs, off days, reserve,
  // plus sprinkled special events (training, medical, passport, meeting, rejected, ground).
  let seed = 0;
  while (date <= range.end) {
    const dow = date.getUTCDay();
    seed++;
    const choice = seed % 7;
    const dayOfPeriod = seed; // 1..31-ish

    let rowKind;
    // Special-event days take precedence so they're visible in the demo.
    if (dayOfPeriod === 5)                        rowKind = 'TRAIN';
    else if (dayOfPeriod === 12)                  rowKind = 'MED';
    else if (dayOfPeriod === 19)                  rowKind = 'PASS';
    else if (dayOfPeriod === 22)                  rowKind = 'REJECT';
    else if (dayOfPeriod === 25)                  rowKind = 'MEET';
    else if (dayOfPeriod >= 27 && dayOfPeriod <= 29) rowKind = 'GROUND';
    else if (choice === 0 || choice === 6 || (dow === 5 && seed % 3 === 0)) rowKind = 'OFF';
    else if (choice === 2 || choice === 4) rowKind = 'RSV';
    else rowKind = 'FLIGHT';

    if (rowKind === 'FLIGHT') {
      // build a 2-flight pair: morning out + evening back
      const pairIdx = seed % DEST_PAIRS.length;
      const out = DEST_PAIRS[pairIdx % DEST_PAIRS.length];
      const back = DEST_PAIRS[(pairIdx + 1) % DEST_PAIRS.length];
      const acReg = REG_BY_TYPE[out.acType][seed % REG_BY_TYPE[out.acType].length];
      const depH = 7 + (seed % 3);
      const arrTotal = depH * 60 + out.dur;
      const arrH = Math.floor(arrTotal / 60) % 24;
      const arrM = arrTotal % 60;
      rows.push({
        Status: '', Action: 'Flight', Crew: 'DEMO', Pos: 'PUR',
        Dep: out.dep, Arr: out.arr,
        DepTime: timeStamp(date, depH, 30),
        ArrTime: timeStamp(date, arrH, arrM),
        FltNo: out.fltNo, ACType: out.acType, ACReg: acReg,
        Tip: 'D', FltMate: '',
      });
      const back2H = arrH + 1;
      const back2Total = back2H * 60 + back.dur;
      const back2ArrH = Math.floor(back2Total / 60) % 24;
      const back2ArrM = back2Total % 60;
      rows.push({
        Status: '', Action: 'Flight', Crew: 'DEMO', Pos: 'PUR',
        Dep: back.dep, Arr: back.arr,
        DepTime: timeStamp(date, back2H, 0),
        ArrTime: timeStamp(date, back2ArrH, back2ArrM),
        FltNo: back.fltNo, ACType: back.acType, ACReg: acReg,
        Tip: 'D', FltMate: '',
      });
    } else {
      const labelMap = {
        OFF:    'OFF Off day',
        RSV:    'RSV Reserve',
        TRAIN:  'REC TRAIN A330',
        MED:    'MED EXAM',
        PASS:   'PSP RENEW',
        MEET:   'MTG BRIEFING',
        REJECT: 'SCK SICK CALL',
        GROUND: 'GND OFFICE',
      };
      rows.push({
        Status: '', Action: 'NonFlight', Crew: 'DEMO', Pos: 'POS',
        Dep: '', Arr: '',
        DepTime: timeStamp(date, 0, 0),
        ArrTime: timeStamp(date, 23, 59),
        FltNo: labelMap[rowKind] || rowKind, ACType: '', ACReg: '', Tip: '', FltMate: '',
      });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return { rangeLabel: `Schedule of DEMO from ${z(range.start)} till ${z(range.end)}`, rows };
}

function classify(fltNo) {
  const u = (fltNo || '').toUpperCase();
  if (/^(OFF|DO\b|REST)/.test(u))                return { status: 'OFF',    code: 'OFF', label: u };
  if (/^(RSV|STBY|RES\b)/.test(u))               return { status: 'RSV',    code: 'RSV', label: u };
  if (/^(REC|RC\b|TRN|TRG|TRAIN|GS\b|SIM|CRM|OPC|LPC|EME|GROUND ?SCHOOL)/.test(u))
                                                  return { status: 'TRAIN',  code: u.split(/\s+/)[0], label: u };
  if (/^(MED|MDC|MDL|MEDICAL)/.test(u))           return { status: 'MED',    code: 'MED', label: u };
  if (/^(PSP|PASS(?:PORT)?)/.test(u))             return { status: 'PASS',   code: 'PSP', label: u };
  if (/^(MTG|MEET(?:ING)?)/.test(u))              return { status: 'MEET',   code: 'MTG', label: u };
  if (/^(REJ|SCK|SICK|REF|REFUSE)/.test(u))       return { status: 'REJECT', code: u.split(/\s+/)[0], label: u };
  if (/^(GND|GROUND|GR\b)/.test(u))               return { status: 'GROUND', code: 'GND', label: u };
  const m = u.match(/^([A-Z]{1,3})?\s*(\d{2,5})/);
  if (m) return { status: 'FLIGHT', code: (m[1] || '') + m[2], label: u };
  return { status: 'OTHER', code: u.split(' ')[0], label: u };
}

export function mockLogin() {
  return { ok: true, periods: buildPeriods() };
}

export function mockRoster(period) {
  const r = buildRoster(period);
  const rows = r.rows.map((row) => {
    const cls = classify(row.FltNo);
    return {
      status: row.Status, action: row.Action, crew: row.Crew, pos: row.Pos,
      dep: row.Dep, arr: row.Arr,
      depTime: row.DepTime, arrTime: row.ArrTime,
      fltNo: row.FltNo, acType: row.ACType, acReg: row.ACReg,
      tip: row.Tip, fltMate: row.FltMate,
      kind: cls.status, kindCode: cls.code, kindLabel: cls.label,
    };
  });
  return { ok: true, rangeLabel: r.rangeLabel, rows };
}

// ---------- Flight Crew (per date) ----------

function flightsForDate(date) {
  // pick 4-6 flights for this date deterministically
  const seed = date.split('-').reduce((a, b) => a + Number(b), 0);
  const count = 4 + (seed % 3);
  const flights = [];
  for (let i = 0; i < count; i++) {
    const p = DEST_PAIRS[(seed + i * 3) % DEST_PAIRS.length];
    const depH = 6 + i * 2;
    const totalArr = depH * 60 + p.dur;
    const arrH = Math.floor(totalArr / 60) % 24;
    const arrM = totalArr % 60;
    flights.push({
      _rowIndex: i,
      _eventTarget: 'GridViewFlt',
      _eventArgument: `Select$${i}`,
      FltNo: p.fltNo,
      Dep: p.dep, Arr: p.arr,
      DepTime: `${pad(depH)}:00`,
      ArrTime: `${pad(arrH)}:${pad(arrM)}`,
      ACType: p.acType,
    });
  }
  return flights;
}

const CREW_TEMPLATES = {
  A320: [
    { Code: 'PILA', Name: 'Capt. Sasan Pilavar', Position: 'CMD' },
    { Code: 'COPI', Name: 'Mehrdad Kasraei',     Position: 'FO'  },
    { Code: 'ANBD', Name: 'Anahid Bahadori',      Position: 'PUR' },
    { Code: 'FATA', Name: 'Fateme Tabari',        Position: 'FA1' },
    { Code: 'SAHA', Name: 'Sahel Akbari',         Position: 'FA2' },
  ],
  A319: [
    { Code: 'PILB', Name: 'Capt. Bahram Pilavar', Position: 'CMD' },
    { Code: 'COPB', Name: 'Reza Mostafavi',       Position: 'FO'  },
    { Code: 'ANBD', Name: 'Anahid Bahadori',      Position: 'PUR' },
    { Code: 'PARV', Name: 'Parvin Vatani',        Position: 'FA1' },
  ],
  A330: [
    { Code: 'PILX', Name: 'Capt. Hooman Ardalan', Position: 'CMD' },
    { Code: 'PILY', Name: 'Capt. Kaveh Khodaei',  Position: 'FO'  },
    { Code: 'ANBD', Name: 'Anahid Bahadori',      Position: 'PUR' },
    { Code: 'HASA', Name: 'Hasti Samiei',         Position: 'FA1' },
    { Code: 'NEDA', Name: 'Neda Daryabari',       Position: 'FA2' },
    { Code: 'MILA', Name: 'Milad Lashkari',       Position: 'FA3' },
    { Code: 'ROYA', Name: 'Roya Yektai',          Position: 'FA4' },
  ],
  ATR72: [
    { Code: 'PILT', Name: 'Capt. Touraj Niaki',   Position: 'CMD' },
    { Code: 'COPT', Name: 'Pouya Tehrani',        Position: 'FO'  },
    { Code: 'ANBD', Name: 'Anahid Bahadori',      Position: 'PUR' },
  ],
};

export function mockFlights(date) {
  return {
    ok: true,
    date,
    headers: ['FltNo','Dep','Arr','DepTime','ArrTime','ACType'],
    flights: flightsForDate(date),
  };
}

export function mockCrew(date, eventArgument) {
  const flights = flightsForDate(date);
  const idxMatch = (eventArgument || '').match(/(\d+)$/);
  const idx = idxMatch ? Number(idxMatch[1]) : 0;
  const flight = flights[idx] ?? flights[0];
  const template = CREW_TEMPLATES[flight.ACType] || CREW_TEMPLATES.A320;
  return {
    ok: true,
    date,
    flights,
    headers: ['Code','Name','Position'],
    crew: template.map((c) => ({ ...c })),
  };
}

export function mockCrewByFlight(date, _fltNo, acType) {
  const template = CREW_TEMPLATES[acType] || CREW_TEMPLATES.A320;
  return {
    ok: true,
    date,
    fltNo: _fltNo,
    headers: ['Code', 'Name', 'Position'],
    crew: template.map((c) => ({ ...c })),
  };
}
