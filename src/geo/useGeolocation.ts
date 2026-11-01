
import { useEffect, useState } from 'react';

export interface Pos {
  lat: number;
  lng: number;
  acc: number;
  ts: number;
}

export type GeoStatus =
  | 'idle'
  | 'asking'
  | 'granted'
  | 'denied'
  | 'unavailable';

export function useGeolocation(enabled: boolean) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('This browser does not support GPS.');
      return;
    }

    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setStatus('unavailable');
      setError('GPS requires a secure HTTPS connection.');
      return;
    }

    setStatus('asking');
    let previous: Pos | null = null;

    const distance = (a: Pos, b: Pos) => {
      const R = 6371000;
      const rad = (n: number) => n * Math.PI / 180;

      const dLat = rad(b.lat - a.lat);
      const dLng = rad(b.lng - a.lng);

      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) *
        Math.cos(rad(b.lat)) *
        Math.sin(dLng / 2) ** 2;

      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next: Pos = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: p.coords.accuracy,
          ts: Date.now()
        };

        // Reject readings with poor accuracy.
        if (!Number.isFinite(next.acc) || next.acc > 50) {
          setError(`GPS accuracy is weak: ±${Math.round(next.acc)}m. Move to an open area.`);
          return;
        }

        // Reject suspiciously large location jumps.
        if (previous) {
          const elapsed = Math.max(0.1, (next.ts - previous.ts) / 1000);
          const moved = distance(previous, next);
          const allowed = Math.max(
            80,
            elapsed * 15 + previous.acc + next.acc
          );

          if (moved > allowed) {
            setError('Unstable GPS reading. Waiting for a better fix...');
            return;
          }
        }

        previous = next;
        setPos(next);
        setStatus('granted');
        setError(undefined);
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission was denied. Enable it in browser settings.');
        } else if (e.code === e.TIMEOUT) {
          setError('Waiting for a GPS fix. Try moving to an open area.');
        } else {
          setError('Unable to determine your location.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000
      }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { pos, status, error };
}

