import { describe, expect, it } from 'vitest';
import { haversine, scaleZone, validateCircle, validatePolygon, validateZone, zoneContains, polygonArea } from '../shared/geo';

// ~ 300 m square near the equator-ish test point
const sq = (s = 0.003) => [
  { lat: 12.9, lng: 77.5 }, { lat: 12.9, lng: 77.5 + s }, { lat: 12.9 + s, lng: 77.5 + s }, { lat: 12.9 + s, lng: 77.5 },
];

describe('geometry', () => {
  it('haversine ~ 111m per 0.001 deg lat', () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 })).toBeGreaterThan(110);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 })).toBeLessThan(112);
  });
  it('accepts a valid polygon and reports area + perimeter', () => {
    const v = validatePolygon(sq());
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.area).toBeGreaterThan(80_000); expect(v.perimeter).toBeGreaterThan(1000); }
  });
  it('rejects fewer than 3 points', () => {
    expect(validatePolygon(sq().slice(0, 2)).ok).toBe(false);
  });
  it('rejects a self-intersecting bow-tie', () => {
    const [a, b, c, d] = sq();
    const v = validatePolygon([a, c, b, d]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/cross/i);
  });
  it('rejects collinear / degenerate shapes', () => {
    const v = validatePolygon([{ lat: 1, lng: 1 }, { lat: 1, lng: 1.001 }, { lat: 1, lng: 1.002 }]);
    expect(v.ok).toBe(false);
  });
  it('rejects near-duplicate neighbours', () => {
    const p = sq();
    expect(validatePolygon([p[0], { lat: p[0].lat + 1e-7, lng: p[0].lng }, p[2], p[3]]).ok).toBe(false);
  });
  it('rejects an area below the minimum', () => {
    expect(validatePolygon(sq(0.0002)).ok).toBe(false);
  });
  it('validates circles', () => {
    expect(validateCircle({ lat: 1, lng: 1 }, 200).ok).toBe(true);
    expect(validateCircle({ lat: 1, lng: 1 }, 5).ok).toBe(false);
    expect(validateZone({ kind: 'circle', center: { lat: 1, lng: 1 }, radius: 100 }).ok).toBe(true);
    expect(validateZone({ kind: 'blob' }).ok).toBe(false);
  });
  it('zoneContains works for polygon and circle', () => {
    const z = { kind: 'polygon' as const, points: sq() };
    expect(zoneContains(z, { lat: 12.9015, lng: 77.5015 })).toBe(true);
    expect(zoneContains(z, { lat: 13.5, lng: 77.5 })).toBe(false);
    const c = { kind: 'circle' as const, center: { lat: 1, lng: 1 }, radius: 100 };
    expect(zoneContains(c, { lat: 1.0005, lng: 1 })).toBe(true);
    expect(zoneContains(c, { lat: 1.002, lng: 1 })).toBe(false);
  });
  it('scaling keeps polygons valid and shrinks area quadratically', () => {
    const z = { kind: 'polygon' as const, points: sq() };
    const s = scaleZone(z, 0.5);
    expect(s.kind).toBe('polygon');
    if (s.kind === 'polygon') {
      expect(validatePolygon(s.points).ok).toBe(true);
      expect(polygonArea(s.points) / polygonArea(z.points)).toBeCloseTo(0.25, 1);
    }
    expect((scaleZone({ kind: 'circle', center: { lat: 0, lng: 0 }, radius: 400 }, 0.5) as any).radius).toBe(200);
  });
});
