import { useEffect, useState } from 'react';

export interface Pos { lat: number; lng: number; acc: n>
export type GeoStatus = 'idle' | 'asking' | 'granted' |>

export function useGeolocation(enabled: boolean) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle>
  const [error, setError] = useState<string | undefined>

  useEffect(() => {
    if (!enabled) { setStatus('idle'); return; }
    if (!('geolocation' in navigator)) { setStatus('una>
    if (!window.isSecureContext && location.hostname !=>
      setStatus('unavailable'); setError('Location need>
    }
    setStatus('asking');
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.>
      (e) => {
        if (e.code === e.PERMISSION_DENIED) { setStatus>
        else setError(e.code === e.TIMEOUT ? 'Waiting f>
      },
      { enableHighAccuracy: true, maximumAge: 2000, tim>
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { pos, status, error };
}




