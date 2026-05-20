import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, Plane, ShieldCheck, AlertTriangle } from 'lucide-react';
import { activationStore, isValidCode } from '../lib/activation';

interface Props {
  onActivated: () => void;
}

export function ActivationScreen({ onActivated }: Props) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setErr('کد را وارد کنید.'); return; }
    setErr(null);
    setChecking(true);
    try {
      const ok = await isValidCode(code);
      if (!ok) {
        setErr('کد فعال‌سازی نامعتبر است.');
        return;
      }
      activationStore.save(code.trim().toUpperCase());
      onActivated();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="relative min-h-full grid place-items-center px-5 py-8 overflow-hidden" dir="rtl">
      {/* Aurora background — matches LoginScreen style for continuity */}
      <div className="absolute inset-0 -z-10 pointer-events-none aurora opacity-90" />
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[-20%] right-[-25%] w-[80vw] h-[80vw] rounded-full bg-gradient-to-br from-brand-400/40 to-brand-700/30 blur-3xl animate-float" />
        <div className="absolute bottom-[-25%] left-[-25%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-tr from-amber-300/30 to-rose-400/30 blur-3xl animate-float" style={{ animationDelay: '-2.5s' }} />
      </div>

      <div className="w-full max-w-sm animate-spring">
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <div className="absolute -inset-3 bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 rounded-[2rem] blur-xl opacity-65 animate-pulse-glow-em" />
            <div className="relative w-[72px] h-[72px] rounded-[1.4rem] bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 grid place-items-center shadow-2xl shadow-brand-900/50 ring-1 ring-white/30">
              <ShieldCheck className="w-9 h-9 text-white drop-shadow-lg" strokeWidth={2.4} />
            </div>
          </div>
          <h1 className="text-[24px] font-black tracking-tight mt-5 mb-1 text-gradient-brand">
            فعال‌سازی برنامه
          </h1>
          <p className="text-[12px] text-slate-600 dark:text-slate-400 text-center max-w-[300px] leading-relaxed font-semibold">
            کد فعال‌سازی را از سازندهٔ برنامه دریافت کنید. این کار فقط یک بار روی این دستگاه لازم است.
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass rounded-3xl p-5 space-y-4 shimmer-sweep">
          <div>
            <label className="text-[12px] font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
              کد فعال‌سازی <span className="opacity-50 text-[11px] font-normal">Activation Code</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600/70 dark:text-brand-400/70" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                className="w-full bg-white/65 dark:bg-slate-800/45 backdrop-blur rounded-xl pr-10 pl-3 py-3 text-[17px] tracking-[0.3em] uppercase tabular-nums font-bold outline-none focus:ring-2 focus:ring-brand-500/50 focus:bg-white/80 dark:focus:bg-slate-800/60 border border-white/50 dark:border-slate-700/40 transition-all text-slate-900 dark:text-slate-100"
                placeholder="ABCD-EFGH"
                dir="ltr"
              />
            </div>
            <p className="text-[10.5px] opacity-60 mt-1.5 text-center">
              ۸ کاراکتر — خط تیره اختیاری است
            </p>
          </div>

          {err && (
            <div className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3 py-2 backdrop-blur flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="flex-1 leading-relaxed">{err}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={checking}
            className="relative w-full rounded-xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 text-white font-extrabold py-3.5 text-[15px] shadow-xl shadow-brand-900/40 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:active:scale-100 grid place-items-center ring-1 ring-white/20 animate-gradient overflow-hidden shimmer-sweep"
          >
            {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : 'فعال‌سازی'}
          </button>

          <div className="flex items-center gap-2 pt-2 text-[10.5px] opacity-60 text-center">
            <Plane className="w-3 h-3 -scale-x-100 shrink-0" />
            <span className="flex-1 leading-relaxed">
              این کد فقط یک بار روی این دستگاه وارد می‌شود — پس از آن نیازی به وارد کردن دوباره نیست.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
