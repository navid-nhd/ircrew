import { useState } from 'react';
import { Server, X, Check, RotateCcw } from 'lucide-react';
import { apiBase } from '../lib/api';
import { cache } from '../lib/cache';
import { cn } from '../lib/utils';

interface Props {
  onClose: () => void;
}

// Lightweight bottom-sheet for the handful of settings the bundled Android
// shell needs that the web build doesn't. Right now: the proxy base URL and a
// "clear cached pages" affordance for when the offline copy is stale.
export function SettingsSheet({ onClose }: Props) {
  const [base, setBase] = useState<string>(apiBase.get());
  const [saved, setSaved] = useState(false);

  const save = () => {
    apiBase.set(base);
    setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 z-40 grid items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-rise" />
      <div
        className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto absolute right-1/2 translate-x-1/2 top-2" />
          <Server className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <div className="text-[15px] font-extrabold flex-1">تنظیمات اتصال</div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-2 pb-3 space-y-3">
          <label className="block">
            <div className="text-[12px] font-bold mb-1.5">
              آدرس سرور <span className="opacity-50 font-normal">Proxy URL</span>
            </div>
            <input
              dir="ltr"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="/api  یا  https://your-proxy.example.com/api"
              className="w-full bg-white/70 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/60 dark:border-slate-700/40"
            />
            <div className="text-[11px] opacity-60 mt-1.5 leading-relaxed">
              برای حالت اپ اندرویدی، URL کامل پراکسی میزبانی‌شده را وارد کنید. در حالت وب می‌توانید خالی بگذارید تا از <span className="font-mono">/api</span> استفاده شود.
            </div>
          </label>

          <button
            onClick={() => { cache.invalidate(); apiBase.set(''); setBase(''); }}
            className="w-full surface-muted rounded-xl py-2.5 text-[12px] font-bold flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            پاک کردن کش و بازنشانی آدرس
          </button>
        </div>

        <div className="px-5 pb-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 surface-muted rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.99] transition-transform"
          >
            انصراف
          </button>
          <button
            onClick={save}
            className={cn(
              'flex-1 rounded-xl py-2.5 text-white font-bold text-[13px] active:scale-[0.99] transition-transform flex items-center justify-center gap-1.5',
              saved ? 'bg-emerald-600' : 'bg-gradient-to-br from-brand-600 to-brand-800',
            )}
          >
            {saved ? <><Check className="w-4 h-4" />ذخیره شد</> : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  );
}
