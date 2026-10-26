import type { Block, Commitment, Course, DayState, Exam, Settings, Topic } from '@shared/types';

export type { Block, Commitment, Course, Exam, Settings, Topic };

export interface ExamX extends Exam {
  startMs: number;
  endMs: number;
}

export interface Boot {
  settings: Settings;
  courses: Course[];
  exams: ExamX[];
  topics: Topic[];
  commitments: Commitment[];
  clock: { date: string; min: number; timezone: string; nowMs: number };
  email: { provider: 'resend' | 'smtp' | 'outbox'; configured: boolean; today: { status: string; at: string; detail: string | null } | null };
}

export interface DayView {
  date: string;
  relation: 'past' | 'today' | 'future';
  state: DayState;
  warnings: string[];
  blocks: Block[];
  studyMin: number;
  doneMin: number;
  total: number;
  done: number;
}

export interface Stats {
  streak: number;
  doneMin: number;
  doneTasks: number;
  courses: Array<{ courseId: string; doneMin: number; plannedMin: number }>;
  trend: Array<{ date: string; done: number; total: number }>;
  weekRate: number;
}

export interface ExamDraft {
  course: string;
  title: string;
  kind: Exam['kind'];
  date: string;
  time: string;
  durationMin: number;
  weight: number;
  confidence: number;
}
