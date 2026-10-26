import { describe, expect, it } from 'vitest';
import { buildEmail, buildSubject, type DigestData } from '../shared/email/build';
import type { Block } from '../shared/types';

const blk = (over: Partial<Block>): Block => ({
  id: 'x', date: '2026-10-27', start: 540, end: 590, kind: 'study', title: 'CSC230 study', courseId: 'c1', examId: 'e1',
  topicId: null, topicTitle: 'Lecture <3>', method: 'recall', note: null, status: 'planned', carried: false, doneAt: null, ...over,
});

const data = (over: Partial<DigestData> = {}): DigestData => ({
  name: 'Sam <b>',
  date: '2026-10-27',
  appUrl: 'https://planner.example.com',
  courses: [{ id: 'c1', code: 'CSC230', name: 'x', color: 2 }],
  yesterday: { done: [blk({ status: 'done' })], missed: [blk({ id: 'y', start: 700, end: 750 })], doneMin: 50 },
  carried: [blk({ carried: true })],
  plan: { blocks: [blk({}), blk({ id: 'b', kind: 'break', start: 590, end: 600, title: 'Break' }), blk({ id: 'm', kind: 'meal', start: 780, end: 825, title: 'Lunch', courseId: null })], state: 'normal', warnings: [] },
  upcoming: [{ title: 'CSC230 Quiz 3', courseCode: 'CSC230', colorIndex: 2, date: '2026-11-03', time: '14:00', daysLeft: 6, hoursLeft: 144 }],
  streak: 3,
  ...over,
});

describe('email builder', () => {
  it('uses a subject with date, exam and countdown', () => {
    expect(buildEmail(data()).subject).toBe('Tue 27 Oct: CSC230 Quiz 3 in 6 days');
    expect(buildSubject(data({ upcoming: [] }))).toBe('Tue 27 Oct: Your plan for today');
    expect(buildSubject(data({ upcoming: [{ ...data().upcoming[0]!, daysLeft: 0 }] }))).toBe('Tue 27 Oct: CSC230 Quiz 3 today at 14:00');
  });
  it('contains all sections in html and text', () => {
    const m = buildEmail(data());
    for (const s of ['Yesterday', 'Carried over', 'Coming up', 'Open today', 'https://planner.example.com/today', '09:00']) expect(m.html).toContain(s);
    for (const s of ['YESTERDAY', 'CARRIED OVER', 'TODAY', 'COMING UP', 'https://planner.example.com/today', '[x]', '[ ]']) expect(m.text).toContain(s);
  });
  it('escapes user content', () => {
    const m = buildEmail(data());
    expect(m.html).not.toContain('<b>');
    expect(m.html).not.toContain('Lecture <3>');
    expect(m.html).toContain('Lecture &lt;3&gt;');
  });
  it('supports light and dark clients', () => {
    const m = buildEmail(data());
    expect(m.html).toContain('prefers-color-scheme: dark');
    expect(m.html).toContain('color-scheme');
    expect(m.html).toContain('viewport');
  });
  it('handles first day, empty day and all-done state', () => {
    const m = buildEmail(data({ yesterday: null, carried: [], upcoming: [], plan: { blocks: [], state: 'all-done', warnings: [] } }));
    expect(m.html).toContain('No plan was recorded yesterday');
    expect(m.html).toContain('Every exam is behind you');
    expect(m.text).toContain('Every exam is behind you.');
  });
});
