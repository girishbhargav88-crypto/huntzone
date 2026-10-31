import type { LatLng } from '../../shared/types';
import { haversine, MAX_VERTICES, MIN_VERTEX_GAP_M, validatePolygon, type Validation } from '../../shared/geo';

/** Pure tap-to-place polygon state. The Leaflet layer only renders this; all rules live here (and are tested). */
export class PolygonDraft {
  points: LatLng[] = [];
  closed = false;

  add(p: LatLng): { ok: true } | { ok: false; error: string } {
    if (this.closed) return { ok: false, error: 'Shape is closed. Drag a point to edit it, or Undo to reopen.' };
    if (this.points.length >= MAX_VERTICES) return { ok: false, error: `You can place up to ${MAX_VERTICES} points.` };
    const last = this.points[this.points.length - 1];
    if (last && haversine(last, p) < MIN_VERTEX_GAP_M) return { ok: false, error: 'That point is too close to the last one.' };
    this.points.push({ lat: p.lat, lng: p.lng });
    return { ok: true };
  }
  /** Closing needs an explicit action: tapping the start point or a Close button. */
  close(): { ok: true } | { ok: false; error: string } {
    if (this.closed) return { ok: true };
    if (this.points.length < 3) return { ok: false, error: 'Add at least 3 points before closing the shape.' };
    this.closed = true;
    return { ok: true };
  }
  undo() {
    this.closed = false;
    this.points.pop();
  }
  clear() {
    this.points = [];
    this.closed = false;
  }
  move(i: number, p: LatLng) {
    if (this.points[i]) this.points[i] = { lat: p.lat, lng: p.lng };
  }
  validate(): Validation {
    return validatePolygon(this.points);
  }
}
