import { randomUUID } from 'node:crypto';
import { defaultSettings } from '../shared/defaults';
import type { Block, Commitment, Course, Exam, Settings, Topic } from '../shared/types';
import type { Db } from './db';

type Row = Record<string, unknown>;

const blockFromRow = (r: Row): Block => ({
  id: r.id as string,
  date: r.date as string,
  start: r.start as number,
  end: r.end as number,
  kind: r.kind as Block['kind'],
  title: r.title as string,
  courseId: (r.course_id as string | null) ?? null,
  examId: (r.exam_id as string | null) ?? null,
  topicId: (r.topic_id as string | null) ?? null,
  topicTitle: (r.topic_title as string | null) ?? null,
  method: (r.method as Block['method']) ?? null,
  note: (r.note as string | null) ?? null,
  status: r.status as Block['status'],
  carried: r.carried === 1,
  doneAt: (r.done_at as string | null) ?? null,
});

const examFromRow = (r: Row): Exam => ({
  id: r.id as string,
  courseId: r.course_id as string,
  title: r.title as string,
  kind: r.kind as Exam['kind'],
  date: r.date as string,
  time: r.time as string,
  durationMin: r.duration_min as number,
  weight: r.weight as number,
  confidence: r.confidence as number,
});

const commitmentFromRow = (r: Row): Commitment => ({
  id: r.id as string,
  label: r.label as string,
  kind: r.kind as Commitment['kind'],
  days: JSON.parse(r.days as string) as number[],
  start: r.start as string,
  end: r.end as string,
  from: (r.from_date as string | null) ?? null,
  to: (r.to_date as string | null) ?? null,
});

