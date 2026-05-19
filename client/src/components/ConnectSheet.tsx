import { useState, type FormEvent } from 'react';
import { KeyRound, User, Loader2, X, Wifi, AlertTriangle, WifiOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Credentials } from '../lib/types';
import { cn } from '../lib/utils';

interface Props {
  onClose: () => void;
  onConnected: (creds: Credentials) => void;
  /** Optional pre-fill (e.g., last-used code) so the user doesn't retype. */
  initialCode?: string;
}

// Reconnect / first-connect bottom sheet. Used by:
//   • Header "اتصال به سرور" badge when running in offline mode
//   • The two online-only tabs (Roster, Flights & Crew) when offline
// It performs a real api.login and only resolves on success — the parent then
// flips the app out of offline mode.
export function ConnectSheet({ onClose, onConnected, initialCode = '' }: Props) {
  const [code, setCode] = useState(initialCode);
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code || !pass) { setErr('کد و رمز را وارد کنید.'); return; }
    setErr(null);
    setLoading(true);
    try {
      const c: Credentials = { code: code.trim().toUpperCase(), pass: pass.trim() };
      await api.login(c);
      onConnected(c);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setErr(e.kind === 'auth' ? 'کد یا رمز نادرست است.' : e.message);
      } else {
        setErr(e instanceof Error ? e.message : 'اتصال ناموفق بود.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-rise" />
      <div
        className="relative surface rounded-t-3xl max-w-screen-sm w-full mx-auto pb-safe animate-rise text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto absolute right-1/2 translate-x-1/2 top-2" />
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 grid place-items-center shrink-0">
            <Wifi className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex-1 pt-1">
            <div className="text-[15px] font-extrabold">اتصال به سرور Iran Air</div>
            <div className="text-[11.5px] opacity-65">با کد و رمز کرو وارد شوید تا داده‌های لحظه‌ای فعال شود</div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-3 space-y-3">
          <div>
            <label className="text-[12px] font-bold mb-1.5 block">
              کد خدمه <span className="opacity-50 text-[11px] font-normal">Crew Code</span>
            </label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600/70" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                className="w-full bg-white/60 dark:bg-slate-800/40 backdrop-blur rounded-xl pr-10 pl-3 py-2.5 text-[15px] tracking-[0.3em] uppercase tabular-nums font-bold outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/70 dark:border-slate-700/40"
                placeholder="ABCD" dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-bold mb-1.5 block">
              رمز عبور <span className="opacity-50 text-[11px] font-normal">Crew Pass</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600/70" />
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                maxLength={8} autoComplete="current-password" inputMode="numeric"
                className="w-full bg-white/60 dark:bg-slate-800/40 backdrop-blur rounded-xl pr-10 pl-3 py-2.5 text-[15px] tracking-[0.5em] tabular-nums font-bold outline-none focus:ring-2 focus:ring-brand-500/50 border border-slate-200/70 dark:border-slate-700/40"
                placeholder="••••" dir="ltr"
              />
            </div>
          </div>

          {err && (
            <div className="text-[12px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-900/40 rounded-xl px-3 py-2 flex items-start gap-2">
              {err.includes('نادرست') ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              <span className="flex-1 leading-relaxed">{err}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full rounded-xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 text-white font-extrabold py-3 text-[14px] shadow-lg shadow-brand-900/30 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:active:scale-100 grid place-items-center ring-1 ring-white/20',
            )}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'اتصال و فعال‌سازی داده‌های لحظه‌ای'}
          </button>
        </form>
      </div>
    </div>
  );
}
