import { useEffect, useState } from 'react';
import { useBoot } from './query';

/** Current time, aligned with the server clock when it is deliberately offset (demo mode). */
export const useNow = (intervalMs = 30_000): number => {
  const boot = useBoot();
  const raw = boot.data ? boot.data.clock.nowMs - boot.dataUpdatedAt : 0;
  const offset = Math.abs(raw) < 120_000 ? 0 : raw;
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = window.setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, offset]);
  return now;
};

export type ThemePref = 'system' | 'light' | 'dark';
export const getTheme = (): ThemePref => {
  try {
    return (localStorage.getItem('cadence-theme') as ThemePref | null) ?? 'system';
  } catch {
    return 'system';
  }
};
export const applyTheme = (t: ThemePref): void => {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try {
    localStorage.setItem('cadence-theme', t);
  } catch {
    // storage unavailable
  }
};