export class Repo {
  constructor(
    readonly db: Db,
    private readonly fallbackTz: string,
    private readonly now: () => number = Date.now,
  ) {}

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // settings
  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const stored: Record<string, unknown> = {};
    for (const r of rows) stored[r.key] = JSON.parse(r.value);
    return { ...defaultSettings(this.fallbackTz), ...stored } as Settings;
  }

  saveSettings(patch: Partial<Settings>): Settings {
    const stmt = this.db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.tx(() => {
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, JSON.stringify(v));
    });
    return this.getSettings();
  }

  // courses
  listCourses(): Course[] {
    return this.db.prepare('SELECT id, code, name, color FROM courses ORDER BY code').all() as Course[];
  }
  getCourse(id: string): Course | undefined {
    return this.db.prepare('SELECT id, code, name, color FROM courses WHERE id = ?').get(id) as Course | undefined;
  }
  createCourse(c: Omit<Course, 'id'>, id: string = randomUUID()): Course {
    this.db.prepare('INSERT INTO courses(id, code, name, color) VALUES(?,?,?,?)').run(id, c.code, c.name, c.color);
    return { id, ...c };
  }
  updateCourse(id: string, c: Partial<Omit<Course, 'id'>>): Course | undefined {
    const cur = this.getCourse(id);
    if (!cur) return undefined;
    const next = { ...cur, ...c };
    this.db.prepare('UPDATE courses SET code=?, name=?, color=? WHERE id=?').run(next.code, next.name, next.color, id);
    return next;
  }
  deleteCourse(id: string): boolean {
    return this.db.prepare('DELETE FROM courses WHERE id = ?').run(id).changes > 0;
  }

  // exams
  listExams(): Exam[] {
    return (this.db.prepare('SELECT * FROM exams ORDER BY date, time, id').all() as Row[]).map(examFromRow);
  }
  getExam(id: string): Exam | undefined {
    const r = this.db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as Row | undefined;
    return r ? examFromRow(r) : undefined;
  }
  createExam(e: Omit<Exam, 'id'>, id: string = randomUUID()): Exam {
    this.db
      .prepare('INSERT INTO exams(id, course_id, title, kind, date, time, duration_min, weight, confidence) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, e.courseId, e.title, e.kind, e.date, e.time, e.durationMin, e.weight, e.confidence);
    return { id, ...e };
  }
  updateExam(id: string, patch: Partial<Omit<Exam, 'id'>>): Exam | undefined {
    const cur = this.getExam(id);
    if (!cur) return undefined;
    const n = { ...cur, ...patch };
    this.db
      .prepare('UPDATE exams SET course_id=?, title=?, kind=?, date=?, time=?, duration_min=?, weight=?, confidence=? WHERE id=?')
      .run(n.courseId, n.title, n.kind, n.date, n.time, n.durationMin, n.weight, n.confidence, id);
    return n;
  }
  deleteExam(id: string): boolean {
    this.db.prepare('UPDATE blocks SET exam_id = NULL WHERE exam_id = ? AND status = ?').run(id, 'done');
    this.db.prepare("DELETE FROM blocks WHERE exam_id = ? AND status != 'done'").run(id);
    return this.db.prepare('DELETE FROM exams WHERE id = ?').run(id).changes > 0;
  }

  // topics
  listTopics(): Topic[] {
    return this.db.prepare('SELECT id, course_id AS courseId, title FROM topics ORDER BY course_id, position, rowid').all() as Topic[];
  }
  createTopic(t: Omit<Topic, 'id'>, id: string = randomUUID()): Topic {
    const pos = (this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM topics WHERE course_id = ?').get(t.courseId) as { p: number }).p;
    this.db.prepare('INSERT INTO topics(id, course_id, title, position) VALUES(?,?,?,?)').run(id, t.courseId, t.title, pos);
    return { id, ...t };
  }
  updateTopic(id: string, title: string): boolean {
    return this.db.prepare('UPDATE topics SET title = ? WHERE id = ?').run(title, id).changes > 0;
  }
  deleteTopic(id: string): boolean {
    this.db.prepare('UPDATE blocks SET topic_id = NULL WHERE topic_id = ?').run(id);
    return this.db.prepare('DELETE FROM topics WHERE id = ?').run(id).changes > 0;
  }

  // commitments
  listCommitments(): Commitment[] {
    return (this.db.prepare('SELECT * FROM commitments ORDER BY start').all() as Row[]).map(commitmentFromRow);
  }
  createCommitment(c: Omit<Commitment, 'id'>, id: string = randomUUID()): Commitment {
    this.db
      .prepare('INSERT INTO commitments(id, label, kind, days, start, end, from_date, to_date) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, c.label, c.kind, JSON.stringify(c.days), c.start, c.end, c.from ?? null, c.to ?? null);
    return { id, ...c };
  }
  updateCommitment(id: string, patch: Partial<Omit<Commitment, 'id'>>): Commitment | undefined {
    const cur = this.listCommitments().find((c) => c.id === id);
    if (!cur) return undefined;
    const n = { ...cur, ...patch };
    this.db
      .prepare('UPDATE commitments SET label=?, kind=?, days=?, start=?, end=?, from_date=?, to_date=? WHERE id=?')
      .run(n.label, n.kind, JSON.stringify(n.days), n.start, n.end, n.from ?? null, n.to ?? null, id);
    return n;
  }
  deleteCommitment(id: string): boolean {
    return this.db.prepare('DELETE FROM commitments WHERE id = ?').run(id).changes > 0;
  }

  // blocks
  blocksOn(date: string): Block[] {
    return (this.db.prepare('SELECT * FROM blocks WHERE date = ? ORDER BY start, end').all(date) as Row[]).map(blockFromRow);
  }
  blocksBetween(from: string, to: string): Block[] {
    return (this.db.prepare('SELECT * FROM blocks WHERE date >= ? AND date <= ? ORDER BY date, start').all(from, to) as Row[]).map(blockFromRow);
  }
  studyHistory(): Block[] {
    return (this.db.prepare("SELECT * FROM blocks WHERE kind IN ('study','review') ORDER BY date, start").all() as Row[]).map(blockFromRow);
  }
  getBlock(id: string): Block | undefined {
    const r = this.db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) as Row | undefined;
    return r ? blockFromRow(r) : undefined;
  }
  replaceDay(date: string, blocks: Block[]): void {
    const ins = this.db.prepare(
      `INSERT OR REPLACE INTO blocks(id, date, start, end, kind, title, course_id, exam_id, topic_id, topic_title, method, note, status, carried, done_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    this.tx(() => {
      this.db.prepare('DELETE FROM blocks WHERE date = ?').run(date);
      for (const b of blocks) {
        ins.run(b.id, b.date, b.start, b.end, b.kind, b.title, b.courseId, b.examId, b.topicId, b.topicTitle, b.method, b.note, b.status, b.carried ? 1 : 0, b.doneAt);
      }
    });
  }
  setBlockStatus(id: string, status: Block['status'], doneAt: string | null): void {
    this.db.prepare('UPDATE blocks SET status = ?, done_at = ? WHERE id = ?').run(status, doneAt, id);
  }
  markPastMissed(today: string): number {
    return this.db.prepare("UPDATE blocks SET status = 'missed' WHERE date < ? AND status = 'planned' AND kind IN ('study','review')").run(today).changes;
  }

  // email log
  emailLog(date: string): { date: string; sent_at: string; provider: string; status: string; detail: string | null; attempts: number } | undefined {
    return this.db.prepare('SELECT * FROM email_log WHERE date = ?').get(date) as never;
  }
  claimEmail(date: string, provider: string): boolean {
    const r = this.db.prepare("INSERT OR IGNORE INTO email_log(date, sent_at, provider, status) VALUES(?, ?, ?, 'sending')").run(date, new Date(this.now()).toISOString(), provider);
    return r.changes > 0;
  }
  finishEmail(date: string, status: 'sent' | 'outbox' | 'failed', detail: string | null): void {
    this.db.prepare('UPDATE email_log SET status = ?, detail = ?, sent_at = ? WHERE date = ?').run(status, detail, new Date(this.now()).toISOString(), date);
  }
  beginRetry(date: string): boolean {
    return this.db.prepare("UPDATE email_log SET status = 'sending', attempts = attempts + 1, sent_at = ? WHERE date = ?").run(new Date(this.now()).toISOString(), date).changes > 0;
  }
  resetEmail(date: string): void {
    this.db.prepare('DELETE FROM email_log WHERE date = ?').run(date);
  }
}
