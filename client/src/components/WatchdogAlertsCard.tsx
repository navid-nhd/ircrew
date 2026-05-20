import { ShieldAlert, AlertTriangle, Info, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { WatchdogAlert } from '../lib/watchdogs';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  alerts: WatchdogAlert[];
  /** When set, hidden alerts are revealed; otherwise we show only the top 3. */
  startExpanded?: boolean;
}

const SEV: Record<WatchdogAlert['severity'], { fa: string; cls: string; ring: string; tint: string; Icon: typeof ShieldAlert }> = {
  critical: { fa: 'بحرانی',  cls: 'text-rose-700 dark:text-rose-200',     ring: 'ring-rose-300/40 dark:ring-rose-700/40',     tint: 'bg-rose-50/80 dark:bg-rose-950/30',     Icon: ShieldAlert },
  warn:     { fa: 'هشدار',  cls: 'text-amber-700 dark:text-amber-200',   ring: 'ring-amber-300/40 dark:ring-amber-700/40',   tint: 'bg-amber-50/80 dark:bg-amber-950/30',   Icon: AlertTriangle },
  info:     { fa: 'اطلاع',  cls: 'text-sky-700 dark:text-sky-200',       ring: 'ring-sky-300/40 dark:ring-sky-700/40',       tint: 'bg-sky-50/80 dark:bg-sky-950/30',       Icon: Info },
};

export function WatchdogAlertsCard({ alerts, startExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(startExpanded);
  if (alerts.length === 0) return null;
  const visible = expanded ? alerts : alerts.slice(0, 3);
  const tally = {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warn:     alerts.filter((a) => a.severity === 'warn').length,
    info:     alerts.filter((a) => a.severity === 'info').length,
  };
  return (
    <div className="surface rounded-2xl overflow-hidden animate-rise text-slate-900 dark:text-slate-100" dir="rtl">
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-fuchsia-700 grid place-items-center shrink-0">
            <ShieldAlert className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-extrabold leading-tight">هشدارهای ایمنی FTL</div>
            <div className="text-[11px] opacity-65 leading-tight mt-0.5">
              {toFaDigits(alerts.length)} مورد شناسایی شد طبق OM-A فصل ۷
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tally.critical > 0 && <Tally fa="بحرانی" n={tally.critical} sev="critical" />}
          {tally.warn > 0 && <Tally fa="هشدار" n={tally.warn} sev="warn" />}
          {tally.info > 0 && <Tally fa="اطلاع" n={tally.info} sev="info" />}
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {visible.map((a) => {
          const meta = SEV[a.severity];
          const Icon = meta.Icon;
          return (
            <div key={a.id} className={cn('p-3 flex items-start gap-3', meta.tint)}>
              <div className={cn('w-8 h-8 rounded-lg grid place-items-center shrink-0 ring-1', meta.tint, meta.ring)}>
                <Icon className={cn('w-4 h-4', meta.cls)} strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[13px] font-extrabold flex-1 truncate">{a.title}</span>
                  <span className="text-[10px] font-extrabold opacity-65 tabular-nums tracking-wider shrink-0">
                    OM-A {a.reference}
                  </span>
                </div>
                <p className="text-[11.5px] leading-relaxed opacity-85">{a.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > 3 && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="w-full p-2.5 text-[12px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-center gap-1.5"
        >
          {expanded ? 'بستن' : `نمایش ${toFaDigits(alerts.length - 3)} مورد دیگر`}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}

function Tally({ fa, n, sev }: { fa: string; n: number; sev: WatchdogAlert['severity'] }) {
  const m = SEV[sev];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-extrabold rounded-full px-2 py-0.5 ring-1', m.tint, m.cls, m.ring)}>
      {fa}
      <span className="tabular-nums opacity-80">{toFaDigits(n)}</span>
    </span>
  );
}
