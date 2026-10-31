import { useState, type ReactNode } from 'react';
import { Icon, Logo } from '../ui/icons';
import { Button, Header, Sheet, useToast } from '../ui/ui';
import { useGame } from '../store';

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen center" style={{ position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, position: 'relative' }}>
        <Logo size={110} />
        <h1 className="logo-big">HUNT<i>//</i>ZONE</h1>
        <p className="tag">REAL WORLD. REAL PLAYERS.<br />HUNT OR BE HUNTED.</p>
      </div>
      <div className="col" style={{ position: 'relative' }}><Button icon="next" onClick={onStart}>GET STARTED</Button></div>
    </div>
  );
}

export function Home({ go, onCreate, onJoin }: { go: (s: string) => void; onCreate: () => void; onJoin: () => void }) {
  const { name } = useGame();
  return (
    <div className="screen">
      <div className="hdr col">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Logo size={30} /><span className="brand">HUNT<i>//</i>ZONE</span></div>
        <button className="iconbtn" onClick={() => go('settings')} aria-label="Settings"><Icon n="gear" /></button>
      </div>
      <div className="scroll col" style={{ justifyContent: 'center', gap: 16 }}>
        {name && <p className="dim" style={{ textAlign: 'center' }}>Welcome back, {name}</p>}
        <button className="big green" onClick={onCreate}><Icon n="users" s={44} c="var(--mint)" /><h3>CREATE HUNT</h3><p>Set the map, invite friends and start playing</p></button>
        <button className="big red" onClick={onJoin}><Icon n="users" s={44} c="#ff7c85" /><h3>JOIN HUNT</h3><p>Enter a room code to join a game</p></button>
      </div>
      <div className="tiles col">
        <button className="tile" onClick={() => go('how')}><Icon n="book" s={24} />HOW TO PLAY</button>
        <button className="tile" onClick={() => go('privacy')}><Icon n="shield" s={24} />PRIVACY</button>
        <button className="tile" onClick={() => go('settings')}><Icon n="gear" s={24} />SETTINGS</button>
      </div>
    </div>
  );
}

export function NameField({ autoFocus }: { autoFocus?: boolean }) {
  const { name, setName } = useGame();
  return (
    <div>
      <label className="lbl" htmlFor="pname">Your name</label>
      <input id="pname" className="field" style={{ marginTop: 6 }} maxLength={20} placeholder="e.g. Alex" value={name} autoFocus={autoFocus} onChange={(e) => setName(e.target.value)} />
    </div>
  );
}

export function Join({ onBack }: { onBack: () => void }) {
  const { join, name } = useGame();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const go = async () => {
    if (!name.trim()) return toast('Enter your name first.', 'err');
    setBusy(true);
    const r = await join(code);
    setBusy(false);
    if (!r.ok) toast(r.error, 'err');
  };
  return (
    <div className="screen">
      <Header title="Join Hunt" onBack={onBack} />
      <div className="scroll col" style={{ gap: 18, paddingTop: 12 }}>
        <NameField />
        <div>
          <label className="lbl" htmlFor="rc">Room code</label>
          <input id="rc" className="field code" style={{ marginTop: 6, textAlign: 'center', minHeight: 72 }} maxLength={4} inputMode="text" autoCapitalize="characters" autoComplete="off"
            placeholder="A7X9" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <p className="hint" style={{ marginTop: 8 }}>Ask the host for the 4-character code shown in their lobby.</p>
        </div>
      </div>
      <div className="col"><Button disabled={code.length !== 4 || busy} icon="next" onClick={go}>{busy ? 'JOINING…' : 'JOIN HUNT'}</Button></div>
    </div>
  );
}

const Step = ({ i, t, d }: { i: string; t: string; d: string }) => (
  <div className="card row" style={{ alignItems: 'flex-start' }}><Icon n={i} s={28} c="var(--mint)" /><div style={{ flex: 1 }}><b>{t}</b><p className="hint">{d}</p></div></div>
);
export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <Header title="How to Play" onBack={onBack} />
      <div className="scroll col">
        <Step i="pin" t="Set the zone" d="The host taps the map to outline a play area and shares the room code." />
        <Step i="hood" t="Hunters" d="Receive approximate runner pulses at set intervals. Get within the tagging distance and hold TAG to catch a runner." />
        <Step i="runner" t="Runners" d="Stay inside the play area, keep moving and avoid hunters. You get a warning when a hunter is close, but never their exact position." />
        <Step i="target" t="Shrinking zone" d="If enabled, the safe area gets smaller over time. Runners outside it for too long are out." />
        <Step i="bolt" t="Winning" d="Hunters win by catching every runner. Runners win by surviving until time runs out." />
        <p className="hint">GPS is approximate (often ±5–30 m). Play in open areas, stay aware of traffic and never trespass.</p>
      </div>
    </div>
  );
}

export function Privacy({ onBack }: { onBack: () => void }) {
  const { leave } = useGame();
  const toast = useToast();
  return (
    <div className="screen">
      <Header title="Privacy" onBack={onBack} />
      <div className="scroll col">
        <Step i="locate" t="Location is shared only during a hunt" d="Your phone sends GPS updates to the game server only while a hunt is running and sharing is on." />
        <Step i="eye" t="Teams see only what the rules allow" d="Hunters see approximate runner pulses. Runners never see other runners, and see only a proximity warning for hunters." />
        <Step i="signaloff" t="You control sharing" d="Use Stop Sharing in the game menu any time. A runner who stays offline for too long is counted as out so the game stays fair." />
        <Step i="trash" t="No location history" d="The server keeps only your latest position in memory. It is discarded when the hunt ends or the room expires." />
        <Button kind="secondary" onClick={async () => { await leave(); localStorage.clear(); toast('Local data cleared.'); }}>Clear data on this device</Button>
      </div>
    </div>
  );
}

export function SettingsScreen({ onBack, onPrivacy }: { onBack: () => void; onPrivacy: () => void }) {
  const { consented, consent } = useGame();
  return (
    <div className="screen">
      <Header title="Settings" onBack={onBack} />
      <div className="scroll col">
        <div className="card"><NameField /></div>
        <div className="card row"><div><b>Location permission</b><p className="hint">{consented ? 'You agreed to share location during hunts.' : 'Not yet agreed. You will be asked before joining.'}</p></div>
          <Button kind="secondary" className="sm" onClick={() => consent(!consented)}>{consented ? 'Revoke' : 'Allow'}</Button></div>
        <Button kind="secondary" onClick={onPrivacy} icon="shield">Privacy controls</Button>
        <p className="hint" style={{ textAlign: 'center' }}>Map data © OpenStreetMap contributors</p>
      </div>
    </div>
  );
}

export function ConsentSheet({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const { consent } = useGame();
  return (
    <Sheet onClose={onNo}>
      <Icon n="locate" s={36} c="var(--mint)" />
      <h3>Share your location to play</h3>
      <p className="hint" style={{ fontSize: 15 }}>HUNT//ZONE needs your phone's GPS during a hunt so the game can tag, warn and keep score. Other players only see what your team's rules allow, and you can stop sharing any time.</p>
      <Button onClick={() => { consent(true); onYes(); }}>I agree</Button>
      <Button kind="ghost" onClick={onNo}>Not now</Button>
    </Sheet>
  );
}

export const Pad = ({ children }: { children: ReactNode }) => <div className="col" style={{ gap: 12, display: 'flex', flexDirection: 'column' }}>{children}</div>;
