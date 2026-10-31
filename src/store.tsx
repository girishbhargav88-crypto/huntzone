import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ack, GameView, Settings, Zone } from '../shared/types';
import { emit, socket } from './net';

const KEY = 'hz.session', NAME = 'hz.name', CONSENT = 'hz.consent';
type Session = { code: string; token: string };
const load = (): Session | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

interface Ctx {
  online: boolean; view: GameView | null; offset: number; resuming: boolean;
  name: string; setName: (n: string) => void; consented: boolean; consent: (v: boolean) => void;
  create: (s: Settings, z: Zone) => Promise<Ack>; join: (code: string) => Promise<Ack>;
  ready: (b: boolean) => void; start: () => Promise<Ack>; tag: () => Promise<Ack<{ name: string }>>;
  sharing: (on: boolean) => void; sendLoc: (l: { lat: number; lng: number; acc: number }) => void;
  leave: () => Promise<void>; cancel: () => Promise<void>; again: () => Promise<Ack>; closedMsg: string | null; clearClosed: () => void;
}
const C = createContext<Ctx>(null as never);
export const useGame = () => useContext(C);

export function GameProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(socket.connected);
  const [view, setView] = useState<GameView | null>(null);
  const [offset, setOffset] = useState(0);
  const [resuming, setResuming] = useState(!!load());
  const [name, setNameS] = useState(localStorage.getItem(NAME) || '');
  const [consented, setConsented] = useState(localStorage.getItem(CONSENT) === '1');
  const [closedMsg, setClosedMsg] = useState<string | null>(null);
  const session = useRef<Session | null>(load());
  const off = useRef(0);

  const drop = useCallback(() => { session.current = null; localStorage.removeItem(KEY); setView(null); }, []);

  useEffect(() => {
    const resume = async () => {
      const s = session.current;
      if (!s) { setResuming(false); return; }
      const r = await emit('room:resume', s);
      if (!r.ok) drop();
      setResuming(false);
    };
    const onConnect = () => { setOnline(true); resume(); };
    const onDisc = () => setOnline(false);
    const onState = (v: GameView) => { off.current = v.now - Date.now(); setOffset(off.current); setView(v); };
    const onClosed = () => { drop(); setClosedMsg('The host cancelled the hunt.'); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisc); socket.on('state', onState); socket.on('room:closed', onClosed);
    if (socket.connected) resume();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisc); socket.off('state', onState); socket.off('room:closed', onClosed); };
  }, [drop]);

  const keep = (r: Ack<{ code: string; token: string }>) => {
    if (r.ok) { session.current = { code: r.code, token: r.token }; localStorage.setItem(KEY, JSON.stringify(session.current)); }
    return r as Ack;
  };
  const lastLoc = useRef(0);
  const value: Ctx = {
    online, view, offset, resuming, name,
    setName: (n) => { setNameS(n); localStorage.setItem(NAME, n); },
    consented, consent: (v) => { setConsented(v); localStorage.setItem(CONSENT, v ? '1' : '0'); },
    create: async (settings, zone) => keep(await emit<{ code: string; token: string }>('room:create', { name, settings, zone })),
    join: async (code) => keep(await emit<{ code: string; token: string }>('room:join', { name, code })),
    ready: (b) => { emit('room:ready', { ready: b }); },
    start: () => emit('game:start'),
    tag: () => emit<{ name: string }>('game:tag'),
    sharing: (on) => { emit('loc:sharing', { on }); },
    sendLoc: (l) => { const n = Date.now(); if (n - lastLoc.current < 1000) return; lastLoc.current = n; socket.emit('loc:update', { ...l, ts: n + off.current }); },
    leave: async () => { await emit('room:leave'); drop(); },
    cancel: async () => { await emit('room:cancel'); drop(); },
    again: () => emit('game:again'),
    closedMsg, clearClosed: () => setClosedMsg(null),
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
