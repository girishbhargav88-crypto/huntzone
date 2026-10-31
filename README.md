# HUNT//ZONE

Mobile-first, real-world multiplayer hunt game. React + TypeScript + Vite + Leaflet on the front, Node + Express + Socket.IO on the back. The **server is authoritative**: roles, tag results, zone, shrinking and visibility are all decided server-side.

## Quick start (desktop)
```bash
npm install
npm run dev        # web on :5173, game server on :3001
npm test           # 40 tests (geometry, polygon draft, rooms, roles, tagging, zone, reconnect)
npm run build && npm run start   # production: server also serves dist/ on :3001
```
Health check: `GET /health`. Open the printed Vite URL on your phone (same Wi-Fi) to test.

**GPS needs HTTPS on phones** (except `localhost`). For real-phone testing use a tunnel to the web port, e.g. `cloudflared tunnel --url http://localhost:5173` or ngrok. With the tunnel in front of `npm run build && npm run start` (single port 3001) nothing else needs configuring.

## Android / Termux
```bash
pkg install nodejs git
cd huntzone && npm install && npm run build && npm run start
```
Then expose port 3001 over HTTPS with a tunnel (cloudflared/ngrok) and open that URL on every phone.

## Production
1. **Backend** (needs persistent WebSockets): deploy the repo to Render, Railway, Fly.io or any Node host. `render.yaml` is included. Start command `npm run start`, health path `/health`. Set `CORS_ORIGINS` to your frontend origin(s). Free tiers sleep when idle and state is in memory, so rooms reset on restart.
2. **Frontend** on Firebase Hosting:
   ```bash
   cp .env.example .env     # set VITE_SERVER_URL=https://your-backend.example.com
   cp .firebaserc.example .firebaserc   # put your project id
   npm run build && npx firebase-tools deploy --only hosting
   ```
   Firebase Hosting cannot run Socket.IO, so the backend is always separate.
3. Firebase Auth/Firestore are optional: if the `VITE_FIREBASE_*` values are empty, nothing initialises and the game works fully.

## Game rules enforced on the server
- Room codes, capacity, host-only start/settings/cancel, ready states, random role assignment (always ≥1 runner).
- Location updates are validated (range, accuracy, freshness ≤60 s, ≥0.8 s apart). Only the latest position is kept in memory.
- Visibility: hunters see fellow hunters live and **approximate, jittered runner pulses** every N seconds. Runners see only themselves plus a proximity warning (no coordinates) unless the host enables "Runners see hunters".
- TAG: hunter role, fresh fix, GPS accuracy ≤30 m for both players, distance ≤ configured tag distance, 3 s cooldown. Result is broadcast to everyone.
- Zone: polygon/circle validated (self-intersection, min area, near-duplicate points). Shrinking scales the zone about its centre (always a valid shape). Runners outside >30 s are out; runners with no location signal >90 s are out.
- Reconnect: session token in localStorage resumes the player; host is reassigned if the host drops.

## Layout
`shared/` types + geometry · `server/` game logic + sockets · `src/map/` Leaflet (tap-to-place `draft.ts`, `ZoneEditor`, `GameMap`) · `src/screens/` the 12 reference screens · `src/ui/` design system · `tests/`.

## Notes
- Map tiles default to OpenStreetMap's public server, which is for light use only. Set `VITE_TILE_URL` to a provider that permits your traffic before a public launch.
- GPS is approximate. Play outdoors in open areas and stay safe.
# huntzone
# huntzone
# huntzone
