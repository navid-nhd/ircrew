import { cn } from '../lib/utils';
import { classifyPosition } from '../lib/positions';

function makeInitials(src: string): string {
  const cleaned = src.replace(/[().,\d]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '–';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export function CrewList({ crew, headers, dense = false }: {
  crew: Array<Record<string, string>>;
  headers: string[];
  dense?: boolean;
}) {
  if (!crew.length) {
    return (
      <div className="text-center text-[12px] text-slate-500 dark:text-slate-400 py-6">
        No crew listed.
      </div>
    );
  }
  const codeKey = headers.find((h) => /^code$|crew/i.test(h)) ?? headers[0];
  const nameKey = headers.find((h) => /name/i.test(h));
  const posKey  = headers.find((h) => /pos|role|rank|duty/i.test(h));

  return (
    <div className={cn(dense ? 'space-y-1.5' : 'space-y-2')} dir="ltr">
      {crew.map((row, i) => {
        const code = row[codeKey] ?? '';
        const name = nameKey ? row[nameKey] : '';
        const pos  = (posKey ? row[posKey] : '') ?? '';
        const info = classifyPosition(pos);
        const t = info.theme;
        const initials = makeInitials(name || code);
        return (
          <div
            key={i}
            className={cn(
              'flex items-center gap-3 surface-muted rounded-xl animate-rise',
              dense ? 'p-2' : 'p-2.5',
            )}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className={cn(
              'shrink-0 rounded-full text-white font-extrabold grid place-items-center shadow-md ring-2 ring-white/40 tracking-wider',
              dense ? 'w-9 h-9 text-[12px]' : 'w-11 h-11 text-[13px]',
              t.bg,
            )}>
              {initials || '–'}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('font-bold truncate', dense ? 'text-[13px]' : 'text-[14px]')}>
                {name || code}
              </div>
              <div className={cn('truncate font-semibold mt-0.5 flex items-baseline gap-1.5', t.text, dense ? 'text-[11px]' : 'text-[12px]')} dir="rtl">
                <span>{info.labelFa}</span>
                <span className="opacity-50 text-[10px] tracking-wider" dir="ltr">{info.labelEn}</span>
              </div>
            </div>
            {pos && (
              <span className={cn(
                'text-[11px] font-extrabold tracking-[0.1em] rounded-md px-2 py-1 ring-1',
                t.text, t.ring,
              )}>
                {pos.toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
