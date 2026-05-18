import { useMemo, useState } from 'react';
import {
  ScanLine, CheckCircle2, XCircle, AlertTriangle, Info,
  Plane, Coffee, ShieldCheck, GraduationCap, Briefcase, ChevronDown,
  Clock,
} from 'lucide-react';
import type { CrewProfile, DutyEntry, ProposedFlight, RuleEngineResult } from '../ftl/rules/types';
import { evaluate } from '../ftl/rules/engine';
import { cn, toFaDigits, jalaliFromIso, formatJalaliFull, weekdayFa } from '../lib/utils';

interface Props {
  profile: CrewProfile;
  history: DutyEntry[];
}

// Run the rules engine against every FDP-class entry in the history (treating
// it as the "proposed" flight with all prior duties as preceding history) and
// surface the FAIL/WARN summary per flight. The user can expand a row to see
// the individual check messages.

const KIND_META: Record<string, { fa: string; icon: typeof Plane }> = {
  fdp:        { fa: 'پرواز',       icon: Plane },
  day_off:    { fa: 'تعطیل',       icon: Coffee },
  reserve:    { fa: 'آماده‌باش',    icon: ShieldCheck },
  training:   { fa: 'آموزش',       icon: GraduationCap },
  admin:      { fa: 'دفتری',       icon: Briefcase },
};

const STATUS_PRIORITY = { fail: 0, warn: 1, pass: 2, info: 3 } as const;
type Sev = 'fail' | 'warn' | 'pass' | 'info';

const worstOf = (results: { status: Sev }[]): Sev => {
  let worst: Sev = 'pass';
  for (const r of results) {
    if (STATUS_PRIORITY[r.status as Sev] < STATUS_PRIORITY[worst]) worst = r.status as Sev;
  }
  return worst;
};

// Build a ProposedFlight from an FDP DutyEntry. Defaults are conservative —
// the user can refine via the main FTL flow if they need exact numbers.
const fdpToProposed = (e: DutyEntry): ProposedFlight => {
  const start = new Date(e.start);
  return {
    label: e.note || 'FDP',
    reportingTimeLocal: e.start,
    estimatedDepartureLocal: e.start,
    estimatedArrivalLocal: e.end,
    referenceTimeHHMM: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    sectors: e.sectors ?? 1,
    scope: 'international',
    body: 'narrow',
    departureStation: e.startStation ?? 'home',
    arrivalStation: e.endStation ?? 'away',
    augmentedExtraFlightCrew: 0,
    restFacilityClass: 0,
    includesLongSector: false,
    useExtensionNoRest: false,
    useSplitDuty: false,
    acclimState: 'B',
    cabinReportsEarlierByMin: 0,
    woclEncroachmentHours: 0,
    precededByStandbyType: 'none',
    standbyStartedAtNight: false,
    tzDiffHours: e.tzDiffHours ?? 0,
    travellingMinOneWay: 30,
    delayMinutesFromReporting: 0,
    delayNotificationsCount: 0,
    modelCommanderDiscretion: true,
  };
};

