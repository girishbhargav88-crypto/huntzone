import { useEffect, useState } from 'react';
import type { Settings, Zone } from '../shared/types';
import { GameProvider, useGame } from './store';
import { ConnectionBanner, Spinner, ToastProvider, useToast } from './ui/ui';
import { ConsentSheet, Home, HowTo, Join, Privacy, SettingsScreen, Welcome } from './screens/Intro';
import { CreateHunt, type Mode } from './screens/Create';
import { Lobby } from './screens/Lobby';
import { Game, Results, RoleReveal } from './screens/Play';
import { ZoneEditor } from './map/ZoneEditor';
import { initFirebase } from './firebaseClient';

type Screen = 'welcome' | 'home' | 'create' | 'draw' | 'join' | 'how' | 'settings' | 'privacy';

function Router() {
  const g = useGame();
  const toast = useToast();
  const [screen, setScreen] = useState<Screen>(localStorage.getItem('hz.seen') ? 'home' : 'welcome');
  const [draft, setDraft] = useState<{ settings?: Settings; mode: Mode }>({ mode: 'polygon' });
  const [ask, setAsk] = useState<null | (() => void)>(null);
  const [busy, setBusy] = useState(false);
  const { view: v } = g;

  useEffect(() => { initFirebase().catch(() => undefined); }, []);
  useEffect(() => { if (g.closedMsg) { toast(g.closedMsg, 'err'); g.clearClosed(); setScreen('home'); } }, [g.closedMsg]);
  useEffect(() => { if (!v && screen === 'draw' && !busy && !draft.settings) setScreen('create'); }, [v]);

  const needConsent = (fn: () => void) => (g.consented ? fn() : setAsk(() => fn));
  const [seen, setSeen] = useState(sessionStorage.getItem('hz.reveal'));
  const reveal = v?.startedAt ? seen === String(v.startedAt) : false;

  let body;
  if (g.resuming) body = <div className="screen center"><Spinner /><p className="hint" style={{ marginTop: 12 }}>Reconnecting to your hunt…</p></div>;
  else if (v) {
    if (v.phase === 'lobby') body = <Lobby />;
    else if (v.phase === 'ended') body = <Results />;
    else if (!reveal && v.you.team) body = <RoleReveal team={v.you.team} onContinue={() => { sessionStorage.setItem('hz.reveal', String(v.startedAt)); setSeen(String(v.startedAt)); }} />;
    else body = <Game />;
  } else if (screen === 'welcome') body = <Welcome onStart={() => { localStorage.setItem('hz.seen', '1'); setScreen('home'); }} />;
  else if (screen === 'home') body = <Home go={(s) => setScreen(s as Screen)} onCreate={() => needConsent(() => setScreen('create'))} onJoin={() => needConsent(() => setScreen('join'))} />;
  else if (screen === 'create') body = <CreateHunt initial={draft.settings} mode={draft.mode} onBack={() => setScreen('home')} onNext={(settings, mode) => { setDraft({ settings, mode }); setScreen('draw'); }} />;
  else if (screen === 'draw') body = busy
    ? <div className="screen center"><Spinner /></div>
    : <ZoneEditor key={draft.mode} mode={draft.mode} onBack={() => setScreen('create')} onConfirm={async (zone: Zone) => {
        setBusy(true);
        const r = await g.create(draft.settings!, zone);
        setBusy(false);
        if (!r.ok) toast(r.error, 'err');
      }} />;
  else if (screen === 'join') body = <Join onBack={() => setScreen('home')} />;
  else if (screen === 'how') body = <HowTo onBack={() => setScreen('home')} />;
  else if (screen === 'privacy') body = <Privacy onBack={() => setScreen('home')} />;
  else body = <SettingsScreen onBack={() => setScreen('home')} onPrivacy={() => setScreen('privacy')} />;

  return (
    <div className="app">
      <ConnectionBanner online={g.online} />
      {body}
      {ask && <ConsentSheet onYes={() => { const f = ask; setAsk(null); f(); }} onNo={() => setAsk(null)} />}
    </div>
  );
}

export default function App() {
  return <ToastProvider><GameProvider><Router /></GameProvider></ToastProvider>;
}
