import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Team } from '../../shared/types';
import { haversine } from '../../shared/geo';
import { Icon } from '../ui/icons';
import { Avatar, Button, Confirm, Countdown, Sheet, ago, fmtClock, useToast } from '../ui/ui';
import { useGame } from '../store';
import { useGeolocation } from '../geo/useGeolocation';
import { GameMap, type MapHandle } from '../map/GameMap';

/* ---------------- role reveal ---------------- */
export function RoleReveal({ team, onContinue }: { team: Team; onContinue: () => void }) {
  const h = team === 'hunter';
  const rules = h
    ? [['target', 'Hunt down the runners'], ['pin', 'Check location pulses'], ['bolt', 'Get close and TAG them'], ['check', 'All runners must be caught']]
    : [['pin', 'Stay inside the play area'], ['eye', 'Avoid the hunters'], ['run', 'Keep moving'], ['bolt', 'Survive until time runs out']];
  return (
    <div className={`screen reveal ${h ? 'h' : 'r'}`}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <p style={{ letterSpacing: '.12em', fontSize: 18 }}>YOU ARE A</p>
        <h1 className={`role ${h ? 'h' : 'r'}`}>{h ? 'HUNTER' : 'RUNNER'}</h1>
        <div style={{ marginTop: 18, color: h ? 'var(--red)' : 'var(--mint)', filter: `drop-shadow(0 0 24px ${h ? '#ff4d5588' : '#5eeab066'})` }}><Icon n={h ? 'hood' : 'runner'} s={120} /></div>
      </div>
      <div className="col card" style={{ background: '#050d14cc', marginBottom: 12 }}>
        {rules.map(([i, t]) => <div className="rule" key={t}><Icon n={i} s={26} c={h ? '#ff6b73' : 'var(--mint)'} />{t}</div>)}
      </div>
      <div className="col"><Button onClick={onContinue}>GOT IT!</Button></div>
    </div>
  );
}

/* ---------------- hold to tag ---------------- */
const HOLD_MS = 2500;
function HoldTag({ near, onDone, onClose }: { near: number | null; onDone: () => void; onClose: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0), t0 = useRef(0), done = useRef(false);
  const stop = () => { cancelAnimationFrame(raf.current); if (!done.current) setP(0); };
  const begin = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    t0.current = performance.now();
    const loop = () => {
      const t = (performance.now() - t0.current) / HOLD_MS;
      if (t >= 1) { done.current = true; setP(1); navigator.vibrate?.(60); onDone(); return; }
      setP(t); raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const C = 2 * Math.PI * 70;
  return createPortal(
    <div className="scrim" style={{ background: 'transparent', pointerEvents: 'none' }}>
      <div className="sheet" style={{ pointerEvents: 'auto', alignItems: 'center', background: '#07161ff2' }}>
        <h3 style={{ color: 'var(--mint)' }}>Hold to TAG</h3>
        <p className="hint">{near !== null ? `Runner about ${near} m away` : 'No runner close enough yet. Get nearer.'}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div className="holdring" onPointerDown={begin} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()} role="button" aria-label="Hold to tag" tabIndex={0}>
            <svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="70" fill="#2a1217" stroke="#4a1f27" strokeWidth="9" /><circle cx="75" cy="75" r="70" fill="none" stroke="#ff4d55" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} /></svg>
            <b>{((HOLD_MS * (1 - p)) / 1000).toFixed(1)}s</b>
          </div>
          <button className="iconbtn" style={{ border: '1.5px solid var(--line)' }} onClick={onClose} aria-label="Cancel tag"><Icon n="close" /></button>
        </div>
      </div>
    </div>, document.body);
}

