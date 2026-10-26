import { contextFromSeed, type SeedFile } from '../shared/seed';
import type { Repo } from './repo';

export const PLACEHOLDER_TOPICS = ['Lectures 1-3', 'Lectures 4-6', 'Lectures 7-9', 'Problem sets', 'Past paper themes'];

export const applySeed = (repo: Repo, seed: SeedFile, opts: { settings: boolean }): void => {
  const ctx = contextFromSeed(seed);
  repo.tx(() => {
    repo.db.exec('DELETE FROM blocks; DELETE FROM exams; DELETE FROM topics; DELETE FROM commitments; DELETE FROM courses;');
    if (opts.settings) repo.saveSettings({ ...ctx.settings, setupDone: seed.settings.setupDone ?? true });
    for (const c of ctx.courses) repo.createCourse({ code: c.code, name: c.name, color: c.color }, c.id);
    for (const t of ctx.topics) repo.createTopic({ courseId: t.courseId, title: t.title }, t.id);
    for (const e of ctx.exams) repo.createExam({ ...e }, e.id);
    for (const c of ctx.commitments) repo.createCommitment({ ...c }, c.id);
  });
};
