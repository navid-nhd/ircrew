import { GitCompare, AlertTriangle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { RosterAuditResult } from '../lib/rosterAudit';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  audit: RosterAuditResult | null;
}

export function RosterAuditCard({ audit }: Props) {
  const [open, setOpen] = useState(true);
  if (!audit) return null;
  const { publicationViolation, changes, hadPrevious } = audit;
  if (!publicationViolation && changes.length === 0) return null;

  const critical = changes.filter((c) => c.exceeds90Min).length;
  const minor = changes.length - critical;

  return (
    <div className="surface rounded-2xl overflow-hidden text-slate-900 dark:text-slate-100 mt-3 animate-rise" dir="rtl">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full p-3 flex items-center gap-2.5 text-right"
      >
        <div className={cn(
          'w-9 h-9 rounded-xl grid place-items-center shrink-0',
          (critical > 0 || publicationViolation) ? 'bg-rose-500/15' : 'bg-amber-500/15',
        )}>
          {(critical > 0 || publicationViolation)
            ? <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-300" strokeWidth={2.4} />
            : <GitCompare className="w-4 h-4 text-amber-700 dark:text-amber-300" strokeWidth={2.4} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold truncate">بازرس روستر</div>
          <div className="text-[10.5px] opacity-65 tabular-nums">
            {publicationViolation && `انتشار دیر · `}
            {hadPrevious ? `${toFaDigits(changes.length)} تغییر شناسایی شد` : 'اولین snapshot ذخیره شد'}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>

      <div className={cn('grid transition-all duration-300', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {publicationViolation && (
              <div className="rounded-lg bg-rose-50/80 dark:bg-rose-950/30 ring-1 ring-rose-300/40 px-3 py-2 text-[11.5px] text-rose-800 dark:text-rose-200">
                <div className="font-extrabold mb-0.5">انتشار روستر کمتر از ۱۴ روز قبل از ماه</div>
                <div className="opacity-85 leading-relaxed">
                  شروع دوره: {publicationViolation.periodStart} · فاصله: {toFaDigits(publicationViolation.daysBeforeMonth)} روز
                  <br />طبق OM-A 7.1.2.1 این مغایرت قابل اعتراض رسمی است.
                </div>
              </div>
            )}
            {changes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {critical > 0 && <Chip fa="بحرانی" n={critical} sev="critical" />}
                {minor > 0 && <Chip fa="جزئی" n={minor} sev="minor" />}
              </div>
            )}
            <div className="space-y-1.5">
              {changes.slice(0, 8).map((c) => (
                <div key={c.rowKey} className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[11.5px] leading-relaxed',
                  c.exceeds90Min ? 'bg-rose-50/70 dark:bg-rose-950/30' : 'bg-amber-50/60 dark:bg-amber-950/30',
                )}>
                  <div className="font-extrabold">{c.message}</div>
                  <div className="opacity-65 text-[10px] tabular-nums tracking-wider mt-0.5">OM-A {c.reference}</div>
                </div>
              ))}
              {changes.length > 8 && (
                <div className="text-[11px] text-center opacity-60">و {toFaDigits(changes.length - 8)} مورد دیگر</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ fa, n, sev }: { fa: string; n: number; sev: 'critical' | 'minor' }) {
  const cls = sev === 'critical'
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
  return (
    <span className={cn('text-[11px] font-extrabold rounded-full px-2 py-0.5', cls)}>
      {fa} <span className="tabular-nums opacity-80">{toFaDigits(n)}</span>
    </span>
  );
}
