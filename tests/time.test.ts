import { describe, expect, it } from 'vitest';
import { addDays, diffDays, examStartMs, fmtMin, isValidTimezone, localNow, toMin, weekday } from '../shared/time';

describe('time helpers', () => {
  it('converts minutes and clock strings', () => {
    expect(toMin('06:30')).toBe(390);
    expect(fmtMin(390)).toBe('06:30');
    expect(fmtMin(1500)).toBe('01:00');
  });
  it('does day arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-12-09', '2026-10-26')).toBe(44);
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2);
    expect(weekday('2026-10-26')).toBe(1);
  });
  it('computes local now in the configured timezone', () => {
    const t = Date.UTC(2026, 9, 26, 22, 30); // 22:30 UTC
    expect(localNow('Asia/Dubai', t)).toEqual({ date: '2026-10-27', min: 2 * 60 + 30 });
    expect(localNow('America/New_York', t)).toEqual({ date: '2026-10-26', min: 18 * 60 + 30 });
  });
  it('resolves an exam instant in its timezone', () => {
    const e = { date: '2026-11-12', time: '08:15' };
    expect(examStartMs(e, 'Asia/Dubai')).toBe(Date.UTC(2026, 10, 12, 4, 15));
    expect(examStartMs(e, 'UTC')).toBe(Date.UTC(2026, 10, 12, 8, 15));
  });
  it('validates timezones', () => {
    expect(isValidTimezone('Asia/Dubai')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
  });
});
