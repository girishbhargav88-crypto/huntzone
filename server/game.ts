import { randomUUID } from 'node:crypto';
import type { GameView, LatLng, MarkerView, PlayerView, PulseView, Settings, ShrinkPhase, Team, Zone } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { haversine, isLatLng, jitter, MIN_SHRINK_FACTOR, scaleZone, validateZone, zoneContains } from '../shared/geo';

export const FRESH_MS = 20_000;
export const SIGNAL_OK_MS = 45_000;
export const SIGNAL_LOSS_MS = 90_000;
export const TAG_MAX_ACC = 30;
export const TAG_COOLDOWN_MS = 3_000;
export const ZONE_GRACE_MS = 30_000;
export const LOC_MIN_GAP_MS = 800;
export const ROOM_TTL_MS = 10 * 60_000;
export const SHRINK_WARNING_MS = 60_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

type Ok<T = object> = { ok: true } & T;
type Err = { ok: false; error: string };
export type Res<T = object> = Ok<T> | Err;
const err = (error: string): Err => ({ ok: false, error });

export interface Loc { lat: number; lng: number; acc: number; ts: number }
export interface Player {
  id: string; token: string; name: string; socketId?: string;
  ready: boolean; connected: boolean; team?: Team; tagged: boolean; left: boolean; sharing: boolean;
  loc?: Loc; lastLocAt: number; lastTagAt: number;
  outsideSince?: number; noSignalSince?: number; eliminatedReason?: string;
}
export interface Room {
  code: string; hostId: string; settings: Settings; zone: Zone;
  phase: 'lobby' | 'playing' | 'ended';
  players: Map<string, Player>;
  startedAt?: number; endsAt?: number; endedAt?: number; winner?: Team;
  pulses: PulseView[]; lastPulseAt: number; totalRunners: number; caught: number;
  events: { ts: number; msg: string }[]; emptySince?: number;
}

const clampInt = (v: unknown, d: number, min: number, max: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : d;
};

export function sanitizeSettings(input: any): Settings {
  const i = input && typeof input === 'object' ? input : {};
  const d = DEFAULT_SETTINGS;
  const maxPlayers = clampInt(i.maxPlayers, d.maxPlayers, 2, 20);
  const durationMin = clampInt(i.durationMin, d.durationMin, 5, 180);
  return {
    name: String(i.name ?? d.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30) || d.name,
    maxPlayers,
    hunters: clampInt(i.hunters, d.hunters, 1, Math.max(1, maxPlayers - 1)),
    durationMin,
    tagDistance: clampInt(i.tagDistance, d.tagDistance, 3, 50),
    pulseSec: clampInt(i.pulseSec, d.pulseSec, 10, 300),
    shrink: Boolean(i.shrink),
    shrinkStartMin: clampInt(i.shrinkStartMin, d.shrinkStartMin, 1, Math.max(1, durationMin - 1)),
    shrinkDurMin: clampInt(i.shrinkDurMin, d.shrinkDurMin, 1, durationMin),
    revealHunters: Boolean(i.revealHunters),
  };
}

const cleanName = (n: unknown) => String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Player';

export class GameManager {
  rooms = new Map<string, Room>();
  constructor(private clock: () => number = Date.now) {}

