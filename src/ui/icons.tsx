import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />, minus: <path d="M5 12h14" />,
  back: <path d="m15 5-7 7 7 7" />, next: <path d="M5 12h14m-6-6 6 6-6 6" />, chevron: <path d="m9 5 7 7-7 7" />, down: <path d="m6 9 6 6 6-6" />,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
  share: <><path d="M12 15V3m0 0L8 7m4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  crown: <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7" />, close: <path d="M6 6l12 12M18 6 6 18" />,
  nav: <path d="M12 3 4.5 20.5 12 16.5l7.5 4z" fill="currentColor" />,
  locate: <><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />, help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17v.01" /></>,
  signal: <path d="M4 18v-3M9 18v-7M14 18V7M19 18V3" />,
  signaloff: <><path d="M4 18v-3M9 18v-7M14 18V7" /><path d="M3 3l18 18" /></>,
  warn: <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 17.5v.01" /></>,
  hood: <><path d="M12 3C7.5 3 5 7 5 11c0 3 .8 5 2 7l-3 3h16l-3-3c1.2-2 2-4 2-7 0-4-2.500-8-7-8z" /><path d="M9 11.500h6" /></>,
  runner: <><circle cx="12" cy="6.500" r="3" /><path d="M5.500 21v-3a6.500 6.500 0 0 1 13 0v3" /></>,
  users: <><circle cx="9" cy="8" r="3.200" /><path d="M3 20v-1.500a6 6 0 0 1 12 0V20" /><circle cx="17.500" cy="9" r="2.500" /><path d="M17.500 14a4.500 4.500 0 0 1 3.500 4.400V20" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M9 7h6" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  pencil: <><path d="m4 20 1-4L16.500 4.500a2 2 0 0 1 3 3L8 19z" /></>,
  circle: <circle cx="12" cy="12" r="8" />, crown2: <path d="m3 8 4.500 4L12 5l4.500 7L21 8l-2 11H5z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />, chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  pin: <><path d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z" /><circle cx="12" cy="9.500" r="2.500" /></>,
  eye: <><path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  run: <><circle cx="14" cy="4.500" r="2" /><path d="m7 21 3.500-6-2-3.500 4-3 3 3.500h3M10.500 15l3 2 1 4" /></>,
};

export function Icon({ n, s = 24, c, fill }: { n: keyof typeof P | string; s?: number; c?: string; fill?: boolean }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={c ? { color: c } : undefined} aria-hidden>
      {P[n] ?? null}
    </svg>
  );
}

export function Logo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke="#5eeab0" strokeWidth="5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 14px #5eeab066)' }} aria-hidden>
      <circle cx="48" cy="48" r="26" /><circle cx="48" cy="48" r="6" fill="#5eeab0" />
      <path d="M48 8v18M48 70v18M8 48h18M70 48h18" />
    </svg>
  );
}
