import { useState } from 'react';
import { WifiOff, Wifi, ShieldCheck } from 'lucide-react';
import type { Credentials } from '../lib/types';
import { ConnectSheet } from './ConnectSheet';

interface Props {
  /** Tab-specific copy so the prompt reads naturally inside each empty state. */
  feature: 'roster' | 'flightcrew';
  onConnected: (creds: Credentials) => void;
}

const COPY: Record<Props['feature'], { title: string; body: string }> = {
  roster: {
    title: 'برای نمایش برنامهٔ ماهانه، اتصال نیاز است',
    body: 'در حالت آفلاین ابزار «بررسی FTL» در دسترس است. هر زمان وصل شدید، برنامهٔ ماهانهٔ شما از سرور Iran Air بارگذاری می‌شود.',
  },
  flightcrew: {
    title: 'برای دیدن خدمهٔ پرواز، اتصال لازم است',
    body: 'این بخش به‌صورت لحظه‌ای از سامانهٔ Iran Air می‌خواند. در حالت آفلاین کار نمی‌کند، اما تب «بررسی FTL» همچنان کاملاً قابل استفاده است.',
  },
};

export function OfflineConnectPrompt({ feature, onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const c = COPY[feature];
  return (
    <div className="surface rounded-3xl p-5 mt-4 animate-rise text-slate-900 dark:text-slate-100" dir="rtl">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400/25 to-amber-600/15 grid place-items-center shrink-0 ring-1 ring-amber-500/30">
          <WifiOff className="w-5 h-5 text-amber-700 dark:text-amber-300" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-extrabold leading-tight">{c.title}</div>
          <div className="text-[11.5px] opacity-65 mt-0.5">حالت آفلاین فعال است</div>
        </div>
      </div>

      <p className="text-[12.5px] leading-relaxed opacity-85 mb-3">{c.body}</p>

      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white font-extrabold py-3 text-[14px] shadow-lg shadow-brand-900/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 ring-1 ring-white/15"
      >
        <Wifi className="w-4 h-4" strokeWidth={2.6} />
        اتصال به سرور Iran Air
      </button>

      <div className="text-[10.5px] opacity-55 text-center mt-2 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3 h-3" />
        داده‌های شما فقط روی همین دستگاه ذخیره می‌شود
      </div>

      {open && (
        <ConnectSheet
          onClose={() => setOpen(false)}
          onConnected={(c) => { setOpen(false); onConnected(c); }}
        />
      )}
    </div>
  );
}
