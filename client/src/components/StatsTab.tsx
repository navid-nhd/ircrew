import { useEffect, useMemo, useState } from 'react';
import {
  Trophy, Plane, Clock, MapPin, BarChart3, Moon, Calendar, Sparkles, Globe, TrendingUp,
} from 'lucide-react';
import type { Credentials } from '../lib/types';
import { listVault, type VaultRecord } from '../lib/recordsVault';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  creds: Credentials;
}

type PeriodKey = '1m' | '3m' | '6m' | '12m' | 'all';

const PERIODS: Array<{ key: PeriodKey; label: string; months: number | null }> = [
  { key: '1m',  label: '۱ ماه',  months: 1  },
  { key: '3m',  label: '۳ ماه',  months: 3  },
  { key: '6m',  label: '۶ ماه',  months: 6  },
  { key: '12m', label: '۱۲ ماه', months: 12 },
  { key: 'all', label: 'همه',    months: null },
];

// "Year in review" style stats page driven entirely from the 24-month vault.
// Counters animate up on first paint to give the page a celebratory feel,
// brand-emerald gradient cards keep the IRCrew identity.
export function StatsTab({ creds }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('12m');
  const allRecords = useMemo(() => listVault(creds.code), [creds.code]);

  const records = useMemo(() => filterByPeriod(allRecords, period), [allRecords, period]);
  const summary = useMemo(() => summarizeRecords(records), [records]);
  const metrics = useMemo(() => deriveMetrics(records), [records]);
  const monthSeries = useMemo(() => buildMonthlySeries(records, period), [records, period]);

  if (allRecords.length === 0) {
    return (
      <div className="pt-6" dir="rtl">
        <EmptyState />
      </div>
    );
  }

  return (
    <section className="pt-3 space-y-3 pb-2" dir="rtl">
      {/* PERIOD SELECTOR */}
      <div className="surface rounded-2xl p-2 text-slate-900 dark:text-slate-100 animate-rise">
        <div className="flex items-center gap-1.5 px-1 pb-1.5">
          <Calendar className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
          <span className="text-[11.5px] font-extrabold opacity-75">بازهٔ آماری</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'rounded-xl py-1.5 text-[11.5px] font-extrabold transition-all',
                period === p.key
                  ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-700/30'
                  : 'bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {summary.totalEntries === 0 ? (
        <div className="surface rounded-2xl p-5 text-center text-slate-900 dark:text-slate-100">
          <div className="text-[32px] mb-1">🌙</div>
          <div className="text-[12.5px] font-extrabold mb-0.5">در این بازه چیزی ثبت نشده</div>
          <div className="text-[11px] opacity-70">یک بازهٔ بزرگ‌تر را امتحان کنید.</div>
        </div>
      ) : (
      <>
      {/* HERO — total flight hours */}
      <div className="relative overflow-hidden rounded-3xl text-white p-4 ring-1 ring-white/15 shadow-2xl shadow-brand-900/40 animate-spring">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500 via-brand-700 to-brand-950 animate-gradient" />
        <div className="absolute -top-16 -right-12 w-52 h-52 rounded-full bg-emerald-300/30 blur-3xl animate-float" />
        <div className="absolute -bottom-16 -left-12 w-52 h-52 rounded-full bg-teal-400/25 blur-3xl animate-float" style={{ animationDelay: '-2s' }} />
        <Plane className="absolute -bottom-4 -right-4 w-28 h-28 text-white/5 -scale-x-100 animate-spin-slow" strokeWidth={1} />

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 opacity-90" />
            <div className="text-[11px] opacity-85 font-bold tracking-[0.18em]">سفر شما در یک نگاه</div>
          </div>

          <div className="text-[12px] opacity-80 font-bold mb-1">مجموع ساعت پرواز در این بازه</div>
          <div className="flex items-baseline gap-1.5 tabular-nums drop-shadow-lg">
            <AnimatedNumber to={Math.floor(summary.totalBlockHours)} className="text-[56px] font-black leading-none" />
            <span className="text-[14px] opacity-80 font-semibold">h</span>
            <AnimatedNumber to={Math.round((summary.totalBlockHours % 1) * 60)} className="text-[26px] font-extrabold leading-none mr-1" pad2 />
            <span className="text-[13px] opacity-80 font-semibold">m</span>
          </div>
          <div className="text-[11px] opacity-75 mt-1 font-bold tabular-nums">
            از {summary.earliestIso?.slice(0, 10)} تا {summary.latestIso?.slice(0, 10)}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <HeroPill label="پرواز"  enLabel="Flights" value={summary.fdpCount} icon={Plane}    accent="from-emerald-300 to-emerald-500" />
            <HeroPill label="مقاصد"  enLabel="Cities"  value={metrics.uniqueDestinations} icon={Globe} accent="from-sky-300 to-sky-500" />
            <HeroPill label="کشورها" enLabel="Hubs"    value={metrics.uniqueAirports} icon={MapPin}  accent="from-violet-300 to-violet-500" />
          </div>
        </div>
      </div>

      {/* MONTHLY HOURS CHART */}
      {monthSeries.length > 0 && (
        <div className="surface rounded-2xl p-3.5 text-slate-900 dark:text-slate-100 animate-rise">
          <div className="flex items-center justify-between">
            <SectionHead icon={TrendingUp} title="ساعت پرواز ماهانه" />
            <div className="text-[10.5px] opacity-65 font-bold tabular-nums">
              میانگین {toFaDigits(Math.round(monthSeries.reduce((s, m) => s + m.hours, 0) / Math.max(1, monthSeries.length)))}h/ماه
            </div>
          </div>
          <MonthlyChart series={monthSeries} />
        </div>
      )}

      {/* HOURS BREAKDOWN */}
      <div className="surface rounded-2xl p-3.5 text-slate-900 dark:text-slate-100 animate-rise">
        <SectionHead icon={Clock} title="ساعت‌ها به تفکیک" />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <BigStat label="ساعت Block" value={summary.totalBlockHours.toFixed(1)} hint="مجموع زمان موتور-روشن" />
          <BigStat label="ساعت Duty" value={summary.totalDutyHours.toFixed(1)} hint="مجموع FDP + Admin + SBY" />
          <BigStat label="روز Off" value={String(summary.dayOffCount)} hint="مجموع روزهای آزاد ثبت‌شده" />
          <BigStat label="Reserve" value={String(summary.reserveCount)} hint="بازه‌های Reserve ثبت‌شده" />
        </div>
      </div>

      {/* TOP ROUTES */}
      {metrics.topRoutes.length > 0 && (
        <div className="surface rounded-2xl p-3.5 text-slate-900 dark:text-slate-100 animate-rise">
          <SectionHead icon={MapPin} title="پرتکرارترین مسیرها" />
          <div className="space-y-1.5 mt-2">
            {metrics.topRoutes.slice(0, 5).map((r, i) => {
              const pct = Math.round((r.n / metrics.topRoutes[0].n) * 100);
              return (
                <div key={r.route} className="relative overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-800/40 px-3 py-2 flex items-center gap-2">
                  <div
                    className="absolute inset-y-0 right-0 bg-gradient-to-l from-brand-500/22 via-brand-500/16 to-transparent"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative w-6 h-6 rounded-full bg-brand-500 text-white text-[10.5px] font-extrabold grid place-items-center shrink-0">{toFaDigits(i + 1)}</span>
                  <span className="relative font-extrabold text-[13px] tabular-nums flex-1" dir="ltr">{r.route}</span>
                  <span className="relative text-[11px] font-bold opacity-80 tabular-nums">{toFaDigits(r.n)}× </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BUSIEST MONTH + LONGEST REST */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.busiestMonth && (
          <div className="surface rounded-2xl p-3 text-slate-900 dark:text-slate-100 animate-rise">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="w-3.5 h-3.5 text-rose-500" />
              <div className="text-[11px] font-extrabold opacity-75">شلوغ‌ترین ماه</div>
            </div>
            <div className="text-[15px] font-black mt-1 tabular-nums">{metrics.busiestMonth.month}</div>
            <div className="text-[11px] opacity-70 mt-0.5">{toFaDigits(metrics.busiestMonth.flights)} پرواز · {toFaDigits(metrics.busiestMonth.hours.toFixed(1))}h</div>
          </div>
        )}
        {metrics.longestRest && (
          <div className="surface rounded-2xl p-3 text-slate-900 dark:text-slate-100 animate-rise">
            <div className="flex items-center gap-1.5 mb-1">
              <Moon className="w-3.5 h-3.5 text-sky-500" />
              <div className="text-[11px] font-extrabold opacity-75">طولانی‌ترین Rest</div>
            </div>
            <div className="text-[15px] font-black mt-1 tabular-nums">{toFaDigits(metrics.longestRest.hours.toFixed(1))}h</div>
            <div className="text-[11px] opacity-70 mt-0.5 tabular-nums">پیش از پرواز {metrics.longestRest.iso.slice(0,10)}</div>
          </div>
        )}
      </div>

      {/* DAY-OF-WEEK HEATMAP */}
      <div className="surface rounded-2xl p-3.5 text-slate-900 dark:text-slate-100 animate-rise">
        <SectionHead icon={BarChart3} title="تراکم پروازها در روزهای هفته" />
        <div className="flex items-end gap-2 mt-3 h-24" dir="rtl">
          {metrics.weekdayCounts.map((n, i) => {
            const max = Math.max(...metrics.weekdayCounts, 1);
            const pct = Math.max(8, Math.round((n / max) * 100));
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-[10px] font-bold opacity-65 tabular-nums">{toFaDigits(n)}</div>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-brand-700 to-brand-400 transition-all"
                  style={{ height: `${pct}%` }}
                />
                <div className="text-[10px] font-extrabold opacity-70">{WEEKDAY_LABELS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MEDALS / ACHIEVEMENTS */}
      {metrics.achievements.length > 0 && (
        <div className="surface rounded-2xl p-3.5 text-slate-900 dark:text-slate-100 animate-rise">
          <SectionHead icon={Trophy} title="نشان‌ها" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            {metrics.achievements.map((a) => (
              <div key={a.id} className={cn(
                'rounded-xl p-2.5 ring-1 flex items-center gap-2',
                a.tone === 'gold' ? 'bg-amber-50 dark:bg-amber-950/30 ring-amber-300/50' :
                a.tone === 'silver' ? 'bg-slate-100 dark:bg-slate-800/40 ring-slate-300/40' :
                'bg-orange-50 dark:bg-orange-950/30 ring-orange-300/40',
              )}>
                <div className="text-[22px]">{a.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-extrabold truncate">{a.title}</div>
                  <div className="text-[10.5px] opacity-70 truncate">{a.subtitle}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </section>
  );
}

// ───── helpers ─────

const WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

// Filter the vault by the selected period (months back from latest record's
// month). "all" returns the whole vault.
function filterByPeriod(records: VaultRecord[], period: PeriodKey): VaultRecord[] {
  if (period === 'all' || records.length === 0) return records;
  const months = PERIODS.find((p) => p.key === period)?.months ?? 12;
  // Anchor the window to the latest record so an inactive month doesn't blank
  // the page; users on holiday still see their last N months of activity.
  const latest = new Date(records[records.length - 1].start);
  const cutoff = new Date(latest.getFullYear(), latest.getMonth() - months + 1, 1).getTime();
  return records.filter((r) => new Date(r.start).getTime() >= cutoff);
}

interface RecordSummary {
  totalEntries: number;
  fdpCount: number;
  totalBlockHours: number;
  totalDutyHours: number;
  dayOffCount: number;
  reserveCount: number;
  earliestIso: string | null;
  latestIso: string | null;
}

function summarizeRecords(list: VaultRecord[]): RecordSummary {
  let totalBlock = 0, totalDuty = 0, fdp = 0, off = 0, reserve = 0;
  for (const r of list) {
    if (r.kind === 'fdp') { fdp++; totalBlock += r.blockHours ?? 0; }
    if (r.kind === 'day_off') off++;
    if (r.kind === 'reserve') reserve++;
    const dur = (new Date(r.end).getTime() - new Date(r.start).getTime()) / 3600_000;
    if (['fdp', 'positioning', 'training', 'admin', 'airport_sb'].includes(r.kind)) totalDuty += dur;
  }
  return {
    totalEntries: list.length,
    fdpCount: fdp,
    totalBlockHours: Math.round(totalBlock * 10) / 10,
    totalDutyHours: Math.round(totalDuty * 10) / 10,
    dayOffCount: off,
    reserveCount: reserve,
    earliestIso: list[0]?.start ?? null,
    latestIso: list[list.length - 1]?.start ?? null,
  };
}

interface MonthBucket { key: string; label: string; hours: number; flights: number }

// Build a continuous monthly series so empty months still get a (zero) bar.
function buildMonthlySeries(records: VaultRecord[], period: PeriodKey): MonthBucket[] {
  if (records.length === 0) return [];
  const tally = new Map<string, { hours: number; flights: number }>();
  for (const r of records) {
    if (r.kind !== 'fdp') continue;
    const d = new Date(r.start);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = tally.get(k) ?? { hours: 0, flights: 0 };
    cur.hours += r.blockHours ?? 0;
    cur.flights++;
    tally.set(k, cur);
  }
  const latest = new Date(records[records.length - 1].start);
  const monthsBack = period === 'all'
    ? Math.min(24, monthsBetween(new Date(records[0].start), latest) + 1)
    : (PERIODS.find((p) => p.key === period)?.months ?? 12);
  const out: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(latest.getFullYear(), latest.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const v = tally.get(k) ?? { hours: 0, flights: 0 };
    out.push({
      key: k,
      label: PERSIAN_MONTHS_SHORT[d.getMonth()],
      hours: Math.round(v.hours * 10) / 10,
      flights: v.flights,
    });
  }
  return out;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

const PERSIAN_MONTHS_SHORT = ['ژان', 'فور', 'مار', 'آپر', 'می', 'ژون', 'ژوی', 'آگو', 'سپ', 'اکت', 'نوا', 'دس'];

// Pure-SVG bar chart — horizontal sliding feel via RTL layout.
function MonthlyChart({ series }: { series: MonthBucket[] }) {
  const max = Math.max(...series.map((m) => m.hours), 1);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="mt-3">
      <div className="relative h-32" dir="ltr">
        <svg viewBox={`0 0 ${series.length * 36} 130`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="barGradHot" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#DC2626" />
            </linearGradient>
          </defs>
          {/* grid lines */}
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line
              key={g}
              x1={0} x2={series.length * 36}
              y1={110 - 100 * g} y2={110 - 100 * g}
              stroke="currentColor" strokeOpacity={0.10} strokeDasharray="2,3"
            />
          ))}
          {series.map((m, i) => {
            const h = Math.max(2, Math.round((m.hours / max) * 100));
            const x = i * 36 + 4;
            const y = 110 - h;
            const hot = m.hours > max * 0.85;
            return (
              <g key={m.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y} width={28} height={h} rx={4}
                  fill={hot ? 'url(#barGradHot)' : 'url(#barGrad)'}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
                {hover === i && (
                  <text x={x + 14} y={y - 4} textAnchor="middle"
                    fontSize="9" fontWeight="800" fill="currentColor">
                    {toFaDigits(m.hours.toFixed(1))}h
                  </text>
                )}
                <text x={x + 14} y={124} textAnchor="middle"
                  fontSize="8.5" fontWeight="700" fill="currentColor" opacity={0.65}>
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {hover !== null && (
        <div className="mt-1 text-center text-[10.5px] font-bold opacity-80 tabular-nums">
          {series[hover].label} · {toFaDigits(series[hover].flights)} پرواز · {toFaDigits(series[hover].hours.toFixed(1))} ساعت
        </div>
      )}
    </div>
  );
}

interface Metrics {
  uniqueDestinations: number;
  uniqueAirports: number;
  topRoutes: Array<{ route: string; n: number }>;
  busiestMonth: { month: string; flights: number; hours: number } | null;
  longestRest: { hours: number; iso: string } | null;
  weekdayCounts: number[];
  achievements: Array<{ id: string; emoji: string; title: string; subtitle: string; tone: 'gold' | 'silver' | 'bronze' }>;
}

function deriveMetrics(records: VaultRecord[]): Metrics {
  const fdps = records.filter((r) => r.kind === 'fdp');
  const destinations = new Set<string>();
  const airports = new Set<string>();
  const routeTally = new Map<string, number>();
  const monthTally = new Map<string, { flights: number; hours: number }>();
  const weekday = new Array(7).fill(0);

  for (const r of fdps) {
    const note = r.note ?? '';
    // note format: "IR715 · THR→DXB · ..."
    const route = note.split(' · ')[1] ?? '';
    if (route) {
      routeTally.set(route, (routeTally.get(route) ?? 0) + 1);
      const [a, b] = route.split('→');
      if (a) airports.add(a.trim());
      if (b) { destinations.add(b.trim()); airports.add(b.trim()); }
    }
    const d = new Date(r.start);
    weekday[(d.getDay() + 1) % 7]++; // shift Sun-Sat → Sat-Fri for Persian week
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = monthTally.get(monthKey) ?? { flights: 0, hours: 0 };
    cur.flights++;
    cur.hours += r.blockHours ?? 0;
    monthTally.set(monthKey, cur);
  }

  const topRoutes = [...routeTally.entries()].map(([route, n]) => ({ route, n }))
    .sort((a, b) => b.n - a.n);

  const monthEntries = [...monthTally.entries()].map(([month, v]) => ({ month, ...v }));
  monthEntries.sort((a, b) => b.flights - a.flights);
  const busiestMonth = monthEntries[0] ?? null;

  // Longest rest = biggest gap between consecutive FDPs.
  let longestRest: Metrics['longestRest'] = null;
  const sorted = [...fdps].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].start).getTime() - new Date(sorted[i - 1].end).getTime()) / 3600_000;
    if (!longestRest || gap > longestRest.hours) {
      longestRest = { hours: Math.max(0, gap), iso: sorted[i].start };
    }
  }

  const achievements: Metrics['achievements'] = [];
  if (fdps.length >= 100) achievements.push({ id: 'fdp100', emoji: '💯', title: 'صد پرواز', subtitle: 'مرز ۱۰۰ پرواز رد شد', tone: 'gold' });
  else if (fdps.length >= 50) achievements.push({ id: 'fdp50', emoji: '🚀', title: 'پنجاه پرواز', subtitle: 'نیمهٔ راه صد پرواز', tone: 'silver' });
  else if (fdps.length >= 10) achievements.push({ id: 'fdp10', emoji: '✈️', title: 'ده پرواز', subtitle: 'شروع خوبی است', tone: 'bronze' });

  if (airports.size >= 15) achievements.push({ id: 'globe15', emoji: '🌍', title: 'جهانگرد', subtitle: `${toFaDigits(airports.size)} فرودگاه مختلف`, tone: 'gold' });
  else if (airports.size >= 5) achievements.push({ id: 'globe5', emoji: '🗺️', title: 'مسافر', subtitle: `${toFaDigits(airports.size)} فرودگاه مختلف`, tone: 'silver' });

  if (longestRest && longestRest.hours >= 72) achievements.push({ id: 'rest72', emoji: '🛌', title: 'استراحت طولانی', subtitle: `${toFaDigits(Math.floor(longestRest.hours))}h یک‌ سره`, tone: 'silver' });

  return {
    uniqueDestinations: destinations.size,
    uniqueAirports: airports.size,
    topRoutes,
    busiestMonth,
    longestRest,
    weekdayCounts: weekday,
    achievements,
  };
}

function AnimatedNumber({ to, className, pad2 }: { to: number; className?: string; pad2?: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(Math.round(to * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  const s = pad2 ? String(n).padStart(2, '0') : String(n);
  return <span className={className}>{toFaDigits(s)}</span>;
}

function HeroPill({ label, enLabel, value, icon: Icon, accent }: {
  label: string; enLabel: string; value: number; icon: typeof Plane; accent: string;
}) {
  return (
    <div className="relative bg-white/10 backdrop-blur-md rounded-xl px-2.5 py-2 ring-1 ring-white/15 overflow-hidden">
      <div className={`absolute -top-4 -right-4 w-14 h-14 rounded-full bg-gradient-to-br ${accent} opacity-30 blur-xl`} />
      <div className="relative flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${accent} grid place-items-center shadow-md shrink-0`}>
          <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.6} />
        </div>
        <div className="leading-tight min-w-0">
          <AnimatedNumber to={value} className="text-[18px] font-black tabular-nums leading-none block" />
          <div className="text-[10px] opacity-75 leading-tight font-bold truncate">{label}</div>
          <div className="text-[9px] opacity-50 leading-none tracking-wider uppercase">{enLabel}</div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-muted rounded-xl px-3 py-2.5">
      <div className="text-[10.5px] opacity-65 font-bold mb-0.5">{label}</div>
      <div className="text-[20px] font-black tabular-nums leading-none">{toFaDigits(value)}</div>
      {hint && <div className="text-[10px] opacity-50 mt-1">{hint}</div>}
    </div>
  );
}

function SectionHead({ icon: Icon, title }: { icon: typeof Trophy; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
      <Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
      {title}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface rounded-3xl p-6 text-center text-slate-900 dark:text-slate-100">
      <div className="text-[40px] mb-2">📊</div>
      <div className="text-[14px] font-extrabold mb-1">آماری برای نمایش نداریم — هنوز</div>
      <div className="text-[12px] opacity-70 leading-relaxed">
        پس از اولین ایمپورت روستر در تب «برنامهٔ من»، آمار خودکار اینجا ساخته می‌شود.
      </div>
    </div>
  );
}
