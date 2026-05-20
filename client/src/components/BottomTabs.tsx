import { CalendarRange, Users, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'roster' | 'flightcrew' | 'ftl';

export function BottomTabs({
  current, onChange,
}: { current: Tab; onChange: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; sub: string; icon: typeof CalendarRange }> = [
    { key: 'roster',     label: 'برنامهٔ من',     sub: 'My Roster',     icon: CalendarRange },
    { key: 'flightcrew', label: 'پرواز و خدمه',  sub: 'Flights & Crew', icon: Users },
    { key: 'ftl',        label: 'بررسی FTL',     sub: 'FTL Checker',   icon: ShieldCheck },
  ];
  const idx = items.findIndex((i) => i.key === current);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 pointer-events-none">
      <div className="mx-auto max-w-screen-sm px-3 pb-safe pointer-events-auto">
        {/* Solid translucent background (no backdrop-filter) so it reads
            correctly on Android WebView which doesn't always honour blur. */}
        <div className="relative rounded-2xl mb-2 mx-1 flex items-stretch overflow-hidden bg-white/95 dark:bg-slate-900/95 border border-slate-200/70 dark:border-slate-700/50 shadow-[0_-4px_24px_-8px_rgba(15,23,42,0.18)] dark:shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.6)]">
          {/* Sliding active indicator */}
          <div
            className="absolute top-1 bottom-1 rounded-xl bg-gradient-to-br from-brand-400/30 via-brand-500/30 to-brand-700/30 ring-1 ring-brand-500/50 shadow-lg shadow-brand-900/25 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              width: `calc(${100 / items.length}% - 8px)`,
              // The flex row is RTL, so item 0 (roster) is on the RIGHT.
              // Position indicator from the right edge to match the visual order.
              right: `calc(${(idx * 100) / items.length}% + 4px)`,
            }}
          />
          {items.map(({ key, label, sub, icon: Icon }) => {
            const active = current === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={cn(
                  'relative flex-1 py-2.5 grid place-items-center gap-0.5 transition-colors duration-300',
                  active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400',
                )}
              >
                <Icon
                  className={cn(
                    'w-[19px] h-[19px] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    active ? 'scale-110 drop-shadow' : 'scale-100',
                  )}
                  strokeWidth={active ? 2.6 : 2}
                />
                <span className={cn('text-[12px] font-extrabold leading-tight', active && 'text-gradient-brand')}>
                  {label}
                </span>
                <span className="text-[10px] opacity-50 leading-none tracking-wider">{sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
