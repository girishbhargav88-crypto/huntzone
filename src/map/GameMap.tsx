import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { GameView, Zone } from '../../shared/types';
import type { Pos } from '../geo/useGeolocation';
import { clusterIcon, playerIcon, pulseIcon, userDotIcon } from './markers';
import { createMap } from './tiles';

export interface MapHandle { recenter: (p: { lat: number; lng: number }) => void; fit: () => void }
const MINT = '#5eeab0', RED = '#ff4d55';
const STALE_MS = 30_000, CLUSTER_PX = 30;

function zoneLayer(z: Zone, o: L.PathOptions): L.Path {
  return z.kind === 'circle' ? L.circle([z.center.lat, z.center.lng], { radius: z.radius, ...o }) : L.polygon(z.points.map((p) => [p.lat, p.lng] as L.LatLngTuple), o);
}

export const GameMap = forwardRef<MapHandle, { view: GameView; me: Pos | null; onSelect: (id: string | null) => void }>(({ view, me, onSelect }, ref) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null), zones = useRef<L.LayerGroup | null>(null), pins = useRef<L.LayerGroup | null>(null);
  const data = useRef({ view, me });
  const fitted = useRef(false);
  const sel = useRef(onSelect); sel.current = onSelect;
  data.current = { view, me };

  const fit = () => {
    const m = map.current; if (!m) return;
    const b = (zoneLayer(data.current.view.zone, {}) as L.Polygon | L.Circle).getBounds();
    if (b?.isValid()) m.fitBounds(b, { padding: [36, 36], animate: false });
  };
  useImperativeHandle(ref, () => ({
    recenter: (p) => map.current?.setView([p.lat, p.lng], Math.max(map.current.getZoom(), 17)),
    fit,
  }));

  const drawPins = () => {
    const m = map.current, g = pins.current; if (!m || !g) return;
    const { view: v, me: mine } = data.current;
    g.clearLayers();
    const team = v.you.team;
    // my own marker comes from the local GPS fix so it moves instantly
    if (mine && team) L.marker([mine.lat, mine.lng], { icon: playerIcon(team, { self: true, tagged: v.you.tagged }), zIndexOffset: 2000 }).on('click', () => sel.current(v.you.id)).addTo(g);
    else if (mine) L.marker([mine.lat, mine.lng], { icon: userDotIcon(), interactive: false }).addTo(g);
    if (mine) L.circle([mine.lat, mine.lng], { radius: mine.acc, stroke: false, fillColor: '#38aaff', fillOpacity: 0.1, interactive: false }).addTo(g);
    for (const p of v.pulses) {
      L.marker([p.lat, p.lng], { icon: pulseIcon(v.now - p.ts > v.settings.pulseSec * 1500) }).on('click', () => sel.current('pulse:' + p.id)).addTo(g);
    }
    // greedy pixel clustering for other players
    const others = v.markers.filter((x) => !x.self).map((x) => ({ x, pt: m.latLngToContainerPoint([x.lat, x.lng]) }));
    const used = new Set<number>();
    others.forEach((a, i) => {
      if (used.has(i)) return;
      const grp = [a]; used.add(i);
      others.forEach((b, j) => { if (!used.has(j) && a.pt.distanceTo(b.pt) < CLUSTER_PX) { grp.push(b); used.add(j); } });
      if (grp.length === 1) {
        const x = a.x;
        L.marker([x.lat, x.lng], { icon: playerIcon(x.team, { tagged: x.tagged, stale: v.now - x.ts > STALE_MS }) }).on('click', () => sel.current(x.id)).addTo(g);
      } else {
        const c = L.latLngBounds(grp.map((q) => [q.x.lat, q.x.lng] as L.LatLngTuple));
        L.marker(c.getCenter(), { icon: clusterIcon(grp.length, grp.every((q) => q.x.team === 'hunter')) })
          .on('click', () => m.fitBounds(c.pad(0.5), { maxZoom: 19 })).addTo(g);
      }
    });
  };

  useEffect(() => {
    const { map: m, dispose } = createMap(el.current!);
    map.current = m; zones.current = L.layerGroup().addTo(m); pins.current = L.layerGroup().addTo(m);
    m.on('zoomend moveend', drawPins);
    m.on('click', () => sel.current(null));
    return () => { dispose(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = zones.current; if (!g) return;
    g.clearLayers();
    const shrinking = view.shrink.phase === 'shrinking' || view.shrink.phase === 'done';
    if (shrinking) {
      zoneLayer(view.zone, { color: '#6fb8a8', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(g);
      zoneLayer(view.activeZone, { color: RED, weight: 3, fillColor: RED, fillOpacity: 0.16, interactive: false }).addTo(g);
    } else {
      zoneLayer(view.activeZone, { color: MINT, weight: 3, fillColor: MINT, fillOpacity: 0.06, interactive: false }).addTo(g);
    }
    if (!fitted.current) { fit(); fitted.current = true; }
  }, [view.zone, view.activeZone, view.shrink.phase]);

  useEffect(drawPins, [view.markers, view.pulses, view.you.team, view.you.tagged, me]);

  return <div ref={el} className="map" />;
});
