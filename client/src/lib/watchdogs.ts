// Bear-trap scanner. Walks the imported DutyEntry[] and surfaces every common
// FTL violation the crew normally trips on. Each alert carries a Persian
// message + an OM-A reference so the user can quote it back to scheduling.
//
// Coverage (every entry maps to a top-tier bear trap from the OM-A analysis):
//   1. Late/Night → Early without 1 local night between (7.1.4.13.7)
//   2. 4+ disruptive shifts → 2nd recovery must be 60h (7.1.4.13.7)
//   3. Reserve assignment notice <10h → right to refuse (7.4.3)
//   4. Standby call inside 21:00–09:00 (7.4.2)
//   5. >10 consecutive Night Duties (7.1.4.4, FRM Reserved)
//   6. Roster published <14 days before month (7.1.2.1) — fed in separately
//   7. Crew-meal gap >6h on long FDP (7.6)
//   8. E↔W rotation with <3 Local Nights HB rest (7.1.4.13.6)
//   9. Travelling >60min away from HB not added to Rest (7.1.4.12.2)
//  10. 18h awake cap (SBY + FDP) (7.4.2 note)

import type { DutyEntry } from '../ftl/rules/types';
import { countLocalNights } from '../ftl/rules/helpers';
import { checkCrewMeals } from './crewMeal';

export type Severity = 'critical' | 'warn' | 'info';

export interface WatchdogAlert {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  reference: string;
  /** Linked entry IDs (so the UI can deep-link to the relevant row). */
  entryIds: string[];
  /** Timestamp the rule applies to, for sorting newest-first. */
  iso: string;
}

const hours = (a: string, b: string): number =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3600_000;

const localHour = (iso: string): number => new Date(iso).getHours();

const isEarlyStart = (iso: string): boolean => {
  const h = localHour(iso);
  return h === 5; // 05:00–05:59
};

const isLateFinish = (iso: string): boolean => {
  const h = localHour(iso);
  return h === 23 || h === 0 || h === 1; // 23:00–01:59
};

const isNightDuty = (e: DutyEntry): boolean => {
  if (e.isNight) return true;
  const s = localHour(e.start);
  const eHr = localHour(e.end);
  // overlaps 02:00–04:59 in some way
  return (s <= 4 || s >= 23) && (eHr >= 2 || eHr === 0);
};

export interface WatchdogInput {
  history: DutyEntry[];
  /** Optional: travelling-times-per-FDP if known (entry id → minutes one-way). */
  travelMinByEntry?: Record<string, number>;
  /** Optional: standby + FDP pairings for the 18h awake check.
   *  Each pair: { sbyHours, fdpEntryId, fdpHours } */
  awakeChecks?: Array<{ sbyHours: number; fdpEntryId: string; fdpHours: number }>;
  /** Optional: any short-notice assignments to flag for trap #3. */
  shortNoticeAssignments?: Array<{ id: string; noticeHours: number; iso: string }>;
  /** Optional: standby contacts that landed in the quiet window for trap #4. */
  quietHourContacts?: Array<{ id: string; iso: string }>;
}