export function MonthLegalityScan({ profile, history }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const flights = useMemo(
    () => history.filter((h) => h.kind === 'fdp')
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [history],
  );

  // For each FDP, evaluate it against the history slice that precedes it.
  const evaluations = useMemo(() => {
    return flights.map((f) => {
      const fStart = new Date(f.start).getTime();
      const prior = history.filter((h) => new Date(h.end).getTime() <= fStart);
      const proposed = fdpToProposed(f);
      const result: RuleEngineResult = evaluate({ profile, history: prior, proposed });
      return { entry: f, result };
    });
  }, [flights, history, profile]);

  // Roll-up tallies for the header chip strip.
  const tally = useMemo(() => {
    let fail = 0, warn = 0, pass = 0;
    for (const ev of evaluations) {
      const worst = worstOf(ev.result.checks as { status: Sev }[]);
      if (worst === 'fail') fail++;
      else if (worst === 'warn') warn++;
      else pass++;
    }
    return { fail, warn, pass, total: evaluations.length };
  }, [evaluations]);

  if (history.length === 0) {
    return (
      <div className="surface rounded-2xl p-4 text-[12px] opacity-70 text-center" dir="rtl">
        برای اسکن، ابتدا برنامهٔ ماه را ایمپورت کنید یا سابقه را دستی وارد کنید.
      </div>
    );
  }
  if (flights.length === 0) {
    return (
      <div className="surface rounded-2xl p-4 text-[12px] opacity-70 text-center" dir="rtl">
        سابقه شامل پرواز عملیاتی (FDP) نیست — اسکن چیزی برای بررسی ندارد.
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl overflow-hidden animate-rise text-slate-900 dark:text-slate-100" dir="rtl">
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-fuchsia-700 grid place-items-center shrink-0">
            <ScanLine className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold leading-tight">اسکن کل ماه طبق OM-A</div>
            <div className="text-[11px] opacity-60 leading-tight mt-0.5">
              {toFaDigits(tally.total)} پرواز ارزیابی شد
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TallyChip kind="fail" n={tally.fail} />
          <TallyChip kind="warn" n={tally.warn} />
          <TallyChip kind="pass" n={tally.pass} />
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {evaluations.map(({ entry, result }) => {
          const worst = worstOf(result.checks as { status: Sev }[]);
          const isOpen = expandedId === entry.id;
          const failChecks = result.checks.filter((c) => c.status === 'fail');
          const warnChecks = result.checks.filter((c) => c.status === 'warn');
          const Icon = KIND_META.fdp.icon;
          const dt = new Date(entry.start);
          const isoDate = entry.start.slice(0, 10);
          const jalali = formatJalaliFull(isoDate);
          const jal = jalaliFromIso(isoDate);
          const wdEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()];
          const wd = weekdayFa(wdEn);
          const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
          // entry.note now looks like "IR715 · THR→DXB" — split for nicer display.
          const noteParts = (entry.note ?? '').split(' · ');
          const fltNo = noteParts[0] || 'FDP';
          const route = noteParts[1] || '';
          const tone = worst === 'fail'
            ? 'bg-rose-50/60 dark:bg-rose-950/30'
            : worst === 'warn'
              ? 'bg-amber-50/60 dark:bg-amber-950/30'
              : '';
          return (
            <div key={entry.id} className={tone}>
              <button
                onClick={() => setExpandedId(isOpen ? null : entry.id)}
                className="w-full p-3 flex items-stretch gap-3 text-right active:scale-[0.997] transition-transform"
              >
                {/* Date column — Jalali day + month, weekday, time */}
                <div className={cn(
                  'w-[64px] shrink-0 rounded-xl flex flex-col items-center justify-center py-1.5 px-1 ring-1',
                  worst === 'fail' ? 'bg-rose-100 dark:bg-rose-900/40 ring-rose-300/50 text-rose-800 dark:text-rose-100'
                    : worst === 'warn' ? 'bg-amber-100 dark:bg-amber-900/40 ring-amber-300/50 text-amber-800 dark:text-amber-100'
                    : 'bg-emerald-100/70 dark:bg-emerald-900/40 ring-emerald-300/40 text-emerald-800 dark:text-emerald-100',
                )}>
                  <div className="text-[10px] font-bold opacity-80 leading-none">{wd}</div>
                  <div className="text-[20px] font-black leading-none my-1 tabular-nums">{toFaDigits(jal.jd || dt.getDate())}</div>
                  <div className="text-[9.5px] font-bold opacity-80 leading-none truncate max-w-[60px] text-center">
                    {jalali.split(' ').slice(1, 2).join(' ') || String(dt.getMonth() + 1)}
                  </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200 -scale-x-100" strokeWidth={2.4} />
                    </div>
                    <span className="text-[14px] font-extrabold tabular-nums" dir="ltr">{fltNo}</span>
                    {route && (
                      <span className="text-[12px] font-bold opacity-80 tabular-nums tracking-wider" dir="ltr">
                        {route}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] opacity-70 flex items-center gap-1.5 tabular-nums" dir="ltr">
                    <Clock className="w-3 h-3" />
                    {timeLabel} · {isoDate}
                  </div>
                </div>

                <div className="flex flex-col items-end justify-center gap-1 shrink-0">
                  <SeverityBadge sev={worst} failN={failChecks.length} warnN={warnChecks.length} />
                  <ChevronDown className={cn('w-4 h-4 transition-transform opacity-60', isOpen && 'rotate-180')} />
                </div>
              </button>

              <div className={cn(
                'grid transition-all duration-300 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}>
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 space-y-1.5">
                    {failChecks.length === 0 && warnChecks.length === 0 && (
                      <div className="text-[11.5px] opacity-65 text-center py-2">
                        همهٔ قواعد OM-A در این پرواز رعایت شده‌اند.
                      </div>
                    )}
                    {[...failChecks, ...warnChecks].map((c) => (
                      <CheckRow key={c.id} status={c.status as Sev} title={c.title} message={c.message} reference={c.reference} />
                    ))}
                    {result.fdpAllowedHHMM && (
                      <div className="text-[10.5px] opacity-60 pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                        FDP مجاز: <span className="font-bold">{result.fdpAllowedHHMM}</span>
                        {result.estimatedFdpHHMM && (<>{'  ·  '}موردنیاز تخمینی: <span className="font-bold">{result.estimatedFdpHHMM}</span></>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TallyChip({ kind, n }: { kind: Sev; n: number }) {
  const meta = {
    fail: { fa: 'مغایر',    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200 ring-rose-300/40',         icon: XCircle },
    warn: { fa: 'هشدار',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200 ring-amber-300/40',    icon: AlertTriangle },
    pass: { fa: 'مجاز',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 ring-emerald-300/40', icon: CheckCircle2 },
    info: { fa: 'اطلاعات',  cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200 ring-sky-300/40',              icon: Info },
  }[kind];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-extrabold rounded-full px-2 py-1 ring-1', meta.cls)}>
      <Icon className="w-3 h-3" strokeWidth={2.6} />
      {meta.fa}
      <span className="tabular-nums opacity-80">{toFaDigits(n)}</span>
    </span>
  );
}

function SeverityBadge({ sev, failN, warnN }: { sev: Sev; failN: number; warnN: number }) {
  if (sev === 'fail') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
      <XCircle className="w-3 h-3" strokeWidth={2.6} />
      {toFaDigits(failN)} مغایرت
    </span>
  );
  if (sev === 'warn') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
      <AlertTriangle className="w-3 h-3" strokeWidth={2.6} />
      {toFaDigits(warnN)} هشدار
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
      <CheckCircle2 className="w-3 h-3" strokeWidth={2.6} />
      OK
    </span>
  );
}

function CheckRow({ status, title, message, reference }: {
  status: Sev; title: string; message: string; reference: string;
}) {
  const tone = status === 'fail' ? 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 ring-rose-300/30'
    : 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 ring-amber-300/30';
  const Icon = status === 'fail' ? XCircle : AlertTriangle;
  return (
    <div className={cn('rounded-lg ring-1 px-2.5 py-2 text-[11px]', tone)}>
      <div className="flex items-center gap-1.5 font-extrabold">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 min-w-0 truncate">{title}</span>
        <span className="opacity-60 tabular-nums tracking-wider text-[10px]">{reference}</span>
      </div>
      <div className="opacity-80 mt-1 leading-relaxed">{message}</div>
    </div>
  );
}
