export type LatLng = { lat: number; lng: number };
export type Zone =
  | { kind: 'polygon'; points: LatLng[] }
  | { kind: 'circle'; center: LatLng; radius: number };
export type Team = 'hunter' | 'runner';

export interface Settings {
  name: string;
  maxPlayers: number;
  hunters: number;
  durationMin: number;
  tagDistance: number; // metres
  pulseSec: number;
  shrink: boolean;
  shrinkStartMin: number;
  shrinkDurMin: number;
  revealHunters: boolean; // runners see hunters' live markers (off by default)
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'Campus Hunt',
  maxPlayers: 8,
  hunters: 2,
  durationMin: 30,
  tagDistance: 10,
  pulseSec: 30,
  shrink: false,
  shrinkStartMin: 15,
  shrinkDurMin: 10,
  revealHunters: false,
};

export interface PlayerView {
  id: string;
  name: string;
  ready: boolean;
  host: boolean;
  connected: boolean;
  tagged: boolean;
  left: boolean;
  sharing: boolean;
  team?: Team; // only when disclosure is permitted
}
export interface MarkerView {
  id: string;
  name: string;
  team: Team;
  lat: number;
  lng: number;
  ts: number;
  acc?: number;
  tagged: boolean;
  self?: boolean;
  distance?: number;
}
export interface PulseView { id: string; lat: number; lng: number; ts: number }

export type ShrinkPhase = 'off' | 'idle' | 'warning' | 'shrinking' | 'done';

export interface GameView {
  code: string;
  phase: 'lobby' | 'playing' | 'ended';
  settings: Settings;
  zone: Zone;
  activeZone: Zone;
  shrink: { phase: ShrinkPhase; startsAt: number; endsAt: number };
  now: number;
  startedAt?: number;
  endsAt?: number;
  endedAt?: number;
  winner?: Team;
  you: {
    id: string; host: boolean; team?: Team; tagged: boolean; ready: boolean; sharing: boolean;
    outsideMs: number | null; signalLost: boolean; eliminatedReason?: string;
  };
  players: PlayerView[];
  counts: { hunters: number; runners: number; caught: number; totalRunners: number };
  markers: MarkerView[];
  pulses: PulseView[];
  nextPulseAt: number;
  nearestRunnerM: number | null;
  hunterNear: null | { level: 'near' | 'danger'; approxM: number };
  events: { ts: number; msg: string }[];
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };
