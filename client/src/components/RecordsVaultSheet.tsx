import { useMemo } from 'react';
import { Archive, Download, X } from 'lucide-react';
import {
  exportVaultCsv, listVault, summarizeVault, downloadBlob,
} from '../lib/recordsVault';
import { cn, toFaDigits } from '../lib/utils';

interface Props {
  crewCode: string;
  onClose: () => void;
}

export function RecordsVaultSheet({ crewCode, onClose }: Props) {
  const summary = useMemo(() => summarizeVault(crewCode), [crewCode]);
  const records = useMemo(() => listVault(crewCode), [crewCode]);

  const onCsv = () => {
    const csv = exportVaultCsv(crewCode);
    downloadBlob(`IRCrew_Vault_${crewCode}_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv;charset=utf-8');
  };

  return (
    <div className="fixed inset-0 z-50 grid items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-rise" />
      <div
        className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise text-slate-900 dark:text-slate-100 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2 sticky top-0 backdrop-blur-xl bg-white/85 dark:bg-slate-950/85 z-10">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto absolute right-1/2 translate-x-1/2 top-2" />
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-700 grid place-items-center shrink-0">
            <Archive className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 pt-1">
            <div className="text-[15px] font-extrabold">گنجینهٔ ۲۴ ماهه (OM-A 7.5)</div>
            <div className="text-[11px] opacity-65">سابقهٔ کامل FTL شما — قابل خروجی CSV</div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Stat label="مجموع رکورد"      value={toFaDigits(summary.totalEntries)} />
            <Stat label="پرواز"             value={toFaDigits(summary.fdpCount)} />
            <Stat label="ساعت Block"        value={toFaDigits(summary.totalBlockHours.toFixed(1))} />
            <Stat label="ساعت Duty"          value={toFaDigits(summary.totalDutyHours.toFixed(1))} />
            <Stat label="روز Off"           value={toFaDigits(summary.dayOffCount)} />
            <Stat label="Reserve"           value={toFaDigits(summary.reserveCount)} />
          </div>

          {summary.earliestIso && summary.latestIso && (
            <div className="text-[11px] opacity-65 text-center mb-3 tabular-nums">
              از {new Date(summary.earliestIso).toLocaleDateString('fa-IR')}{' '}
              تا {new Date(summary.latestIso).toLocaleDateString('fa-IR')}
            </div>
          )}

          <button
            onClick={onCsv}
            disabled={records.length === 0}
            className={cn(
              'w-full rounded-xl py-3 text-[13px] font-extrabold text-white flex items-center justify-center gap-2',
              records.length === 0 ? 'bg-slate-300 dark:bg-slate-700' : 'bg-gradient-to-br from-brand-500 to-brand-800 active:scale-[0.98]',
            )}
          >
            <Download className="w-4 h-4" strokeWidth={2.6} />
            خروجی CSV کامل
          </button>

          <div className="mt-4 text-[12px] font-bold opacity-75 mb-2">آخرین ۱۰ رویداد</div>
          <div className="space-y-1.5">
            {records.slice(-10).reverse().map((r) => (
              <div key={r.id} className="flex items-center gap-2 surface-muted rounded-lg px-2.5 py-1.5 text-[12px]">
                <span className="font-extrabold opacity-80 uppercase tracking-wider tabular-nums">{r.kind}</span>
                <span className="opacity-60 tabular-nums">{r.start.slice(0, 16).replace('T', ' ')}</span>
                <span className="flex-1 truncate text-left" dir="ltr">{r.note}</span>
              </div>
            ))}
            {records.length === 0 && (
              <div className="text-center text-[12px] opacity-60 py-4">
                هنوز رکوردی ذخیره نشده. در تب «سابقه» یک ماه را ایمپورت کنید.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-muted rounded-xl px-3 py-2.5">
      <div className="text-[10px] opacity-60 font-bold tracking-wider mb-0.5">{label}</div>
      <div className="text-[18px] font-black tabular-nums leading-none">{value}</div>
    </div>
  );
}
