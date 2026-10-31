import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const env = import.meta.env;
export const TILE_URL: string = env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR: string = env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const DEFAULT_CENTER: L.LatLngTuple = [51.505, -0.09];

/** Creates a Leaflet map with OSM tiles, attribution, separate zoom control and automatic resize handling. */
export function createMap(el: HTMLElement): { map: L.Map; dispose: () => void } {
  const map = L.map(el, { zoomControl: false, attributionControl: false, preferCanvas: true, tap: true, maxZoom: 19 } as L.MapOptions)
    .setView(DEFAULT_CENTER, 13);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR, crossOrigin: true }).addTo(map);
  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  el.classList.add('dark-tiles');
  const fix = () => map.invalidateSize({ animate: false });
  const ro = new ResizeObserver(fix);
  ro.observe(el);
  window.addEventListener('orientationchange', fix);
  window.addEventListener('resize', fix);
  window.visualViewport?.addEventListener('resize', fix);
  setTimeout(fix, 50);
  return {
    map,
    dispose: () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', fix);
      window.removeEventListener('resize', fix);
      window.visualViewport?.removeEventListener('resize', fix);
      map.off();
      map.remove();
    },
  };
}
