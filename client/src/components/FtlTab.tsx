import { useEffect, useMemo, useState } from 'react';
import HistoryPanel from '../ftl/components/HistoryPanel';
import ProposedFlightPanel from '../ftl/components/ProposedFlight';
import ResultsPanel from '../ftl/components/ResultsPanel';
import CandidateBar from '../ftl/components/CandidateBar';
import { evaluate } from '../ftl/rules/engine';
import type { CrewProfile, DutyEntry, ProposedFlight } from '../ftl/rules/types';
import type { Credentials } from '../lib/types';
import { classifyPosition } from '../lib/positions';
import { AdjacentDuties } from './AdjacentDuties';
import { RosterImport } from './RosterImport';
import { MonthLegalityScan } from './MonthLegalityScan';
import { fdpsToCandidates } from '../lib/dutyToCandidate';
import { Toolbox } from './Toolbox';
import { WatchdogAlertsCard } from './WatchdogAlertsCard';
import { scanForBearTraps } from '../lib/watchdogs';
import { vaultEntries } from '../lib/recordsVault';
import '../ftl/ftl-styles.css';

// All state for the FTL Checker is persisted per crew code so two roles using
// the same device don't clobber each other's history. v4 dropped the synthetic
// default candidate — older payloads are ignored on load so a real-data user
// doesn't inherit yesterday's "پرواز فردا" mock.
const storeKey = (code: string) => `ftl-checker.v4.${code.toUpperCase()}`;
const LEGACY_KEYS = (code: string) => [`ftl-checker.v3.${code.toUpperCase()}`];

const tomorrowAt = (h: number, daysOffset = 1) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

// Blank template used ONLY when the user explicitly taps "افزودن پرواز جدید".
// Never used to populate the initial state so the FTL tab no longer ships
// mock-looking defaults on first open.
const blankProposed = (daysOffset = 1): ProposedFlight => {
  const reportIso = tomorrowAt(8, daysOffset);
  const etdIso = tomorrowAt(9, daysOffset);
  const etaIso = tomorrowAt(13, daysOffset);
  const d = new Date(reportIso);
  return {
    label: '',
    reportingTimeLocal: reportIso,
    estimatedDepartureLocal: etdIso,
    estimatedArrivalLocal: etaIso,
    referenceTimeHHMM: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    sectors: 2,
    scope: 'international',
    body: 'wide',
    departureStation: 'home',
    arrivalStation: 'away',
    augmentedExtraFlightCrew: 0,
    restFacilityClass: 0,
    includesLongSector: false,
    useExtensionNoRest: false,
    useSplitDuty: false,
    splitDutyBreakMin: 180,
    splitDutyAccommodation: 'none',
    acclimState: 'B',
    cabinReportsEarlierByMin: 0,
    woclEncroachmentHours: 0,
    precededByStandbyType: 'none',
    precededByStandbyHours: 0,
    standbyStartedAtNight: false,
    tzDiffHours: 0,
    travellingMinOneWay: 30,
    delayMinutesFromReporting: 0,
    delayNotificationsCount: 0,
    modelCommanderDiscretion: true,
  };
};

const duplicateForNextDay = (c: ProposedFlight): ProposedFlight => {
  const shift = (iso: string | undefined) => {
    if (!iso) return iso;
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  };
  return {
    ...c,
    label: c.label ? `${c.label} — کپی` : '',
    reportingTimeLocal: shift(c.reportingTimeLocal)!,
    estimatedDepartureLocal: shift(c.estimatedDepartureLocal),
    estimatedArrivalLocal: shift(c.estimatedArrivalLocal),
  };
};

type Tab = 'profile' | 'history' | 'flight' | 'results' | 'tools';

interface Props {
  creds: Credentials;
  /** User's position code (e.g. "FA2", "IP"). When known we pre-fill the FTL
   *  profile with the matching role so the user doesn't have to re-enter it. */
  position?: string;
}

