import L from 'leaflet';
import type { Team } from '../../shared/types';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const GLYPH: Record<Team, string> = {
  hunter: '<g stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"><circle cx="20" cy="20" r="7"/><path d="M20 9v5M20 26v5M9 20h5M26 20h5"/></g><circle cx="20" cy="20" r="2" fill="#fff"/>',
  runner: '<g fill="#fff"><circle cx="20" cy="14.500" r="4.200"/><path d="M11.500 29c0-5 3.800-8 8.500-8s8.500 3 8.500 8z"/></g>',
};
const FILL: Record<Team, string> = { hunter: '#e23a46', runner: '#1da5c8' };

export function playerIcon(team: Team, o: { self?: boolean; stale?: boolean; tagged?: boolean } = {}) {
  const cls = ['mk', o.self && 'self', o.stale && 'stale', o.tagged && 'tagged'].filter(Boolean).join(' ');
  const slash = o.tagged ? '<path d="M9 9l22 22" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' : '';
  return L.divIcon({
    className: '', iconSize: [40, 40], iconAnchor: [20, 20],
    html: `<div class="${cls}"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17.500" fill="${FILL[team]}" stroke="#fff" stroke-width="2.500"/>${GLYPH[team]}${slash}</svg></div>`,
  });
}
/** Hunter-only approximate runner pulse: dashed ring, no live-GPS look. */
export function pulseIcon(stale: boolean) {
  return L.divIcon({
    className: '', iconSize: [44, 44], iconAnchor: [22, 22],
    html: `<div class="mk pulse ${stale ? 'stale' : ''}" style="width:44px;height:44px"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="#1da5c833" stroke="#7cdcf5" stroke-width="2.500" stroke-dasharray="4 4"/><circle cx="22" cy="22" r="6" fill="#7cdcf5"/></svg></div>`,
  });
}
export function clusterIcon(n: number, red: boolean) {
  return L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 20], html: `<div class="cluster ${red ? 'red' : ''}">${n}</div>` });
}
export const userDotIcon = () => L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="userdot"></div>' });
