import { readFileSync } from 'node:fs';
import { contextFromSeed, type SeedFile } from '../shared/seed';
import type { Block, PlanContext } from '../shared/types';

export const demoSeed = (): SeedFile => JSON.parse(readFileSync('seed/demo.json', 'utf8')) as SeedFile;
export const demoCtx = (): PlanContext => contextFromSeed(demoSeed());

export const doneBlock = (over: Partial<Block> & Pick<Block, 'date' | 'start' | 'end'>): Block => ({
  id: `${over.date}:${over.start}:study`,
  kind: 'study',
  title: 'done',
  courseId: 'mth210',
  examId: 'mth210-2',
  topicId: null,
  topicTitle: null,
  method: 'recall',
  note: null,
  status: 'done',
  carried: false,
  doneAt: null,
  ...over,
});
