import { defaultSettings, EXAM_DEFAULTS } from './defaults';
import type { Commitment, Course, Exam, ExamKind, PlanContext, Settings, Topic } from './types';

export interface SeedFile {
  settings: Partial<Settings>;
  courses: Array<{ code: string; name: string; color: number }>;
  exams: Array<{
    course: string;
    title: string;
    kind: ExamKind;
    date: string;
    time: string;
    durationMin?: number;
    weight?: number;
    confidence?: number;
  }>;
  topics: Record<string, string[]>;
  commitments: Array<Omit<Commitment, 'id'>>;
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const contextFromSeed = (seed: SeedFile): PlanContext => {
  const settings: Settings = { ...defaultSettings(seed.settings.timezone ?? 'UTC'), ...seed.settings };
  const courses: Course[] = seed.courses.map((c) => ({ id: slug(c.code), ...c }));
  const exams: Exam[] = seed.exams.map((e, i) => ({
    id: `${slug(e.course)}-${i + 1}`,
    courseId: slug(e.course),
    title: e.title,
    kind: e.kind,
    date: e.date,
    time: e.time,
    durationMin: e.durationMin ?? EXAM_DEFAULTS[e.kind].durationMin,
    weight: e.weight ?? EXAM_DEFAULTS[e.kind].weight,
    confidence: e.confidence ?? 3,
  }));
  const topics: Topic[] = Object.entries(seed.topics).flatMap(([code, list]) =>
    list.map((title, i) => ({ id: `${slug(code)}-t${i + 1}`, courseId: slug(code), title })),
  );
  const commitments: Commitment[] = seed.commitments.map((c, i) => ({ id: `c${i + 1}`, ...c }));
  return { settings, courses, exams, topics, commitments, blocks: [] };
};
