import { useEffect, useState } from 'react';
import type { Credentials } from './lib/types';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { BottomTabs } from './components/BottomTabs';
import { RosterTab } from './components/RosterTab';
import { FlightCrewTab } from './components/FlightCrewTab';
import { FtlTab } from './components/FtlTab';
import { OfflineConnectPrompt } from './components/OfflineConnectPrompt';
import { StatsTab } from './components/StatsTab';
import { honorificFromPosition } from './lib/positions';
import { profileStore } from './lib/profile';

type Tab = 'roster' | 'flightcrew' | 'ftl' | 'stats';

const STORE_KEY = 'ircrew.creds.v1';

function loadCreds(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch { return null; }
}

export function App() {
  const [creds, setCreds] = useState<Credentials | null>(() => loadCreds());
  // When the user is offline, the FTL Checker is the only fully-functional
  // tab, so we land them there. Online users keep the original roster default.
  const [tab, setTab] = useState<Tab>(() => loadCreds()?.offline ? 'ftl' : 'roster');
  const [position, setPosition] = useState<string>(() =>
    creds ? (profileStore.load(creds.code)?.position ?? '') : '');

  useEffect(() => {
    if (creds) localStorage.setItem(STORE_KEY, JSON.stringify(creds));
  }, [creds]);

  useEffect(() => {
    if (!creds) { setPosition(''); return; }
    setPosition(profileStore.load(creds.code)?.position ?? '');
  }, [creds]);

  const onLogout = () => {
    localStorage.removeItem(STORE_KEY);
    setCreds(null);
    setTab('roster');
  };

  // When the user reconnects from a tab's connect-prompt or the header badge,
  // we replace the stored creds in place — the tabs re-fetch automatically
  // because their `creds` prop changed reference.
  const onReconnected = (c: Credentials) => {
    setCreds(c);
    setTab('roster');
  };

  if (!creds) return <LoginScreen onAuth={setCreds} />;

  const honorific = position ? honorificFromPosition(position) : undefined;
  const isOffline = !!creds.offline;

  return (
    <div className="min-h-full flex flex-col">
      <Header
        crewCode={creds.code}
        honorific={honorific}
        onLogout={onLogout}
        offline={isOffline}
        onReconnected={onReconnected}
      />
      <main className="flex-1 mx-auto w-full max-w-screen-sm px-4 pb-28">
        {tab === 'roster' && (
          isOffline
            ? <OfflineConnectPrompt feature="roster" onConnected={onReconnected} />
            : <RosterTab creds={creds} onPositionLearned={setPosition} />
        )}
        {tab === 'flightcrew' && (
          isOffline
            ? <OfflineConnectPrompt feature="flightcrew" onConnected={onReconnected} />
            : <FlightCrewTab creds={creds} />
        )}
        {tab === 'ftl' && <FtlTab creds={creds} position={position} />}
        {tab === 'stats' && <StatsTab creds={creds} />}
      </main>
      <BottomTabs current={tab} onChange={setTab} />
    </div>
  );
}
