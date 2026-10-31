import { useState } from 'react';
import { Icon } from '../ui/icons';
import { Avatar, Button, Confirm, Header, useToast } from '../ui/ui';
import { useGame } from '../store';
import { fmtArea, polygonArea, circleArea } from '../../shared/geo';

export function Lobby() {
  const { view: v, ready, start, leave, cancel } = useGame();
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!v) return null;
  const me = v.you, host = me.host;
  const area = v.zone.kind === 'circle' ? circleArea(v.zone.radius) : polygonArea(v.zone.points);
  const everyoneReady = v.players.length >= 2 && v.players.every((p) => p.ready);

  const share = async () => {
    const text = `Join my HUNT//ZONE game! Room code: ${v.code}`;
    try { if (navigator.share) await navigator.share({ title: 'HUNT//ZONE', text, url: location.origin }); else throw 0; }
    catch { try { await navigator.clipboard.writeText(`${text} — ${location.origin}`); toast('Invite copied.'); } catch { toast('Share the code: ' + v.code); } }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(v.code); toast('Room code copied.'); } catch { toast('Room code: ' + v.code); } };
  const go = async () => { setBusy(true); const r = await start(); setBusy(false); if (!r.ok) toast(r.error, 'err'); };

  return (
    <div className="screen">
      <Header title="Lobby" onBack={() => setLeaving(true)} right={<button className="iconbtn" onClick={share} aria-label="Share"><Icon n="share" /></button>} />
      <div className="scroll col">
        <div className="card row">
          <div><p className="hint">Room code</p><div className="code" aria-label={`Room code ${v.code.split('').join(' ')}`}>{v.code}</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="secondary" className="sm" icon="copy" onClick={copy}>Copy</Button>
            <Button kind="secondary" className="sm" icon="share" onClick={share}>Share</Button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip mint">{v.settings.name}</span>
          <span className="chip">{v.settings.durationMin} min</span>
          <span className="chip red">{v.settings.hunters} hunter{v.settings.hunters > 1 ? 's' : ''}</span>
          <span className="chip blue">{fmtArea(area)}</span>
        </div>
        <h3 style={{ marginTop: 4 }}>Players ({v.players.length}/{v.settings.maxPlayers})</h3>
        <div className="card plist">
          {v.players.map((p) => (
            <div className="prow" key={p.id} style={{ opacity: p.connected ? 1 : 0.5 }}>
              <Avatar name={p.name} />
              <div className="nm">{p.id === me.id ? `${p.name} (You)` : p.name}{p.host && <Icon n="crown" s={16} c="#ffcf5a" />}</div>
              {!p.connected ? <span className="dim">Offline</span> : p.ready ? <span className="ready">Ready ✓</span> : <span className="notready">Not Ready</span>}
            </div>
          ))}
        </div>
        {v.players.length < 2 && <p className="hint" style={{ textAlign: 'center' }}>Share the code to invite friends. You need at least 2 players.</p>}
      </div>
      <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {host
          ? <>
              <Button disabled={busy || !everyoneReady} onClick={go}>START HUNT</Button>
              {!everyoneReady && v.players.length >= 2 && <p className="hint" style={{ textAlign: 'center' }}>Waiting for everyone to be ready…</p>}
            </>
          : <Button kind={me.ready ? 'secondary' : 'primary'} onClick={() => ready(!me.ready)}>{me.ready ? 'NOT READY' : "I'M READY"}</Button>}
        {!host && <p className="hint" style={{ textAlign: 'center' }}>Waiting for the host to start…</p>}
      </div>
      {leaving && (host
        ? <Confirm danger title="Cancel this hunt?" body="Everyone in the lobby will be removed." yes="Cancel hunt" no="Keep lobby" onYes={() => cancel()} onNo={() => setLeaving(false)} />
        : <Confirm danger title="Leave this hunt?" body="You can rejoin with the room code until the hunt starts." yes="Leave" no="Stay" onYes={() => leave()} onNo={() => setLeaving(false)} />)}
    </div>
  );
}