/* ---------------- live game ---------------- */
export function Game() {
  const { view: v, offset, sharing, sendLoc, tag, leave } = useGame();
  const toast = useToast();
  const geo = useGeolocation(!!v?.you.sharing);
  const mapRef = useRef<MapHandle>(null), root = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState(false), [leaving, setLeaving] = useState(false), [holding, setHolding] = useState(false);
  const posRef = useRef(geo.pos); posRef.current = geo.pos;
  const shareRef = useRef(!!v?.you.sharing); shareRef.current = !!v?.you.sharing;
  const lastEv = useRef(v?.events.length ? v.events[v.events.length - 1].ts : 0);

  useEffect(() => { if (geo.pos && shareRef.current) sendLoc(geo.pos); }, [geo.pos]);
  useEffect(() => { const i = setInterval(() => { const p = posRef.current; if (p && shareRef.current) sendLoc(p); }, 5000); return () => clearInterval(i); }, []);
  useEffect(() => {
    const ro = new ResizeObserver(() => root.current?.style.setProperty('--bar-h', `${bar.current?.offsetHeight ?? 0}px`));
    if (bar.current) ro.observe(bar.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const e = v?.events[v.events.length - 1];
    if (e && e.ts > lastEv.current) { lastEv.current = e.ts; toast(e.msg); }
  }, [v?.events]);

  if (!v || !v.you.team) return null;
  const me = v.you, hunter = me.team === 'hunter';
  const now = v.now + (Date.now() - (v.now - offset));
  const shrinkLeft = v.shrink.startsAt - (Date.now() + offset);
  const sm = v.markers.find((m) => m.id === sel);
  const sp = sel?.startsWith('pulse:') ? v.pulses.find((p) => 'pulse:' + p.id === sel) : undefined;
  const dTo = (a: { lat: number; lng: number }) => (geo.pos ? Math.round(haversine(geo.pos, a)) : null);
  const canTag = hunter && !me.tagged && v.you.sharing && !!geo.pos;

  const recenter = () => {
    if (geo.pos) mapRef.current?.recenter(geo.pos);
    else toast(geo.error ?? (me.sharing ? 'Waiting for a GPS fix…' : 'Turn on location sharing to find yourself.'), 'err');
  };
  const doTag = async () => {
    const r = await tag(); setHolding(false);
    toast(r.ok ? `Tagged ${r.name}!` : r.error, r.ok ? 'ok' : 'err');
  };

  return (
    <div ref={root} style={{ position: 'absolute', inset: 0 }}>
      <GameMap ref={mapRef} view={v} me={geo.pos} onSelect={setSel} />

      <div className="overlay top">
        <div className="hud">
          <button className="iconbtn glass" onClick={() => setMenu(true)} aria-label="Game menu"><Icon n="menu" /></button>
          <div className="mid">
            <div className="brand">HUNT<i>//</i>ZONE</div>
            <div className="timer" aria-label="Time remaining"><Countdown target={v.endsAt!} offset={offset} /></div>
            <div className="counts">
              <span className="chip red"><Icon n="hood" s={14} />HUNTERS: {v.counts.hunters}</span>
              <span className="chip blue"><Icon n="runner" s={14} />RUNNERS: {v.counts.runners}</span>
            </div>
          </div>
          <button className="iconbtn glass" onClick={() => sharing(!me.sharing)} aria-label={me.sharing ? 'Stop sharing location' : 'Start sharing location'} style={{ color: me.sharing ? 'var(--mint)' : '#ff8e93' }}>
            <Icon n={me.sharing ? 'signal' : 'signaloff'} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {me.tagged && <div className="alert info" role="status"><Icon n="eye" />{me.eliminatedReason ?? 'You are out'}. Spectating.</div>}
          {!me.tagged && me.outsideMs !== null && <div className={`alert ${hunter ? 'warn' : ''}`} role="alert"><Icon n="warn" />Return to the play area{!hunter && me.outsideMs > 0 ? ` — ${Math.ceil(me.outsideMs / 1000)}s` : ''}</div>}
          {v.shrink.phase === 'warning' && <div className="alert warn" role="status"><Icon n="warn" />Zone shrinks in {fmtClock(shrinkLeft)}</div>}
          {v.shrink.phase === 'shrinking' && <div className="alert" role="status" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon n="warn" />Zone shrinking — stay inside the red line</span><div className="zonebar"><div style={{ width: `${Math.min(100, ((Date.now() + offset - v.shrink.startsAt) / (v.shrink.endsAt - v.shrink.startsAt)) * 100)}%` }} /></div></div>}
          {me.sharing && !geo.pos && <div className="alert warn" role="status"><Icon n="locate" />{geo.error ?? 'Getting your GPS fix…'}</div>}
          {!me.sharing && !me.tagged && <div className="alert warn" role="status"><Icon n="signaloff" />Sharing is off. Runners are out after 90s offline.</div>}
        </div>
      </div>

      {(sm || sp) && (
        <div className="infocard glass" style={{ top: 'calc(var(--top) + 250px)' }} onClick={() => setSel(null)}>
          {sm && <><b>{sm.self ? `${sm.name} (You)` : sm.name}</b>
            <span className="hint">{sm.team === 'hunter' ? 'Hunter' : 'Runner'}{sm.tagged ? ' · Caught' : ''}{sm.distance !== undefined ? ` · ~${sm.distance} m away` : ''}</span>
            <span className="hint">Last seen {ago(sm.ts, now)}{sm.acc !== undefined ? ` · GPS ±${Math.round(sm.acc)} m` : ''}</span></>}
          {sp && <><b>Runner pulse</b><span className="hint">Approximate position · received {ago(sp.ts, now)}{dTo(sp) !== null ? ` · ~${dTo(sp)} m away` : ''}</span><span className="hint">Next pulse in {fmtClock(v.nextPulseAt - (Date.now() + offset))}</span></>}
        </div>
      )}

      <div className="overlay bottom" ref={bar}>
        <button className="fab" onClick={recenter} aria-label="Recenter on my location"><Icon n="nav" s={26} /></button>
        {!hunter && v.hunterNear && !me.tagged && (
          <div className="alert" role="alert"><Icon n="warn" />A hunter is nearby! ~{v.hunterNear.approxM} m</div>
        )}
        {hunter ? (
          <div className="bar glass">
            <button className="iconbtn" style={{ border: '1.5px solid var(--line)', borderRadius: 16 }} onClick={() => mapRef.current?.fit()} aria-label="Show whole play area"><Icon n="target" /></button>
            <button className="tagbtn" disabled={!canTag} onClick={() => setHolding(true)}>TAG</button>
            <div className={`ring ${v.nearestRunnerM !== null ? 'hot' : ''}`} aria-label="Distance to nearest runner">{v.nearestRunnerM !== null ? `${v.nearestRunnerM}m` : '—'}</div>
          </div>
        ) : (
          <div className="bar glass" style={{ justifyContent: 'space-between' }}>
            <div><b style={{ color: 'var(--mint)' }}>RUNNER</b><p className="hint">{me.tagged ? 'Out of play' : `Survive · ${v.counts.runners} left`}</p></div>
            <div style={{ textAlign: 'right' }}><p className="hint">{me.sharing ? 'Sharing location' : 'Not sharing'}</p><p className="hint">{geo.pos ? `GPS ±${Math.round(geo.pos.acc)} m` : 'No GPS fix'}</p></div>
          </div>
        )}
      </div>

      {holding && <HoldTag near={v.nearestRunnerM} onDone={doTag} onClose={() => setHolding(false)} />}
      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <h3>Game menu</h3>
          <div className="stat"><span>Your team</span><b style={{ color: hunter ? '#ff7c85' : 'var(--mint)' }}>{hunter ? 'Hunter' : 'Runner'}</b></div>
          <div className="stat"><span>Room</span><b>{v.code}</b></div>
          <div className="stat"><span>Tag distance</span><b>{v.settings.tagDistance} m</b></div>
          <div className="stat"><span>Pulse interval</span><b>{v.settings.pulseSec}s</b></div>
          <p className="hint">{hunter ? 'Hold TAG within range of a runner. Pulses are approximate and delayed.' : 'Stay inside the zone and out of reach. You only get a warning when a hunter is close.'}</p>
          <Button kind="secondary" icon={me.sharing ? 'signaloff' : 'signal'} onClick={() => { sharing(!me.sharing); setMenu(false); }}>{me.sharing ? 'Stop sharing location' : 'Resume sharing'}</Button>
          <Button kind="danger" onClick={() => { setMenu(false); setLeaving(true); }}>Leave game</Button>
        </Sheet>
      )}
      {leaving && <Confirm danger title="Leave the hunt?" body={hunter ? 'Your team will play on without you.' : 'You will be counted as out.'} yes="Leave game" no="Keep playing" onYes={() => leave()} onNo={() => setLeaving(false)} />}
    </div>
  );
}

