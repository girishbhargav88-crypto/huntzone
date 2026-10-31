import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { GameManager, type Res } from './game';

const PORT = Number(process.env.PORT) || 3001;
const ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
const corsOrigin = ORIGINS.includes('*') ? true : ORIGINS;

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: mgr.rooms.size, uptime: Math.round(process.uptime()) }));

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin }, pingInterval: 10_000, pingTimeout: 15_000, maxHttpBufferSize: 50_000 });
const mgr = new GameManager();

function push(code: string) {
  const room = mgr.rooms.get(code);
  if (!room) return;
  for (const p of room.players.values()) if (p.socketId && p.connected) io.to(p.socketId).emit('state', mgr.viewFor(room, p));
}

io.on('connection', (s: Socket) => {
  let bucket = 0;
  const timer = setInterval(() => (bucket = 0), 1000);
  const limited = () => ++bucket > 40;
  const reply = (ack: unknown, r: unknown) => typeof ack === 'function' && (ack as (x: unknown) => void)(r);
  const ctx = () => s.data as { code?: string; token?: string };

  const bind = (code: string) => { s.data = { ...s.data, code }; };

  s.on('room:create', (d, ack) => {
    if (limited()) return;
    const r = mgr.createRoom(d?.name, d?.settings, d?.zone, s.id);
    if (r.ok) { s.data = { code: r.code, token: r.token }; reply(ack, r); push(r.code); } else reply(ack, r);
  });
  s.on('room:join', (d, ack) => {
    if (limited()) return;
    const r = mgr.join(d?.code, d?.name, s.id);
    if (r.ok) { s.data = { code: r.code, token: r.token }; reply(ack, r); push(r.code); } else reply(ack, r);
  });
  s.on('room:resume', (d, ack) => {
    if (limited()) return;
    const r = mgr.resume(d?.code, d?.token, s.id);
    if (r.ok) { s.data = { code: r.code, token: d.token }; bind(r.code); reply(ack, r); push(r.code); } else reply(ack, r);
  });

  const act = (ev: string, fn: (d: any, c: { code: string; token: string }) => Res<any>, pushAfter = true) =>
    s.on(ev, (d, ack) => {
      if (limited()) return;
      const { code, token } = ctx();
      if (!code || !token) return reply(ack, { ok: false, error: 'Not in a hunt.' });
      const r = fn(d, { code, token });
      reply(ack, r);
      if (r.ok && pushAfter) push(code);
    });

  act('room:ready', (d, c) => mgr.setReady(c.code, c.token, d?.ready));
  act('room:settings', (d, c) => mgr.updateSettings(c.code, c.token, d));
  act('game:start', (_d, c) => mgr.start(c.code, c.token));
  act('game:tag', (_d, c) => mgr.tag(c.code, c.token));
  act('game:again', (_d, c) => mgr.playAgain(c.code, c.token));
  act('loc:sharing', (d, c) => mgr.setSharing(c.code, c.token, d?.on));
  act('loc:update', (d, c) => mgr.updateLocation(c.code, c.token, d), false);
  s.on('room:leave', (_d, ack) => {
    const { code, token } = ctx();
    if (!code) return reply(ack, { ok: true });
    const r = mgr.leave(code, token);
    s.data = {};
    reply(ack, r);
    push(code);
  });
  s.on('room:cancel', (_d, ack) => {
    const { code, token } = ctx();
    const r = mgr.cancel(code, token);
    if (r.ok) for (const id of r.socketIds) io.to(id).emit('room:closed');
    reply(ack, r.ok ? { ok: true } : r);
  });
  s.on('disconnect', () => {
    clearInterval(timer);
    const { code, token } = ctx();
    if (code) { mgr.disconnect(code, token, s.id); push(code); }
  });
});

setInterval(() => {
  mgr.tick();
  for (const code of mgr.rooms.keys()) push(code);
}, 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`HUNT//ZONE server on :${PORT} (health: /health)${fs.existsSync(dist) ? ' + serving dist/' : ''}`));
