import L from 'leaflet';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { LatLng, Zone } from '../../shared/types';
import { circleArea, fmtArea, fmtDist, MAX_RADIUS_M, MIN_RADIUS_M, validateCircle } from '../../shared/geo';
import { Icon } from '../ui/icons';
import { Button, useToast } from '../ui/ui';
import { useGeolocation } from '../geo/useGeolocation';
import { PolygonDraft } from './draft';
import { createMap } from './tiles';
import { userDotIcon } from './markers';

const MINT = '#5eeab0', TEAL = '#2fd1b4';

export function ZoneEditor({ mode, onConfirm, onBack }: { mode: 'polygon' | 'circle'; onConfirm: (z: Zone) => void; onBack: () => void }) {
  const root = useRef<HTMLDivElement>(null), el = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null), layer = useRef<L.LayerGroup | null>(null), userLayer = useRef<L.LayerGroup | null>(null);
  const poly = useRef<L.Polygon | L.Polyline | null>(null);
  const draft = useRef(new PolygonDraft());
  const center = useRef<LatLng | null>(null);
  const radiusRef = useRef(300);
  const [radius, setRadius] = useState(300);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const toast = useToast();
  const geo = useGeolocation(true);
  const firstFix = useRef(true), touched = useRef(false);

  const fit = useCallback(() => {
    const m = map.current; if (!m) return;
    const h = bar.current?.offsetHeight ?? 200;
    const b = mode === 'polygon' ? (poly.current as L.Polygon | null)?.getBounds() : center.current ? L.circle(center.current, { radius: radiusRef.current }).getBounds() : null;
    if (b?.isValid()) m.fitBounds(b, { paddingTopLeft: [30, 110], paddingBottomRight: [30, h + 30], animate: true });
  }, [mode]);

  const draw = useCallback(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers(); poly.current = null;
    const label = (c: L.LatLngExpression, txt: string) =>
      L.marker(c, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="zlabel">${txt}<small>(approx)</small></div>` }) }).addTo(g);
    if (mode === 'polygon') {
      const d = draft.current;
      const ll = d.points.map((p) => L.latLng(p.lat, p.lng));
      if (d.closed) poly.current = L.polygon(ll, { color: MINT, weight: 3, fillColor: TEAL, fillOpacity: 0.28 }).addTo(g);
      else {
        if (ll.length >= 3) L.polygon(ll, { stroke: false, fillColor: TEAL, fillOpacity: 0.12, interactive: false }).addTo(g);
        if (ll.length > 1) poly.current = L.polyline(ll, { color: MINT, weight: 3 }).addTo(g);
      }
      ll.forEach((p, i) => {
        const showLbl = i === 0 && !d.closed && ll.length >= 3;
        const icon = L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div class="vtx ${i === 0 ? 'first' : ''}">${showLbl ? '<span class="vlabel">Tap to close</span>' : ''}</div>` });
        const mk = L.marker(p, { icon, draggable: d.closed, keyboard: false, zIndexOffset: i === 0 ? 1000 : 0 }).addTo(g);
        if (i === 0) mk.on('click', () => {
          if (d.closed) return;
          const r = d.close();
          if (!r.ok) { toast(r.error, 'err'); return; }
          draw(); fit(); bump();
        });
        if (d.closed) {
          mk.on('drag', (e) => {
            const q = (e.target as L.Marker).getLatLng();
            d.move(i, { lat: q.lat, lng: q.lng });
            (poly.current as L.Polygon | null)?.setLatLngs(d.points.map((x) => L.latLng(x.lat, x.lng)));
          });
          mk.on('dragend', () => { draw(); bump(); });
        }
      });
      const v = d.closed ? d.validate() : null;
      if (v?.ok) label([ll.reduce((s, p) => s + p.lat, 0) / ll.length, ll.reduce((s, p) => s + p.lng, 0) / ll.length], fmtArea(v.area));
    } else if (center.current) {
      const c = L.latLng(center.current.lat, center.current.lng);
      const circle = L.circle(c, { radius: radiusRef.current, color: MINT, weight: 3, fillColor: TEAL, fillOpacity: 0.28 }).addTo(g);
      const mk = L.marker(c, { draggable: true, icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: '<div class="vtx first"></div>' }) }).addTo(g);
      mk.on('drag', (e) => { const q = (e.target as L.Marker).getLatLng(); center.current = { lat: q.lat, lng: q.lng }; circle.setLatLng(q); });
      mk.on('dragend', () => { draw(); bump(); });
      label(c, fmtArea(circleArea(radiusRef.current)));
    }
  }, [mode, toast, fit]);

  useEffect(() => {
    const { map: m, dispose } = createMap(el.current!);
    map.current = m; layer.current = L.layerGroup().addTo(m); userLayer.current = L.layerGroup().addTo(m);
    m.on('dragstart zoomstart', () => { touched.current = true; });
    // 'click' is not fired after a pan gesture, so dragging the map never adds a vertex.
    m.on('click', (e: L.LeafletMouseEvent) => {
      touched.current = true;
      if (mode === 'polygon') {
        const r = draft.current.add({ lat: e.latlng.lat, lng: e.latlng.lng });
        if (!r.ok) { toast(r.error, 'err'); return; }
      } else center.current = { lat: e.latlng.lat, lng: e.latlng.lng };
      draw(); bump();
    });
    const h = new ResizeObserver(() => root.current?.style.setProperty('--bar-h', `${bar.current?.offsetHeight ?? 0}px`));
    if (bar.current) h.observe(bar.current);
    return () => { h.disconnect(); layer.current?.clearLayers(); dispose(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const m = map.current, u = userLayer.current; if (!m || !u || !geo.pos) return;
    u.clearLayers(); L.marker([geo.pos.lat, geo.pos.lng], { icon: userDotIcon(), interactive: false }).addTo(u);
    if (firstFix.current && !touched.current) { m.setView([geo.pos.lat, geo.pos.lng], 17); }
    firstFix.current = false;
  }, [geo.pos]);

  const d = draft.current;
  const v = mode === 'polygon' ? (d.closed ? d.validate() : null) : center.current ? validateCircle(center.current, radius) : null;
  const canClose = mode === 'polygon' && !d.closed && d.points.length >= 3;
  const hint = mode === 'polygon'
    ? d.closed ? 'Drag a point to adjust the shape.' : d.points.length >= 3 ? 'Tap the starting point to close.' : d.points.length ? 'Keep tapping to add boundary points.' : 'Tap the map to add boundary points.'
    : center.current ? 'Drag the center or use the slider to resize.' : 'Tap the map to place the circle center.';

  const recenter = () => {
    if (geo.pos && map.current) map.current.setView([geo.pos.lat, geo.pos.lng], Math.max(map.current.getZoom(), 17));
    else toast(geo.error ?? 'Waiting for a GPS fix…', 'err');
  };
  const confirm = () => {
    if (mode === 'polygon') { if (v?.ok) onConfirm({ kind: 'polygon', points: d.points }); }
    else if (center.current && v?.ok) onConfirm({ kind: 'circle', center: center.current, radius });
  };

  return (
    <div ref={root} style={{ position: 'absolute', inset: 0 }}>
      <div ref={el} className="map" />
      <div className="overlay top">
        <div className="glass hdr" style={{ padding: '0 4px' }}>
          <button className="iconbtn" onClick={onBack} aria-label="Back"><Icon n="back" /></button>
          <h2>{mode === 'polygon' ? 'Draw Play Area' : 'Circle Play Area'}</h2>
          <button className="iconbtn" onClick={() => toast(hint)} aria-label="Help"><Icon n="help" /></button>
        </div>
        <div className="glass" style={{ marginTop: 8, padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 14, borderRadius: 14 }} role="status">{hint}</div>
      </div>
      <div className="overlay bottom" ref={bar}>
        <button className="fab" onClick={recenter} aria-label="Recenter on my location"><Icon n="nav" s={26} /></button>
        {v && (
          <div className="glass" style={{ padding: '8px 14px', fontSize: 13, borderColor: v.ok ? 'var(--line)' : 'var(--red)', color: v.ok ? 'var(--text)' : '#ffb1b5', textAlign: 'center' }} role="status">
            {v.ok ? `${fmtArea(v.area)} area · ${fmtDist(v.perimeter)} ${mode === 'polygon' ? 'perimeter' : 'around'}${mode === 'circle' ? ` · ${radius} m radius` : ''}` : v.error}
          </div>
        )}
        {mode === 'circle' && center.current && (
          <div className="glass" style={{ width: '100%', maxWidth: 520, padding: '6px 14px' }}>
            <input type="range" min={MIN_RADIUS_M} max={MAX_RADIUS_M > 2000 ? 2000 : MAX_RADIUS_M} step={10} value={radius} aria-label="Radius in metres"
              onChange={(e) => { const r = Number(e.target.value); radiusRef.current = r; setRadius(r); draw(); }} onPointerUp={fit} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 520 }}>
          <Button kind="secondary" className="sm" style={{ flex: 1 }} icon="undo" disabled={mode === 'polygon' ? !d.points.length : !center.current}
            onClick={() => { if (mode === 'polygon') d.undo(); else center.current = null; draw(); bump(); }}>Undo</Button>
          <Button kind="secondary" className="sm" style={{ flex: 1 }} icon="trash" disabled={mode === 'polygon' ? !d.points.length : !center.current}
            onClick={() => { d.clear(); center.current = null; draw(); bump(); }}>Clear</Button>
        </div>
        {mode === 'polygon' && !d.closed
          ? <Button disabled={!canClose} icon="check" onClick={() => { const r = d.close(); if (!r.ok) toast(r.error, 'err'); else { draw(); fit(); bump(); } }}>CLOSE SHAPE</Button>
          : <Button disabled={!v?.ok} icon="next" onClick={confirm}>CONFIRM AREA</Button>}
      </div>
    </div>
  );
}
