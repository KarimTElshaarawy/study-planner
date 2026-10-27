import { planDay, planHorizon } from '../shared/planner';
import { addDays, diffDays, examEndMs, examStartMs, localNow, toMin } from '../shared/time';
import { isStudy, type Block, type DayState, type PlanContext } from '../shared/types';
import type { Repo } from './repo';

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

export interface CourseStat {
  courseId: string;
  doneMin: number;
  plannedMin: number;
}

export interface Stats {
  streak: number;
  doneMin: number;
  doneTasks: number;
  courses: CourseStat[];
  trend: Array<{ date: string; done: number; total: number }>;
  weekRate: number;
}

export class Service {
  constructor(
    readonly repo: Repo,
    readonly now: () => number = Date.now,
  ) {}

  /** Local date and minute. After midnight but before bedtime (late sleepers) it still counts as the previous day. */
  clock() {
    const s = this.repo.getSettings();
    const n = localNow(s.timezone, this.now());
    const sleep = toMin(s.sleepTime);
    if (sleep <= toMin(s.wakeTime) && n.min < sleep) return { date: addDays(n.date, -1), min: n.min + 1440 };
    return n;
  }

  context(): PlanContext {
    return {
      settings: this.repo.getSettings(),
      courses: this.repo.listCourses(),
      exams: this.repo.listExams(),
      topics: this.repo.listTopics(),
      commitments: this.repo.listCommitments(),
      blocks: this.repo.studyHistory(),
    };
  }

  /** Marks yesterday and older unfinished sessions as missed and makes sure today has a stored plan. */
  ensureToday(): void {
    const { date } = this.clock();
    this.repo.markPastMissed(date);
    if (this.repo.blocksOn(date).length === 0) this.replanToday();
  }

  replanToday(): DayView {
    const { date, min } = this.clock();
    this.repo.markPastMissed(date);
    const ctx = this.context();
    const plan = planDay(ctx, date, { nowMin: min });
    this.repo.replaceDay(date, plan.blocks);
    return this.view(date, plan.blocks, plan.state, plan.warnings, 'today');
  }

  private view(date: string, blocks: Block[], state: DayState, warnings: string[], relation: DayView['relation']): DayView {
    const study = blocks.filter(isStudy);
    const active = study.filter((b) => b.status !== 'missed' || relation === 'past');
    return {
      date,
      relation,
      state,
      warnings,
      blocks,
      studyMin: study.filter((b) => b.status !== 'missed').reduce((s, b) => s + b.end - b.start, 0),
      doneMin: study.filter((b) => b.status === 'done').reduce((s, b) => s + b.end - b.start, 0),
      total: active.length,
      done: study.filter((b) => b.status === 'done').length,
    };
  }

  day(date: string): DayView {
    const { date: today, min } = this.clock();
    if (date === today) {
      this.ensureToday();
      const ctx = this.context();
      const meta = planDay(ctx, date, { nowMin: min });
      return this.view(date, this.repo.blocksOn(date), meta.state, meta.warnings, 'today');
    }
    if (date < today) {
      this.repo.markPastMissed(today);
      const ctx = this.context();
      const meta = planDay(ctx, date, { nowMin: null });
      return this.view(date, this.repo.blocksOn(date), this.repo.blocksOn(date).length ? meta.state : 'rest', [], 'past');
    }
    return this.range(date, date)[0] as DayView;
  }

  /** Preview of future days: today's stored plan counts as history, the rest assumes work gets done. */
  range(from: string, to: string): DayView[] {
    const { date: today } = this.clock();
    const out: DayView[] = [];
    let futureFrom = from;
    if (from <= today) {
      for (let d = from; d <= to && d <= today; d = addDays(d, 1)) out.push(this.day(d));
      futureFrom = addDays(today, 1);
    }
    if (futureFrom <= to) {
      this.ensureToday();
      const ctx = this.context();
      // plan continuously from tomorrow so a far week reflects the work scheduled before it
      const plans = planHorizon(ctx, addDays(today, 1), to, null);
      for (const p of plans) if (p.date >= futureFrom) out.push(this.view(p.date, p.blocks, p.state, p.warnings, 'future'));
    }
    return out;
  }

  toggle(id: string, done: boolean): Block | undefined {
    const b = this.repo.getBlock(id);
    if (!b || !isStudy(b)) return undefined;
    const { date, min } = this.clock();
    if (done) {
      if (b.status !== 'done') this.repo.setBlockStatus(id, 'done', new Date(this.now()).toISOString());
    } else if (b.status === 'done') {
      const past = b.date < date || (b.date === date && b.end <= min);
      this.repo.setBlockStatus(id, past ? 'missed' : 'planned', null);
    }
    return this.repo.getBlock(id);
  }

  upcoming(limit = 6) {
    const ctx = this.context();
    const nowMs = this.now();
    return ctx.exams
      .map((e) => ({ exam: e, startMs: examStartMs(e, ctx.settings.timezone), endMs: examEndMs(e, ctx.settings.timezone) }))
      .filter((x) => x.endMs >= nowMs)
      .sort((a, b) => a.startMs - b.startMs)
      .slice(0, limit)
      .map((x) => ({ ...x, course: ctx.courses.find((c) => c.id === x.exam.courseId) ?? null }));
  }

  stats(): Stats {
    const { date: today } = this.clock();
    const hist = this.repo.studyHistory();
    const byCourse = new Map<string, CourseStat>();
    for (const c of this.repo.listCourses()) byCourse.set(c.id, { courseId: c.id, doneMin: 0, plannedMin: 0 });
    for (const b of hist) {
      if (!b.courseId) continue;
      const s = byCourse.get(b.courseId);
      if (!s) continue;
      const len = b.end - b.start;
      if (b.status === 'done') s.doneMin += len;
      if (b.status !== 'missed') s.plannedMin += len;
    }
    const trend: Stats['trend'] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const day = hist.filter((b) => b.date === d);
      trend.push({ date: d, done: day.filter((b) => b.status === 'done').length, total: day.length });
    }
    const hasDone = (d: string): boolean => hist.some((b) => b.date === d && b.status === 'done');
    let streak = 0;
    let cursor = hasDone(today) ? today : addDays(today, -1);
    while (hasDone(cursor) && diffDays(today, cursor) < 400) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    const week = trend.slice(-7);
    const wTotal = week.reduce((s, t) => s + t.total, 0);
    const wDone = week.reduce((s, t) => s + t.done, 0);
    const done = hist.filter((b) => b.status === 'done');
    return {
      streak,
      doneMin: done.reduce((s, b) => s + b.end - b.start, 0),
      doneTasks: done.length,
      courses: [...byCourse.values()],
      trend,
      weekRate: wTotal === 0 ? 0 : wDone / wTotal,
    };
  }
}
