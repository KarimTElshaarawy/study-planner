import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate, VARIANTS } from '../scripts/simulate';
import type { SeedFile } from '../shared/seed';

describe('day by day simulation (26 Oct to the last exam, Dec 2026)', () => {
  for (const [label, mutate] of VARIANTS) {
    it(`holds every invariant: ${label}`, () => {
      const seed = JSON.parse(readFileSync('seed/demo.json', 'utf8')) as SeedFile;
      mutate(seed);
      const last = seed.exams.reduce((m, e) => (e.date > m ? e.date : m), '2026-10-26');
      const r = simulate(seed, '2026-10-26', last, 10 * 60);
      expect(r.errors).toEqual([]);
      expect(r.days).toBe(50);
      expect(r.sessions).toBeGreaterThan(50);
    });
  }
});
