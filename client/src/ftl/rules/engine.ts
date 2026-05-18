// FTL rules engine — runs every check defined in OM-A Chapter 7
// against a crew profile + duty history + a proposed FDP, and produces
// a structured pass/fail/warn result list plus the maximum allowed FDP.

import {
  lookupFdpRow, toMin,
  TABLE_7_2, TABLE_7_3, TABLE_7_4, TABLE_7_5, TABLE_7_6, TABLE_7_9,
  type RestClass,
} from './tables';
import type {
  CrewProfile, DutyEntry, ProposedFlight, CheckResult, RuleEngineResult, CalculationStep,
} from './types';
import {
  parseIso, hoursBetween, fmtHFromHours, fmtH,
  windowEnding, sumOverlapping, calendarMonthKey, sameCalendarMonth,
  countLocalNights,
} from './helpers';
import { buildAnalysis } from './analysis';

const CHECK = (
  id: string, ref: string, title: string, status: CheckResult['status'],
  message: string, extra?: Partial<CheckResult>,
): CheckResult => ({ id, reference: ref, title, status, message, ...extra });

// Counts hours that contribute to "Cumulative Duty" per 7.1.4.1:
//   FDP duty + 100% Airport Standby + 25% other Standby + Positioning + Training + Admin
const dutyHoursForEntry = (e: DutyEntry, overlapMs: number): number => {
  const hours = overlapMs / 3600_000;
  switch (e.kind) {
    case 'fdp':
    case 'positioning':
    case 'training':
    case 'admin':
    case 'airport_sb':
      return hours;
    case 'sba':
    case 'sbb':
    case 'sbf':
      return 0.25 * hours; // 25% rule
    default:
      return 0;
  }
};

// Block hours only count when on FDP and only the FDP entry's recorded blockHours.
const blockHoursIn = (entries: DutyEntry[], winStartMs: number, winEndMs: number): number => {
  let total = 0;
  for (const e of entries) {
    if (e.kind !== 'fdp' || !e.blockHours) continue;
    const s = parseIso(e.start).getTime();
    const en = parseIso(e.end).getTime();
    if (s >= winEndMs || en <= winStartMs) continue;
    // If FDP entirely inside window, count whole; otherwise prorate by time overlap fraction.
    const total_fdp_ms = en - s;
    if (total_fdp_ms <= 0) continue;
    const overlap = Math.min(en, winEndMs) - Math.max(s, winStartMs);
    total += e.blockHours * (overlap / total_fdp_ms);
  }
  return total;
};

// Resolve max FDP from Table 7.2 (basic, no extension)
const fdpFromTable72 = (startTimeMin: number, sectors: number): string | null => {
  const row = lookupFdpRow(TABLE_7_2, startTimeMin);
  if (!row) return null;
  const cap = Math.min(Math.max(sectors, 2), 10);
  return row.bySectors[cap] ?? null;
};

// Resolve from Table 7.3 (extension without in-flight rest)
const fdpFromTable73 = (startTimeMin: number, sectors: number): string | null => {
  const row = lookupFdpRow(TABLE_7_3, startTimeMin);
  if (!row) return null;
  const cap = Math.min(Math.max(sectors, 2), 5);
  return row.bySectors[cap] ?? null;
};

// Picks Table 7.4 vs 7.5 based on includesLongSector + extra pilots + rest class.
const fdpFromInflightRest = (
  restClass: RestClass, extra: 1 | 2, longSector: boolean,
): string => (longSector ? TABLE_7_5[restClass][extra] : TABLE_7_4[restClass][extra]);

// Cabin-crew minimum in-flight rest (Table 7.6).
export const cabinMinInflightRest = (
  fdpHHMM: string, restClass: RestClass,
): string | null => {
  const fdpMin = toMin(fdpHHMM);
  for (const row of TABLE_7_6) {
    if (fdpMin <= toMin(row.upTo)) return row.rest[restClass] ?? null;
  }
  return null;
};

// ────────────────────────────────────────────────────────────────────────────
// Main engine
// ────────────────────────────────────────────────────────────────────────────
export interface EvaluateInput {
  profile: CrewProfile;
  history: DutyEntry[];
  proposed: ProposedFlight;
  /** ISO of "now" — used for cumulative windows ending at proposed flight start. */
  nowIso?: string;
}

