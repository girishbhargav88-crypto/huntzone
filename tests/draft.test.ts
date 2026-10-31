import { describe, expect, it } from 'vitest';
import { PolygonDraft } from '../src/map/draft';

const P = (lat: number, lng: number) => ({ lat: 12.9 + lat, lng: 77.5 + lng });

describe('PolygonDraft (tap-to-place)', () => {
  it('adds vertices one tap at a time', () => {
    const d = new PolygonDraft();
    expect(d.add(P(0, 0)).ok).toBe(true);
    expect(d.add(P(0, 0.003)).ok).toBe(true);
    expect(d.points).toHaveLength(2);
  });
  it('ignores duplicate / nearly identical consecutive points', () => {
    const d = new PolygonDraft();
    d.add(P(0, 0));
    expect(d.add(P(0.0000001, 0)).ok).toBe(false);
    expect(d.points).toHaveLength(1);
  });
  it('refuses to close with too few vertices', () => {
    const d = new PolygonDraft();
    d.add(P(0, 0)); d.add(P(0, 0.003));
    const r = d.close();
    expect(r.ok).toBe(false);
    expect(d.closed).toBe(false);
  });
  it('closes only on an explicit close (tapping the start point) and then validates', () => {
    const d = new PolygonDraft();
    d.add(P(0, 0)); d.add(P(0, 0.003)); d.add(P(0.003, 0.003)); d.add(P(0.003, 0));
    expect(d.closed).toBe(false);
    expect(d.close().ok).toBe(true);
    expect(d.closed).toBe(true);
    expect(d.validate().ok).toBe(true);
    expect(d.add(P(0.01, 0.01)).ok).toBe(false); // no more points once closed
  });
  it('undo removes the last vertex and reopens a closed shape', () => {
    const d = new PolygonDraft();
    d.add(P(0, 0)); d.add(P(0, 0.003)); d.add(P(0.003, 0.003));
    d.close();
    d.undo();
    expect(d.closed).toBe(false);
    expect(d.points).toHaveLength(2);
  });
  it('clear wipes the draft', () => {
    const d = new PolygonDraft();
    d.add(P(0, 0)); d.add(P(0, 0.003)); d.add(P(0.003, 0.003)); d.close();
    d.clear();
    expect(d.points).toHaveLength(0);
    expect(d.closed).toBe(false);
  });
  it('flags a self-intersecting shape after closing', () => {
    const d = new PolygonDraft();
    d.add(P(0, 0)); d.add(P(0.003, 0.003)); d.add(P(0, 0.003)); d.add(P(0.003, 0));
    d.close();
    expect(d.validate().ok).toBe(false);
  });
});
