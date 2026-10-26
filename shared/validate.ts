import { addDays, diffDays, toMin, weekday } from './time';
import { isStudy, type DayPlan, type PlanContext } from './types';
import { dayBounds, PRE_EXAM_BUFFER, POST_EXAM_BLACKOUT } from './planner/planner';

interface Iv {
  start: number;
  end: number;
  label: string;
}

const commitmentsOn = (ctx: PlanContext, date: string): Iv[] =>
  ctx.commitments
    .filter((c) => c.days.includes(weekday(date)) && (!c.from || date >= c.from) && (!c.to || date <= c.to))
    .map((c) => {
      const start = toMin(c.start);
      const end = toMin(c.end) > start ? toMin(c.end) : toMin(c.end) + 1440;
      return { start, end, label: c.label };
    });

const examsOn = (ctx: PlanContext, date: string, shift: number): Iv[] =>
  ctx.exams
    .filter((e) => e.date === date && e.kind !== 'deadline')
    .map((e) => ({
      start: toMin(e.time) + shift - PRE_EXAM_BUFFER,
      end: toMin(e.time) + shift + e.durationMin + POST_EXAM_BLACKOUT,
      label: e.title,
    }));

/** Returns human readable invariant violations for one planned day. Empty means valid. */
export const checkDay = (ctx: PlanContext, plan: DayPlan, nowMin: number | null = null): string[] => {
  const errs: string[] = [];
  const { sleep, wake } = dayBounds(ctx);
  const blocks = plan.blocks.filter((b) => b.kind !== 'break');
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i]!;
    if (a.start < wake || a.end > sleep) errs.push(`${plan.date} ${a.title} outside waking hours`);
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j]!;
      if (a.start < b.end && b.start < a.end) errs.push(`${plan.date} overlap: ${a.title} / ${b.title}`);
    }
  }
  const forbidden: Iv[] = [
    ...commitmentsOn(ctx, plan.date),
    ...examsOn(ctx, plan.date, 0),
    ...commitmentsOn(ctx, addDays(plan.date, 1)).map((c) => ({ ...c, start: c.start + 1440, end: c.end + 1440 })),
    ...examsOn(ctx, addDays(plan.date, 1), 1440),
  ];
  const study = plan.blocks.filter(isStudy);
  for (const s of study) {
    for (const f of forbidden) if (s.start < f.end && f.start < s.end) errs.push(`${plan.date} study ${s.start}-${s.end} collides with ${f.label}`);
    if (s.status === 'planned' && nowMin !== null && s.start < nowMin) errs.push(`${plan.date} study scheduled in the past`);
    if (!s.topicTitle || !s.method || !s.note) errs.push(`${plan.date} session lacks topic, method or note`);
    const exam = ctx.exams.find((e) => e.id === s.examId);
    if (!exam) errs.push(`${plan.date} session without a live exam`);
    else {
      if (exam.date < plan.date) errs.push(`${plan.date} session for finished ${exam.title}`);
      if (exam.date === plan.date && exam.kind !== 'deadline' && s.end > toMin(exam.time)) errs.push(`${plan.date} session overlaps ${exam.title}`);
    }
  }
  // taper: a course with an exam tomorrow only gets light review
  for (const e of ctx.exams.filter((e) => e.kind !== 'deadline' && diffDays(e.date, plan.date) === 1)) {
    const heavy = study.filter((s) => s.courseId === e.courseId && s.kind === 'study');
    if (heavy.length > 0) errs.push(`${plan.date} heavy study for ${e.courseId} the day before ${e.title}`);
  }
  // breaks: two study sessions never touch
  const sorted = study.filter((s) => s.status !== 'missed').sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start === sorted[i - 1]!.end) errs.push(`${plan.date} back-to-back sessions at ${sorted[i]!.start}`);
  }
  const cap = ctx.settings.dailyCapMin;
  if (plan.studyMin > cap) errs.push(`${plan.date} over cap: ${plan.studyMin} > ${cap}`);
  return errs;
};
