// "ابزارها" sub-tab — single home for every standalone OM-A calculator and the
// PDF/CSV exporters. Each card is collapsible so the whole tab stays scannable
// on a phone. Mobile-first vertical stack; cards keep their own state.

import { useMemo, useState } from 'react';
import {
  Wrench, ChevronDown, Coffee, Plane, Users,
  Moon, FileText, Archive, ShieldCheck, Sunrise, Clock,
} from 'lucide-react';
import type { Credentials } from '../lib/types';
import type { CrewProfile } from '../ftl/rules/types';
import { resolveAcclimatization, acclLabelFa, type AcclState } from '../lib/acclimatization';
import { projectWoclForDay } from '../lib/wocl';
import { computeCabinReportWindow } from '../lib/cabinReport';
import { planInflightRest, fleetLabelFa, type Fleet } from '../lib/inflightRest';
import { splitAugmentedRest } from '../lib/augRestSplit';
import { checkCrewMeals } from '../lib/crewMeal';
import { DEFAULT_PROTECTED_SLEEP } from '../lib/reserveGuard';
import { FatigueReportSheet } from './FatigueReportSheet';
import { RecordsVaultSheet } from './RecordsVaultSheet';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  creds: Credentials;
  profile: CrewProfile;
}

export function Toolbox({ creds, profile }: Props) {
  const [showFatigue, setShowFatigue] = useState(false);
  const [showVault, setShowVault] = useState(false);

  return (
    <div className="space-y-3" dir="rtl">
      <div className="surface rounded-2xl p-3.5 flex items-center gap-2.5 animate-rise text-slate-900 dark:text-slate-100">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 grid place-items-center shrink-0">
          <Wrench className="w-4.5 h-4.5 text-white" strokeWidth={2.6} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold leading-tight">جعبه‌ابزار FTL</div>
          <div className="text-[11px] opacity-65 leading-tight mt-0.5">
            تمام محاسبه‌گرها و خروجی‌های مبتنی بر OM-A فصل ۷
          </div>
        </div>
      </div>

      {/* Primary actions (most-asked-for) */}
      <div className="grid grid-cols-2 gap-2">
        <ActionTile
          icon={FileText} fa="ساخت Fatigue Report"
          sub="PDF آماده برای FS&OS"
          onClick={() => setShowFatigue(true)}
          tone="from-rose-500 to-fuchsia-700"
        />
        <ActionTile
          icon={Archive} fa="گنجینهٔ ۲۴ ماهه"
          sub="خروجی CSV کامل"
          onClick={() => setShowVault(true)}
          tone="from-amber-500 to-orange-700"
        />
      </div>

      {/* Calculator cards */}
      <ToolCard icon={Sunrise} fa="ردیاب Acclimatization (B/D/X)"
        ref_="OM-A 7.1.3 + Table 7.1">
        <AcclimCalculator />
      </ToolCard>

      <ToolCard icon={Moon} fa="نمایش پنجرهٔ WOCL" ref_="OM-A 7.1.3">
        <WoclCalculator />
      </ToolCard>

      <ToolCard icon={Coffee} fa="محاسبه‌گر ریپورت زودتر کابین" ref_="OM-A 7.1.4.6">
        <CabinReportCalculator />
      </ToolCard>

      <ToolCard icon={Plane} fa="برنامه‌ریز In-flight Rest" ref_="OM-A 7.1.4.8 / 7.1.4.8.1 + Table 7.6">
        <IfrPlannerCalculator profile={profile} />
      </ToolCard>

      <ToolCard icon={Users} fa="تقسیم Rest بین گروه‌های Augmented" ref_="OM-A 7.1.4.8">
        <AugSplitCalculator profile={profile} />
      </ToolCard>

      <ToolCard icon={Coffee} fa="مراقب وعدهٔ غذایی" ref_="OM-A 7.6">
        <CrewMealCalculator />
      </ToolCard>

      <ToolCard icon={ShieldCheck} fa="پنجرهٔ خواب رزرو (پیش‌فرض)" ref_="OM-A 7.4.3">
        <ReserveSleepCalculator />
      </ToolCard>

      {showFatigue && (
        <FatigueReportSheet
          initial={{ crewCode: creds.code, crewRole: profile.role === 'cabin' ? 'مهماندار' : 'خلبان' }}
          onClose={() => setShowFatigue(false)}
        />
      )}
      {showVault && (
        <RecordsVaultSheet crewCode={creds.code} onClose={() => setShowVault(false)} />
      )}
    </div>
  );
}

