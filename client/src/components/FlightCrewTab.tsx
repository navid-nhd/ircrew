import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, Plane, RefreshCw, Users, AlertTriangle, Loader2, ChevronDown, WifiOff } from 'lucide-react';
import { api } from '../lib/api';
import type {
  Credentials, CrewResponse, FlightRow, FlightsResponse,
} from '../lib/types';
import { cn, formatJalaliFull, weekdayFa, jalaliFromIso } from '../lib/utils';
import { CrewList } from './CrewList';
import { PersianDatePickerSheet } from './PersianDatePickerSheet';
import { todayIso } from '../lib/utils';

interface Props {
  creds: Credentials;
}

const WEEKDAY_FROM_ISO_EN = (iso: string): string => {
  if (!iso) return '';
  const dt = new Date(iso + 'T00:00:00Z');
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()];
};

export function FlightCrewTab({ creds }: Props) {
  const [date, setDate] = useState<string>(todayIso());
  const [showPicker, setShowPicker] = useState(false);
  const [flights, setFlights] = useState<FlightsResponse | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [crewMap, setCrewMap] = useState<Record<number, { data?: CrewResponse; loading: boolean; err?: string; startedAt?: number }>>({});
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [staleNote, setStaleNote] = useState<{ when: number } | null>(null);

  // Monotonic sequence so an out-of-order resolve (slow first request finishing
  // after a fast second one) cannot overwrite the visible state with stale data.
  const seqRef = useRef(0);

  useEffect(() => {
    const mySeq = ++seqRef.current;
    const ctrl = new AbortController();
    (async () => {
      setLoadingFlights(true); setErr(null);
      // Wipe per-flight crew state AND the visible flight list — the new date's
      // row indices reference a different set of flights, and we don't want the
      // user to see the previous date's list lingering under an error message.
      setExpandedIdx(null); setCrewMap({}); setStaleNote(null);
      setFlights(null);
      try {
        const r = await api.flightsOnDate(creds, date, {
          signal: ctrl.signal, forceFresh: refreshTick > 0,
        });
        if (mySeq !== seqRef.current) return;
        setFlights(r.data);
        if (r.stale) setStaleNote({ when: r.storedAt ?? Date.now() });
      } catch (e) {
        if (mySeq !== seqRef.current) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setErr(e instanceof Error ? e.message : 'خطا در دریافت پروازها.');
      } finally {
        if (mySeq === seqRef.current) setLoadingFlights(false);
      }
    })();
    return () => ctrl.abort();
  }, [date, creds, refreshTick]);

  const expandFlight = async (row: FlightRow) => {
    if (!row._eventTarget) return;
    if (expandedIdx === row._rowIndex) { setExpandedIdx(null); return; }
    setExpandedIdx(row._rowIndex);
    if (crewMap[row._rowIndex]?.data) return;
    setCrewMap((m) => ({ ...m, [row._rowIndex]: { loading: true, startedAt: Date.now() } }));
    try {
      const r = await api.crewOnFlight(creds, date, row._eventTarget, row._eventArgument || '');
      setCrewMap((m) => ({ ...m, [row._rowIndex]: { data: r.data, loading: false } }));
    } catch (e) {
      setCrewMap((m) => ({ ...m, [row._rowIndex]: { loading: false, err: e instanceof Error ? e.message : 'خطا' } }));
    }
  };

  const flightHeaders = flights?.headers ?? [];
  const fltNoKey   = useMemo(() => flightHeaders.find((h) => /flt|flight/i.test(h)) ?? 'FltNo', [flightHeaders]);
  const depKey     = useMemo(() => flightHeaders.find((h) => /^dep$/i.test(h) || /from|origin/i.test(h)) ?? 'Dep', [flightHeaders]);
  const arrKey     = useMemo(() => flightHeaders.find((h) => /^arr$/i.test(h) || /to|dest/i.test(h)) ?? 'Arr', [flightHeaders]);
  // Real upstream uses DepT/DepL (UTC/Local). Match those + any "DepTime"/"STD" variants.
  const depTimeKey = useMemo(() => flightHeaders.find((h) => /dep.*time|^std$|^dept$|^dep[lt]$/i.test(h)) ?? 'DepTime', [flightHeaders]);
  const arrTimeKey = useMemo(() => flightHeaders.find((h) => /arr.*time|^sta$|^arrt$|^arr[lt]$/i.test(h)) ?? 'ArrTime', [flightHeaders]);
  // Real upstream uses just "Type" for aircraft type.
  const acTypeKey  = useMemo(() => flightHeaders.find((h) => /ac.*type|aircraft|^type$/i.test(h)) ?? 'ACType', [flightHeaders]);

  const jalaliLong = formatJalaliFull(date);
  const wdEn = WEEKDAY_FROM_ISO_EN(date);
  const wdFa = weekdayFa(wdEn);
  const jal = jalaliFromIso(date);

  return (
    <section className="pt-3">
      <button
        onClick={() => setShowPicker(true)}
        className="w-full surface rounded-2xl p-4 flex items-center gap-3 text-right active:scale-[0.99] transition-transform mb-3"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 grid place-items-center shadow-md shadow-brand-900/20 shrink-0">
          <CalendarIcon className="w-5 h-5 text-white" strokeWidth={2.4} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] opacity-60 leading-none mb-1">تاریخ انتخاب‌شده</div>
          <div className="text-[15px] font-extrabold truncate">
            {wdFa} · {jalaliLong}
          </div>
          <div className="text-[11px] opacity-50 tabular-nums truncate mt-0.5">
            {date} · {jal.jy}/{String(jal.jm).padStart(2,'0')}/{String(jal.jd).padStart(2,'0')}
          </div>
        </div>
        <ChevronDown className="w-4 h-4 opacity-60" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-1">
          <Plane className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
          <h2 className="text-[12px] font-extrabold opacity-80">پروازهای این روز</h2>
          {flights && <span className="text-[12px] opacity-60 tabular-nums">({flights.flights.length})</span>}
        </div>
        <button
          onClick={() => setRefreshTick((t) => t + 1)}
          aria-label="بازخوانی"
          className={cn('w-9 h-9 grid place-items-center rounded-xl surface active:scale-95 transition-all', loadingFlights && 'opacity-60')}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loadingFlights && 'animate-spin')} />
        </button>
      </div>

      {err && (
        <div className="surface rounded-xl px-3 py-3 mb-3 text-[13px] text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {staleNote && !err && (
        <div className="surface rounded-xl px-3 py-2 mb-3 text-[12px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5" />
          <span>نمایش داده‌های ذخیره‌شده — سرور در دسترس نیست.</span>
          <span className="opacity-60 tabular-nums mr-auto">{new Date(staleNote.when).toLocaleTimeString('fa-IR')}</span>
        </div>
      )}

      {loadingFlights ? (
        <div>
          <div className="space-y-2 mb-3">
            {[0,1,2].map((i) => <div key={i} className="skeleton h-[72px]" />)}
          </div>
          <div className="text-[11px] text-center opacity-60 font-semibold">
            در حال دریافت لیست پروازها از سرور Iran Air…
          </div>
        </div>
      ) : flights && flights.flights.length > 0 ? (
        <div className="space-y-2.5">
          {flights.flights.map((f) => {
            const isOpen = expandedIdx === f._rowIndex;
            const c = crewMap[f._rowIndex];
            const dep = String(f[depKey] ?? '—');
            const arr = String(f[arrKey] ?? '—');
            const dt  = String(f[depTimeKey] ?? '');
            const at  = String(f[arrTimeKey] ?? '');
            const fltNo = String(f[fltNoKey] ?? '');
            const acType = String(f[acTypeKey] ?? '');

            return (
              <div key={f._rowIndex} className="surface rounded-2xl overflow-hidden animate-rise">
                <button
                  onClick={() => expandFlight(f)}
                  disabled={!f._eventTarget}
                  className="w-full text-right p-3 flex items-center gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-700/10 grid place-items-center shrink-0">
                    <Plane className="w-5 h-5 text-emerald-700 dark:text-emerald-400 -scale-x-100" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0" dir="ltr">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[14px] font-extrabold tabular-nums">{fltNo}</span>
                      {acType && <span className="text-[11px] opacity-70 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5">{acType}</span>}
                    </div>
                    <div className="text-[12px] opacity-90 tabular-nums flex items-center gap-1.5 font-semibold">
                      <span>{dep}</span>
                      <span className="opacity-50">{dt}</span>
                      <Plane className="w-3 h-3 opacity-40 -scale-x-100" />
                      <span>{arr}</span>
                      <span className="opacity-50">{at}</span>
                    </div>
                  </div>
                  <div className="w-9 h-9 grid place-items-center rounded-full bg-slate-100 dark:bg-slate-800 shrink-0">
                    <ChevronDown
                      className={cn('w-4 h-4 transition-transform duration-300', isOpen && 'rotate-180')}
                      strokeWidth={2.4}
                    />
                  </div>
                </button>

                <div className={cn(
                  'grid transition-all duration-300 ease-out',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}>
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 my-2 text-[12px] font-bold opacity-70">
                        <Users className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        خدمهٔ پرواز
                        {c?.data && <span className="opacity-50 font-normal">({c.data.crew.length})</span>}
                      </div>
                      {c?.loading && (
                        <SlowLoad startedAt={c.startedAt} message="در حال دریافت لیست خدمه…" slowMessage="شبکه کند است، در حال تلاش مجدد…" />
                      )}
                      {c?.err && (
                        <div className="text-[12px] text-red-600 dark:text-red-400 flex items-center gap-1.5 py-2">
                          <AlertTriangle className="w-3.5 h-3.5" />{c.err}
                        </div>
                      )}
                      {c?.data && !c.loading && !c.err && (
                        <CrewList crew={c.data.crew} headers={c.data.headers} dense />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : flights ? (
        <div className="surface rounded-2xl p-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
          هیچ پروازی برای این روز ثبت نشده است.
        </div>
      ) : null}

      {showPicker && (
        <PersianDatePickerSheet
          iso={date}
          onClose={() => setShowPicker(false)}
          onPick={(iso) => { setDate(iso); setShowPicker(false); }}
        />
      )}
    </section>
  );
}

function SlowLoad({ startedAt, message, slowMessage }: { startedAt?: number; message: string; slowMessage: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const slow = elapsed >= 6;
  // Use tick to keep React subscribed to timer; not consumed in render directly
  void tick;
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-slate-500 dark:text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <div className="text-[11px] font-semibold text-center">
        {slow ? slowMessage : message}
        {elapsed > 0 && <span className="opacity-50 tabular-nums tracking-wider mr-1.5">· {elapsed}s</span>}
      </div>
    </div>
  );
}