export function FtlTab({ creds, position }: Props) {
  const crewCode = creds.code;
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  // Map our IRCrew tier to FTL Checker's `role` field. Pilots → 'flight';
  // anyone else (including unknown) defaults to 'cabin'.
  const initialRole = useMemo<CrewProfile['role']>(() => {
    const tier = classifyPosition(position).tier;
    return tier === 'CAPTAIN' || tier === 'FIRST_OFFICER' || tier === 'INSTRUCTOR' ? 'flight' : 'cabin';
  }, [position]);

  const [profile, setProfile] = useState<CrewProfile>({
    fullName: '', role: initialRole, homeBase: 'THR', hasFRM: false,
  });
  const [history, setHistory] = useState<DutyEntry[]>([]);
  // Start with no candidates — the user either imports real ones from their
  // roster or taps "افزودن" to start a hypothetical evaluation.
  const [candidates, setCandidates] = useState<ProposedFlight[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    try {
      // Discard any legacy stores so the user isn't haunted by the old
      // "پرواز فردا" mock the previous version persisted.
      for (const k of LEGACY_KEYS(crewCode)) localStorage.removeItem(k);

      const raw = localStorage.getItem(storeKey(crewCode));
      if (raw) {
        const s = JSON.parse(raw);
        if (s.profile) setProfile(s.profile);
        if (s.history) setHistory(s.history);
        if (Array.isArray(s.candidates)) {
          setCandidates(s.candidates);
          setActiveIndex(Math.min(s.activeIndex ?? 0, Math.max(0, s.candidates.length - 1)));
        }
      }
    } catch {/* ignore */}
  }, [crewCode]);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(crewCode), JSON.stringify({ profile, history, candidates, activeIndex }));
    } catch {/* ignore */}
  }, [crewCode, profile, history, candidates, activeIndex]);

  const activeCandidate = candidates[activeIndex] ?? candidates[0];
  const hasCandidate = !!activeCandidate;
  const result = useMemo(
    () => hasCandidate
      ? evaluate({ profile, history, proposed: activeCandidate })
      : null,
    [profile, history, activeCandidate, hasCandidate],
  );
  const allResults = useMemo(
    () => candidates.map((c) => evaluate({ profile, history, proposed: c })),
    [profile, history, candidates],
  );

  const updateActive = (next: ProposedFlight) => {
    const arr = [...candidates];
    arr[activeIndex] = next;
    setCandidates(arr);
  };
  const addCandidate = () => {
    const offset = candidates.length + 1;
    setCandidates([...candidates, blankProposed(offset)]);
    setActiveIndex(candidates.length);
  };
  const duplicateCandidate = (i: number) => {
    const dup = duplicateForNextDay(candidates[i]);
    const arr = [...candidates, dup];
    setCandidates(arr);
    setActiveIndex(arr.length - 1);
    setTab('flight');
  };
  const deleteCandidate = (i: number) => {
    const arr = candidates.filter((_, idx) => idx !== i);
    setCandidates(arr);
    if (arr.length === 0) setActiveIndex(0);
    else setActiveIndex(Math.min(activeIndex, arr.length - 1));
  };

  const failCount = result?.checks.filter((c) => c.status === 'fail').length ?? 0;
  const warnCount = result?.checks.filter((c) => c.status === 'warn').length ?? 0;

  // After a successful import, drop the user straight into the flights view
  // with real candidates derived from upcoming FDPs. We also archive everything
  // into the 24-month vault so the user owns the data even if Iran Air's
  // upstream later forgets a flight.
  const onImportHistory = (entries: DutyEntry[], periodLabel: string) => {
    setHistory(entries);
    setImportedFrom(periodLabel);
    vaultEntries(crewCode, entries, periodLabel);
    const derived = fdpsToCandidates(entries);
    if (derived.length > 0) {
      setCandidates(derived);
      setActiveIndex(0);
    }
  };

  // Bear-trap scan over current history — re-evaluated whenever entries change.
  const watchdogAlerts = useMemo(
    () => scanForBearTraps({ history }),
    [history],
  );

  return (
    <div className="ftl-scope app pt-3">
      <div className="tabs">
        <button className={`tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>۱. پروفایل</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          ۲. سابقه <span className="num" style={{ color: '#888' }}>({history.length})</span>
        </button>
        <button className={`tab ${tab === 'flight' ? 'active' : ''}`} onClick={() => setTab('flight')}>
          ۳. کاندیدها <span className="num" style={{ color: '#888' }}>({candidates.length})</span>
        </button>
        <button className={`tab ${tab === 'tools' ? 'active' : ''}`} onClick={() => setTab('tools')}>
          ابزارها
        </button>
        <button className={`tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>
          ۴. نتیجه
          {failCount > 0 && <span className="badge">{failCount}</span>}
          {failCount === 0 && warnCount > 0 && <span className="badge" style={{ background: 'var(--warn)' }}>{warnCount}</span>}
        </button>
      </div>

      {tab === 'profile' && (
        <div className="card">
          <h2>۱. پروفایل خدمه</h2>
          <div className="help">
            اطلاعات پایهٔ خدمه را وارد کن. بقیهٔ محاسبات با درنظر گرفتن این پروفایل انجام می‌شود.
            <br />نکته: <b>FRM (Fatigue Risk Management)</b> طبق OM-A هنوز پیاده‌سازی نشده — این فیلد برای حالت آینده است.
          </div>
          <div className="row">
            <div className="field">
              <label>نام و نام خانوادگی</label>
              <input type="text" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} placeholder="اختیاری" />
            </div>
            <div className="field">
              <label>نقش</label>
              <select value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value as 'cabin' | 'flight' })}>
                <option value="cabin">Cabin Crew (مهماندار)</option>
                <option value="flight">Flight Crew (خلبان)</option>
              </select>
            </div>
            <div className="field">
              <label>Home Base</label>
              <select value={profile.homeBase} onChange={(e) => setProfile({ ...profile, homeBase: e.target.value as 'THR' | 'BND' })}>
                <option value="THR">THR — تهران مهرآباد</option>
                <option value="BND">BND — بندرعباس</option>
              </select>
            </div>
            <div className="field inline">
              <label>
                <input type="checkbox" checked={profile.hasFRM} onChange={(e) => setProfile({ ...profile, hasFRM: e.target.checked })} />
                FRM پیاده‌سازی شده (پیش‌فرض: خیر)
              </label>
            </div>
          </div>
          <hr />
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => setTab('history')}>گام بعد: سابقهٔ وظایف →</button>
            <button className="btn btn-secondary" onClick={() => {
              if (confirm('آیا تمام داده‌های ذخیره‌شدهٔ FTL را پاک کنم؟')) {
                localStorage.removeItem(storeKey(crewCode));
                setProfile({ fullName: '', role: initialRole, homeBase: 'THR', hasFRM: false });
                setHistory([]);
                setCandidates([]);
                setActiveIndex(0);
                setImportedFrom(null);
              }
            }}>پاک کردن همهٔ داده‌ها</button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <>
          <div className="my-3">
            {creds.offline ? (
              <div className="surface rounded-2xl p-4 text-[12px] text-amber-800 dark:text-amber-200 bg-amber-50/70 dark:bg-amber-950/30 ring-1 ring-amber-300/40 flex items-start gap-2" dir="rtl">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <div className="flex-1 leading-relaxed">
                  در حالت آفلاین ایمپورت خودکار از روستر فعال نیست. می‌توانید سابقه را پایین به‌صورت دستی وارد کنید، یا از سربرگ بالا روی «اتصال» بزنید تا برنامهٔ ماهانه مستقیماً از سرور خوانده شود.
                </div>
              </div>
            ) : (
              <RosterImport creds={creds} onImport={onImportHistory} />
            )}
          </div>
          {importedFrom && (
            <div className="surface rounded-xl px-3 py-2 my-2 text-[11.5px] text-emerald-700 dark:text-emerald-300 flex items-center gap-2" dir="rtl">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>سابقه از دورهٔ «{importedFrom}» جایگزین شد ({history.length} رویداد)</span>
            </div>
          )}
          {watchdogAlerts.length > 0 && (
            <div className="my-3">
              <WatchdogAlertsCard alerts={watchdogAlerts} />
            </div>
          )}
          <div className="my-3">
            <MonthLegalityScan profile={profile} history={history} />
          </div>
          <HistoryPanel history={history} onChange={setHistory} />
          <div className="toolbar">
            <button className="btn btn-secondary" onClick={() => setTab('profile')}>← گام قبل</button>
            <button className="btn btn-primary" onClick={() => setTab('flight')}>گام بعد: پروازهای کاندید →</button>
          </div>
        </>
      )}

      {tab === 'flight' && (
        <>
          <CandidateBar
            candidates={candidates} activeIndex={activeIndex}
            profile={profile} history={history}
            onSelect={setActiveIndex} onAdd={addCandidate}
            onDelete={deleteCandidate} onDuplicate={duplicateCandidate}
          />
          {!hasCandidate ? (
            <NoCandidateEmpty onGoImport={() => setTab('history')} onAdd={addCandidate} />
          ) : (
            <>
              <div className="my-3">
                <AdjacentDuties
                  candidates={candidates}
                  activeIndex={activeIndex}
                  history={history}
                  onHistoryChange={setHistory}
                  onCandidateChange={updateActive}
                  result={result!}
                  evalProfile={profile}
                />
              </div>
              <ProposedFlightPanel proposed={activeCandidate} onChange={updateActive} />
            </>
          )}
          <div className="toolbar">
            <button className="btn btn-secondary" onClick={() => setTab('history')}>← گام قبل</button>
            <button className="btn btn-primary" disabled={!hasCandidate} onClick={() => setTab('results')}>محاسبه و نمایش نتیجه ←</button>
          </div>
        </>
      )}

      {tab === 'results' && (
        <>
          {!hasCandidate ? (
            <NoCandidateEmpty onGoImport={() => setTab('history')} onAdd={addCandidate} />
          ) : (
            <ResultsPanel
              result={result!}
              candidates={candidates}
              allResults={allResults}
              activeIndex={activeIndex}
              history={history}
            />
          )}
          {history.some((h) => h.kind === 'fdp') && (
            <div className="my-3">
              <MonthLegalityScan profile={profile} history={history} />
            </div>
          )}
          <div className="toolbar">
            <button className="btn btn-secondary" onClick={() => setTab('flight')}>← اصلاح پرواز</button>
            <button className="btn btn-secondary" onClick={() => setTab('history')}>← اصلاح سابقه</button>
          </div>
        </>
      )}

      {tab === 'tools' && (
        <div className="my-2">
          <Toolbox creds={creds} profile={profile} />
        </div>
      )}
    </div>
  );
}

function NoCandidateEmpty({ onGoImport, onAdd }: { onGoImport: () => void; onAdd: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '13pt', fontWeight: 800, color: 'var(--brand)' }}>
        هنوز کاندید پروازی ندارید
      </div>
      <div className="help" style={{ margin: '8px auto 14px', maxWidth: 480 }}>
        برای محاسبهٔ FTL نیاز به دست‌کم یک پرواز کاندید است. پیشنهاد ما:
        ابتدا برنامهٔ ماه خود را از تب «سابقه» ایمپورت کنید — پروازهای آینده به‌صورت خودکار به‌عنوان کاندید اضافه می‌شوند.
        در غیر این صورت، می‌توانید یک پرواز فرضی به‌صورت دستی اضافه کنید.
      </div>
      <div className="toolbar" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={onGoImport}>↪ ایمپورت از روستر</button>
        <button className="btn btn-secondary" onClick={onAdd}>+ افزودن دستی</button>
      </div>
    </div>
  );
}
