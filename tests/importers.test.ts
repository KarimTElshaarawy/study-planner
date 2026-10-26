import { describe, expect, it } from 'vitest';
import { guessCourse, guessKind, parseCsv, parseCsvRows, parseIcs } from '../server/importers';

describe('importers', () => {
  it('parses quoted CSV cells', () => {
    expect(parseCsvRows('a,"b,c","d ""q"""\n1,2,3')).toEqual([['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
  });
  it('guesses kinds and courses', () => {
    expect(guessKind('PHY150L lab report due')).toBe('deadline');
    expect(guessKind('Final exam')).toBe('final');
    expect(guessCourse('CSC230 Quiz 3')).toBe('CSC230');
    expect(guessCourse('Dentist')).toBe('');
  });
  it('requires a date column', () => {
    expect(parseCsv('foo,bar\n1,2').errors).toHaveLength(1);
  });
  it('converts floating and TZID ICS times', () => {
    const ics = 'BEGIN:VEVENT\nSUMMARY:CHM120 Quiz\nDTSTART;TZID=America/New_York:20261101T090000\nEND:VEVENT';
    expect(parseIcs(ics, 'Asia/Dubai').items[0]).toMatchObject({ date: '2026-11-01', time: "18:00" });
  });
});