/* ---------------- results ---------------- */
export function Results() {
  const { view: v, again, leave } = useGame();
  const toast = useToast();
  if (!v) return null;
  const hw = v.winner === 'hunter';
  const dur = (v.endedAt ?? v.now) - (v.startedAt ?? v.now);
  const left = Math.max(0, (v.endsAt ?? 0) - (v.endedAt ?? 0));
  return (
    <div className={`screen reveal ${hw ? 'h' : 'r'}`}>
      <div className="scroll col" style={{ alignItems: 'center', paddingTop: 20 }}>
        <p className="brand">HUNT<i>//</i>ZONE</p>
        <div style={{ color: '#ffcf5a', filter: 'drop-shadow(0 0 18px #ffcf5a88)' }}><Icon n="crown" s={52} /></div>
        <h1 className={`role ${hw ? 'h' : 'r'}`} style={{ fontSize: 44, textAlign: 'center' }}>{hw ? 'HUNTERS WIN' : 'RUNNERS WIN'}</h1>
        <p className="dim">{v.you.team === v.winner ? 'Your team won. Nice hunt!' : 'Better luck next round.'}</p>
        <div className="card col" style={{ background: '#050d14cc', marginTop: 8 }}>
          <div className="stat"><span>Game Duration</span><b>{fmtClock(dur)}</b></div>
          <div className="stat"><span>Runners Caught</span><b>{v.counts.caught} / {v.counts.totalRunners}</b></div>
          <div className="stat"><span>Time Remaining</span><b>{fmtClock(left)}</b></div>
        </div>
        <div className="card col plist" style={{ background: '#050d14cc' }}>
          {v.players.map((p) => (
            <div className="prow" key={p.id}>
              <Avatar name={p.name} size={36} ring={p.team === 'hunter' ? 'red' : 'mint'} />
              <div className="nm">{p.id === v.you.id ? `${p.name} (You)` : p.name}</div>
              <span className={`chip ${p.team === 'hunter' ? 'red' : 'blue'}`}>{p.team === 'hunter' ? 'Hunter' : p.tagged ? 'Caught' : 'Survived'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {v.you.host
          ? <Button onClick={async () => { const r = await again(); if (!r.ok) toast(r.error, 'err'); }}>PLAY AGAIN</Button>
          : <p className="hint" style={{ textAlign: 'center' }}>Waiting for the host to start another round…</p>}
        <Button kind="secondary" onClick={() => leave()}>BACK TO HOME</Button>
      </div>
    </div>
  );
}
