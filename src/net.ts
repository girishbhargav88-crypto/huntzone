import { io } from 'socket.io-client';
import type { Ack } from '../shared/types';

const env = import.meta.env;
export const SERVER_URL: string | undefined = env.VITE_SERVER_URL || (env.DEV ? `${location.protocol}//${location.hostname}:3001` : undefined);
export const socket = io(SERVER_URL ?? '/', { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });

export function emit<T = object>(ev: string, data?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: 'The server did not respond. Check your connection.' }), 8000);
    socket.emit(ev, data, (r: Ack<T>) => { clearTimeout(t); resolve(r); });
  });
}
