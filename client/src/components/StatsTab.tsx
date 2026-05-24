import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Trophy, Plane, Clock, MapPin, BarChart3, Moon, Calendar, Sparkles, Globe, TrendingUp, PieChart,
} from 'lucide-react';
import type { Credentials } from '../lib/types';
import { listVault, type VaultRecord } from '../lib/recordsVault';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  creds: Credentials;
}

type PeriodKey = 'this_month' | 'last_month' | '3m' | '6m' | 'ytd' | '12m' | '24m' | 'all';

const PERIODS: Array<{ key: PeriodKey; label: string; months: number | null }> = [
  { key: 'this_month', label: 'این ماه',   months: null },
  { key: 'last_month', label: 'ماه قبل',   months: null },
  { key: '3m',         label: '۳ ماهه',    months: 3 },
  { key: '6m',         label: '۶ ماهه',    months: 6 },
  { key: 'ytd',        label: 'از اول سال', months: null },
  { key: '12m',        label: '۱۲ ماهه',   months: 12 },
  { key: '24m',        label: '۲۴ ماهه',   months: 24 },
  { key: 'all',        label: 'همه',       months: null },
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
  const kindSlices = useMemo(() => buildKindBreakdown(records), [records]);

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
        <div className="grid grid-cols-4 gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'rounded-xl py-1.5 text-[11px] font-extrabold transition-all',
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

      {/* KIND BREAKDOWN — donut + legend */}
      {kindSlices.length > 0 && (
        <div className="surface rounded-2xl p-3.5 text-slate-900 dark:text-slate-100 animate-rise">
          <SectionHead icon={PieChart} title="ترکیب ساعت Duty" />
          <div className="mt-3">
            <KindDonut slices={kindSlices} />
          </div>
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

// Filter the vault by the selected period. Rolling N-month windows are
// anchored to the LATEST record so an inactive month doesn't blank the page;
// calendar windows (this_month / last_month / ytd) use the latest record's
// year & month so the user sees data even when they're not flying right now.
function filterByPeriod(records: VaultRecord[], period: PeriodKey): VaultRecord[] {
  if (period === 'all' || records.length === 0) return records;
  const latest = new Date(records[records.length - 1].start);

  if (period === 'this_month') {
    const from = new Date(latest.getFullYear(), latest.getMonth(), 1).getTime();
    const to = new Date(latest.getFullYear(), latest.getMonth() + 1, 1).getTime();
    return records.filter((r) => {
      const t = new Date(r.start).getTime();
      return t >= from && t < to;
    });
  }
  if (period === 'last_month') {
    const from = new Date(latest.getFullYear(), latest.getMonth() - 1, 1).getTime();
    const to = new Date(latest.getFullYear(), latest.getMonth(), 1).getTime();
    return records.filter((r) => {
      const t = new Date(r.start).getTime();
      return t >= from && t < to;
    });
  }
  if (period === 'ytd') {
    const from = new Date(latest.getFullYear(), 0, 1).getTime();
    return records.filter((r) => new Date(r.start).getTime() >= from);
  }

  const months = PERIODS.find((p) => p.key === period)?.months ?? 12;
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

// Build a continuous monthly series so empty months still get a (zero) point.
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
  const earliest = new Date(records[0].start);

  // How many months to render? Calendar-anchored periods get a fixed span,
  // rolling N-month periods get N, "all" walks from the earliest record.
  let monthsBack: number;
  if (period === 'this_month' || period === 'last_month') monthsBack = 1;
  else if (period === 'ytd') monthsBack = latest.getMonth() + 1;
  else if (period === 'all') monthsBack = Math.min(24, monthsBetween(earliest, latest) + 1);
  else monthsBack = PERIODS.find((p) => p.key === period)?.months ?? 12;

  const anchor = period === 'last_month'
    ? new Date(latest.getFullYear(), latest.getMonth() - 1, 1)
    : latest;

  const out: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
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

// Hours-by-kind breakdown for the donut chart. Mirrors summarize but keeps
// each duty category separate.
interface KindSlice { key: string; label: string; hours: number; color: string }
function buildKindBreakdown(records: VaultRecord[]): KindSlice[] {
  const tally = new Map<string, number>();
  for (const r of records) {
    const dur = (new Date(r.end).getTime() - new Date(r.start).getTime()) / 3_600_000;
    if (['fdp', 'positioning', 'training', 'admin', 'airport_sb'].includes(r.kind)) {
      tally.set(r.kind, (tally.get(r.kind) ?? 0) + dur);
    }
  }
  const palette: Record<string, { label: string; color: string }> = {
    fdp:          { label: 'پرواز',       color: '#10B981' },
    positioning:  { label: 'پوزیشن',      color: '#0EA5E9' },
    training:     { label: 'تمرین',       color: '#8B5CF6' },
    admin:        { label: 'اداری',       color: '#F59E0B' },
    airport_sb:   { label: 'استندبای',    color: '#EC4899' },
  };
  return [...tally.entries()]
    .map(([k, h]) => ({ key: k, label: palette[k].label, hours: Math.round(h * 10) / 10, color: palette[k].color }))
    .filter((s) => s.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

const PERSIAN_MONTHS_SHORT = ['ژان', 'فور', 'مار', 'آپر', 'می', 'ژون', 'ژوی', 'آگو', 'سپ', 'اکت', 'نوا', 'دس'];

// Smooth-curve area chart with axis ticks, dots, and dual hover detail.
// Cubic-bezier smoothing makes the trend obvious at a glance, and the
// gradient fill + flight-count bars overlay turn it into a real dashboard
// instead of a flat bar block.
function MonthlyChart({ series }: { series: MonthBucket[] }) {
  const max = Math.max(...series.map((m) => m.hours), 1);
  const maxFlights = Math.max(...series.map((m) => m.flights), 1);
  const [hover, setHover] = useState<number | null>(null);

  // Chart geometry — keep the SVG viewBox in lockstep with the data so the
  // hit-test math (mouse → bucket index) stays trivial.
  const W = Math.max(series.length * 40, 200);
  const H = 160;
  const padL = 28;
  const padR = 8;
  const padT = 18;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = innerW / Math.max(1, series.length - 1);

  const points = series.map((m, i) => ({
    x: padL + i * stepX,
    y: padT + innerH - (m.hours / max) * innerH,
    barH: (m.flights / maxFlights) * innerH * 0.45,
  }));

  // Smooth path via Catmull–Rom → cubic Bézier with a tame tension.
  const pathD = (() => {
    if (points.length < 2) return '';
    const parts: string[] = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const t = 0.22;
      const c1x = p1.x + (p2.x - p0.x) * t;
      const c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t;
      const c2y = p2.y - (p3.y - p1.y) * t;
      parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
    }
    return parts.join(' ');
  })();
  const areaD = pathD ? `${pathD} L ${padL + innerW} ${padT + innerH} L ${padL} ${padT + innerH} Z` : '';

  // Y-axis ticks at 0/25/50/75/100% of max.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((g) => ({
    y: padT + innerH - g * innerH,
    label: Math.round(max * g),
  }));

  // Linear hit-test for hover (mouseover SVG → nearest bucket).
  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W - padL;
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(x / stepX)));
    setHover(idx);
  };

  return (
    <div className="mt-3">
      <div className="relative" style={{ height: H + 8 }} dir="ltr">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full block"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#10B981" stopOpacity="0.55" />
              <stop offset="55%"  stopColor="#10B981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="barFlightGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#0EA5E9" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0369A1" stopOpacity="0.70" />
            </linearGradient>
          </defs>

          {/* y-grid + tick labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={padL + innerW} y1={t.y} y2={t.y}
                stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2,3" />
              <text x={padL - 4} y={t.y + 3} fontSize="8.5" fontWeight="700"
                fill="currentColor" opacity="0.55" textAnchor="end">
                {toFaDigits(String(t.label))}
              </text>
            </g>
          ))}

          {/* flight-count bars (secondary metric, bottom-anchored, light blue) */}
          {points.map((p, i) => (
            <rect key={`b${i}`}
              x={p.x - 5} width={10}
              y={padT + innerH - p.barH}
              height={p.barH}
              rx={2}
              fill="url(#barFlightGrad)"
              opacity={hover === null || hover === i ? 0.85 : 0.35}
            />
          ))}

          {/* smooth area + line */}
          {areaD && <path d={areaD} fill="url(#areaGrad)" />}
          {pathD && <path d={pathD} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}

          {/* data dots */}
          {points.map((p, i) => (
            <g key={`d${i}`}>
              <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3.2}
                fill="#FFFFFF" stroke="#059669" strokeWidth="2" />
            </g>
          ))}

          {/* x-axis month labels */}
          {series.map((m, i) => (
            <text key={`x${i}`}
              x={points[i].x} y={H - 6}
              textAnchor="middle" fontSize="8.5" fontWeight="700"
              fill="currentColor" opacity={hover === i ? 0.95 : 0.55}>
              {m.label}
            </text>
          ))}

          {/* hover vertical guide */}
          {hover !== null && (
            <g>
              <line x1={points[hover].x} x2={points[hover].x}
                y1={padT} y2={padT + innerH}
                stroke="#059669" strokeOpacity="0.45" strokeDasharray="2,3" />
              <circle cx={points[hover].x} cy={points[hover].y} r={6}
                fill="#10B981" fillOpacity="0.3" />
            </g>
          )}
        </svg>
      </div>

      {/* Hover detail strip — empty space takes the same height to avoid layout jumps. */}
      <div className="mt-1 h-5 text-center text-[10.5px] font-extrabold tabular-nums">
        {hover !== null ? (
          <>
            <span className="text-slate-700 dark:text-slate-200">{series[hover].label}</span>
            <span className="opacity-50 mx-1.5">·</span>
            <span className="text-emerald-600 dark:text-emerald-400">{toFaDigits(series[hover].hours.toFixed(1))} ساعت</span>
            <span className="opacity-50 mx-1.5">·</span>
            <span className="text-sky-600 dark:text-sky-400">{toFaDigits(series[hover].flights)} پرواز</span>
          </>
        ) : (
          <span className="opacity-50">روی نمودار حرکت کن</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-1 text-[10px] font-bold opacity-70">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> ساعت پرواز</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-sky-500 inline-block rounded-sm" /> تعداد پرواز</span>
      </div>
    </div>
  );
}

// Donut chart for hours-by-kind. Pure SVG, animated via stroke-dasharray.
function KindDonut({ slices }: { slices: KindSlice[] }) {
  const total = slices.reduce((s, x) => s + x.hours, 0);
  if (total === 0) return null;
  const R = 56;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none"
            stroke="currentColor" strokeOpacity="0.06" strokeWidth="18" />
          {slices.map((s) => {
            const len = (s.hours / total) * C;
            const dash = `${len} ${C - len}`;
            const el = (
              <circle key={s.key}
                cx="70" cy="70" r={R} fill="none"
                stroke={s.color} strokeWidth="18"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center pointer-events-none rotate-0">
          <div className="text-center">
            <div className="text-[20px] font-black leading-none tabular-nums">{toFaDigits(Math.round(total))}</div>
            <div className="text-[9.5px] font-bold opacity-65 mt-0.5">ساعت کل</div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="font-extrabold flex-1 truncate">{s.label}</span>
            <span className="tabular-nums font-bold opacity-80">{toFaDigits(s.hours.toFixed(1))}h</span>
            <span className="tabular-nums opacity-50 text-[10px] w-9 text-left">{toFaDigits(Math.round((s.hours / total) * 100))}٪</span>
          </div>
        ))}
      </div>
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
