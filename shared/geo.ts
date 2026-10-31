import area from '@turf/area';
import kinks from '@turf/kinks';
import inside from '@turf/boolean-point-in-polygon';
import { point, polygon as tPolygon } from '@turf/helpers';
import type { LatLng, Zone } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export const MIN_ZONE_AREA_M2 = 2000;
export const MAX_ZONE_AREA_M2 = 50_000_000;
export const MIN_VERTEX_GAP_M = 3;
export const MAX_VERTICES = 60;
export const MIN_RADIUS_M = 30;
export const MAX_RADIUS_M = 5000;
export const MIN_SHRINK_FACTOR = 0.35;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const isLatLng = (p: any): p is LatLng =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

const ring = (pts: LatLng[]) => {
  const c = pts.map((p) => [p.lng, p.lat]);
  c.push(c[0]);
  return c;
};

export function polygonArea(pts: LatLng[]): number {
  return pts.length < 3 ? 0 : area(tPolygon([ring(pts)]));
}
export function polygonPerimeter(pts: LatLng[]): number {
  let t = 0;
  for (let i = 0; i < pts.length; i++) t += haversine(pts[i], pts[(i + 1) % pts.length]);
  return t;
}
export const circleArea = (r: number) => Math.PI * r * r;

export type Validation = { ok: true; area: number; perimeter: number } | { ok: false; error: string };

export function validatePolygon(pts: LatLng[], minArea = MIN_ZONE_AREA_M2): Validation {
  if (!Array.isArray(pts) || pts.length < 3) return { ok: false, error: 'Add at least 3 boundary points.' };
  if (pts.length > MAX_VERTICES) return { ok: false, error: `Use at most ${MAX_VERTICES} points.` };
  if (!pts.every(isLatLng)) return { ok: false, error: 'One of the points is not a valid location.' };
  for (let i = 0; i < pts.length; i++) {
    if (haversine(pts[i], pts[(i + 1) % pts.length]) < MIN_VERTEX_GAP_M)
      return { ok: false, error: 'Two neighbouring points are almost on top of each other. Undo or move one.' };
  }
  const poly = tPolygon([ring(pts)]);
  const a = area(poly);
  if (kinks(poly).features.length > 0)
    return { ok: false, error: 'The boundary lines cross each other. Undo or drag a point so the outline does not cross itself.' };
  if (a < 1) return { ok: false, error: 'The points are in a straight line. Spread them out to enclose an area.' };
  if (a < minArea) return { ok: false, error: `Area is too small. Minimum is ${Math.round(minArea).toLocaleString()} m².` };
  if (a > MAX_ZONE_AREA_M2) return { ok: false, error: 'Area is too large for a hunt.' };
  return { ok: true, area: a, perimeter: polygonPerimeter(pts) };
}

export function validateCircle(center: LatLng, radius: number): Validation {
  if (!isLatLng(center)) return { ok: false, error: 'Tap the map to place the circle center.' };
  if (!Number.isFinite(radius) || radius < MIN_RADIUS_M || radius > MAX_RADIUS_M)
    return { ok: false, error: `Radius must be ${MIN_RADIUS_M}–${MAX_RADIUS_M} m.` };
  return { ok: true, area: circleArea(radius), perimeter: 2 * Math.PI * radius };
}

export function validateZone(z: any): Validation {
  if (!z || typeof z !== 'object') return { ok: false, error: 'Play area is missing.' };
  if (z.kind === 'polygon') return validatePolygon(z.points);
  if (z.kind === 'circle') return validateCircle(z.center, Number(z.radius));
  return { ok: false, error: 'Unknown play area type.' };
}

export function zoneContains(z: Zone, p: LatLng): boolean {
  if (z.kind === 'circle') return haversine(z.center, p) <= z.radius;
  return inside(point([p.lng, p.lat]), tPolygon([ring(z.points)]));
}

export function zoneCenter(z: Zone): LatLng {
  if (z.kind === 'circle') return z.center;
  const n = z.points.length;
  return { lat: z.points.reduce((s, p) => s + p.lat, 0) / n, lng: z.points.reduce((s, p) => s + p.lng, 0) / n };
}

/** Uniform scale about the centre: a similarity transform, so a simple polygon always stays simple. */
export function scaleZone(z: Zone, f: number): Zone {
  if (z.kind === 'circle') return { kind: 'circle', center: z.center, radius: z.radius * f };
  const c = zoneCenter(z);
  return { kind: 'polygon', points: z.points.map((p) => ({ lat: c.lat + (p.lat - c.lat) * f, lng: c.lng + (p.lng - c.lng) * f })) };
}

export function jitter(p: LatLng, meters: number): LatLng {
  const a = Math.random() * 2 * Math.PI;
  const d = Math.random() * meters;
  return {
    lat: p.lat + (d * Math.cos(a)) / 111320,
    lng: p.lng + (d * Math.sin(a)) / (111320 * Math.max(0.05, Math.cos(rad(p.lat)))),
  };
}

export function fmtArea(m2: number): string {
  return m2 >= 100_000 ? `${(m2 / 1e6).toFixed(2)} km²` : `${Math.round(m2).toLocaleString()} m²`;
}
export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
