import { useEffect, useState } from 'react';
import type { Credentials } from './lib/types';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { BottomTabs } from './components/BottomTabs';
import { RosterTab } from './components/RosterTab';
import { FlightCrewTab } from './components/FlightCrewTab';
import { FtlTab } from './components/FtlTab';
import { honorificFromPosition } from './lib/positions';
import { profileStore } from './lib/profile';

type Tab = 'roster' | 'flightcrew' | 'ftl';

const STORE_KEY = 'ircrew.creds.v1';

function loadCreds(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch { return null; }
}

export function App() {
  const [creds, setCreds] = useState<Credentials | null>(() => loadCreds());
  const [tab, setTab] = useState<Tab>('roster');
  // Read the user's persisted position so the header can pick the right
  // honorific on the very first render — even before any roster has loaded.
  const [position, setPosition] = useState<string>(() =>
    creds ? (profileStore.load(creds.code)?.position ?? '') : '');

  useEffect(() => {
    if (creds) localStorage.setItem(STORE_KEY, JSON.stringify(creds));
  }, [creds]);

  // When the credentials change (login / switch account), reload position.
  useEffect(() => {
    if (!creds) { setPosition(''); return; }
    setPosition(profileStore.load(creds.code)?.position ?? '');
  }, [creds]);

  const onLogout = () => {
    localStorage.removeItem(STORE_KEY);
    setCreds(null);
    setTab('roster');
  };

  if (!creds) return <LoginScreen onAuth={setCreds} />;

  const honorific = position ? honorificFromPosition(position) : undefined;

  return (
    <div className="min-h-full flex flex-col">
      <Header crewCode={creds.code} honorific={honorific} onLogout={onLogout} />
      <main className="flex-1 mx-auto w-full max-w-screen-sm px-4 pb-28">
        {tab === 'roster'     && <RosterTab creds={creds} onPositionLearned={setPosition} />}
        {tab === 'flightcrew' && <FlightCrewTab creds={creds} />}
        {tab === 'ftl'        && <FtlTab creds={creds} position={position} />}
      </main>
      <BottomTabs current={tab} onChange={setTab} />
    </div>
  );
}