function ActionTile({ icon: Icon, fa, sub, tone, onClick }: {
  icon: typeof FileText; fa: string; sub: string; tone: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-2xl p-3 text-white text-right active:scale-[0.98] transition-transform',
        `bg-gradient-to-br ${tone} shadow-md`,
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" strokeWidth={2.6} />
        <span className="text-[12.5px] font-extrabold flex-1">{fa}</span>
      </div>
      <div className="text-[10.5px] opacity-90">{sub}</div>
    </button>
  );
}

function ToolCard({ icon: Icon, fa, ref_, children, defaultOpen = false }: {
  icon: typeof Clock; fa: string; ref_: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="surface rounded-2xl overflow-hidden text-slate-900 dark:text-slate-100">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full p-3 flex items-center gap-2.5 text-right"
      >
        <div className="w-9 h-9 rounded-xl bg-brand-500/15 grid place-items-center shrink-0">
          <Icon className="w-4 h-4 text-brand-700 dark:text-brand-300" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold truncate">{fa}</div>
          <div className="text-[10.5px] opacity-60 tabular-nums tracking-wider">{ref_}</div>
        </div>
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      <div className={cn('grid transition-all duration-300', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── Individual calculator widgets ─────────

function AcclimCalculator() {
  const [tz, setTz] = useState(6);
  const [elapsed, setElapsed] = useState(72);
  const res = useMemo(() => {
    const proposed = new Date().toISOString();
    const lastDuty = {
      id: 'mock', kind: 'fdp' as const,
      start: new Date(Date.now() - elapsed * 3600_000).toISOString(),
      end: new Date(Date.now() - elapsed * 3600_000).toISOString(),
    };
    return resolveAcclimatization(proposed, lastDuty, tz);
  }, [tz, elapsed]);
  return (
    <div className="space-y-2.5 text-[12px]">
      <NumberRow label="ΔTZ از مبدأ تا مقصد (ساعت)" value={tz} onChange={setTz} min={0} max={14} />
      <NumberRow label="گذشته از پایان Duty قبلی (ساعت)" value={elapsed} onChange={setElapsed} min={0} max={200} />
      <StateBadge state={res.state} />
      <div className="text-[11.5px] opacity-75 leading-relaxed">{res.reason}</div>
    </div>
  );
}

function WoclCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [state, setState] = useState<AcclState>('B');
  const [tz, setTz] = useState(0);
  const bands = useMemo(() => projectWoclForDay(date, state, tz), [date, state, tz]);
  return (
    <div className="space-y-2.5 text-[12px]">
      <label className="block">
        <div className="text-[11px] font-bold mb-1">تاریخ</div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr"
          className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="text-[11px] font-bold mb-1">وضعیت Acclim</div>
          <select value={state} onChange={(e) => setState(e.target.value as AcclState)}
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40">
            <option value="B">B — مبدأ</option>
            <option value="D">D — مقصد</option>
            <option value="X">X — نامعلوم</option>
          </select>
        </label>
        <NumberRow label="ΔTZ" value={tz} onChange={setTz} min={-12} max={12} />
      </div>
      <div className="space-y-1.5">
        {bands.map((b, i) => (
          <div key={i} className="surface-muted rounded-lg p-2 text-[11.5px]" dir="ltr">
            <span className="opacity-60 mr-1">{b.frame}:</span>
            {new Date(b.startIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            {' → '}
            {new Date(b.endIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CabinReportCalculator() {
  const [cockpit, setCockpit] = useState(() => {
    const d = new Date(); d.setHours(8, 0, 0, 0); return d.toISOString().slice(0, 16);
  });
  const [early, setEarly] = useState(45);
  const [cap, setCap] = useState('13:00');
  const plan = useMemo(() => computeCabinReportWindow(
    new Date(cockpit).toISOString(), early, cap,
  ), [cockpit, early, cap]);
  return (
    <div className="space-y-2.5 text-[12px]">
      <label className="block">
        <div className="text-[11px] font-bold mb-1">ریپورت کاکپیت</div>
        <input type="datetime-local" value={cockpit} onChange={(e) => setCockpit(e.target.value)} dir="ltr"
          className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <NumberRow label="کابین چقدر زودتر؟ (دقیقه)" value={early} onChange={setEarly} min={0} max={120} />
        <label className="block">
          <div className="text-[11px] font-bold mb-1">سقف FDP کاکپیت</div>
          <input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="13:00" dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
      </div>
      <ResultGrid items={[
        ['ریپورت کابین',     new Date(plan.cabinReportIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })],
        ['FDP مؤثر کابین',   plan.cabinFdpLengthHHMM],
        ['آخرین Block-on',    new Date(plan.cabinBlockOnIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })],
        ['Check-out',         new Date(plan.cabinCheckoutIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })],
      ]} />
      <div className="text-[11px] opacity-75">{plan.note}</div>
    </div>
  );
}

function IfrPlannerCalculator({ profile }: { profile: CrewProfile }) {
  const now = new Date();
  const [etd, setEtd] = useState(() => { const d = new Date(now); d.setHours(9, 0, 0, 0); return d.toISOString().slice(0, 16); });
  const [eta, setEta] = useState(() => { const d = new Date(now); d.setHours(17, 0, 0, 0); return d.toISOString().slice(0, 16); });
  const [groups, setGroups] = useState<1 | 2 | 3>(2);
  const [fleet, setFleet] = useState<Fleet>('A330-zoneA');
  const plan = useMemo(() => planInflightRest({
    etdIso: new Date(etd).toISOString(),
    etaIso: new Date(eta).toISOString(),
    groupCount: groups, fleet,
  }), [etd, eta, groups, fleet]);
  void profile;
  return (
    <div className="space-y-2.5 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><div className="text-[11px] font-bold mb-1">Block-off</div>
          <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">Block-on</div>
          <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><div className="text-[11px] font-bold mb-1">تعداد گروه</div>
          <select value={groups} onChange={(e) => setGroups(Number(e.target.value) as 1 | 2 | 3)}
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40">
            <option value={1}>۱</option><option value={2}>۲</option><option value={3}>۳</option>
          </select>
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">هواپیما</div>
          <select value={fleet} onChange={(e) => setFleet(e.target.value as Fleet)}
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40">
            {(['A330-zoneA','B747-upperDeck','Bunk-Class1','unknown'] as Fleet[]).map(f => (
              <option key={f} value={f}>{fleetLabelFa[f]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="surface-muted rounded-lg p-2 space-y-1.5 text-[11.5px]" dir="ltr">
        <div className="text-right text-[11px] opacity-65">Class {plan.facilityClass} · window {Math.floor(plan.windowMinutes / 60)}h {plan.windowMinutes % 60}min</div>
        {plan.groups.map((g) => (
          <div key={g.groupIndex} className="flex items-center justify-between font-bold">
            <span className="opacity-60">G{g.groupIndex}</span>
            <span>
              {new Date(g.restStartIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {new Date(g.restEndIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="tabular-nums">{toFaDigits(g.restMinutes)}m</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] opacity-75">{plan.note}</div>
    </div>
  );
}

function AugSplitCalculator({ profile }: { profile: CrewProfile }) {
  const now = new Date();
  const [start, setStart] = useState(() => { const d = new Date(now); d.setHours(10, 0, 0, 0); return d.toISOString().slice(0, 16); });
  const [end, setEnd] = useState(() => { const d = new Date(now); d.setHours(16, 0, 0, 0); return d.toISOString().slice(0, 16); });
  const [groups, setGroups] = useState<2 | 3>(2);
  const [cls, setCls] = useState<1 | 2 | 3>(2);
  const [fdp, setFdp] = useState('15:00');
  const isCabin = profile.role === 'cabin';
  const res = useMemo(() => splitAugmentedRest({
    earliestRestStartIso: new Date(start).toISOString(),
    latestRestEndIso: new Date(end).toISOString(),
    groupCount: groups,
    facilityClass: cls,
    fdpHHMM: fdp,
    isCabin,
  }), [start, end, groups, cls, fdp, isCabin]);
  return (
    <div className="space-y-2.5 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><div className="text-[11px] font-bold mb-1">شروع پنجره</div>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">پایان پنجره</div>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block"><div className="text-[11px] font-bold mb-1">گروه</div>
          <select value={groups} onChange={(e) => setGroups(Number(e.target.value) as 2 | 3)}
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40">
            <option value={2}>۲</option><option value={3}>۳</option>
          </select>
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">Class</div>
          <select value={cls} onChange={(e) => setCls(Number(e.target.value) as 1 | 2 | 3)}
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40">
            <option value={1}>۱</option><option value={2}>۲</option><option value={3}>۳</option>
          </select>
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">FDP</div>
          <input value={fdp} onChange={(e) => setFdp(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
      </div>
      <div className="surface-muted rounded-lg p-2 space-y-1 text-[11.5px]" dir="ltr">
        {res.groups.map((g) => (
          <div key={g.index} className="flex items-center justify-between">
            <span className="opacity-60">G{g.index}</span>
            <span className="font-bold">
              {new Date(g.startIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {new Date(g.endIso).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="tabular-nums">{toFaDigits(g.minutes)}m</span>
          </div>
        ))}
      </div>
      <div className={cn('text-[11px] leading-relaxed', res.meetsTable76 ? 'opacity-75' : 'text-rose-700 dark:text-rose-300 font-bold')}>{res.note}</div>
    </div>
  );
}

function CrewMealCalculator() {
  const [start, setStart] = useState(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d.toISOString().slice(0, 16); });
  const [end, setEnd] = useState(() => { const d = new Date(); d.setHours(19, 0, 0, 0); return d.toISOString().slice(0, 16); });
  const res = useMemo(() => checkCrewMeals({
    id: 'mock', kind: 'fdp',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  }), [start, end]);
  return (
    <div className="space-y-2.5 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><div className="text-[11px] font-bold mb-1">شروع FDP</div>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">پایان FDP</div>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
      </div>
      {res.needsMeal && res.suggestedMealSlots.length > 0 && (
        <div className="surface-muted rounded-lg p-2 text-[11.5px]" dir="ltr">
          <div className="text-right text-[11px] opacity-65 mb-1">زمان‌های پیشنهادی وعدهٔ غذا</div>
          {res.suggestedMealSlots.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="opacity-60">#{i + 1}</span>
              <span className="font-bold">{new Date(s).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
      <div className={cn('text-[11px] leading-relaxed', res.violation && 'text-rose-700 dark:text-rose-300 font-bold')}>{res.note}</div>
    </div>
  );
}

function ReserveSleepCalculator() {
  const [start, setStart] = useState(DEFAULT_PROTECTED_SLEEP.startLocalHHMM);
  const [end, setEnd] = useState(DEFAULT_PROTECTED_SLEEP.endLocalHHMM);
  return (
    <div className="space-y-2.5 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><div className="text-[11px] font-bold mb-1">شروع خواب محافظت‌شده</div>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
        <label className="block"><div className="text-[11px] font-bold mb-1">پایان خواب محافظت‌شده</div>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr"
            className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40" />
        </label>
      </div>
      <div className="surface-muted rounded-lg p-2.5 text-[11.5px] leading-relaxed">
        طبق OM-A 7.4.3 شما در پنجرهٔ <b dir="ltr">{start}–{end}</b> حق ۸ ساعت خواب محافظت‌شده دارید.
        هر تماس همای داخل این پنجره — مگر مأموریت اضطراری — مستندسازی می‌شود.
        برای ثبت تماس‌ها از صفحهٔ گزارش خستگی استفاده کنید.
      </div>
    </div>
  );
}

// ───────── shared atoms ─────────

function NumberRow({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold mb-1">{label}</div>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        dir="ltr"
        className="w-full bg-white/70 dark:bg-slate-800/60 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40 tabular-nums" />
    </label>
  );
}

function ResultGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="surface-muted rounded-lg px-2.5 py-1.5">
          <div className="text-[10px] opacity-60 font-bold">{k}</div>
          <div className="text-[13px] font-extrabold tabular-nums" dir="ltr">{v}</div>
        </div>
      ))}
    </div>
  );
}

function StateBadge({ state }: { state: AcclState }) {
  const tone = state === 'B' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
    : state === 'D' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-extrabold', tone)}>
      <Sunrise className="w-3.5 h-3.5" strokeWidth={2.6} />
      {acclLabelFa(state)}
    </div>
  );
}
