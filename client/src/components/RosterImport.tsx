import { useEffect, useMemo, useState } from 'react';
import {
  Download, ChevronDown, WifiOff, Loader2,
  CheckCircle2, AlertTriangle, RefreshCw, CalendarDays,
  Plane, Coffee, ShieldCheck, GraduationCap, Briefcase, X,
} from 'lucide-react';
import type { Credentials } from '../lib/types';
import type { DutyEntry } from '../ftl/rules/types';
import { api } from '../lib/api';
import { rosterToHistory, type ConversionStats } from '../lib/rosterToHistory';
import { periodLabelFa, periodLabelGregorianFa, cn, toFaDigits } from '../lib/utils';

interface Props {
  creds: Credentials;
  /** Called with converted entries when the user confirms the import. The
   *  parent decides whether to replace or merge with manual entries. */
  onImport: (entries: DutyEntry[], periodLabel: string) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading-periods' }
  | { kind: 'loading-roster' }
  | { kind: 'ready'; stats: ConversionStats; entries: DutyEntry[]; stale: boolean; storedAt: number | null }
  | { kind: 'offline'; message: string }
  | { kind: 'error'; message: string };

const KIND_META: Array<{ key: 'fdp'|'reserve'|'day_off'|'training'|'admin'; fa: string; icon: typeof Plane; tone: string }> = [
  { key: 'fdp',      fa: 'پرواز',  icon: Plane,          tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-300/40' },
  { key: 'reserve',  fa: 'آماده',  icon: ShieldCheck,    tone: 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 ring-violet-300/40' },
  { key: 'day_off',  fa: 'تعطیل',  icon: Coffee,         tone: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 ring-amber-300/40' },
  { key: 'training', fa: 'آموزش',  icon: GraduationCap,  tone: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 ring-sky-300/40' },
  { key: 'admin',    fa: 'دفتری',  icon: Briefcase,      tone: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/40 ring-slate-300/40' },
];

export function RosterImport({ creds, onImport }: Props) {
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [tick, setTick] = useState(0);
  const [showSheet, setShowSheet] = useState(false);

  // Periods (cached login)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus({ kind: 'loading-periods' });
      try {
        const r = await api.login(creds);
        if (cancelled) return;
        setPeriods(r.periods);
        if (r.periods.length && !period) setPeriod(r.periods[0]);
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: 'offline',
          message: e instanceof Error ? e.message : 'سرور Iran Air پاسخ نمی‌دهد.',
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds, tick]);

  // Roster for selected period
  useEffect(() => {
    if (!period) return;
    const ctrl = new AbortController();
    (async () => {
      setStatus({ kind: 'loading-roster' });
      try {
        const r = await api.roster(creds, period, { signal: ctrl.signal, forceFresh: tick > 0 });
        if (ctrl.signal.aborted) return;
        const conv = rosterToHistory(r.data.rows);
        setStatus({
          kind: 'ready',
          stats: conv.stats,
          entries: conv.entries,
          stale: r.stale,
          storedAt: r.storedAt,
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setStatus({
          kind: 'offline',
          message: e instanceof Error ? e.message : 'دریافت برنامه ممکن نشد.',
        });
      }
    })();
    return () => ctrl.abort();
  }, [creds, period, tick]);

  const periodFa = useMemo(() => period ? periodLabelFa(period) : 'انتخاب دوره', [period]);
  const periodEn = useMemo(() => period ? periodLabelGregorianFa(period) : '', [period]);

  const isLoading = status.kind === 'loading-periods' || status.kind === 'loading-roster';

  return (
    <div className="rounded-3xl overflow-hidden animate-rise glass text-slate-900 dark:text-slate-100" dir="rtl">
      {/* ── HEADER STRIP ───────────────────────────────────────────── */}
      <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-brand-500/95 via-brand-600 to-brand-800 text-white">
        <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-8 w-32 h-32 rounded-full bg-emerald-300/20 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shrink-0 ring-1 ring-white/25">
            <Download className="w-4.5 h-4.5 text-white" strokeWidth={2.6} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-extrabold leading-tight">ایمپورت از برنامهٔ ماهانه</div>
            <div className="text-[11px] opacity-85 leading-tight mt-0.5">داده‌های ماه را به سابقهٔ FTL منتقل کن</div>
          </div>
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={isLoading}
            aria-label="بازخوانی"
            className="w-9 h-9 grid place-items-center rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition ring-1 ring-white/20 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── PERIOD PICKER (big tappable button) ────────────────────── */}
      <div className="px-3.5 pt-3.5 pb-2">
        <button
          onClick={() => setShowSheet(true)}
          disabled={periods.length === 0}
          className={cn(
            'w-full rounded-2xl px-3.5 py-3 flex items-center gap-3 text-right transition-all',
            'surface ring-1 ring-brand-500/15 hover:ring-brand-500/35 active:scale-[0.99]',
            periods.length === 0 && 'opacity-60',
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-700/10 grid place-items-center shrink-0">
            <CalendarDays className="w-5 h-5 text-brand-700 dark:text-brand-400" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] opacity-60 leading-none mb-1 font-bold tracking-wider">
              ماه انتخاب‌شده · ضربه بزن
            </div>
            <div className="text-[15px] font-extrabold truncate text-brand-800 dark:text-brand-200">
              {periodFa}
            </div>
            {periodEn && (
              <div className="text-[10.5px] opacity-55 tabular-nums tracking-wider mt-0.5 truncate" dir="ltr">{periodEn}</div>
            )}
          </div>
          <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
        </button>
      </div>

      {/* ── STATUS / SUMMARY BODY ──────────────────────────────────── */}
      <div className="px-3.5 pb-4">
        {status.kind === 'loading-periods' && (
          <StatusRow icon={Loader2} spin text="در حال دریافت لیست دوره‌ها از سرور Iran Air…" />
        )}
        {status.kind === 'loading-roster' && (
          <StatusRow icon={Loader2} spin text="در حال دریافت برنامهٔ ماه…" />
        )}

        {status.kind === 'offline' && (
          <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 ring-1 ring-amber-300/50 p-3.5 mt-1 space-y-2">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200 font-extrabold text-[12.5px]">
              <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
              <span>اتصال به سرور Iran Air برقرار نشد</span>
            </div>
            <div className="text-[11.5px] opacity-85 leading-relaxed text-amber-900 dark:text-amber-200">
              {status.message}
            </div>
            <div className="text-[11px] opacity-80 leading-relaxed text-amber-800 dark:text-amber-200/90 border-t border-amber-300/40 pt-2 mt-2">
              می‌توانید سابقهٔ پرواز را به‌صورت دستی در پنل پایین وارد کنید، یا پس از وصل‌شدن دوباره از دکمهٔ بازخوانی استفاده کنید.
            </div>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="rounded-2xl bg-red-50/80 dark:bg-red-950/30 ring-1 ring-red-300/50 p-3 mt-1 flex items-start gap-2 text-[12px] text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{status.message}</div>
          </div>
        )}

        {status.kind === 'ready' && (
          <ReadySummary
            stats={status.stats}
            stale={status.stale}
            storedAt={status.storedAt}
            onImport={() => onImport(status.entries, periodFa)}
          />
        )}
      </div>

      {showSheet && (
        <PeriodPickerSheet
          periods={periods}
          current={period}
          onPick={(p) => { setPeriod(p); setShowSheet(false); }}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  );
}

function StatusRow({ icon: Icon, text, spin }: { icon: typeof Loader2; text: string; spin?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 py-3 text-[12px] text-slate-600 dark:text-slate-300">
      <Icon className={cn('w-4 h-4', spin && 'animate-spin')} />
      <span>{text}</span>
    </div>
  );
}

function ReadySummary({ stats, stale, storedAt, onImport }: {
  stats: ConversionStats; stale: boolean; storedAt: number | null;
  onImport: () => void;
}) {
  const visible = KIND_META.map((m) => ({ ...m, n: stats.byKind[m.key] ?? 0 })).filter((m) => m.n > 0);

  return (
    <div className="space-y-3">
      {stale && (
        <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 ring-1 ring-amber-300/40 px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">داده‌های ذخیره‌شده — سرور آنلاین نیست</span>
          {storedAt && <span className="opacity-70 tabular-nums text-[10.5px]">{new Date(storedAt).toLocaleString('fa-IR')}</span>}
        </div>
      )}

      <div className="rounded-2xl surface p-3.5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <div className="text-[12px] font-extrabold flex-1">
            <span className="tabular-nums">{toFaDigits(stats.imported)}</span> رویداد آمادهٔ ایمپورت
          </div>
          {stats.skipped > 0 && (
            <span className="text-[10.5px] opacity-55">{toFaDigits(stats.skipped)} نادیده گرفته شد</span>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {visible.map(({ key, fa, icon: Icon, tone, n }) => (
            <div key={key} className={cn('rounded-xl ring-1 px-1.5 py-2 flex flex-col items-center justify-center gap-1', tone)}>
              <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
              <span className="text-[10px] font-bold leading-none">{fa}</span>
              <span className="text-[13px] font-black tabular-nums leading-none">{toFaDigits(n)}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onImport}
        className="w-full rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white font-extrabold py-3.5 text-[14px] shadow-lg shadow-brand-900/30 active:scale-[0.98] flex items-center justify-center gap-2 transition-transform ring-1 ring-white/15"
      >
        <Download className="w-4 h-4" strokeWidth={2.6} />
        ایمپورت این دوره و محاسبه
      </button>
      <div className="text-[10.5px] opacity-55 text-center leading-relaxed -mt-1">
        سابقهٔ FTL با ورودی‌های این ماه جایگزین می‌شود. می‌توانید بعد آن را دستی هم تنظیم کنید.
      </div>
    </div>
  );
}

function PeriodPickerSheet({ periods, current, onPick, onClose }: {
  periods: string[]; current: string;
  onPick: (p: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-rise" />
      <div
        className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto absolute right-1/2 translate-x-1/2 top-2" />
          <div className="flex-1">
            <div className="text-[16px] font-extrabold pt-1">انتخاب دوره</div>
            <div className="text-[11.5px] opacity-65">یکی از دوره‌های ماهانه را برای محاسبه انتخاب کنید</div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 pb-3 no-scrollbar">
          {periods.length === 0 && (
            <div className="text-center text-[12px] opacity-70 py-6">
              دوره‌ای در دسترس نیست. بازخوانی را امتحان کنید.
            </div>
          )}
          {periods.map((p) => {
            const active = p === current;
            return (
              <button
                key={p}
                onClick={() => onPick(p)}
                className={cn(
                  'w-full text-right py-3 px-3 rounded-xl flex items-center justify-between gap-2 mb-1 transition-colors',
                  active
                    ? 'bg-gradient-to-l from-brand-100/80 to-brand-50 dark:from-brand-900/50 dark:to-brand-950/40 text-brand-800 dark:text-brand-100 font-extrabold ring-1 ring-brand-500/30'
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] truncate">{periodLabelFa(p)}</div>
                  <div className="text-[11px] opacity-65 tabular-nums truncate tracking-wider mt-0.5" dir="ltr">{periodLabelGregorianFa(p)}</div>
                </div>
                {active && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
