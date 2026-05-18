import { useState } from 'react';
import { LogOut, Plane, Settings } from 'lucide-react';
import { greetingFa } from '../lib/utils';
import { SettingsSheet } from './SettingsSheet';

export function Header({ crewCode, honorific, onLogout }: {
  crewCode: string;
  /** Persian honorific derived from the user's own roster position. Optional —
   *  we show the crew code only when we can't infer a role yet. */
  honorific?: string;
  onLogout: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <header className="pt-safe sticky top-0 z-20 backdrop-blur-2xl bg-white/65 dark:bg-slate-950/60 border-b border-slate-200/50 dark:border-slate-800/50">
      <div className="mx-auto max-w-screen-sm px-4 pt-3 pb-3 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-br from-brand-400 to-brand-800 rounded-2xl blur-md opacity-50" />
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 grid place-items-center shadow-lg shadow-brand-900/30 ring-1 ring-white/30">
              <Plane className="w-5 h-5 text-white -scale-x-100 drop-shadow" strokeWidth={2.4} />
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-[12px] opacity-60 font-semibold">{greetingFa()}</div>
            <div className="text-[14px] font-extrabold tracking-tight">
              {honorific ? <>{honorific} </> : null}
              <span className="text-gradient-brand tabular-nums tracking-wider">{crewCode}</span>
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowSettings(true)}
          aria-label="تنظیمات"
          className="w-10 h-10 grid place-items-center rounded-full glass hover:bg-brand-50/70 hover:text-brand-700 dark:hover:bg-brand-950/30 transition-colors active:scale-95"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          onClick={onLogout}
          aria-label="خروج"
          className="w-10 h-10 grid place-items-center rounded-full glass hover:bg-red-50/70 hover:text-red-600 dark:hover:bg-red-950/40 transition-colors active:scale-95"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </header>
  );
}
