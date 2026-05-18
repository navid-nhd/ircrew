import { useState, type FormEvent } from 'react';
import { Plane, KeyRound, User, Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import type { Credentials } from '../lib/types';

export function LoginScreen({ onAuth }: { onAuth: (c: Credentials) => void }) {
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code || !pass) { setErr('کد و رمز را وارد کنید.'); return; }
    setErr(null);
    setLoading(true);
    try {
      const c = { code: code.trim().toUpperCase(), pass: pass.trim() };
      await api.login(c);
      onAuth(c);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'ورود ناموفق بود.';
      setErr(msg.includes('Login failed') ? 'کد یا رمز اشتباه است.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-full grid place-items-center px-5 py-8 overflow-hidden">
      {/* Aurora background */}
      <div className="absolute inset-0 -z-10 pointer-events-none aurora opacity-90" />
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[-20%] right-[-25%] w-[80vw] h-[80vw] rounded-full bg-gradient-to-br from-brand-400/40 to-brand-700/30 blur-3xl animate-float" />
        <div className="absolute bottom-[-25%] left-[-25%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-tr from-amber-300/30 to-rose-400/30 blur-3xl animate-float" style={{ animationDelay: '-2.5s' }} />
        <div className="absolute top-[40%] left-[60%] w-[40vw] h-[40vw] rounded-full bg-gradient-to-tr from-violet-400/25 to-sky-400/25 blur-3xl animate-float" style={{ animationDelay: '-4s' }} />
      </div>

      <div className="w-full max-w-sm animate-spring">
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <div className="absolute -inset-3 bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 rounded-[2rem] blur-xl opacity-70 animate-pulse-glow-em" />
            <div className="relative w-[76px] h-[76px] rounded-[1.4rem] bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 grid place-items-center shadow-2xl shadow-brand-900/50 ring-1 ring-white/30 animate-float">
              <Plane className="w-10 h-10 text-white drop-shadow-lg -scale-x-100" strokeWidth={2.2} />
            </div>
          </div>
          <h1 className="text-[28px] font-black tracking-tight mt-6 mb-1 text-gradient-brand">
            آی‌آر کرو
          </h1>
          <p className="text-[12px] text-slate-600 dark:text-slate-400 text-center max-w-[280px] leading-relaxed font-semibold">
            برنامهٔ ماهانهٔ خدمه و خدمهٔ پرواز در یک نگاه
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass rounded-3xl p-5 space-y-4 shimmer-sweep">
          <div>
            <label className="text-[12px] font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
              کد خدمه <span className="opacity-50 text-[11px] font-normal">Crew Code</span>
            </label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600/70 dark:text-brand-400/70" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                className="w-full bg-white/60 dark:bg-slate-800/40 backdrop-blur rounded-xl pr-10 pl-3 py-3 text-[16px] tracking-[0.3em] uppercase tabular-nums font-bold outline-none focus:ring-2 focus:ring-brand-500/50 focus:bg-white/80 dark:focus:bg-slate-800/60 border border-white/50 dark:border-slate-700/40 transition-all"
                placeholder="ABCD"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
              رمز عبور <span className="opacity-50 text-[11px] font-normal">Crew Pass</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600/70 dark:text-brand-400/70" />
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                maxLength={8}
                autoComplete="current-password"
                inputMode="numeric"
                className="w-full bg-white/60 dark:bg-slate-800/40 backdrop-blur rounded-xl pr-10 pl-3 py-3 text-[16px] tracking-[0.5em] tabular-nums font-bold outline-none focus:ring-2 focus:ring-brand-500/50 focus:bg-white/80 dark:focus:bg-slate-800/60 border border-white/50 dark:border-slate-700/40 transition-all"
                placeholder="••••"
                dir="ltr"
              />
            </div>
          </div>

          {err && (
            <div className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3 py-2 backdrop-blur">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="relative w-full rounded-xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 text-white font-extrabold py-3.5 text-[15px] shadow-xl shadow-brand-900/40 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:active:scale-100 grid place-items-center ring-1 ring-white/20 animate-gradient overflow-hidden shimmer-sweep"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ورود به برنامه'}
          </button>

          <div className="flex items-center gap-2 my-1">
            <span className="flex-1 h-px bg-gradient-to-l from-transparent via-slate-300 to-transparent dark:via-slate-600" />
            <span className="text-[11px] opacity-50 font-bold">یا</span>
            <span className="flex-1 h-px bg-gradient-to-l from-transparent via-slate-300 to-transparent dark:via-slate-600" />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => onAuth({ code: 'DEMO', pass: 'DEMO' })}
            className="w-full rounded-xl border-2 border-dashed border-brand-400/60 dark:border-brand-500/60 text-[13px] py-2.5 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 font-extrabold backdrop-blur"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" strokeWidth={2.6} />
            مشاهده با داده‌های نمایشی
          </button>
        </form>

        <p className="text-[11px] text-slate-500 dark:text-slate-500 text-center mt-5 leading-relaxed px-2">
          اطلاعات شما فقط روی همین دستگاه ذخیره می‌شود.
        </p>
      </div>
    </div>
  );
}
