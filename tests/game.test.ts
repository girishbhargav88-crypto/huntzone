import { beforeEach, describe, expect, it } from 'vitest';
import { GameManager, TAG_COOLDOWN_MS, ZONE_GRACE_MS } from '../server/game';

const zone = {
  kind: 'polygon' as const,
  points: [{ lat: 12.9, lng: 77.5 }, { lat: 12.9, lng: 77.503 }, { lat: 12.903, lng: 77.503 }, { lat: 12.903, lng: 77.5 }],
};
const inside = { lat: 12.9015, lng: 77.5015 };
let t = 1_000_000;
let m: GameManager;
beforeEach(() => { t = 1_000_000; m = new GameManager(() => t); });

function lobby(n = 3, settings: any = {}) {
  const h = m.createRoom('Host', { maxPlayers: 4, hunters: 1, ...settings }, zone, 's0');
  if (!h.ok) throw new Error(h.error);
  const players = [{ token: h.token, id: h.playerId }];
  for (let i = 1; i < n; i++) {
    const j = m.join(h.code, `P${i}`, `s${i}`);
    if (!j.ok) throw new Error(j.error);
    m.setReady(h.code, j.token, true);
    players.push({ token: j.token, id: j.playerId });
  }
  return { code: h.code, players, room: m.rooms.get(h.code)! };
}
function begin(n = 3, settings: any = {}) {
  const l = lobby(n, settings);
  expect(m.start(l.code, l.players[0].token).ok).toBe(true);
  const byTeam = (team: string) => l.players.filter((p) => l.room.players.get(p.id)!.team === team);
  return { ...l, hunters: byTeam('hunter'), runners: byTeam('runner') };
}
const loc = (code: string, token: string, lat: number, lng: number, acc = 5) => {
  t += 1000;
  return m.updateLocation(code, token, { lat, lng, acc, ts: t });
};

