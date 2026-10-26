import type { ExamX } from './types';

export const fmtMin = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const dur = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

const utcDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number): string => new Date(utcDate(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
export const mondayOf = (iso: string): string => {
  const dow = (utcDate(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
};
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string =>
  new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(utcDate(iso));

export interface Countdown {
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
  /** the headline number and unit */
  big: number;
  unit: string;
}

export const countdown = (e: Pick<ExamX, 'startMs' | 'endMs'>, nowMs: number): Countdown => {
  const diff = e.startMs - nowMs;
  if (diff <= 0) return { past: nowMs > e.endMs, days: 0, hours: 0, minutes: 0, big: 0, unit: nowMs > e.endMs ? 'done' : 'now' };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days >= 1) return { past: false, days, hours, minutes, big: days, unit: days === 1 ? 'day' : 'days' };
  if (hours >= 1) return { past: false, days, hours, minutes, big: hours, unit: hours === 1 ? 'hour' : 'hours' };
  return { past: false, days, hours, minutes, big: minutes, unit: minutes === 1 ? 'minute' : 'minutes' };
};

export const buzz = (ms = 8): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
};

export const METHOD_LABEL: Record<string, string> = {
  recall: 'Active recall',
  practice: 'Practice questions',
  pastpaper: 'Past paper',
  association: 'Association hook',
  quiz: 'Quiz yourself',
  write: 'Write-up',
};

export const EXAM_KIND_LABEL: Record<string, string> = { quiz: 'Quiz', midterm: 'Midterm', final: 'Final', deadline: 'Deadline' };
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