export const evaluate = (input: EvaluateInput): RuleEngineResult => {
  const { profile, history, proposed } = input;
  const checks: CheckResult[] = [];

  const reportingIso = proposed.reportingTimeLocal;
  const reportMs = parseIso(reportingIso).getTime();

  // Helper to run any window check
  const runWindow = (
    label: string, hoursBack: number, limit: number, ref: string,
    sumFn: (e: DutyEntry, overlapMs: number) => number,
    unit = 'h',
  ) => {
    const [s, e] = windowEnding(reportingIso, hoursBack);
    const used = sumOverlapping(history, s, e, sumFn);
    const status = used > limit ? 'fail' : used > limit * 0.9 ? 'warn' : 'pass';
    // Build calculation breakdown
    const calc: CalculationStep[] = [
      { label: 'پنجرهٔ زمانی', formula: `${hoursBack}h قبل از Reporting`, value: `${new Date(s).toLocaleString('fa-IR')} تا ${new Date(e).toLocaleString('fa-IR')}` },
      { label: 'مجموع ساعات وظیفه (Duty)', formula: 'FDP + Positioning + Training + Admin + Airport SB کامل + ۲۵٪ سایر SB', value: `${used.toFixed(2)}${unit}` },
      { label: 'سقف مجاز', formula: `OM-A ${ref}`, value: `${limit}${unit}` },
      { label: 'نتیجه', formula: `${used.toFixed(2)} ${used > limit ? '>' : used > limit * 0.9 ? '> ۹۰٪ ×' : '≤'} ${limit}`, value: status === 'fail' ? 'FAIL' : status === 'warn' ? 'WARN' : 'PASS' },
    ];
    checks.push(CHECK(
      `cumulative-${label}`, ref, label, status,
      status === 'fail'
        ? `سقف نقض شده: ${used.toFixed(2)}${unit} از حداکثر ${limit}${unit}.`
        : status === 'warn'
          ? `بسیار نزدیک به سقف: ${used.toFixed(2)}${unit} از ${limit}${unit} (>۹۰٪).`
          : `در محدوده: ${used.toFixed(2)}${unit} از ${limit}${unit}.`,
      { value: `${used.toFixed(2)}${unit}`, limit: `${limit}${unit}`, calculation: calc },
    ));
    return used;
  };

  // ── 7.1.4.1 Cumulative Duty (60/110/190) ──────────────────────────────────
  runWindow('Cumulative Duty / 7d',  7 * 24,  60, '7.1.4.1', dutyHoursForEntry);
  runWindow('Cumulative Duty / 14d', 14 * 24, 110, '7.1.4.1', dutyHoursForEntry);
  runWindow('Cumulative Duty / 28d', 28 * 24, 190, '7.1.4.1', dutyHoursForEntry);

  // ── 7.1.4.2 Cumulative Block (100/900/1000) ───────────────────────────────
  {
    const [s28, e28] = windowEnding(reportingIso, 28 * 24);
    const block28 = blockHoursIn(history, s28, e28);
    const status28 = block28 > 100 ? 'fail' : block28 > 90 ? 'warn' : 'pass';
    checks.push(CHECK(
      'cumulative-block-28', '7.1.4.2', 'Cumulative Block / 28d', status28,
      status28 === 'fail'
        ? `Block سقف نقض شده: ${block28.toFixed(1)}h از ۱۰۰h.`
        : status28 === 'warn'
          ? `Block نزدیک سقف: ${block28.toFixed(1)}h از ۱۰۰h.`
          : `Block در محدوده: ${block28.toFixed(1)}h از ۱۰۰h.`,
      { value: `${block28.toFixed(1)}h`, limit: '100h' },
    ));

    const [s365, e365] = windowEnding(reportingIso, 365 * 24);
    const block365 = blockHoursIn(history, s365, e365);
    const status365 = block365 > 1000 ? 'fail' : block365 > 900 ? 'warn' : 'pass';
    checks.push(CHECK(
      'cumulative-block-365', '7.1.4.2', 'Cumulative Block / 12 ماه متوالی', status365,
      status365 === 'fail'
        ? `Block سقف نقض شده: ${block365.toFixed(1)}h از ۱۰۰۰h.`
        : `Block در محدوده: ${block365.toFixed(1)}h از ۱۰۰۰h.`,
      { value: `${block365.toFixed(1)}h`, limit: '1000h' },
    ));

    // calendar year (Jan 1 → Dec 31) check
    const yearStart = new Date(parseIso(reportingIso).getFullYear(), 0, 1).getTime();
    const yearEnd = new Date(parseIso(reportingIso).getFullYear() + 1, 0, 1).getTime();
    const blockYear = blockHoursIn(history, yearStart, yearEnd);
    checks.push(CHECK(
      'cumulative-block-year', '7.1.4.2', 'Cumulative Block / سال تقویمی',
      blockYear > 900 ? 'fail' : blockYear > 800 ? 'warn' : 'pass',
      blockYear > 900
        ? `Block سال نقض شده: ${blockYear.toFixed(1)}h از ۹۰۰h.`
        : `Block سال: ${blockYear.toFixed(1)}h از ۹۰۰h.`,
      { value: `${blockYear.toFixed(1)}h`, limit: '900h' },
    ));
  }

  // ── 7.1.4.3 Days Off / Calendar Month ─────────────────────────────────────
  {
    const monthKey = calendarMonthKey(reportingIso);
    const monthOffs = history.filter(h => h.kind === 'day_off' && sameCalendarMonth(h.start, reportingIso));
    const offDaysCount = monthOffs.length;
    const localNights = monthOffs.reduce((acc, e) => acc + countLocalNights(e.start, e.end), 0);
    const offFail = offDaysCount < 7 || localNights < 2;
    const offCalc: CalculationStep[] = [
      { label: 'ماه تقویمی', value: monthKey },
      { label: 'روزهای Day Off ثبت‌شده', value: String(offDaysCount), note: 'حداقل ۷ روز' },
      { label: 'شب‌های محلی پوشانده', formula: '۲۲:۰۰ تا ۰۸:۰۰ هر شب ≥ ۸h داخل Day Off', value: String(localNights), note: 'حداقل ۲ شب' },
      { label: 'نتیجه', formula: `${offDaysCount} ${offDaysCount >= 7 ? '≥' : '<'} ۷ AND ${localNights} ${localNights >= 2 ? '≥' : '<'} ۲`, value: offFail ? 'WARN' : 'PASS' },
    ];
    checks.push(CHECK(
      'days-off-month', '7.1.4.3', `روزهای آزاد در ماه ${monthKey}`,
      offFail ? 'warn' : 'pass',
      offFail
        ? `هشدار: ثبت‌شده ${offDaysCount} روز و ${localNights} شب محلی — حداقل ۷ + ۲ شب لازم است.`
        : `OK: ${offDaysCount} روز و ${localNights} شب محلی ثبت شده.`,
      { value: `${offDaysCount}d / ${localNights}n`, limit: '≥7d / ≥2n', calculation: offCalc },
    ));
  }

  // ── 7.1.4.4 Consecutive Night Duties ──────────────────────────────────────
  {
    // Find runs of consecutive Night FDPs (no rest >= 24h between them counts as "consecutive")
    const fdps = history.filter(h => h.kind === 'fdp').sort(
      (a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime(),
    );
    let longestRun = 0; let runLen = 0; let runMaxHours = 0;
    let prevEndMs = -Infinity;
    for (const f of fdps) {
      if (f.isNight) {
        const sMs = parseIso(f.start).getTime();
        if (sMs - prevEndMs <= 30 * 3600_000) runLen++;
        else runLen = 1;
        const dur = hoursBetween(f.start, f.end);
        runMaxHours = Math.max(runMaxHours, dur);
        if (runLen > longestRun) longestRun = runLen;
      } else {
        runLen = 0;
      }
      prevEndMs = parseIso(f.end).getTime();
    }
    const sectorIssue = fdps.some(f => f.isNight && (f.sectors ?? 0) > 4);
    if (sectorIssue) {
      checks.push(CHECK(
        'night-sectors', '7.1.4.4', 'Night Duty — حداکثر ۴ سکتور', 'fail',
        'حداقل یک Night Duty در سابقه بیش از ۴ سکتور دارد.',
      ));
    } else {
      checks.push(CHECK(
        'night-sectors', '7.1.4.4', 'Night Duty — حداکثر ۴ سکتور', 'pass',
        'تمام Night Dutyها ≤ ۴ سکتور.',
      ));
    }
    if (runMaxHours > 10) {
      checks.push(CHECK(
        'night-10h', '7.1.4.4', 'Night Duty — اجتناب از >۱۰ ساعت متوالی',
        profile.hasFRM ? 'warn' : 'fail',
        `حداکثر طول Night Duty در سابقه: ${runMaxHours.toFixed(1)}h. چون FRM پیاده‌سازی نشده، اجتناب الزامی است.`,
      ));
    } else {
      checks.push(CHECK(
        'night-10h', '7.1.4.4', 'Night Duty — اجتناب از >۱۰ ساعت', 'pass',
        `حداکثر طول Night Duty در سابقه: ${runMaxHours.toFixed(1)}h.`,
      ));
    }
  }

  // ── 7.1.4.5 Basic FDP from Table 7.2 ──────────────────────────────────────
  const startMin = toMin(proposed.referenceTimeHHMM);
  let baseFdp: string | null = fdpFromTable72(startMin, proposed.sectors);
  const baseRow = TABLE_7_2.find(r => {
    const f = toMin(r.bracket.from), t = toMin(r.bracket.to);
    return f <= t ? (startMin >= f && startMin <= t) : (startMin >= f || startMin <= t);
  });
  const baseFdpCalc: CalculationStep[] = [
    { label: 'Reference Time (شروع FDP)', value: proposed.referenceTimeHHMM },
    { label: 'بازهٔ زمانی Table 7.2', value: baseRow ? `${baseRow.bracket.from} – ${baseRow.bracket.to}` : '—' },
    { label: 'تعداد سکتور', value: String(proposed.sectors) },
    { label: 'FDP پایه (lookup Table 7.2)', formula: 'ردیف بازه × ستون سکتور', value: baseFdp ?? '—', note: 'OM-A 7.1.4.5' },
  ];
  if (!baseFdp) {
    checks.push(CHECK(
      'fdp-base', '7.1.4.5', 'FDP پایه', 'fail',
      `FDP پایه قابل محاسبه نیست (شروع ${proposed.referenceTimeHHMM}, ${proposed.sectors} سکتور).`,
      { calculation: baseFdpCalc },
    ));
  } else {
    checks.push(CHECK(
      'fdp-base', '7.1.4.5', 'FDP پایه (Table 7.2)', 'info',
      `FDP پایه: ${baseFdp} (شروع ${proposed.referenceTimeHHMM}, ${proposed.sectors} سکتور).`,
      { value: baseFdp, calculation: baseFdpCalc },
    ));
  }

  // ── 7.1.4.6 Cabin earlier reporting (≤60min) ──────────────────────────────
  if ((proposed.cabinReportsEarlierByMin ?? 0) > 60) {
    checks.push(CHECK(
      'cabin-earlier', '7.1.4.6', 'Cabin Reporting زودتر — حداکثر ۶۰ دقیقه', 'fail',
      `Cabin زودتر از ${proposed.cabinReportsEarlierByMin} دقیقه — بیشتر از سقف ۶۰ دقیقه.`,
    ));
  } else if ((proposed.cabinReportsEarlierByMin ?? 0) > 0) {
    checks.push(CHECK(
      'cabin-earlier', '7.1.4.6', 'Cabin Reporting زودتر', 'pass',
      `Cabin از ${proposed.cabinReportsEarlierByMin} دقیقه زودتر شروع — مجاز.`,
    ));
  }

  // ── 7.1.4.7 Extension WITHOUT in-flight rest ──────────────────────────────
  let fdpAfterExt: string | null = baseFdp;
  if (proposed.useExtensionNoRest) {
    // count extensions used in last 7 days from history
    const [ws, we] = windowEnding(reportingIso, 7 * 24);
    const recentExt = history.filter(h =>
      h.kind === 'fdp' && h.usedExtensionNoRest &&
      parseIso(h.start).getTime() >= ws && parseIso(h.start).getTime() <= we,
    ).length;
    if (recentExt >= 2) {
      checks.push(CHECK(
        'ext-no-rest-count', '7.1.4.7', 'Extension بدون In-flight Rest — حداکثر ۲× در ۷ روز', 'fail',
        `قبلاً ${recentExt} بار در ۷ روز اخیر استفاده شده. مجاز نیست.`,
      ));
      fdpAfterExt = null;
    } else {
      // Check WOCL sector cap
      const sectorCap =
        proposed.woclEncroachmentHours <= 0 ? 5 :
        proposed.woclEncroachmentHours <= 2 ? 4 : 2;
      if (proposed.sectors > sectorCap) {
        checks.push(CHECK(
          'ext-no-rest-sectors', '7.1.4.7', 'Extension بدون In-flight Rest — سقف سکتور', 'fail',
          `${proposed.sectors} سکتور > سقف ${sectorCap} (با پوشش WOCL ${proposed.woclEncroachmentHours}h).`,
        ));
        fdpAfterExt = null;
      } else {
        const t73 = fdpFromTable73(startMin, proposed.sectors);
        if (!t73) {
          checks.push(CHECK(
            'ext-no-rest-table', '7.1.4.7', 'Extension بدون In-flight Rest', 'fail',
            `Extension برای شروع ${proposed.referenceTimeHHMM} و ${proposed.sectors} سکتور مجاز نیست (Table 7.3).`,
          ));
          fdpAfterExt = null;
        } else {
          fdpAfterExt = t73;
          checks.push(CHECK(
            'ext-no-rest-applied', '7.1.4.7', 'Extension بدون In-flight Rest — اعمال‌شده', 'pass',
            `حداکثر FDP پس از Extension: ${t73}. (نیاز: Rest قبل/بعد +۲h یا Rest بعد +۴h)`,
            { value: t73 },
          ));
        }
      }
    }
    if (proposed.restFacilityClass !== 0 || proposed.useSplitDuty) {
      checks.push(CHECK(
        'ext-no-rest-mix', '7.1.4.7', 'ترکیب Extension بدون In-flight Rest با In-flight Rest/Split', 'fail',
        'Extension بدون In-flight Rest را نمی‌توان با In-flight Rest یا Split Duty در یک Duty Period ترکیب کرد.',
      ));
    }
  }

  // ── 7.1.4.8 Extension WITH in-flight rest ─────────────────────────────────
  let fdpAfterIfr: string | null = fdpAfterExt;
  if (proposed.restFacilityClass !== 0) {
    const extra = (proposed.augmentedExtraFlightCrew || 0) as 0 | 1 | 2;
    if (extra < 1 || extra > 2) {
      checks.push(CHECK(
        'ifr-augmented', '7.1.4.8', 'Augmented Crew', 'fail',
        'برای استفاده از In-flight Rest باید ۱ یا ۲ خلبان اضافی داشته باشی.',
      ));
    } else if (proposed.sectors > 3 && !proposed.includesLongSector) {
      checks.push(CHECK(
        'ifr-sectors', '7.1.4.8.2', 'In-flight Rest — حداکثر ۳ سکتور', 'fail',
        `${proposed.sectors} سکتور > سقف ۳ برای In-flight Rest.`,
      ));
    } else if (proposed.includesLongSector && proposed.sectors > 2) {
      checks.push(CHECK(
        'ifr-long-sector', '7.1.4.8.3', 'سکتور ≥۹h — حداکثر ۲ سکتور', 'fail',
        'برای FDPهای دارای یک سکتور ≥۹h، تعداد سکتور باید ≤ ۲ باشد.',
      ));
    } else {
      fdpAfterIfr = fdpFromInflightRest(proposed.restFacilityClass, extra as 1 | 2, proposed.includesLongSector);
      const tableUsed = proposed.includesLongSector ? '7.5' : '7.4';
      checks.push(CHECK(
        'ifr-applied', '7.1.4.8', `Extension با In-flight Rest (Table ${tableUsed})`, 'pass',
        `حداکثر FDP: ${fdpAfterIfr} (Class ${proposed.restFacilityClass}, +${extra} خلبان).`,
        { value: fdpAfterIfr },
      ));
      // Cabin minimum rest check
      if (profile.role === 'cabin') {
        const minRest = cabinMinInflightRest(fdpAfterIfr, proposed.restFacilityClass);
        checks.push(CHECK(
          'ifr-cabin-min', '7.1.4.8.4', 'حداقل In-flight Rest کابین (Table 7.6)',
          minRest ? 'info' : 'fail',
          minRest
            ? `حداقل استراحت حین پرواز برای کابین: ${minRest} (Class ${proposed.restFacilityClass}).`
            : `Class ${proposed.restFacilityClass} برای FDP ${fdpAfterIfr} پاسخگو نیست — Class بهتری لازم است.`,
          { value: minRest ?? '—' },
        ));
      }
    }
  }

  // ── 7.1.4.10 Split Duty ───────────────────────────────────────────────────
  if (proposed.useSplitDuty) {
    if (proposed.useExtensionNoRest || proposed.restFacilityClass !== 0) {
      checks.push(CHECK(
        'split-mix', '7.1.4.10', 'Split Duty — ترکیب ممنوع', 'fail',
        'Split Duty را نمی‌توان با In-flight Rest یا Extension بدون In-flight Rest ترکیب کرد.',
      ));
    } else if ((proposed.splitDutyBreakMin ?? 0) < 180) {
      checks.push(CHECK(
        'split-break', '7.1.4.10', 'Split Duty — Break حداقل ۳ ساعت', 'fail',
        `Break ثبت‌شده ${proposed.splitDutyBreakMin} دقیقه — حداقل ۱۸۰ دقیقه لازم است.`,
      ));
    } else if (baseFdp) {
      const breakMin = proposed.splitDutyBreakMin!;
      let extensionMin = 0;
      if (proposed.splitDutyAccommodation === 'suitable') {
        extensionMin = Math.floor(breakMin * 0.5);
      } else if (proposed.splitDutyAccommodation === 'accommodation') {
        // 50% of part of break NOT encroaching WOCL, max 3h
        const nonWocl = Math.max(0, breakMin - proposed.woclEncroachmentHours * 60);
        extensionMin = Math.min(180, Math.floor(nonWocl * 0.5));
      }
      const newFdp = fmtH(toMin(baseFdp) + extensionMin);
      fdpAfterIfr = newFdp;
      checks.push(CHECK(
        'split-applied', '7.1.4.10', 'Split Duty — اعمال شده', 'pass',
        `FDP پایه ${baseFdp} + ${fmtH(extensionMin)} (${proposed.splitDutyAccommodation}) = ${newFdp}.`,
        { value: newFdp },
      ));
    }
  }

  // ── 7.1.4.11 Reporting Time matches Table 7.7 ─────────────────────────────
  // (Informational — we just show what the planned check-in should be)

  // ── 7.1.4.13 Rest before this FDP ─────────────────────────────────────────
  {
    const lastDuty = [...history]
      .filter(h => ['fdp', 'positioning', 'training', 'admin', 'airport_sb'].includes(h.kind))
      .sort((a, b) => parseIso(b.end).getTime() - parseIso(a.end).getTime())[0];
    if (lastDuty) {
      // 7.1.4.13.1 Note: Rest starts 1h after duty in THR/BND, 2h after duty at IKA.
      // We apply the offset only when the last duty ended at the crew's Home Base side.
      const restStartOffsetMin = (lastDuty.endStation === 'home')
        ? (lastDuty.endsAtIKA ? 120 : 60)
        : 0;
      const effectiveRestStartMs = parseIso(lastDuty.end).getTime() + restStartOffsetMin * 60_000;
      const restMs = reportMs - effectiveRestStartMs;
      const restH = restMs / 3600_000;
      const prevDur = hoursBetween(lastDuty.start, lastDuty.end);
      const baseRequired = proposed.departureStation === 'home' ? 12 : 10;
      let required = Math.max(baseRequired, prevDur);
      // 7.1.4.13.5: If previous FDP used in-flight rest extension, min rest = max(prev, 14h)
      if (lastDuty.usedInflightRestExt) required = Math.max(required, 14);
      // 7.1.4.13.8.2: TZ ≥4h away from home base → ≥14h
      if (proposed.tzDiffHours >= 4 && proposed.departureStation === 'away') {
        required = Math.max(required, 14);
      }
      // 7.1.4.13.2 / Travelling >60min → increase rest by amount above 60min total
      if ((proposed.travellingMinOneWay ?? 0) > 60 && proposed.departureStation === 'away') {
        const totalTravel = (proposed.travellingMinOneWay! * 2);
        const extra = Math.max(0, totalTravel - 60) / 60;
        required += extra;
      }
      const status = restH >= required ? 'pass' : 'fail';
      const offsetNote = restStartOffsetMin > 0 ? ` (شروع Rest با ${restStartOffsetMin / 60}h تأخیر طبق Note 7.1.4.13.1)` : '';
      // Build detailed calculation
      const calc: CalculationStep[] = [
        { label: 'طول Duty قبلی', formula: `Reporting قبلی (${new Date(lastDuty.start).toLocaleString('fa-IR')}) تا پایان (${new Date(lastDuty.end).toLocaleString('fa-IR')})`, value: `${prevDur.toFixed(2)}h` },
        { label: 'پایان Duty قبلی', value: new Date(lastDuty.end).toLocaleString('fa-IR') },
        ...(restStartOffsetMin > 0 ? [{
          label: 'تأخیر شروع Rest',
          formula: lastDuty.endsAtIKA ? 'IKA: +۲h' : 'THR/BND: +۱h',
          value: `+${restStartOffsetMin / 60}h`,
          note: 'OM-A 7.1.4.13.1 Note',
        } as CalculationStep] : []),
        { label: 'شروع رسمی Rest', formula: `پایان Duty + ${restStartOffsetMin / 60}h`, value: new Date(effectiveRestStartMs).toLocaleString('fa-IR') },
        { label: 'شروع FDP بعدی (Reporting)', value: new Date(reportingIso).toLocaleString('fa-IR') },
        { label: 'Rest در دسترس', formula: 'Reporting بعدی − شروع رسمی Rest', value: `${restH.toFixed(2)}h` },
        {
          label: 'Rest موردنیاز',
          formula: proposed.departureStation === 'home'
            ? `max(Duty قبلی=${prevDur.toFixed(2)}h, ۱۲h${lastDuty.usedInflightRestExt ? ', ۱۴h IFR' : ''})`
            : `max(Duty قبلی=${prevDur.toFixed(2)}h, ۱۰h${proposed.tzDiffHours >= 4 ? ', ۱۴h ΔTZ≥۴h' : ''})`,
          value: `${required.toFixed(2)}h`,
          note: `OM-A 7.1.4.13.${proposed.departureStation === 'home' ? '1' : '2'}`,
        },
        ...(proposed.departureStation === 'away' && (proposed.travellingMinOneWay ?? 0) > 60 ? [{
          label: 'افزایش به‌خاطر Travelling > ۶۰min',
          formula: `(${proposed.travellingMinOneWay} × ۲ − ۶۰) / ۶۰`,
          value: `+${((Math.max(0, (proposed.travellingMinOneWay ?? 0) * 2 - 60)) / 60).toFixed(2)}h`,
          note: 'OM-A 7.1.4.13.2',
        } as CalculationStep] : []),
        {
          label: 'نتیجه',
          formula: `${restH.toFixed(2)}h ${status === 'pass' ? '≥' : '<'} ${required.toFixed(2)}h`,
          value: status === 'pass' ? `PASS (حاشیهٔ امن ${(restH - required).toFixed(2)}h)` : `FAIL (کم به اندازهٔ ${(required - restH).toFixed(2)}h)`,
        },
      ];
      checks.push(CHECK(
        'rest-before', '7.1.4.13', 'حداقل Rest قبل از FDP', status,
        status === 'pass'
          ? `Rest = ${restH.toFixed(2)}h ≥ ${required.toFixed(2)}h موردنیاز${offsetNote}.`
          : `Rest کافی نیست: ${restH.toFixed(2)}h < ${required.toFixed(2)}h موردنیاز${offsetNote}. کم به اندازهٔ ${(required - restH).toFixed(2)}h.`,
        { value: `${restH.toFixed(2)}h`, limit: `${required.toFixed(2)}h`, calculation: calc },
      ));
    } else {
      checks.push(CHECK(
        'rest-before', '7.1.4.13', 'حداقل Rest قبل از FDP', 'info',
        'سابقه‌ای از Duty قبلی ثبت نشده — تصور می‌شود Rest کافی است.',
      ));
    }
  }

  // ── 7.1.4.13.7 first bullet — Late/Night → Early Start: 1 local night ─────
  {
    const lastDuty = [...history]
      .filter(h => h.kind === 'fdp')
      .sort((a, b) => parseIso(b.end).getTime() - parseIso(a.end).getTime())[0];
    if (lastDuty && (lastDuty.isLate || lastDuty.isNight) && proposed.departureStation === 'home') {
      const reportLocalMin = parseIso(reportingIso).getHours() * 60 + parseIso(reportingIso).getMinutes();
      const isProposedEarly = reportLocalMin >= 5 * 60 && reportLocalMin <= 5 * 60 + 59;
      if (isProposedEarly) {
        const nights = countLocalNights(lastDuty.end, reportingIso);
        checks.push(CHECK(
          'late-to-early', '7.1.4.13.7',
          'گذار Late/Night → Early — یک شب محلی بین دو FDP',
          nights >= 1 ? 'pass' : 'fail',
          nights >= 1
            ? `Rest شامل ${nights} شب محلی است ✓`
            : `Rest شامل هیچ شب محلی (۲۲:۰۰–۰۸:۰۰) نیست — گذار از Late/Night به Early Start نیاز به ≥۱ شب محلی دارد.`,
        ));
      }
    }
  }

  // ── 7.1.4.13.8.1 Home Base TZ Rotation Rest (Table 7.9) ───────────────────
  {
    if (proposed.departureStation === 'home') {
      const rotationFdps = history
        .filter(h => h.kind === 'fdp' && (h.tzDiffHours ?? 0) >= 4)
        .sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime());
      const lastRotFdp = rotationFdps[rotationFdps.length - 1];
      if (lastRotFdp) {
        const tzMax = Math.abs(lastRotFdp.tzDiffHours ?? 0);
        const elapsedH = (reportMs - parseIso(lastRotFdp.start).getTime()) / 3600_000;
        const minNights = TABLE_7_9(tzMax, elapsedH);
        const haveNights = countLocalNights(lastRotFdp.end, reportingIso);
        if (haveNights < minNights) {
          checks.push(CHECK(
            'tz-home-base-rest', '7.1.4.13.8.1',
            'Home Base TZ Rotation Rest (Table 7.9)', 'fail',
            `پس از روتیشن با ΔTZ ${tzMax.toFixed(1)}h حداقل ${minNights} شب محلی Rest در Home Base لازم است؛ موجود: ${haveNights}.`,
            { value: `${haveNights}n`, limit: `≥${minNights}n` },
          ));
        }
      }
    }
  }

  // ── 7.1.4.6 Cabin earlier reporting — extends effective FDP for cabin ─────
  // (Note: maximum FDP is calculated from cockpit reporting; FDP starts at cabin reporting → cabin's actual FDP is up to 60min longer.)
  if ((proposed.cabinReportsEarlierByMin ?? 0) > 0 && profile.role === 'cabin') {
    // Already validated ≤60 above; here we DON'T extend the allowed FDP — but document the impact.
    checks.push(CHECK(
      'cabin-fdp-impact', '7.1.4.6',
      'Cabin Reporting زودتر — اثر روی FDP', 'info',
      `چون کابین ${proposed.cabinReportsEarlierByMin} دقیقه زودتر از Cockpit Reporting می‌کند، FDP کابین ${proposed.cabinReportsEarlierByMin} دقیقه طولانی‌تر از سقف Table 7.2 خواهد بود (سقف بر اساس Reporting Cockpit، شمارش از Reporting Cabin).`,
    ));
  }

  // ── 7.1.4.14 Mixed Duties — pre-FDP same-day duty time counted in FDP ─────
  if ((proposed.preFdpMixedDutyMin ?? 0) > 0) {
    checks.push(CHECK(
      'mixed-duties', '7.1.4.14',
      'Mixed Duties — افزوده به FDP', 'info',
      `${proposed.preFdpMixedDutyMin} دقیقهٔ Pre-FDP (Simulator/Admin/Training) به‌طور کامل به FDP افزوده می‌شود.`,
    ));
  }

  // ── 7.4.3 Reserve checks ──────────────────────────────────────────────────
  {
    const reserves = history
      .filter(h => h.kind === 'reserve')
      .sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime());
    for (const r of reserves) {
      const dur = hoursBetween(r.start, r.end);
      if (dur > 168) {
        checks.push(CHECK(
          'reserve-168', '7.4.3',
          'Reserve منفرد — حداکثر ۱۶۸ ساعت', 'fail',
          `Reserve از ${new Date(r.start).toLocaleString()} طول ${dur.toFixed(1)}h دارد > ۱۶۸h.`,
        ));
        break;
      }
    }
    // 10h advance notice — only verifiable if user marked the standby-converted history
    // (informational only)
  }

  // ── 7.1.4.13.4 Extended Recovery Rest (≥36h+2 nights, every 168h) ─────────
  {
    const recoveries = history
      .filter(h => h.kind === 'recovery' || h.kind === 'day_off')
      .sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime());
    // identify last "qualifying" recovery: 36h+2 nights
    const qualifying = recoveries.filter(r => {
      const dur = hoursBetween(r.start, r.end);
      const nights = countLocalNights(r.start, r.end);
      return dur >= 36 && nights >= 2;
    });
    const last = qualifying[qualifying.length - 1];
    if (last) {
      const sinceH = (reportMs - parseIso(last.end).getTime()) / 3600_000;
      checks.push(CHECK(
        'recovery-168', '7.1.4.13.4',
        'فاصله از آخرین Extended Recovery Rest',
        sinceH > 168 ? 'fail' : sinceH > 144 ? 'warn' : 'pass',
        sinceH > 168
          ? `${sinceH.toFixed(0)}h از آخرین Recovery — بیش از ۱۶۸h.`
          : `${sinceH.toFixed(0)}h از آخرین Recovery (سقف ۱۶۸h).`,
        { value: `${sinceH.toFixed(0)}h`, limit: '≤168h' },
      ));
    } else {
      checks.push(CHECK(
        'recovery-168', '7.1.4.13.4', 'Extended Recovery Rest', 'warn',
        'هیچ Recovery Rest واجد شرایط (≥۳۶h + ۲ شب محلی) در سابقه ثبت نشده.',
      ));
    }
  }

  // ── 7.1.4.13.7 Disruptive schedule between recoveries (4+ → 60h) ──────────
  {
    const recoveries = history
      .filter(h => (h.kind === 'recovery' || h.kind === 'day_off') &&
        hoursBetween(h.start, h.end) >= 36 &&
        countLocalNights(h.start, h.end) >= 2)
      .sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime());
    if (recoveries.length >= 2) {
      const r1 = recoveries[recoveries.length - 2];
      const r2 = recoveries[recoveries.length - 1];
      const between = history.filter(h =>
        h.kind === 'fdp' && (h.isNight || h.isEarly || h.isLate) &&
        parseIso(h.start).getTime() > parseIso(r1.end).getTime() &&
        parseIso(h.end).getTime() < parseIso(r2.start).getTime(),
      );
      if (between.length >= 4) {
        const r2Dur = hoursBetween(r2.start, r2.end);
        if (r2Dur < 60) {
          checks.push(CHECK(
            'disruptive-60h', '7.1.4.13.7',
            'Disruptive Schedule — Recovery دوم باید ≥۶۰h باشد', 'fail',
            `${between.length} Night/Early/Late بین دو Recovery — Recovery دوم ${r2Dur.toFixed(0)}h است (< ۶۰).`,
          ));
        } else {
          checks.push(CHECK(
            'disruptive-60h', '7.1.4.13.7', 'Disruptive Schedule', 'pass',
            `Recovery دوم ${r2Dur.toFixed(0)}h ≥ ۶۰h ✓.`,
          ));
        }
      }
    }
  }

  // ── 7.1.4.13.6 Eastward-Westward Rotation ─────────────────────────────────
  {
    const rotations = history
      .filter(h => h.kind === 'fdp' && (h.tzDiffHours ?? 0) >= 4)
      .sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime());
    if (rotations.length >= 2 && proposed.tzDiffHours >= 4) {
      const last = rotations[rotations.length - 1];
      // need 3 local nights at HB between alternating directions if 6+/4+
      const restAtHbHours = (reportMs - parseIso(last.end).getTime()) / 3600_000;
      const last6plus = (last.tzDiffHours ?? 0) >= 6;
      const next4plus = proposed.tzDiffHours >= 4;
      if (last6plus && next4plus) {
        const nights = countLocalNights(last.end, reportingIso);
        checks.push(CHECK(
          'rot-east-west', '7.1.4.13.6', 'Eastward-Westward Rotation',
          nights >= 3 ? 'pass' : 'fail',
          nights >= 3
            ? `${nights} شب محلی Rest بین دو روتیشن — OK.`
            : `فقط ${nights} شب محلی Rest بین دو روتیشن — باید ≥۳ باشد. (Rest=${restAtHbHours.toFixed(0)}h)`,
        ));
      }
    }
  }

  // ── 7.4 Standby effects on FDP ────────────────────────────────────────────
  if (proposed.precededByStandbyType && proposed.precededByStandbyType !== 'none') {
    const sbHours = proposed.precededByStandbyHours ?? 0;
    if (proposed.precededByStandbyType === 'airport') {
      // FDP reduced by amount > 4h; total cap 16h
      const reduction = Math.max(0, sbHours - 4);
      if (fdpAfterIfr) {
        const newFdpMin = Math.max(0, toMin(fdpAfterIfr) - reduction * 60);
        fdpAfterIfr = fmtHFromHours(newFdpMin / 60);
      }
      const sbAirportCalc: CalculationStep[] = [
        { label: 'طول Airport Standby', value: `${sbHours}h`, note: 'حداکثر مجاز ۱۲h' },
        { label: 'آستانهٔ کاهش FDP', value: '۴h', note: 'OM-A 7.4.1' },
        { label: 'کاهش FDP', formula: `max(0, ${sbHours} − ۴)`, value: `${reduction.toFixed(1)}h` },
        { label: 'سقف مجموع SB + FDP', value: '۱۶h', note: 'OM-A 7.4.1' },
      ];
      checks.push(CHECK(
        'sb-airport', '7.4.1', 'Airport Standby — کاهش FDP',
        sbHours > 12 ? 'fail' : 'info',
        sbHours > 12
          ? `Airport Standby ${sbHours}h > سقف ۱۲h.`
          : `کاهش FDP به اندازهٔ ${reduction.toFixed(1)}h. مجموع SB+FDP باید ≤۱۶h باشد.`,
        { calculation: sbAirportCalc },
      ));
    } else {
      // Other standby: 25% counts cumulative; FDP reduced by amount > 6h (or 8h with extension)
      const threshold = (proposed.useSplitDuty || proposed.restFacilityClass !== 0) ? 8 : 6;
      let reductionH = Math.max(0, sbHours - threshold);
      // If standby started 23:00–07:00, that band doesn't count
      if (proposed.standbyStartedAtNight) {
        // Approximation: subtract up to 8h band from standby hours that exceed threshold
        reductionH = Math.max(0, reductionH - 8);
      }
      if (fdpAfterIfr) {
        const newFdpMin = Math.max(0, toMin(fdpAfterIfr) - reductionH * 60);
        fdpAfterIfr = fmtHFromHours(newFdpMin / 60);
      }
      // 18h Awake cap
      const fdpHours = fdpAfterIfr ? toMin(fdpAfterIfr) / 60 : 0;
      const awakeTotal = sbHours + fdpHours;
      const awakeCalc: CalculationStep[] = [
        { label: 'مدت Standby', value: `${sbHours}h` },
        { label: 'FDP محاسبه‌شده', value: `${fdpAfterIfr ?? '—'}` },
        { label: 'مجموع Awake', formula: 'Standby + FDP', value: `${awakeTotal.toFixed(2)}h` },
        { label: 'سقف مجاز', value: '۱۸h', note: 'OM-A 7.4.2.b' },
        { label: 'نتیجه', formula: `${awakeTotal.toFixed(2)} ${awakeTotal > 18 ? '>' : '≤'} ۱۸`, value: awakeTotal > 18 ? 'FAIL' : 'PASS' },
      ];
      if (awakeTotal > 18) {
        checks.push(CHECK(
          'sb-awake-18', '7.4.2.b', 'Standby + FDP Awake Time', 'fail',
          `Standby (${sbHours}h) + FDP (${fdpAfterIfr}) = ${awakeTotal.toFixed(2)}h > ۱۸h Awake Time.`,
          { calculation: awakeCalc },
        ));
      } else {
        checks.push(CHECK(
          'sb-awake-18', '7.4.2.b', 'Standby + FDP Awake Time', 'pass',
          `مجموع Standby + FDP = ${awakeTotal.toFixed(2)}h در حد مجاز (≤۱۸h).`,
          { calculation: awakeCalc },
        ));
      }
      const sbOtherCalc: CalculationStep[] = [
        { label: 'نوع Standby', value: proposed.precededByStandbyType === 'home' ? 'منزل (۹۰min reach)' : 'هتل (۶۰min reach)' },
        { label: 'مدت Standby', value: `${sbHours}h` },
        { label: 'آستانهٔ کاهش FDP', value: `${threshold}h`, note: proposed.useSplitDuty || proposed.restFacilityClass !== 0 ? 'با IFR/Split → ۸h' : 'OM-A 7.4.2.f/g' },
        { label: '۲۵٪ Cumulative', formula: `0.25 × ${sbHours}h`, value: `${(0.25 * sbHours).toFixed(2)}h`, note: 'OM-A 7.4.2.c' },
        { label: 'کاهش FDP', formula: `max(0, ${sbHours} − ${threshold}) ${proposed.standbyStartedAtNight ? '− ۸h (شب ۲۳-۷)' : ''}`, value: `${reductionH.toFixed(1)}h` },
      ];
      checks.push(CHECK(
        'sb-other', '7.4.2', 'Other Standby — اعمال‌شده', 'info',
        `${proposed.precededByStandbyType === 'home' ? '۹۰' : '۶۰'} دقیقه برای رسیدن به نقطهٔ حضور. کاهش FDP: ${reductionH.toFixed(1)}h.`,
        { calculation: sbOtherCalc },
      ));
    }
  }

  // ── Acclimatization (X state warning) ─────────────────────────────────────
  if (proposed.acclimState === 'X') {
    checks.push(CHECK(
      'accl-x', '7.1.3', 'Acclimatization', 'warn',
      'وضعیت Acclimatization نامعلوم (X). محاسبات FDP باید به صورت محافظه‌کارانه با Reference Time محل اقامت انجام شود.',
    ));
  } else {
    checks.push(CHECK(
      'accl-state', '7.1.3', 'Acclimatization', 'info',
      `وضعیت Acclimatization: ${proposed.acclimState} (B = مبدأ، D = مقصد، X = نامعلوم).`,
    ));
  }

  // ── Final FDP allowed (pick the most permissive among applicable rules) ───
  let fdpAllowed: string | null = baseFdp;
  if (proposed.useExtensionNoRest && fdpAfterExt) fdpAllowed = fdpAfterExt;
  if (proposed.restFacilityClass !== 0 && fdpAfterIfr) fdpAllowed = fdpAfterIfr;
  if (proposed.useSplitDuty && fdpAfterIfr) fdpAllowed = fdpAfterIfr;

  // ── 7.2 Delayed Reporting handling ────────────────────────────────────────
  let fdpAfterDelay: string | null = fdpAllowed;
  let delayNote: string | undefined = undefined;
  const delayMin = proposed.delayMinutesFromReporting ?? 0;
  const notifications = proposed.delayNotificationsCount ?? 0;
  if (delayMin > 0) {
    if (notifications > 3) {
      checks.push(CHECK(
        'delay-3-notifications', '7.2.1', 'تعداد ابلاغ تأخیر — حداکثر ۳ بار', 'fail',
        `${notifications} بار ابلاغ تأخیر در یک پرواز > حداکثر ۳ بار.`,
      ));
    }
    if (delayMin >= 600) {
      // ≥10h: counts as Rest period
      delayNote = `تأخیر ${(delayMin / 60).toFixed(1)} ساعته (≥۱۰ ساعت). اگر شرکت پس از ابلاغ مزاحمتی ایجاد نکند، این به‌عنوان Rest Period محسوب می‌شود (طبق ۷.۲.۵). FDP باید مجدداً محاسبه شود.`;
      checks.push(CHECK(
        'delay-counts-as-rest', '7.2.5', 'تأخیر طولانی — محسوب شدن به‌عنوان Rest', 'info',
        delayNote,
      ));
    } else if (delayMin >= 240) {
      // ≥4h: max FDP based on more limiting of original or delayed reporting time
      const delayedRefMin = (toMin(proposed.referenceTimeHHMM) + delayMin) % (24 * 60);
      const fdpFromDelayed = fdpFromTable72(delayedRefMin, proposed.sectors);
      if (fdpAllowed && fdpFromDelayed) {
        const min1 = toMin(fdpAllowed);
        const min2 = toMin(fdpFromDelayed);
        const limiting = Math.min(min1, min2);
        fdpAfterDelay = fmtH(limiting);
        delayNote = `تأخیر ${(delayMin / 60).toFixed(1)} ساعته ≥ ۴h. حداکثر FDP بر اساس "محدودکننده‌تر" بین Reporting اصلی (${fdpAllowed}) و Reporting جدید (${fdpFromDelayed}) محاسبه می‌شود = ${fdpAfterDelay}. شمارش FDP از Reporting جدید آغاز می‌شود.`;
      }
    } else {
      // <4h: max FDP based on original reporting, FDP starts at delayed reporting
      delayNote = `تأخیر ${(delayMin / 60).toFixed(1)} ساعته < ۴h. حداکثر FDP بر اساس Reporting اصلی محاسبه می‌شود (${fdpAllowed ?? '—'})، اما شمارش از Reporting جدید آغاز می‌شود.`;
    }
    if (notifications >= 2) {
      delayNote = (delayNote ?? '') + ` (به‌علت تغییر بیش از یک بار، شمارش FDP از ۱ ساعت پس از اعلام دوم یا Reporting جدید — هرکدام زودتر — آغاز می‌شود.)`;
    }
  }

  // ── 7.3.3 Commander's Discretion (planning estimate) ──────────────────────
  let fdpWithCmd: string | null = null;
  if (fdpAllowed) {
    const augmented = (proposed.augmentedExtraFlightCrew ?? 0) >= 1;
    const extra = augmented ? 180 : 120; // +3h augmented, +2h non-augmented
    fdpWithCmd = fmtH(toMin(fdpAllowed) + extra);
    checks.push(CHECK(
      'cmd-discretion', '7.3.3', "اختیار کاپیتان (Commander's Discretion)", 'info',
      `با اختیار کاپیتان، FDP می‌تواند حداکثر تا ${fdpWithCmd} افزایش یابد (+${augmented ? '۳' : '۲'} ساعت — ${augmented ? 'Augmented' : 'Non-Augmented'}). نیازمند مشورت با همهٔ خدمه و — جز در موارد استثنایی — تأیید قبلی DMD/GD است. Rest پس از آن هرگز کمتر از ۱۰ ساعت نباشد.`,
      { value: fdpWithCmd },
    ));
  }

  // If any FAIL has invalidated the path, the allowed FDP is null
  const anyFail = checks.some(c => c.status === 'fail');
  if (anyFail) {
    fdpAllowed = null;
    fdpAfterDelay = null;
    fdpWithCmd = null;
  }

  // ── Over-duty: compare estimated FDP (ETA + 30 min - Reporting) vs allowed ──
  let estimatedFdpHHMM: string | null = null;
  let estimatedBlockHHMM: string | null = null;
  let overDutyMinutes = 0;
  let coverableByCmdDiscretion = false;
  let overDutyStatus = '';

  if (proposed.estimatedDepartureLocal && proposed.estimatedArrivalLocal) {
    const etdMs = parseIso(proposed.estimatedDepartureLocal).getTime();
    const etaMs = parseIso(proposed.estimatedArrivalLocal).getTime();
    if (etaMs > etdMs) {
      const blockMin = Math.round((etaMs - etdMs) / 60_000);
      estimatedBlockHHMM = fmtHFromHours(blockMin / 60);
      // Estimated FDP = Reporting Time → ETA + 30 min Check-out
      const fdpMin = Math.round((etaMs + 30 * 60_000 - reportMs) / 60_000);
      if (fdpMin > 0) {
        estimatedFdpHHMM = fmtHFromHours(fdpMin / 60);
        // Compare with what's allowed (after delay if any, else fdpAllowed)
        const referenceFdp = fdpAfterDelay ?? fdpAllowed;
        if (referenceFdp) {
          const allowedMin = toMin(referenceFdp);
          overDutyMinutes = fdpMin - allowedMin;
          if (overDutyMinutes <= 0) {
            overDutyStatus = `پرواز در محدودهٔ مجاز است: FDP موردنیاز ${estimatedFdpHHMM} ≤ FDP مجاز ${referenceFdp}. حاشیهٔ امن: ${fmtHFromHours(Math.abs(overDutyMinutes) / 60)}.`;
          } else {
            const cmdMargin = (proposed.augmentedExtraFlightCrew ?? 0) >= 1 ? 180 : 120;
            coverableByCmdDiscretion = overDutyMinutes <= cmdMargin;
            if (coverableByCmdDiscretion) {
              overDutyStatus = `Over-Duty: ${fmtHFromHours(overDutyMinutes / 60)} بیشتر از سقف مجاز (${referenceFdp}). این مقدار <b>قابل پوشش با اختیار کاپیتان</b> است (سقف مطلق +${cmdMargin / 60}h).`;
            } else {
              overDutyStatus = `Over-Duty خارج از سقف مطلق: ${fmtHFromHours(overDutyMinutes / 60)} بیشتر از مجاز (${referenceFdp}). حتی با اختیار کاپیتان (+${cmdMargin / 60}h) قابل پوشش نیست. <b>این پرواز را نباید پذیرفت.</b>`;
            }
            const overCalc: CalculationStep[] = [
              { label: 'Reporting Time', value: new Date(reportingIso).toLocaleString('fa-IR') },
              { label: 'ETA (Block-on آخر)', value: new Date(proposed.estimatedArrivalLocal!).toLocaleString('fa-IR') },
              { label: 'پایان FDP', formula: 'ETA + ۳۰min Check-out', value: new Date(etaMs + 30 * 60_000).toLocaleString('fa-IR'), note: 'OM-A 7.1.4.12' },
              { label: 'FDP موردنیاز (تخمینی)', formula: 'پایان FDP − Reporting', value: estimatedFdpHHMM! },
              { label: 'FDP حداکثر مجاز', value: referenceFdp, note: 'محاسبه‌شده طبق ۷.۱.۴.۵–۷.۱.۴.۸ + اثر تأخیر' },
              { label: 'Over-Duty', formula: 'موردنیاز − مجاز', value: overDutyMinutes >= 0 ? `+${fmtHFromHours(overDutyMinutes / 60)}` : `−${fmtHFromHours(Math.abs(overDutyMinutes) / 60)}` },
              { label: 'سقف اختیار کاپیتان', formula: (proposed.augmentedExtraFlightCrew ?? 0) >= 1 ? '+۳h Augmented' : '+۲h Non-Augmented', value: `+${cmdMargin / 60}h`, note: 'OM-A 7.3.3' },
              {
                label: 'نتیجه',
                formula: coverableByCmdDiscretion
                  ? `Over-Duty ${fmtHFromHours(overDutyMinutes / 60)} ≤ سقف Discretion ${cmdMargin / 60}h`
                  : `Over-Duty ${fmtHFromHours(overDutyMinutes / 60)} > سقف Discretion ${cmdMargin / 60}h`,
                value: coverableByCmdDiscretion ? 'WARN — قابل پوشش با کاپیتان' : 'FAIL — خارج از سقف مطلق',
              },
            ];
            checks.push(CHECK(
              'over-duty', '7.1.4.5/7.3.3',
              'Over-Duty تخمینی',
              coverableByCmdDiscretion ? 'warn' : 'fail',
              overDutyStatus.replace(/<\/?b>/g, ''),
              { value: estimatedFdpHHMM, limit: referenceFdp, calculation: overCalc },
            ));
          }
        }
      }
    }
  }

  // Recompute analysis if over-duty added a check
  const finalAnyFail = checks.some(c => c.status === 'fail');

  return {
    fdpAllowedHHMM: finalAnyFail ? null : fdpAllowed,
    fdpRequiredHHMM: estimatedFdpHHMM,
    fdpWithCommanderDiscretionHHMM: finalAnyFail && !coverableByCmdDiscretion ? null : fdpWithCmd,
    fdpAfterDelayHHMM: finalAnyFail ? null : fdpAfterDelay,
    delayNote,
    estimatedFdpHHMM,
    estimatedBlockHHMM,
    overDutyMinutes,
    coverableByCmdDiscretion,
    overDutyStatus,
    checks,
    analysis: buildAnalysis(checks),
    fitToFly: !finalAnyFail,
    hasWarnings: checks.some(c => c.status === 'warn'),
  };
};
