
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
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('This browser has no location support.');
      return;
    }

    if (
      !window.isSecureContext &&
      location.hostname !== 'localhost'
    ) {
      setStatus('unavailable');
      setError('Location needs a secure (HTTPS) connection on phones.');
      return;
    }

    setStatus('asking');
    setError(undefined);

    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: p.coords.accuracy,
          ts: Date.now(),
        });

        setStatus('granted');
        setError(undefined);
      },

      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setStatus('denied');
          setError(
            'Location permission was denied. Enable it in your browser settings to play.'
          );
        } else if (e.code === e.TIMEOUT) {
          setError('Waiting for a GPS fix...');
        } else {
          setError('GPS signal is weak. Try moving to open sky.');
        }
      },

      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 20000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled]);

  return { pos, status, error };
}

