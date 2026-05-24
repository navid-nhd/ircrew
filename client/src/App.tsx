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
import { Toolbox } from './components/Toolbox';
import { ActivationScreen } from './components/ActivationScreen';
import { activationStore } from './lib/activation';
import { resetUpstreamSession } from './lib/upstreamClient';
import { ensureNotificationsReady, publishBgContext, clearBgContext } from './lib/notifyBridge';
import { honorificFromPosition } from './lib/positions';
import { profileStore } from './lib/profile';

type Tab = 'roster' | 'flightcrew' | 'ftl' | 'tools' | 'stats';

const STORE_KEY = 'ircrew.creds.v1';

function loadCreds(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch { return null; }
}

export function App() {
  // The activation gate is the very first thing — once activated, the flag
  // stays in localStorage and we never prompt again on this device.
  const [activated, setActivated] = useState<boolean>(() => activationStore.isActivated());
  const [creds, setCreds] = useState<Credentials | null>(() => loadCreds());
  // When the user is offline, the FTL Checker is the only fully-functional
  // tab, so we land them there. Online users keep the original roster default.
  const [tab, setTab] = useState<Tab>(() => loadCreds()?.offline ? 'ftl' : 'roster');
  const [position, setPosition] = useState<string>(() =>
    creds ? (profileStore.load(creds.code)?.position ?? '') : '');

  useEffect(() => {
    if (creds) localStorage.setItem(STORE_KEY, JSON.stringify(creds));
  }, [creds]);

  // Notification permission + Android channel — only the FIRST launch
  // prompts; subsequent launches are no-ops.
  useEffect(() => { void ensureNotificationsReady(); }, []);

  // Push real creds into the background runner's KV when the user logs in
  // with online creds. DEMO / OFFLINE are skipped (no real upstream to poll).
  useEffect(() => {
    if (!creds || creds.offline || creds.code === 'DEMO') {
      void clearBgContext();
      return;
    }
    // period is published from RosterTab once the user picks one.
    void publishBgContext({ code: creds.code, pass: creds.pass, period: '' });
  }, [creds]);

  useEffect(() => {
    if (!creds) { setPosition(''); return; }
    setPosition(profileStore.load(creds.code)?.position ?? '');
  }, [creds]);

  const onLogout = () => {
    localStorage.removeItem(STORE_KEY);
    resetUpstreamSession();   // dump the in-memory native session cache too
    void clearBgContext();    // stop background polling for this code
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

  if (!activated) return <ActivationScreen onActivated={() => setActivated(true)} />;
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
        {tab === 'tools' && (
          <div className="my-2">
            <Toolbox
              creds={creds}
              profile={{ fullName: '', role: 'flight', homeBase: 'THR', hasFRM: false }}
            />
          </div>
        )}
        {tab === 'stats' && <StatsTab creds={creds} />}
      </main>
      <BottomTabs current={tab} onChange={setTab} />
    </div>
  );
}
