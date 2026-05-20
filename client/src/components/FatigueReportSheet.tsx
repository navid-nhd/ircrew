import { useState } from 'react';
import { FileText, Download, Copy, X, Check } from 'lucide-react';
import {
  buildFatigueReportPdf, downloadFatigueReportPdf, renderFatigueReportText,
  type FatigueReason, type FatigueReportInput, reasonLabel,
} from '../lib/fatigueReport';

interface Props {
  /** Initial values seeded from the FTL engine output / active candidate. */
  initial: Partial<FatigueReportInput> & { crewCode: string };
  onClose: () => void;
}

const REASONS: FatigueReason[] = [
  'commander-discretion', 'unfit-to-fly', 'short-rest',
  'roster-overload', 'standby-abuse', 'other',
];

export function FatigueReportSheet({ initial, onClose }: Props) {
  const [data, setData] = useState<FatigueReportInput>({
    crewCode: initial.crewCode,
    crewName: initial.crewName ?? '',
    crewRole: initial.crewRole ?? '',
    contactEmail: initial.contactEmail ?? '',
    flightNo: initial.flightNo ?? '',
    flightDateIso: initial.flightDateIso ?? new Date().toISOString(),
    depStation: initial.depStation ?? '',
    arrStation: initial.arrStation ?? '',
    fdpHHMM: initial.fdpHHMM ?? '',
    reason: initial.reason ?? 'commander-discretion',
    detail: initial.detail ?? '',
    fdpCapHHMM: initial.fdpCapHHMM,
    restAvailableHours: initial.restAvailableHours,
    restRequiredHours: initial.restRequiredHours,
    woclEncroachmentHours: initial.woclEncroachmentHours,
    cdUsedMinutes: initial.cdUsedMinutes,
  });
  const [copied, setCopied] = useState(false);

  const update = <K extends keyof FatigueReportInput>(k: K, v: FatigueReportInput[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderFatigueReportText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const onPreview = () => {
    const blob = buildFatigueReportPdf(data);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-fuchsia-700 grid place-items-center shrink-0">
            <FileText className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 pt-1">
            <div className="text-[15px] font-extrabold">گزارش خستگی (Fatigue Report)</div>
            <div className="text-[11px] opacity-65">طبق OM-A 7.1.1 / 7.3.x / 7.7 — قابل ایمیل به FS&OS</div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 space-y-4">
          <Field label="نوع گزارش">
            <select
              value={data.reason}
              onChange={(e) => update('reason', e.target.value as FatigueReason)}
              className="w-full bg-white/70 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40"
            >
              {REASONS.map((r) => <option key={r} value={r}>{reasonLabel(r)}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="کد خدمه">
              <Input value={data.crewCode} onChange={(v) => update('crewCode', v)} dir="ltr" upper />
            </Field>
            <Field label="نام و نام‌خانوادگی">
              <Input value={data.crewName ?? ''} onChange={(v) => update('crewName', v)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="نقش">
              <Input value={data.crewRole ?? ''} onChange={(v) => update('crewRole', v)} placeholder="مهماندار / کاپیتان" />
            </Field>
            <Field label="ایمیل تماس">
              <Input value={data.contactEmail ?? ''} onChange={(v) => update('contactEmail', v)} dir="ltr" placeholder="you@example.com" />
            </Field>
          </div>

          <Divider label="پرواز / رویداد" />

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="پرواز">
              <Input value={data.flightNo ?? ''} onChange={(v) => update('flightNo', v)} dir="ltr" upper />
            </Field>
            <Field label="مبدأ">
              <Input value={data.depStation ?? ''} onChange={(v) => update('depStation', v.toUpperCase())} dir="ltr" upper />
            </Field>
            <Field label="مقصد">
              <Input value={data.arrStation ?? ''} onChange={(v) => update('arrStation', v.toUpperCase())} dir="ltr" upper />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="طول FDP (HH:MM)">
              <Input value={data.fdpHHMM ?? ''} onChange={(v) => update('fdpHHMM', v)} dir="ltr" placeholder="12:30" />
            </Field>
            <Field label="سقف FDP">
              <Input value={data.fdpCapHHMM ?? ''} onChange={(v) => update('fdpCapHHMM', v)} dir="ltr" placeholder="13:00" />
            </Field>
            <Field label="CD (دقیقه)">
              <Input
                value={data.cdUsedMinutes != null ? String(data.cdUsedMinutes) : ''}
                onChange={(v) => update('cdUsedMinutes', v ? Number(v) : undefined)}
                dir="ltr" placeholder="60"
              />
            </Field>
          </div>

          <Field label="شرح رویداد">
            <textarea
              value={data.detail}
              onChange={(e) => update('detail', e.target.value)}
              rows={5}
              className="w-full bg-white/70 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40 leading-relaxed"
              placeholder="مثال: پرواز IR707 با ۴ سکتور و WOCL ۳ ساعت پوشش داده شد. قبل از پرواز فقط ۱۰ ساعت Rest داشتم..."
            />
          </Field>
        </div>

        <div className="px-5 pb-3 grid grid-cols-3 gap-2 sticky bottom-0 backdrop-blur-xl bg-white/85 dark:bg-slate-950/85 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onCopy}
            className="rounded-xl py-2.5 text-[12px] font-bold flex items-center justify-center gap-1.5 surface-muted active:scale-[0.99]"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'کپی شد' : 'کپی متن'}
          </button>
          <button
            onClick={onPreview}
            className="rounded-xl py-2.5 text-[12px] font-bold flex items-center justify-center gap-1.5 surface-muted active:scale-[0.99]"
          >
            پیش‌نمایش PDF
          </button>
          <button
            onClick={() => downloadFatigueReportPdf(data)}
            className="rounded-xl py-2.5 text-[12px] font-extrabold text-white bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2.6} />
            دانلود PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11.5px] font-bold mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function Input({ value, onChange, dir, upper, placeholder }: {
  value: string; onChange: (v: string) => void;
  dir?: 'ltr' | 'rtl'; upper?: boolean; placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
      dir={dir}
      placeholder={placeholder}
      className="w-full bg-white/70 dark:bg-slate-800/60 rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40"
    />
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      <span className="text-[11px] font-bold opacity-65">{label}</span>
      <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
