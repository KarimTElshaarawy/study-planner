import { readFileSync, existsSync } from 'node:fs';
import { planHorizon, windowDays } from '../shared/planner';
import { contextFromSeed, type SeedFile } from '../shared/seed';
import { addDays, diffDays } from '../shared/time';
import { isStudy } from '../shared/types';
import { checkDay } from '../shared/validate';

export interface SimResult {
  errors: string[];
  days: number;
  sessions: number;
}

export const simulate = (seed: SeedFile, from: string, to: string, nowMin: number | null): SimResult => {
  const ctx = contextFromSeed(seed);
  const plans = planHorizon(ctx, from, to, nowMin);
  const errors: string[] = [];
  for (const p of plans) errors.push(...checkDay(ctx, p, p.date === from ? nowMin : null));

  const all = plans.flatMap((p) => p.blocks.filter(isStudy));
  for (const e of ctx.exams) {
    if (e.date < from) continue;
    const prep = all.filter((b) => b.examId === e.id);
    if (prep.length === 0) errors.push(`no prep scheduled for ${e.title}`);
    if (prep.some((b) => b.date > e.date)) errors.push(`prep after ${e.title}`);
  }
  // no course unstudied for more than 2 days while it has an exam ahead in its prep window
  for (const c of ctx.courses) {
    let last: string | null = null;
    for (const p of plans) {
      if (all.some((b) => b.date === p.date && b.courseId === c.id)) last = p.date;
      const opens = ctx.exams
        .filter((e) => e.courseId === c.id && e.kind !== 'deadline' && diffDays(e.date, p.date) >= 2 && diffDays(e.date, p.date) <= windowDays(e))
        .map((e) => addDays(e.date, -windowDays(e) - 1));
      if (opens.length === 0) continue;
      const firstOpen = opens.reduce((a, b) => (a < b ? a : b));
      const anchor = last && last > firstOpen ? last : firstOpen;
      const named = p.warnings.some((w) => w.startsWith(c.code));
      if (diffDays(p.date, anchor) > 2 && !named) errors.push(`${c.code} unstudied ${diffDays(p.date, anchor)} days at ${p.date}`);
    }
  }
  // every deadline and exam has prep, sessions have a break or gap between them (checked per day)
  return { errors, days: plans.length, sessions: all.length };
};

export const VARIANTS: Array<[string, (s: SeedFile) => void]> = [
  ['default', () => undefined],
  ['late sleeper', (s) => {
    s.settings.sleepTime = '02:00';
    s.commitments.push({ label: 'Night shift', kind: 'work', days: [2, 4], start: '22:00', end: '01:30' });
  }],
  ['tight cap', (s) => { s.settings.dailyCapMin = 200; }],
  ['long sessions', (s) => { s.settings.sessionMin = 90; s.settings.breakMin = 15; }],
];

const main = (): void => {
  const file = existsSync('seed/personal.json') ? 'seed/personal.json' : 'seed/demo.json';
  for (const f of ['seed/demo.json', file]) {
    const seed = JSON.parse(readFileSync(f, 'utf8')) as SeedFile;
    for (const [label, mutate] of VARIANTS) {
      const variant = structuredClone(seed);
      mutate(variant);
      const last = variant.exams.reduce((m, e) => (e.date > m ? e.date : m), '2026-10-26');
      const r = simulate(variant, '2026-10-26', last, 10 * 60);
      console.log(`${f} [${label}]: ${r.days} days, ${r.sessions} sessions, ${r.errors.length} violations`);
      for (const e of r.errors.slice(0, 20)) console.log('  - ' + e);
      if (r.errors.length) process.exitCode = 1;
    }
    if (f === file) break;
  }
};

if (process.argv[1]?.endsWith('simulate.ts')) main();
