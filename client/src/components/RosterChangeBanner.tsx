import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, GitCompare, Check, ChevronDown } from 'lucide-react';
import {
  loadChanges, markSeen, type StoredChangeBatch,
} from '../lib/rosterChangeNotifier';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  crewCode: string;
  period: string;
  /** Forces a reload of the stored batch — bumped by the parent each time it
   *  finishes a roster fetch + audit, so a newly-recorded batch shows up
   *  immediately without waiting for a re-mount. */
  bumpToken: number;
}

export function RosterChangeBanner({ crewCode, period, bumpToken }: Props) {
  const [batch, setBatch] = useState<StoredChangeBatch | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!period) { setBatch(null); return; }
    setBatch(loadChanges(crewCode, period));
  }, [crewCode, period, bumpToken]);

  if (!batch || batch.seen) return null;

  const critical = batch.changes.filter((c) => c.exceeds90Min).length;
  const minor = batch.changes.length - critical;
  const totalLabel = toFaDigits(batch.changes.length);

  const acknowledge = () => {
    markSeen(crewCode, period);
    setBatch((b) => (b ? { ...b, seen: true } : b));
  };

  return (
    <div className="rounded-3xl overflow-hidden mb-3 animate-spring ring-1 ring-amber-400/40 shadow-xl shadow-amber-900/15" dir="rtl">
      {/* Strip — sun-warm gradient so it pops above everything else */}
      <div className="relative bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white p-3.5">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-yellow-300/30 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-rose-300/25 blur-2xl pointer-events-none" />

        <div className="relative flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shrink-0 ring-1 ring-white/25 animate-pulse">
            <Bell className="w-5 h-5 text-white" strokeWidth={2.6} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] opacity-85 font-bold tracking-[0.15em] uppercase">روستر تغییر کرد</div>
            <div className="text-[13.5px] font-extrabold leading-tight truncate">
              {totalLabel} مورد جدید از آخرین بازدید شما
            </div>
          </div>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="w-9 h-9 grid place-items-center rounded-xl bg-white/15 hover:bg-white/25 ring-1 ring-white/20 active:scale-95 shrink-0"
            aria-label={expanded ? 'بستن' : 'بازکردن'}
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>

        <div className="relative flex flex-wrap gap-1.5 mt-2.5">
          {critical > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-white/20 ring-1 ring-white/25 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" strokeWidth={2.6} />
              بحرانی <span className="tabular-nums">{toFaDigits(critical)}</span>
            </span>
          )}
          {minor > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-white/15 ring-1 ring-white/20 rounded-full px-2 py-0.5">
              <GitCompare className="w-3 h-3" strokeWidth={2.6} />
              جزئی <span className="tabular-nums">{toFaDigits(minor)}</span>
            </span>
          )}
          <span className="inline-flex items-center text-[11px] opacity-80 mr-auto">
            ثبت‌شده در {new Date(batch.recordedAt).toLocaleString('fa-IR', {
              hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Detail list */}
      <div className={cn('grid transition-all duration-300 ease-out bg-white dark:bg-slate-900',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="p-3 space-y-1.5">
            {batch.changes.slice(0, 12).map((c) => (
              <div
                key={c.rowKey + c.kind}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-slate-900 dark:text-slate-100',
                  c.exceeds90Min
                    ? 'bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-300/40'
                    : 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-300/40',
                )}
              >
                <div className="font-extrabold">{c.message}</div>
                <div className="opacity-65 text-[10px] tabular-nums tracking-wider mt-0.5">OM-A {c.reference}</div>
              </div>
            ))}
            {batch.changes.length > 12 && (
              <div className="text-[11px] text-center opacity-60 text-slate-900 dark:text-slate-100">
                و {toFaDigits(batch.changes.length - 12)} مورد دیگر
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acknowledge button — always visible */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={acknowledge}
          className="w-full h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white font-extrabold text-[13px] active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/20"
        >
          <Check className="w-4 h-4" strokeWidth={2.6} />
          خواندم — این تغییرات را دیدم
        </button>
      </div>
    </div>
  );
}