export function scanForBearTraps(input: WatchdogInput): WatchdogAlert[] {
  const out: WatchdogAlert[] = [];
  const fdps = input.history
    .filter((h) => h.kind === 'fdp')
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Trap 1: Late/Night → Early without ≥1 local night between.
  for (let i = 1; i < fdps.length; i++) {
    const prev = fdps[i - 1];
    const next = fdps[i];
    const prevLateOrNight = isLateFinish(prev.end) || isNightDuty(prev);
    if (!prevLateOrNight) continue;
    if (!isEarlyStart(next.start)) continue;
    const nights = countLocalNights(prev.end, next.start);
    if (nights < 1) {
      out.push({
        id: `trap1-${next.id}`,
        severity: 'critical',
        title: 'گذر Late/Night → Early بدون شب محلی',
        message: `پرواز بعدی (${next.note || next.id}) Early Start است اما بین آن و پرواز قبلی شب محلی کامل وجود ندارد. حق رد قانونی دارید.`,
        reference: '7.1.4.13.7',
        entryIds: [prev.id, next.id],
        iso: next.start,
      });
    }
  }

  // Trap 5: >10 consecutive Night Duties.
  let nightRun = 0;
  let runStart: string | null = null;
  for (const f of fdps) {
    if (isNightDuty(f)) {
      if (nightRun === 0) runStart = f.start;
      nightRun++;
      if (nightRun > 10) {
        out.push({
          id: `trap5-${f.id}`,
          severity: 'critical',
          title: 'بیش از ۱۰ Night Duty پشت‌سرهم',
          message: `روند Night Duty از ${runStart} ادامه دارد (تا کنون ${nightRun}). تا اجرای FRM، رد قانونی است.`,
          reference: '7.1.4.4',
          entryIds: [f.id],
          iso: f.start,
        });
        break; // one alert for the run
      }
    } else {
      nightRun = 0;
    }
  }

  // Trap 7: Crew-meal gap on FDP >6h.
  for (const f of fdps) {
    const check = checkCrewMeals(f);
    if (check.violation) {
      out.push({
        id: `trap7-${f.id}`,
        severity: 'warn',
        title: 'فاصلهٔ بیش از ۶ ساعت بدون غذا',
        message: check.note,
        reference: '7.6',
        entryIds: [f.id],
        iso: f.start,
      });
    }
  }

  // Trap 8: Eastward ↔ Westward rotation with <3 local nights HB rest.
  const rotations = input.history
    .filter((h) => h.kind === 'fdp' && Math.abs(h.tzDiffHours ?? 0) >= 4)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  for (let i = 1; i < rotations.length; i++) {
    const prev = rotations[i - 1];
    const curr = rotations[i];
    const oppositeDir = (prev.tzDiffHours ?? 0) * (curr.tzDiffHours ?? 0) < 0;
    if (!oppositeDir) continue;
    const nights = countLocalNights(prev.end, curr.start);
    if (nights < 3) {
      out.push({
        id: `trap8-${curr.id}`,
        severity: 'critical',
        title: 'روتیشن شرق ↔ غرب با فاصلهٔ ناکافی',
        message: `بین این دو روتیشن جهت‌متفاوت تنها ${nights} شب محلی استراحت در HB وجود دارد — حداقل ۳ شب لازم است.`,
        reference: '7.1.4.13.6',
        entryIds: [prev.id, curr.id],
        iso: curr.start,
      });
    }
  }

  // Trap 9: Travelling >60min not added to rest (best-effort — caller supplies map).
  if (input.travelMinByEntry) {
    for (const f of fdps) {
      const t = input.travelMinByEntry[f.id];
      if (!t || t <= 60) continue;
      out.push({
        id: `trap9-${f.id}`,
        severity: 'warn',
        title: 'زمان رفت‌وآمد > ۶۰ دقیقه',
        message: `زمان رفت‌وآمد یک‌سویه ${t}min — مازاد بر ۶۰ دقیقه باید به طول Rest قبلی اضافه شده باشد.`,
        reference: '7.1.4.12.2',
        entryIds: [f.id],
        iso: f.start,
      });
    }
  }

  // Trap 10: 18h awake cap on SBY + FDP.
  for (const a of input.awakeChecks ?? []) {
    const sum = a.sbyHours + a.fdpHours;
    if (sum > 18) {
      out.push({
        id: `trap10-${a.fdpEntryId}`,
        severity: 'critical',
        title: 'بیداری بیش از ۱۸ ساعت (SBY + FDP)',
        message: `Standby ${a.sbyHours}h + FDP ${a.fdpHours}h = ${sum.toFixed(1)}h > سقف ۱۸ ساعت. حق رد قانونی دارید.`,
        reference: '7.4.2',
        entryIds: [a.fdpEntryId],
        iso: new Date().toISOString(),
      });
    }
  }

  // Trap 3: Short-notice assignments (<10h).
  for (const sn of input.shortNoticeAssignments ?? []) {
    if (sn.noticeHours < 10) {
      out.push({
        id: `trap3-${sn.id}`,
        severity: 'critical',
        title: 'ابلاغ Reserve با کمتر از ۱۰ ساعت پیش‌آگاهی',
        message: `ابلاغ تنها ${sn.noticeHours.toFixed(1)}h قبل از ریپورت — مطابق ۷.۴.۳ حق رد دارید.`,
        reference: '7.4.3',
        entryIds: [],
        iso: sn.iso,
      });
    }
  }

  // Trap 4: Standby contacts inside quiet hours (21:00–09:00).
  for (const c of input.quietHourContacts ?? []) {
    out.push({
      id: `trap4-${c.id}`,
      severity: 'warn',
      title: 'تماس همای در پنجرهٔ ممنوع',
      message: `تماس ${new Date(c.iso).toLocaleString('fa-IR')} داخل پنجرهٔ ۲۱:۰۰–۰۹:۰۰ — مستندسازی برای FS&OS انجام شود.`,
      reference: '7.4.2',
      entryIds: [],
      iso: c.iso,
    });
  }

  // Trap 2: 4+ disruptive shifts between two recoveries; 2nd recovery must be 60h.
  const recoveries = input.history
    .filter((h) => (h.kind === 'recovery' || h.kind === 'day_off') &&
      hours(h.start, h.end) >= 36 && countLocalNights(h.start, h.end) >= 2)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  if (recoveries.length >= 2) {
    const r1 = recoveries[recoveries.length - 2];
    const r2 = recoveries[recoveries.length - 1];
    const disruptive = input.history.filter((h) =>
      h.kind === 'fdp' && (h.isNight || h.isEarly || h.isLate) &&
      new Date(h.start).getTime() > new Date(r1.end).getTime() &&
      new Date(h.end).getTime() < new Date(r2.start).getTime(),
    );
    if (disruptive.length >= 4) {
      const r2Hours = hours(r2.start, r2.end);
      if (r2Hours < 60) {
        out.push({
          id: `trap2-${r2.id}`,
          severity: 'critical',
          title: 'Recovery دوم باید ≥۶۰ ساعت باشد',
          message: `${disruptive.length} شیفت مخرب بین دو Recovery اخیر — Recovery دوم باید ≥۶۰ ساعت باشد (فعلی: ${r2Hours.toFixed(0)}h).`,
          reference: '7.1.4.13.7',
          entryIds: [r2.id],
          iso: r2.start,
        });
      }
    }
  }

  // Newest first so the user sees the freshest alerts at the top.
  out.sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime());
  return out;
}
