import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

/* ---------- toast ---------- */
type ToastFn = (msg: string, kind?: 'ok' | 'err') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: string; id: number } | null>(null);
  const timer = useRef(0);
  const show = useCallback<ToastFn>((msg, kind = 'ok') => {
    setT({ msg, kind, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- basics ---------- */
export function Button({ kind = 'primary', children, icon, ...p }: { kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`btn ${kind} ${p.className ?? ''}`}>{children}{icon && <Icon n={icon} s={20} />}</button>;
}
export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="hdr">
      {onBack ? <button className="iconbtn" onClick={onBack} aria-label="Back"><Icon n="back" /></button> : <span style={{ width: 44 }} />}
      <h2>{title}</h2>
      {right ?? <span style={{ width: 44 }} />}
    </div>
  );
}
const COLORS = ['#5eeab0', '#ffb86b', '#7cc7ff', '#f58fb9', '#c3a6ff', '#ffe27a', '#8ef0ff', '#ff9a7a'];
export function Avatar({ name, size = 42, ring }: { name: string; size?: number; ring?: 'red' | 'mint' }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div className="av" style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: size * 0.4, borderColor: ring === 'red' ? 'var(--red)' : ring === 'mint' ? 'var(--mint)' : undefined }}>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </div>
  );
}
export function Stepper({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return (
    <div className="row">
      <label>{label}</label>
      <div className="stepper">
        <button onClick={() => onChange(Math.max(min, value - step))} aria-label={`Decrease ${label}`}><Icon n="minus" /></button>
        <b>{value}{unit}</b>
        <button onClick={() => onChange(Math.min(max, value + step))} aria-label={`Increase ${label}`}><Icon n="plus" /></button>
      </div>
    </div>
  );
}
export function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (b: boolean) => void }) {
  return (
    <div className="row">
      <div><label>{label}</label>{hint && <p className="hint">{hint}</p>}</div>
      <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
    </div>
  );
}
export function Sheet({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return <div className="scrim" onClick={onClose}><div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">{children}</div></div>;
}
export function Confirm({ title, body, yes, no = 'Cancel', danger, onYes, onNo }: { title: string; body: string; yes: string; no?: string; danger?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <Sheet onClose={onNo}>
      <h3>{title}</h3><p className="hint" style={{ fontSize: 15 }}>{body}</p>
      <Button kind={danger ? 'danger' : 'primary'} onClick={onYes}>{yes}</Button>
      <Button kind="ghost" onClick={onNo}>{no}</Button>
    </Sheet>
  );
}
export const Spinner = () => <div className="spin" role="progressbar" aria-label="Loading" />;
export function ConnectionBanner({ online }: { online: boolean }) {
  return online ? null : <div className="conn" role="alert">Reconnecting to the game server…</div>;
}
export function Countdown({ target, offset }: { target: number; offset: number }) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), 250); return () => clearInterval(i); }, []);
  return <>{fmtClock(target - (Date.now() + offset))}</>;
}
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}
