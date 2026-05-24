import { CalendarRange, Users, ShieldCheck, BarChart3, Wrench } from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'roster' | 'flightcrew' | 'ftl' | 'stats' | 'tools';

export function BottomTabs({
  current, onChange,
}: { current: Tab; onChange: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; icon: typeof CalendarRange }> = [
    { key: 'roster',     label: 'برنامه',       icon: CalendarRange },
    { key: 'flightcrew', label: 'پرواز و خدمه', icon: Users },
    { key: 'ftl',        label: 'FTL',           icon: ShieldCheck },
    { key: 'tools',      label: 'ابزارها',      icon: Wrench },
    { key: 'stats',      label: 'آمار',          icon: BarChart3 },
  ];
  const idx = items.findIndex((i) => i.key === current);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 pointer-events-none">
      <div className="mx-auto max-w-screen-sm px-3 pb-safe pointer-events-auto">
        <div
          className={cn(
            'relative rounded-2xl mb-2 mx-1 flex items-stretch overflow-hidden',
            'bg-white/97 dark:bg-slate-900/97',
            'border border-slate-200/80 dark:border-slate-700/60',
            'shadow-[0_-6px_28px_-10px_rgba(15,23,42,0.22)] dark:shadow-[0_-6px_28px_-10px_rgba(0,0,0,0.7)]',
          )}
        >
          {/* Sliding active indicator — uses solid emerald tint so it stands out on the white nav. */}
          <div
            className={cn(
              'absolute top-1 bottom-1 rounded-xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              'bg-gradient-to-br from-brand-500/12 via-brand-500/14 to-brand-700/12',
              'ring-1 ring-brand-500/30',
            )}
            style={{
              width: `calc(${100 / items.length}% - 8px)`,
              right: `calc(${(idx * 100) / items.length}% + 4px)`,
            }}
          />
          {items.map(({ key, label, icon: Icon }) => {
            const active = current === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                aria-label={label}
                className={cn(
                  // Slightly taller for thumb-friendly hit targets.
                  'relative flex-1 min-h-[58px] grid place-items-center gap-1 py-2 transition-colors duration-300',
                  active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400',
                )}
              >
                <Icon
                  className={cn(
                    // Larger 22px icons read clearly on phone screens.
                    'w-[22px] h-[22px] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    active ? 'scale-110 drop-shadow' : 'scale-100',
                  )}
                  strokeWidth={active ? 2.7 : 2.1}
                />
                <span
                  className={cn(
                    'text-[11.5px] font-extrabold leading-none tracking-tight',
                    active && 'text-gradient-brand',
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
