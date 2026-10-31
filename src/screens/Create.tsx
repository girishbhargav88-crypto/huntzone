import { useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';
import { Icon } from '../ui/icons';
import { Button, Header, Stepper, Toggle, useToast } from '../ui/ui';
import { NameField } from './Intro';
import { useGame } from '../store';

export type Mode = 'polygon' | 'circle';

export function CreateHunt({ initial, mode: m0, onBack, onNext }: { initial?: Settings; mode?: Mode; onBack: () => void; onNext: (s: Settings, mode: Mode) => void }) {
  const [s, setS] = useState<Settings>(initial ?? DEFAULT_SETTINGS);
  const [mode, setMode] = useState<Mode>(m0 ?? 'polygon');
  const [adv, setAdv] = useState(false);
  const { name } = useGame();
  const toast = useToast();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => {
    const n = { ...p, [k]: v };
    if (n.hunters > n.maxPlayers - 1) n.hunters = n.maxPlayers - 1;
    return n;
  });
  return (
    <div className="screen">
      <Header title="Create Hunt" onBack={onBack} />
      <div className="scroll col">
        <NameField />
        <div>
          <label className="lbl" htmlFor="gname">Game name</label>
          <input id="gname" className="field" style={{ marginTop: 6 }} maxLength={30} value={s.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="card">
          <Stepper label="Players" value={s.maxPlayers} min={2} max={20} onChange={(v) => set('maxPlayers', v)} />
          <Stepper label="Hunters" value={s.hunters} min={1} max={Math.max(1, s.maxPlayers - 1)} onChange={(v) => set('hunters', v)} />
          <div className="row"><label htmlFor="dur">Game duration</label>
            <select id="dur" className="field" value={s.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))}>
              {[10, 15, 20, 30, 45, 60, 90, 120].map((v) => <option key={v} value={v}>{v} minutes</option>)}
            </select></div>
        </div>
        <div>
          <p className="lbl" style={{ marginBottom: 8 }}>Map area</p>
          <div className="seg">
            <button className={mode === 'polygon' ? 'on' : ''} onClick={() => setMode('polygon')}><Icon n="pencil" s={26} />Draw Area</button>
            <button className={mode === 'circle' ? 'on' : ''} onClick={() => setMode('circle')}><Icon n="circle" s={26} />Circle Area</button>
          </div>
        </div>
        <button className="btn ghost" style={{ justifyContent: 'space-between' }} onClick={() => setAdv(!adv)} aria-expanded={adv}>Advanced rules<Icon n="down" /></button>
        {adv && (
          <div className="card">
            <Stepper label="Tag distance" value={s.tagDistance} min={3} max={50} step={1} unit=" m" onChange={(v) => set('tagDistance', v)} />
            <Stepper label="Pulse every" value={s.pulseSec} min={10} max={300} step={10} unit=" s" onChange={(v) => set('pulseSec', v)} />
            <Toggle label="Shrinking zone" hint="The safe area gets smaller over time." on={s.shrink} onChange={(v) => set('shrink', v)} />
            {s.shrink && <>
              <Stepper label="Shrink starts at" value={s.shrinkStartMin} min={1} max={Math.max(1, s.durationMin - 1)} unit=" min" onChange={(v) => set('shrinkStartMin', v)} />
              <Stepper label="Shrink lasts" value={s.shrinkDurMin} min={1} max={s.durationMin} unit=" min" onChange={(v) => set('shrinkDurMin', v)} />
            </>}
            <Toggle label="Runners see hunters" hint="Off by default. Shows hunters live on runners' maps." on={s.revealHunters} onChange={(v) => set('revealHunters', v)} />
          </div>
        )}
      </div>
      <div className="col"><Button icon="next" onClick={() => name.trim() ? onNext(s, mode) : toast('Enter your name first.', 'err')}>NEXT: SELECT AREA</Button></div>
    </div>
  );
}
