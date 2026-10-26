import type { Settings } from './types';

export const defaultSettings = (timezone: string): Settings => ({
  name: '',
  timezone,
  email: '',
  wakeTime: '07:00',
  sleepTime: '23:30',
  sessionMin: 50,
  breakMin: 10,
  longBreakMin: 25,
  longBreakEvery: 3,
  dailyCapMin: 360,
  windDownMin: 30,
  morningMin: 30,
  meals: [
    { label: 'Breakfast', time: '07:30', durationMin: 30 },
    { label: 'Lunch', time: '13:00', durationMin: 45 },
    { label: 'Dinner', time: '19:30', durationMin: 45 },
  ],
  emailTime: '06:30',
  emailEnabled: true,
  setupDone: false,
});

export const EXAM_DEFAULTS = {
  quiz: { durationMin: 60, weight: 1 },
  midterm: { durationMin: 90, weight: 3 },
  final: { durationMin: 120, weight: 5 },
  deadline: { durationMin: 0, weight: 2 },
} as const;