describe('rooms', () => {
  it('creates a room with a 4-char code and joins by code', () => {
    const { code } = lobby(2);
    expect(code).toMatch(/^[A-Z2-9]{4}$/);
    expect(m.join(code.toLowerCase(), 'Zed').ok).toBe(true);
  });
  it('rejects unknown codes, an invalid zone and bad settings are clamped', () => {
    expect(m.join('ZZZZ', 'x').ok).toBe(false);
    expect(m.createRoom('H', {}, { kind: 'polygon', points: [] }).ok).toBe(false);
    const r = m.createRoom('H', { maxPlayers: 999, hunters: 99, durationMin: 1 }, zone);
    if (!r.ok) throw new Error();
    const s = m.rooms.get(r.code)!.settings;
    expect(s.maxPlayers).toBe(20); expect(s.hunters).toBe(19); expect(s.durationMin).toBe(5);
  });
  it('enforces capacity', () => {
    const l = lobby(2, { maxPlayers: 2 });
    expect(m.join(l.code, 'Late').ok).toBe(false);
  });
  it('makes duplicate names unique', () => {
    const { code } = lobby(1);
    const a = m.join(code, 'Sam'), b = m.join(code, 'Sam');
    if (!a.ok || !b.ok) throw new Error();
    const names = [...m.rooms.get(code)!.players.values()].map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('cannot join after start', () => {
    const { code } = begin(3);
    expect(m.join(code, 'Late').ok).toBe(false);
  });
});

describe('host permissions, ready, start validation', () => {
  it('only the host can start / cancel / change settings', () => {
    const l = lobby(3);
    expect(m.start(l.code, l.players[1].token).ok).toBe(false);
    expect(m.cancel(l.code, l.players[1].token).ok).toBe(false);
    expect(m.updateSettings(l.code, l.players[1].token, {}).ok).toBe(false);
    expect(m.updateSettings(l.code, l.players[0].token, { hunters: 1, maxPlayers: 6 }).ok).toBe(true);
  });
  it('needs 2+ players and everyone ready', () => {
    const solo = lobby(1);
    expect(m.start(solo.code, solo.players[0].token).ok).toBe(false);
    const l = lobby(3);
    m.setReady(l.code, l.players[2].token, false);
    const r = m.start(l.code, l.players[0].token);
    expect(r.ok).toBe(false);
    m.setReady(l.code, l.players[2].token, true);
    expect(m.start(l.code, l.players[0].token).ok).toBe(true);
  });
  it('assigns the configured number of hunters (always leaving a runner)', () => {
    const g = begin(4, { hunters: 2 });
    expect(g.hunters).toHaveLength(2); expect(g.runners).toHaveLength(2);
    const g2 = new GameManager(() => t);
    const h = g2.createRoom('H', { hunters: 19, maxPlayers: 20 }, zone, 'a'); if (!h.ok) throw new Error();
    const j = g2.join(h.code, 'J', 'b'); if (!j.ok) throw new Error();
    g2.setReady(h.code, j.token, true); g2.start(h.code, h.token);
    const teams = [...g2.rooms.get(h.code)!.players.values()].map((p) => p.team).sort();
    expect(teams).toEqual(['hunter', 'runner']);
  });
  it('clients cannot assign their own role via ready or settings', () => {
    const l = lobby(3);
    m.setReady(l.code, l.players[1].token, { team: 'hunter' } as any);
    expect(l.room.players.get(l.players[1].id)!.team).toBeUndefined();
  });
  it('reassigns host when the host leaves the lobby', () => {
    const l = lobby(3);
    m.leave(l.code, l.players[0].token);
    expect(l.room.hostId).not.toBe(l.players[0].id);
    expect(l.room.players.size).toBe(2);
  });
  it('host cancel closes the room', () => {
    const l = lobby(2);
    const r = m.cancel(l.code, l.players[0].token);
    expect(r.ok).toBe(true);
    expect(m.rooms.has(l.code)).toBe(false);
  });
});

describe('locations & privacy', () => {
  it('rejects malformed and stale updates', () => {
    const g = begin(3);
    const p = g.players[1];
    expect(m.updateLocation(g.code, p.token, { lat: 999, lng: 0, acc: 1 }).ok).toBe(false);
    expect(m.updateLocation(g.code, p.token, { lat: 1, lng: 1, acc: -1 }).ok).toBe(false);
    expect(m.updateLocation(g.code, p.token, { lat: 1, lng: 1, acc: 5, ts: t - 120_000 }).ok).toBe(false);
  });
  it('rate limits updates', () => {
    const g = begin(3);
    const p = g.players[1];
    expect(m.updateLocation(g.code, p.token, { lat: 12.9, lng: 77.5, acc: 5 }).ok).toBe(true);
    expect(m.updateLocation(g.code, p.token, { lat: 12.9, lng: 77.5, acc: 5 }).ok).toBe(false);
  });
  it('runners never receive other runners or hunters live positions by default; hunters get only pulses for runners', () => {
    const g = begin(4, { hunters: 1, pulseSec: 10 });
    const [h] = g.hunters;
    g.players.forEach((p) => loc(g.code, p.token, inside.lat, inside.lng));
    const rv = m.viewFor(g.room, g.room.players.get(g.runners[0].id)!);
    expect(rv.markers.map((x) => x.id)).toEqual([g.runners[0].id]);
    expect(rv.pulses).toHaveLength(0);
    t += 11_000; m.tick();
    loc(g.code, h.token, inside.lat, inside.lng);
    const hv = m.viewFor(g.room, g.room.players.get(h.id)!);
    expect(hv.markers.every((x) => x.team === 'hunter')).toBe(true);
    expect(hv.pulses.length).toBeGreaterThan(0);
    const rn = g.room.players.get(g.runners[0].id)!;
    expect(hv.pulses.some((p) => p.lat === rn.loc!.lat && p.lng === rn.loc!.lng)).toBe(false); // jittered, not exact
    const rteams = rv.players.filter((p) => p.id !== g.runners[0].id && p.team);
    expect(rteams.every((p) => p.team === 'runner')).toBe(true);
  });
  it('runner gets a proximity warning without coordinates', () => {
    const g = begin(3, { hunters: 1 });
    const hunter = g.hunters[0];
    loc(g.code, hunter.token, 12.9015, 77.5015);
    loc(g.code, g.runners[0].token, 12.9018, 77.5015); // ~33 m
    const v = m.viewFor(g.room, g.room.players.get(g.runners[0].id)!);
    expect(v.hunterNear?.level).toBe('danger');
    expect(JSON.stringify(v)).not.toContain(String(12.9015));
  });
});

describe('tagging', () => {
  it('validates role, range, GPS accuracy, cooldown and updates the win condition', () => {
    const g = begin(3, { hunters: 1, tagDistance: 10 });
    const h = g.hunters[0], r = g.runners[0], r2 = g.runners[1];
    expect(m.tag(g.code, r.token).ok).toBe(false); // runner can't tag
    loc(g.code, h.token, 12.9015, 77.5015);
    loc(g.code, r.token, 12.9025, 77.5015); // ~111 m away
    loc(g.code, r2.token, 12.9015, 77.5025);
    t += TAG_COOLDOWN_MS + 1; expect(m.tag(g.code, h.token).ok).toBe(false); // out of range
    loc(g.code, r.token, 12.90155, 77.5015); // ~5.5 m
    loc(g.code, h.token, 12.9015, 77.5015, 80); // too inaccurate
    t += TAG_COOLDOWN_MS + 1;
    const bad = m.tag(g.code, h.token);
    expect(bad.ok).toBe(false);
    loc(g.code, h.token, 12.9015, 77.5015, 5);
    loc(g.code, r.token, 12.90155, 77.5015, 5);
    t += TAG_COOLDOWN_MS + 1;
    const ok = m.tag(g.code, h.token);
    expect(ok.ok).toBe(true);
    expect(g.room.players.get(r.id)!.tagged).toBe(true);
    expect(m.tag(g.code, h.token).ok).toBe(false); // cooldown
    expect(g.room.phase).toBe('playing');
    // catch the last runner
    loc(g.code, h.token, 12.9015, 77.5015, 5);
    loc(g.code, r2.token, 12.90155, 77.5015, 5);
    t += TAG_COOLDOWN_MS + 1;
    expect(m.tag(g.code, h.token).ok).toBe(true);
    expect(g.room.phase).toBe('ended');
    expect(g.room.winner).toBe('hunter');
  });
  it('refuses to tag with stale location', () => {
    const g = begin(2);
    const h = g.hunters[0];
    loc(g.code, h.token, 12.9015, 77.5015);
    t += 30_000;
    expect(m.tag(g.code, h.token).ok).toBe(false);
  });
});

describe('zone & timer', () => {
  it('eliminates a runner who stays outside the zone past the grace period', () => {
    const g = begin(2, { hunters: 1 });
    const r = g.runners[0];
    loc(g.code, r.token, 13.5, 77.5);
    m.tick();
    expect(g.room.players.get(r.id)!.tagged).toBe(false);
    const v = m.viewFor(g.room, g.room.players.get(r.id)!);
    expect(v.you.outsideMs).not.toBeNull();
    t += ZONE_GRACE_MS + 1000;
    loc(g.code, r.token, 13.5, 77.5);
    m.tick();
    expect(g.room.players.get(r.id)!.tagged).toBe(true);
    expect(g.room.winner).toBe('hunter');
  });
  it('runners win when the timer expires', () => {
    const g = begin(2, { durationMin: 5 });
    t += 5 * 60_000 + 1;
    m.tick();
    expect(g.room.phase).toBe('ended');
    expect(g.room.winner).toBe('runner');
  });
  it('shrinks the active zone over time on the server', () => {
    const g = begin(2, { durationMin: 30, shrink: true, shrinkStartMin: 5, shrinkDurMin: 10 });
    const area0 = (m.activeZone(g.room) as any).points;
    expect(m.shrinkInfo(g.room, t).phase).toBe('idle');
    t += 4.5 * 60_000; expect(m.shrinkInfo(g.room, t).phase).toBe('warning');
    t += 5 * 60_000;
    expect(m.shrinkInfo(g.room, t).phase).toBe('shrinking');
    const mid = (m.activeZone(g.room) as any).points;
    expect(Math.abs(mid[0].lat - mid[2].lat)).toBeLessThan(Math.abs(area0[0].lat - area0[2].lat));
    t += 10 * 60_000;
    expect(m.shrinkInfo(g.room, t).phase).toBe('done');
  });
});

describe('connection handling', () => {
  it('reconnects with the token and marks disconnects', () => {
    const l = lobby(2);
    m.disconnect(l.code, l.players[1].token, 's1');
    expect(l.room.players.get(l.players[1].id)!.connected).toBe(false);
    expect(m.resume(l.code, l.players[1].token, 'new').ok).toBe(true);
    expect(l.room.players.get(l.players[1].id)!.connected).toBe(true);
    expect(m.resume(l.code, 'bad-token', 'x').ok).toBe(false);
  });
  it('reassigns host if the host disconnects', () => {
    const l = lobby(3);
    m.disconnect(l.code, l.players[0].token, 's0');
    expect(l.room.hostId).not.toBe(l.players[0].id);
  });
  it('leaving mid-game eliminates a runner and can end the hunt; play again resets', () => {
    const g = begin(2, { hunters: 1 });
    m.leave(g.code, g.runners[0].token);
    expect(g.room.phase).toBe('ended');
    const host = g.players.find((p) => p.id === g.room.hostId)!;
    const r = m.playAgain(g.code, host.token);
    expect(r.ok).toBe(true);
    expect(g.room.phase).toBe('lobby');
  });
});
