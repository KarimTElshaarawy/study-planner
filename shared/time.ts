import { DateTime } from 'luxon';
import type { Exam, Hhmm } from './types';

export const toMin = (t: Hhmm): number => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const fmtMin = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const utc = (date: string): DateTime => DateTime.fromISO(date, { zone: 'utc' });

export const addDays = (date: string, n: number): string => utc(date).plus({ days: n }).toISODate() as string;

export const diffDays = (a: string, b: string): number => Math.round(utc(a).diff(utc(b), 'days').days);

/** ISO weekday, 1 = Monday .. 7 = Sunday */
export const weekday = (date: string): number => utc(date).weekday;

export const isValidTimezone = (tz: string): boolean => DateTime.local().setZone(tz).isValid;

export interface LocalNow {
  date: string;
  min: number;
}

export const localNow = (tz: string, nowMs: number = Date.now()): LocalNow => {
  const dt = DateTime.fromMillis(nowMs, { zone: tz });
  return { date: dt.toISODate() as string, min: dt.hour * 60 + dt.minute };
};

export const examStartMs = (exam: Pick<Exam, 'date' | 'time'>, tz: string): number =>
  DateTime.fromISO(`${exam.date}T${exam.time}`, { zone: tz }).toMillis();

export const examEndMs = (exam: Exam, tz: string): number => examStartMs(exam, tz) + exam.durationMin * 60000;

export const formatDateLong = (date: string): string => utc(date).toFormat('ccc d LLL');
