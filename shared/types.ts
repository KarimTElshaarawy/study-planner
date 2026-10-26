export type Hhmm = string;

export interface Meal {
  label: string;
  time: Hhmm;
  durationMin: number;
}

export interface Settings {
  name: string;
  timezone: string;
  email: string;
  wakeTime: Hhmm;
  sleepTime: Hhmm;
  sessionMin: number;
  breakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  dailyCapMin: number;
  windDownMin: number;
  morningMin: number;
  meals: Meal[];
  emailTime: Hhmm;
  emailEnabled: boolean;
  setupDone: boolean;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  /** index into the course palette (0..7) */
  color: number;
}

export type ExamKind = 'quiz' | 'midterm' | 'final' | 'deadline';

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  kind: ExamKind;
  /** local date YYYY-MM-DD in settings.timezone */
  date: string;
  time: Hhmm;
  durationMin: number;
  /** stakes, 1 (low) .. 5 (high) */
  weight: number;
  /** self-rated confidence, 1 (shaky) .. 5 (solid) */
  confidence: number;
}

export interface Topic {
  id: string;
  courseId: string;
  title: string;
}

export type CommitmentKind = 'class' | 'work' | 'training' | 'other';

export interface Commitment {
  id: string;
  label: string;
  kind: CommitmentKind;
  /** ISO weekdays, 1 = Monday .. 7 = Sunday */
  days: number[];
  start: Hhmm;
  end: Hhmm;
  from?: string | null;
  to?: string | null;
}

export type BlockKind = 'study' | 'review' | 'break' | 'meal' | 'commitment' | 'exam';
export type Method = 'recall' | 'practice' | 'pastpaper' | 'association' | 'quiz' | 'write';
export type BlockStatus = 'planned' | 'done' | 'missed';

export interface Block {
  id: string;
  date: string;
  /** minutes since local midnight */
  start: number;
  end: number;
  kind: BlockKind;
  title: string;
  courseId: string | null;
  examId: string | null;
  topicId: string | null;
  topicTitle: string | null;
  method: Method | null;
  note: string | null;
  status: BlockStatus;
  carried: boolean;
  doneAt: string | null;
}

export type DayState = 'normal' | 'rest' | 'exam-day' | 'all-done' | 'empty';

export interface DayPlan {
  date: string;
  blocks: Block[];
  warnings: string[];
  state: DayState;
  studyMin: number;
}

export interface PlanContext {
  settings: Settings;
  courses: Course[];
  exams: Exam[];
  topics: Topic[];
  commitments: Commitment[];
  /** persisted study/review blocks of every date (history) */
  blocks: Block[];
}

export const isStudy = (b: Block): boolean => b.kind === 'study' || b.kind === 'review';