  private newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }
  private mk(name: string, socketId?: string): Player {
    return { id: randomUUID().slice(0, 8), token: randomUUID(), name, socketId, ready: false, connected: true, tagged: false, left: false, sharing: true, lastLocAt: 0, lastTagAt: 0 };
  }
  private ev(room: Room, msg: string) {
    room.events.push({ ts: this.clock(), msg });
    if (room.events.length > 8) room.events.shift();
  }

  auth(code: unknown, token: unknown): { room: Room; player: Player } | null {
    const room = this.rooms.get(String(code ?? '').toUpperCase());
    if (!room) return null;
    for (const p of room.players.values()) if (p.token === token) return { room, player: p };
    return null;
  }

  createRoom(hostName: unknown, settingsIn: unknown, zone: unknown, socketId?: string): Res<{ code: string; token: string; playerId: string }> {
    const v = validateZone(zone);
    if (!v.ok) return err(v.error);
    const settings = sanitizeSettings(settingsIn);
    const host = this.mk(cleanName(hostName), socketId);
    host.ready = true;
    const room: Room = {
      code: this.newCode(), hostId: host.id, settings, zone: zone as Zone, phase: 'lobby',
      players: new Map([[host.id, host]]), pulses: [], lastPulseAt: 0, totalRunners: 0, caught: 0, events: [],
    };
    this.rooms.set(room.code, room);
    return { ok: true, code: room.code, token: host.token, playerId: host.id };
  }

  join(code: unknown, name: unknown, socketId?: string): Res<{ code: string; token: string; playerId: string }> {
    const room = this.rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) return err('No hunt found with that code.');
    if (room.phase !== 'lobby') return err('That hunt has already started.');
    if (room.players.size >= room.settings.maxPlayers) return err('This hunt is full.');
    let base = cleanName(name), n = base, i = 2;
    const names = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    while (names.has(n.toLowerCase())) n = `${base} ${i++}`;
    const p = this.mk(n, socketId);
    room.players.set(p.id, p);
    room.emptySince = undefined;
    return { ok: true, code: room.code, token: p.token, playerId: p.id };
  }

  resume(code: unknown, token: unknown, socketId?: string): Res<{ code: string; playerId: string }> {
    const a = this.auth(code, token);
    if (!a || a.player.left) return err('This hunt is no longer available.');
    a.player.connected = true;
    a.player.socketId = socketId;
    a.room.emptySince = undefined;
    return { ok: true, code: a.room.code, playerId: a.player.id };
  }

  setReady(code: unknown, token: unknown, ready: unknown): Res {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    if (a.room.phase !== 'lobby') return err('The hunt has already started.');
    a.player.ready = a.player.id === a.room.hostId ? true : Boolean(ready);
    return { ok: true };
  }

  updateSettings(code: unknown, token: unknown, settingsIn: unknown): Res {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    if (a.player.id !== a.room.hostId) return err('Only the host can change settings.');
    if (a.room.phase !== 'lobby') return err('Settings are locked once the hunt starts.');
    const s = sanitizeSettings(settingsIn);
    if (s.maxPlayers < a.room.players.size) return err('Max players is below the current player count.');
    a.room.settings = s;
    return { ok: true };
  }

  start(code: unknown, token: unknown): Res {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    const { room } = a;
    if (a.player.id !== room.hostId) return err('Only the host can start the hunt.');
    if (room.phase !== 'lobby') return err('The hunt has already started.');
    const ps = [...room.players.values()];
    if (ps.length < 2) return err('You need at least 2 players.');
    if (ps.some((p) => !p.connected)) return err('A player has disconnected. Wait for them or ask them to leave.');
    if (ps.some((p) => p.id !== room.hostId && !p.ready)) return err('Everyone must be ready first.');
    const v = validateZone(room.zone);
    if (!v.ok) return err(v.error);

    const nHunters = Math.min(room.settings.hunters, ps.length - 1);
    const shuffled = [...ps];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((p, i) => {
      p.team = i < nHunters ? 'hunter' : 'runner';
      p.tagged = false; p.left = false; p.loc = undefined; p.outsideSince = undefined; p.noSignalSince = undefined;
      p.eliminatedReason = undefined; p.lastTagAt = 0; p.sharing = true;
    });
    const now = this.clock();
    room.phase = 'playing';
    room.startedAt = now;
    room.endsAt = now + room.settings.durationMin * 60_000;
    room.endedAt = undefined; room.winner = undefined;
    room.totalRunners = ps.length - nHunters;
    room.caught = 0; room.pulses = []; room.lastPulseAt = now; room.events = [];
    this.ev(room, 'The hunt has begun!');
    return { ok: true };
  }

  setSharing(code: unknown, token: unknown, on: unknown): Res {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    a.player.sharing = Boolean(on);
    if (!a.player.sharing) a.player.noSignalSince ??= this.clock();
    return { ok: true };
  }

  updateLocation(code: unknown, token: unknown, input: unknown): Res {
    const raw = input as Record<string, any> | null;
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    const { room, player: p } = a;
    if (room.phase !== 'playing' || p.left) return err('Not in an active hunt.');
    const now = this.clock();
    if (!raw || !isLatLng({ lat: raw.lat, lng: raw.lng })) return err('Malformed location.');
    const acc = Number(raw.acc);
    if (!Number.isFinite(acc) || acc < 0 || acc > 2000) return err('Malformed accuracy.');
    if (raw.ts !== undefined && (!Number.isFinite(Number(raw.ts)) || Math.abs(now - Number(raw.ts)) > 60_000)) return err('Stale location.');
    if (now - p.lastLocAt < LOC_MIN_GAP_MS) return err('Too many updates.');
    if (!p.sharing) return err('Location sharing is off.');
    p.lastLocAt = now;
    p.loc = { lat: raw.lat, lng: raw.lng, acc, ts: now };
    return { ok: true };
  }

  tag(code: unknown, token: unknown): Res<{ name: string }> {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    const { room, player: p } = a;
    if (room.phase !== 'playing') return err('The hunt is not active.');
    if (p.team !== 'hunter' || p.left) return err('Only hunters can tag.');
    const now = this.clock();
    if (now - p.lastTagAt < TAG_COOLDOWN_MS) return err('Wait a moment before tagging again.');
    if (!p.sharing || !p.loc || now - p.loc.ts > FRESH_MS) return err('Your location is out of date. Wait for a GPS fix.');
    if (p.loc.acc > TAG_MAX_ACC) return err(`GPS is too weak (±${Math.round(p.loc.acc)} m). Move to open sky.`);
    p.lastTagAt = now;
    let best: Player | undefined, bestD = Infinity;
    for (const r of room.players.values()) {
      if (r.team !== 'runner' || r.tagged || r.left || !r.sharing || !r.loc) continue;
      if (now - r.loc.ts > FRESH_MS || r.loc.acc > TAG_MAX_ACC) continue;
      const d = haversine(p.loc, r.loc);
      if (d <= room.settings.tagDistance && d < bestD) { best = r; bestD = d; }
    }
    if (!best) return err('No runner within tagging range.');
    best.tagged = true;
    best.eliminatedReason = 'Tagged by a hunter';
    room.caught++;
    this.ev(room, `${best.name} was tagged by ${p.name}`);
    this.checkWin(room);
    return { ok: true, name: best.name };
  }

  private activeRunners(room: Room) {
    return [...room.players.values()].filter((p) => p.team === 'runner' && !p.tagged && !p.left);
  }
  private checkWin(room: Room) {
    if (room.phase !== 'playing') return;
    if (this.activeRunners(room).length === 0) this.end(room, 'hunter');
    else if (![...room.players.values()].some((p) => p.team === 'hunter' && !p.left)) this.end(room, 'runner');
  }
  private end(room: Room, winner: Team) {
    room.phase = 'ended'; room.winner = winner; room.endedAt = this.clock();
    this.ev(room, winner === 'hunter' ? 'All runners caught. Hunters win!' : 'Time is up. Runners win!');
  }

  private reassignHost(room: Room) {
    const cur = room.players.get(room.hostId);
    if (cur && cur.connected && !cur.left) return;
    const next = [...room.players.values()].find((p) => p.connected && !p.left);
    if (next) { room.hostId = next.id; next.ready = true; this.ev(room, `${next.name} is now the host`); }
  }

  disconnect(code: unknown, token: unknown, socketId?: string) {
    const a = this.auth(code, token);
    if (!a || (socketId && a.player.socketId !== socketId)) return;
    a.player.connected = false;
    if (a.room.phase === 'lobby' && a.player.id !== a.room.hostId) a.player.ready = false;
    this.reassignHost(a.room);
    if (![...a.room.players.values()].some((p) => p.connected)) a.room.emptySince = this.clock();
  }

  leave(code: unknown, token: unknown): Res {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    const { room, player: p } = a;
    if (room.phase === 'playing') {
      p.left = true; p.connected = false;
      if (p.team === 'runner' && !p.tagged) { p.tagged = true; p.eliminatedReason = 'Left the hunt'; }
      this.ev(room, `${p.name} left the hunt`);
      this.reassignHost(room);
      this.checkWin(room);
    } else {
      room.players.delete(p.id);
      this.reassignHost(room);
      if (room.players.size === 0) this.rooms.delete(room.code);
    }
    return { ok: true };
  }

  /** Host cancels the hunt. Returns the sockets that should be told it closed. */
  cancel(code: unknown, token: unknown): Res<{ socketIds: string[] }> {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    if (a.player.id !== a.room.hostId) return err('Only the host can cancel the hunt.');
    const socketIds = [...a.room.players.values()].map((p) => p.socketId).filter((s): s is string => !!s);
    this.rooms.delete(a.room.code);
    return { ok: true, socketIds };
  }

  playAgain(code: unknown, token: unknown): Res {
    const a = this.auth(code, token);
    if (!a) return err('Not in a hunt.');
    const { room } = a;
    if (a.player.id !== room.hostId) return err('Only the host can start a new round.');
    if (room.phase !== 'ended') return err('The hunt is still running.');
    for (const [id, p] of room.players) {
      if (p.left) { room.players.delete(id); continue; }
      p.team = undefined; p.tagged = false; p.ready = id === room.hostId; p.loc = undefined;
      p.outsideSince = undefined; p.noSignalSince = undefined; p.eliminatedReason = undefined; p.sharing = true;
    }
    room.phase = 'lobby'; room.startedAt = room.endsAt = room.endedAt = room.winner = undefined;
    room.pulses = []; room.caught = 0; room.events = [];
    return { ok: true };
  }

  // ---------- zone ----------
  shrinkInfo(room: Room, now: number): { phase: ShrinkPhase; startsAt: number; endsAt: number; t: number } {
    if (!room.settings.shrink || !room.startedAt) return { phase: 'off', startsAt: 0, endsAt: 0, t: 0 };
    const startsAt = room.startedAt + room.settings.shrinkStartMin * 60_000;
    const endsAt = startsAt + room.settings.shrinkDurMin * 60_000;
    const t = Math.min(1, Math.max(0, (now - startsAt) / (endsAt - startsAt)));
    const phase: ShrinkPhase = now >= endsAt ? 'done' : now >= startsAt ? 'shrinking' : startsAt - now <= SHRINK_WARNING_MS ? 'warning' : 'idle';
    return { phase, startsAt, endsAt, t };
  }
  activeZone(room: Room, now = this.clock()): Zone {
    const s = this.shrinkInfo(room, now);
    if (s.t <= 0) return room.zone;
    return scaleZone(room.zone, 1 - (1 - MIN_SHRINK_FACTOR) * s.t);
  }

  // ---------- tick ----------
  tick() {
    const now = this.clock();
    for (const room of [...this.rooms.values()]) {
      if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) { this.rooms.delete(room.code); continue; }
      if (room.phase !== 'playing') continue;
      if (room.endsAt && now >= room.endsAt) { this.end(room, 'runner'); continue; }
      const zone = this.activeZone(room, now);
      for (const p of room.players.values()) {
        if (p.left || !p.team) continue;
        const live = p.sharing && p.loc && now - p.loc.ts < SIGNAL_OK_MS;
        if (!live) {
          p.noSignalSince ??= now;
          if (p.team === 'runner' && !p.tagged && now - p.noSignalSince > SIGNAL_LOSS_MS) {
            p.tagged = true; p.eliminatedReason = 'Lost location signal';
            room.caught++;
            this.ev(room, `${p.name} lost signal and is out`);
          }
          continue;
        }
        p.noSignalSince = undefined;
        if (zoneContains(zone, p.loc!)) p.outsideSince = undefined;
        else {
          p.outsideSince ??= now;
          if (p.team === 'runner' && !p.tagged && now - p.outsideSince > ZONE_GRACE_MS) {
            p.tagged = true; p.eliminatedReason = 'Left the play area';
            room.caught++;
            this.ev(room, `${p.name} left the zone and is out`);
          }
        }
      }
      if (now - room.lastPulseAt >= room.settings.pulseSec * 1000) {
        room.lastPulseAt = now;
        room.pulses = this.activeRunners(room)
          .filter((r) => r.sharing && r.loc && now - r.loc.ts < SIGNAL_OK_MS)
          .map((r) => ({ id: randomUUID().slice(0, 6), ...jitter(r.loc!, 20), ts: now }));
      }
      this.checkWin(room);
    }
  }

  // ---------- per-player view (privacy filtering happens here) ----------
  viewFor(room: Room, me: Player): GameView {
    const now = this.clock();
    const s = this.shrinkInfo(room, now);
    const playing = room.phase !== 'lobby';
    const intel = playing && (me.team === 'hunter' || me.tagged);
    const canSeeTeam = (p: Player) =>
      room.phase === 'ended' || p.id === me.id || p.tagged || (!!me.team && me.team === p.team) || (playing && me.tagged);

    const players: PlayerView[] = [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, ready: p.ready || p.id === room.hostId, host: p.id === room.hostId,
      connected: p.connected && !p.left, tagged: p.tagged, left: p.left, sharing: p.sharing,
      team: playing && canSeeTeam(p) ? p.team : undefined,
    }));

    const markers: MarkerView[] = [];
    const dist = (l: Loc) => (me.loc ? Math.round(haversine(me.loc, l)) : undefined);
    if (room.phase === 'playing' && me.team) {
      if (me.loc && me.sharing) markers.push({ id: me.id, name: me.name, team: me.team, lat: me.loc.lat, lng: me.loc.lng, ts: me.loc.ts, acc: me.loc.acc, tagged: me.tagged, self: true });
      for (const p of room.players.values()) {
        if (p.id === me.id || !p.team || !p.loc || p.left) continue;
        const visible = p.team === 'hunter' ? me.team === 'hunter' || me.tagged || room.settings.revealHunters : p.tagged && intel;
        if (!visible || (!p.sharing && !p.tagged)) continue;
        markers.push({ id: p.id, name: p.name, team: p.team, lat: p.loc.lat, lng: p.loc.lng, ts: p.loc.ts, acc: p.loc.acc, tagged: p.tagged, distance: dist(p.loc) });
      }
    }

    let nearestRunnerM: number | null = null;
    let hunterNear: GameView['hunterNear'] = null;
    if (room.phase === 'playing' && me.loc && now - me.loc.ts < SIGNAL_OK_MS) {
      if (me.team === 'hunter') {
        const range = Math.max(30, room.settings.tagDistance * 3);
        for (const r of this.activeRunners(room)) {
          if (!r.loc || !r.sharing || now - r.loc.ts > FRESH_MS) continue;
          const d = haversine(me.loc, r.loc);
          if (d <= range && (nearestRunnerM === null || d < nearestRunnerM)) nearestRunnerM = Math.round(d);
        }
      } else if (me.team === 'runner' && !me.tagged) {
        let best = Infinity;
        for (const h of room.players.values()) {
          if (h.team !== 'hunter' || h.left || !h.loc || !h.sharing || now - h.loc.ts > FRESH_MS) continue;
          best = Math.min(best, haversine(me.loc, h.loc));
        }
        if (best <= 150) hunterNear = { level: best <= 50 ? 'danger' : 'near', approxM: Math.max(10, Math.round(best / 10) * 10) };
      }
    }

    const hunters = [...room.players.values()].filter((p) => p.team === 'hunter' && !p.left).length;
    return {
      code: room.code, phase: room.phase, settings: room.settings, zone: room.zone, activeZone: this.activeZone(room, now),
      shrink: { phase: s.phase, startsAt: s.startsAt, endsAt: s.endsAt }, now,
      startedAt: room.startedAt, endsAt: room.endsAt, endedAt: room.endedAt, winner: room.winner,
      you: {
        id: me.id, host: me.id === room.hostId, team: playing ? me.team : undefined, tagged: me.tagged, ready: me.ready || me.id === room.hostId,
        sharing: me.sharing,
        outsideMs: me.outsideSince && me.team === 'runner' && !me.tagged ? Math.max(0, ZONE_GRACE_MS - (now - me.outsideSince)) : me.outsideSince ? 0 : null,
        signalLost: room.phase === 'playing' && !!me.noSignalSince, eliminatedReason: me.eliminatedReason,
      },
      players,
      counts: { hunters, runners: this.activeRunners(room).length, caught: room.caught, totalRunners: room.totalRunners },
      markers, pulses: intel ? room.pulses : [], nextPulseAt: room.lastPulseAt + room.settings.pulseSec * 1000,
      nearestRunnerM, hunterNear, events: room.events.slice(-5),
    };
  }
}
export type { LatLng };
