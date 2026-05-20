import { useState } from 'react';
import { LogOut, Plane, Settings, Wifi, WifiOff, Sun, Moon, SunMoon } from 'lucide-react';
import { greetingFa } from '../lib/utils';
import { SettingsSheet } from './SettingsSheet';
import { ConnectSheet } from './ConnectSheet';
import { theme, type ThemeMode } from '../lib/theme';
import type { Credentials } from '../lib/types';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
};

const MODE_ICON = { auto: SunMoon, light: Sun, dark: Moon };
const MODE_LABEL: Record<ThemeMode, string> = {
  auto: 'حالت خودکار',
  light: 'حالت روشن',
  dark: 'حالت تاریک',
};

export function Header({ crewCode, honorific, onLogout, offline, onReconnected }: {
  crewCode: string;
  /** Persian honorific derived from the user's own roster position. Optional —
   *  we show the crew code only when we can't infer a role yet. */
  honorific?: string;
  onLogout: () => void;
  /** True when the session is offline (FTL-only). */
  offline?: boolean;
  /** Called when the user successfully signs in via the inline ConnectSheet. */
  onReconnected?: (c: Credentials) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => theme.get());

  const cycleTheme = () => {
    const next = NEXT_MODE[themeMode];
    setThemeMode(next);
    theme.set(next);
  };
  const ThemeIcon = MODE_ICON[themeMode];

  // Consistent square icon button — 38×38 (large enough for thumb taps on
  // mobile, small enough to keep the header compact).
  const iconBtn =
    'w-9 h-9 grid place-items-center rounded-xl bg-white/85 dark:bg-slate-800/70 ' +
    'border border-slate-200/70 dark:border-slate-700/60 ' +
    'shadow-sm transition-all active:scale-95';

  return (
    <header className="pt-safe sticky top-0 z-20 bg-white/95 dark:bg-slate-950/95 border-b border-slate-200/60 dark:border-slate-800/60">
      <div className="mx-auto max-w-screen-sm px-3 pt-2.5 pb-2.5 flex items-center gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-br from-brand-400 to-brand-800 rounded-2xl blur-md opacity-45" />
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 grid place-items-center shadow-lg shadow-brand-900/30 ring-1 ring-white/30">
              <Plane className="w-5 h-5 text-white -scale-x-100 drop-shadow" strokeWidth={2.4} />
            </div>
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[11px] opacity-65 font-semibold leading-none mb-0.5 truncate">{greetingFa()}</div>
            <div className="text-[13.5px] font-extrabold tracking-tight truncate">
              {honorific ? <>{honorific} </> : null}
              <span className="text-gradient-brand tabular-nums tracking-wider">{crewCode === 'OFFLINE' ? 'مهمان' : crewCode}</span>
            </div>
          </div>
        </div>
        <div className="flex-1" />

        {offline && (
          <button
            onClick={() => setShowConnect(true)}
            className="h-9 px-2.5 flex items-center gap-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-300/70 dark:border-amber-700/50 text-[11px] font-extrabold active:scale-95 transition-transform shrink-0"
            title="اتصال به سرور"
          >
            <WifiOff className="w-3.5 h-3.5" strokeWidth={2.6} />
            <span>آفلاین</span>
            <span className="opacity-50">·</span>
            <Wifi className="w-3.5 h-3.5" strokeWidth={2.6} />
          </button>
        )}

        <button
          onClick={cycleTheme}
          aria-label={MODE_LABEL[themeMode]}
          title={MODE_LABEL[themeMode]}
          className={iconBtn + ' hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30'}
        >
          <ThemeIcon className="w-4 h-4" strokeWidth={2.2} />
        </button>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="تنظیمات"
          className={iconBtn + ' hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/30'}
        >
          <Settings className="w-4 h-4" strokeWidth={2.2} />
        </button>
        <button
          onClick={onLogout}
          aria-label="خروج"
          className={iconBtn + ' hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40'}
        >
          <LogOut className="w-4 h-4" strokeWidth={2.2} />
        </button>
      </div>
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
      {showConnect && (
        <ConnectSheet
          initialCode={crewCode !== 'OFFLINE' ? crewCode : ''}
          onClose={() => setShowConnect(false)}
          onConnected={(c) => { setShowConnect(false); onReconnected?.(c); }}
        />
      )}
    </header>
  );
}
