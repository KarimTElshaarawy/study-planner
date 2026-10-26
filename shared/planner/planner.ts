import { addDays, diffDays, toMin, weekday } from '../time';
import {
  isStudy,
  type Block,
  type Commitment,
  type DayPlan,
  type DayState,
  type Exam,
  type Method,
  type PlanContext,
} from '../types';
import { METHOD_SEQUENCE, REVIEW_METHODS, TAPER_NOTE, noteFor } from './templates';

export const PRE_EXAM_BUFFER = 30;
export const POST_EXAM_BLACKOUT = 60;
export const EXAM_DAY_REVIEW_GAP = 45;
export const TAPER_SESSIONS_DAY_BEFORE = 2;
export const TAPER_SESSIONS_EXAM_DAY = 1;
const MEAL_SHIFT_MAX = 120;
const MEAL_SHIFT_STEP = 15;
const MAX_DAY = 1440 + 360;

interface Interval {
  start: number;
  end: number;
}

const clamp15 = (n: number): number => Math.min(5, Math.max(1, n));

export const needMinutes = (e: Exam): number => {
  const w = clamp15(e.weight);
  const base = e.kind === 'deadline' ? 60 + 45 * w : 120 + 90 * w;
  return Math.round((base * (0.6 + 0.2 * (5 - clamp15(e.confidence)))) / 5) * 5;
};

export const windowDays = (e: Exam): number => (e.kind === 'deadline' ? 7 + 3 * clamp15(e.weight) : 10 + 4 * clamp15(e.weight));

const unionIntervals = (list: Interval[]): Interval[] => {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
};

const subtract = (range: Interval, busy: Interval[]): Interval[] => {
  const out: Interval[] = [];
  let cur = range.start;
  for (const b of unionIntervals(busy)) {
    if (b.end <= cur) continue;
    if (b.start >= range.end) break;
    if (b.start > cur) out.push({ start: cur, end: Math.min(b.start, range.end) });
    cur = Math.max(cur, b.end);
  }
  if (cur < range.end) out.push({ start: cur, end: range.end });
  return out;
};

const commitmentApplies = (c: Commitment, date: string): boolean => {
  if (!c.days.includes(weekday(date))) return false;
  if (c.from && date < c.from) return false;
  if (c.to && date > c.to) return false;
  return true;
};

export const dayBounds = (ctx: PlanContext): { wake: number; sleep: number } => {
  const wake = toMin(ctx.settings.wakeTime);
  let sleep = toMin(ctx.settings.sleepTime);
  if (sleep <= wake) sleep += 1440;
  return { wake, sleep: Math.min(sleep, MAX_DAY) };
};

const examInterval = (e: Exam): Interval => {
  const start = toMin(e.time);
  return { start, end: Math.min(start + e.durationMin, MAX_DAY) };
};

interface Slot extends Interval {
  breakAfter: number;
}

const layoutSlots = (windows: Interval[], ctx: PlanContext, adjacentStreak: (start: number) => number): Slot[] => {
  const { sessionMin, breakMin, longBreakMin, longBreakEvery } = ctx.settings;
  const slots: Slot[] = [];
  for (const w of windows) {
    let cur = w.start;
    let streak = adjacentStreak(w.start);
    while (cur + sessionMin <= w.end) {
      const slot: Slot = { start: cur, end: cur + sessionMin, breakAfter: 0 };
      streak += 1;
      cur += sessionMin;
      const brk = streak % longBreakEvery === 0 ? longBreakMin : breakMin;
      slots.push(slot);
      if (cur + brk + sessionMin > w.end) break;
      slot.breakAfter = brk;
      cur += brk;
    }
  }
  return slots;
};

interface Candidate {
  exam: Exam;
  remaining: number;
  daysLeft: number;
  dd: number;
  taperKind: 'none' | 'day-before' | 'exam-day';
}

const courseLabel = (ctx: PlanContext, courseId: string): string =>
  ctx.courses.find((c) => c.id === courseId)?.code ?? 'Course';

export interface PlanOptions {
  /** minutes since local midnight, null when planning a future/preview day or a past day in full */
  nowMin: number | null;
}

/**
 * Plans one local day. Pure and deterministic. `ctx.blocks` holds persisted study/review
 * history; blocks of `date` that are done (or in progress, or already past) are kept untouched.
 */
export const planDay = (ctx: PlanContext, date: string, opts: PlanOptions): DayPlan => {
  const { settings } = ctx;
  const { wake, sleep } = dayBounds(ctx);
  const nowMin = opts.nowMin;
  const warnings: string[] = [];

  // 1. Existing study blocks of the day that survive a replan.
  const existing = ctx.blocks.filter((b) => b.date === date && isStudy(b));
  const kept: Block[] = [];
  for (const b of existing) {
    if (b.status === 'done') kept.push(b);
    else if (b.status === 'missed') kept.push(b);
    else if (nowMin !== null && b.end <= nowMin) kept.push({ ...b, status: 'missed' });
    else if (nowMin !== null && b.start < nowMin) kept.push(b);
  }

  // 2. Fixed blocks.
  const fixed: Block[] = [];
  const busy: Interval[] = [];
  const mk = (b: Partial<Block> & Pick<Block, 'start' | 'end' | 'kind' | 'title'>): Block => ({
    id: `${date}:${b.start}:${b.kind}`,
    date,
    courseId: null,
    examId: null,
    topicId: null,
    topicTitle: null,
    method: null,
    note: null,
    status: 'planned',
    carried: false,
    doneAt: null,
    ...b,
  });

  const dayExams = ctx.exams.filter((e) => e.date === date && e.kind !== 'deadline').sort((a, b) => toMin(a.time) - toMin(b.time));
  for (const c of ctx.commitments.filter((c) => commitmentApplies(c, date))) {
    const start = toMin(c.start);
    const end = Math.min(toMin(c.end) > start ? toMin(c.end) : toMin(c.end) + 1440, MAX_DAY);
    // an exam replaces whatever part of a class or shift falls on top of it
    for (const piece of subtract({ start, end }, dayExams.map(examInterval))) {
      fixed.push(mk({ ...piece, kind: 'commitment', title: c.label, id: `${date}:${piece.start}:commitment:${c.id}` }));
      busy.push(piece);
    }
  }
  if (sleep > 1440) {
    // late sleepers: next-day items that start before bedtime still block the evening
    const next = addDays(date, 1);
    for (const c of ctx.commitments.filter((c) => commitmentApplies(c, next))) {
      const st = toMin(c.start) + 1440;
      if (st < sleep) busy.push({ start: st, end: MAX_DAY });
    }
    for (const e of ctx.exams.filter((e) => e.date === next && e.kind !== 'deadline')) {
      const iv = examInterval(e);
      if (iv.start + 1440 - PRE_EXAM_BUFFER < sleep) busy.push({ start: iv.start + 1440 - PRE_EXAM_BUFFER, end: MAX_DAY });
    }
  }

  for (const e of dayExams) {
    const iv = examInterval(e);
    fixed.push(
      mk({
        ...iv,
        kind: 'exam',
        title: e.title,
        courseId: e.courseId,
        examId: e.id,
        id: `${date}:${iv.start}:exam:${e.id}`,
      }),
    );
    busy.push({ start: iv.start - PRE_EXAM_BUFFER, end: iv.end + POST_EXAM_BLACKOUT });
  }
  for (let i = 1; i < dayExams.length; i++) {
    const a = examInterval(dayExams[i - 1] as Exam);
    const b = examInterval(dayExams[i] as Exam);
    if (b.start < a.end) warnings.push(`${(dayExams[i - 1] as Exam).title} and ${(dayExams[i] as Exam).title} overlap.`);
  }
  for (const k of kept) busy.push({ start: k.start, end: k.status === 'missed' ? k.end : k.end + settings.breakMin });

  // 3. Meals, shifted to the nearest free spot.
  const mealBusy = [...busy];
  for (const meal of settings.meals) {
    const dur = meal.durationMin;
    const pref = toMin(meal.time);
    let placed: number | null = null;
    for (let off = 0; off <= MEAL_SHIFT_MAX && placed === null; off += MEAL_SHIFT_STEP) {
      for (const s of off === 0 ? [pref] : [pref + off, pref - off]) {
        if (s < wake || s + dur > sleep) continue;
        const clash = mealBusy.some((i) => s < i.end && s + dur > i.start);
        if (!clash) {
          placed = s;
          break;
        }
      }
    }
    if (placed !== null) {
      fixed.push(mk({ start: placed, end: placed + dur, kind: 'meal', title: meal.label, id: `${date}:${placed}:meal` }));
      mealBusy.push({ start: placed, end: placed + dur });
      busy.push({ start: placed, end: placed + dur });
    }
  }

  // 4. Free windows for study.
  const studyStart = wake + settings.morningMin;
  const studyEnd = sleep - settings.windDownMin;
  let from = studyStart;
  if (nowMin !== null) from = Math.max(from, Math.ceil(nowMin / 5) * 5);
  const windows = studyEnd > from ? subtract({ start: from, end: studyEnd }, busy).filter((w) => w.end - w.start >= settings.sessionMin) : [];

  // 5. Demand candidates.
  const histDone = ctx.blocks.filter((b) => isStudy(b) && b.status === 'done');
  const doneByExam = new Map<string, number>();
  for (const b of histDone) {
    if (b.examId) doneByExam.set(b.examId, (doneByExam.get(b.examId) ?? 0) + (b.end - b.start));
  }
  // done blocks of this date were included above only if persisted; kept done blocks are part of ctx.blocks already.
  const candidates: Candidate[] = [];
  for (const e of ctx.exams) {
    const dd = diffDays(e.date, date);
    if (dd < 0 || dd > windowDays(e)) continue;
    const remaining = needMinutes(e) - (doneByExam.get(e.id) ?? 0);
    const taperKind: Candidate['taperKind'] =
      e.kind === 'deadline' ? 'none' : dd === 0 ? 'exam-day' : dd === 1 ? 'day-before' : 'none';
    const daysLeft = dd >= 2 ? dd - 1 : 1;
    candidates.push({ exam: e, remaining, daysLeft, dd, taperKind });
  }

  const hasFuture = ctx.exams.some((e) => e.date > date || (e.date === date && (nowMin === null || toMin(e.time) + e.durationMin > nowMin)));
  const state: DayState = ctx.exams.length === 0 ? 'empty' : !hasFuture ? 'all-done' : dayExams.length > 0 ? 'exam-day' : candidates.length === 0 ? 'rest' : 'normal';

  // 6. Pick sessions.
  const keptStudyMin = kept.filter((b) => b.status !== 'missed').reduce((s, b) => s + (b.end - b.start), 0);
  const capLeft = Math.max(0, settings.dailyCapMin - keptStudyMin);
  const adjacent = (start: number): number => (kept.some((k) => k.end === start && k.status !== 'missed') ? 1 : 0);
  const allSlots = layoutSlots(windows, ctx, adjacent);

  const placed: Block[] = [];
  if (state !== 'all-done') {
    const slots: Slot[] = [];
    // eligibility depends on slot time, so decide per slot below
    slots.push(...allSlots);
    const usedByExam = new Map<string, number>();
    const reviewByExam = new Map<string, number>();
    const courseCount = new Map<string, number>();
    for (const b of ctx.blocks.filter((x) => isStudy(x) && x.courseId && x.date <= date)) {
      if (b.status === 'missed' && b.date !== date) continue;
      if (b.status === 'planned' && b.date === date) continue;
      courseCount.set(b.courseId as string, (courseCount.get(b.courseId as string) ?? 0) + 1);
    }
    const topicCount = new Map<string, number>();
    for (const b of ctx.blocks) if (isStudy(b) && b.topicId && b.status === 'done') topicCount.set(b.topicId, (topicCount.get(b.topicId) ?? 0) + 1);

    const lastStudy = (courseId: string): string | null => {
      let last: string | null = null;
      for (const b of histDone) if (b.courseId === courseId && b.date <= date && (last === null || b.date > last)) last = b.date;
      return last;
    };
    const missedRecent = (courseId: string): number => {
      const ids = new Set<string>();
      const lo = addDays(date, -2);
      for (const b of [...ctx.blocks, ...kept]) {
        if (isStudy(b) && b.courseId === courseId && b.status === 'missed' && b.date >= lo && b.date <= date) ids.add(b.id);
      }
      return ids.size;
    };
    const carryLeft = new Map<string, number>();
    for (const c of candidates) carryLeft.set(c.exam.courseId, Math.min(missedRecent(c.exam.courseId), 3));

    const taperCourses = new Set(candidates.filter((c) => c.taperKind !== 'none').map((c) => c.exam.courseId));
    const eligible = (c: Candidate, slot: Slot): boolean => {
      if (c.exam.date === date && slot.end > toMin(c.exam.time) - PRE_EXAM_BUFFER - (c.taperKind === 'exam-day' ? EXAM_DAY_REVIEW_GAP - PRE_EXAM_BUFFER : 0)) return false;
      if (c.taperKind === 'none' && taperCourses.has(c.exam.courseId)) return false;
      if (c.taperKind === 'day-before') return (reviewByExam.get(c.exam.id) ?? 0) < TAPER_SESSIONS_DAY_BEFORE;
      if (c.taperKind === 'exam-day') return (reviewByExam.get(c.exam.id) ?? 0) < TAPER_SESSIONS_EXAM_DAY;
      if (staleCourses.has(c.exam.courseId) && c.dd >= 2 && c.exam.kind !== 'deadline') return true;
      return c.remaining - (usedByExam.get(c.exam.id) ?? 0) > 0;
    };

    // how many sessions to schedule today
    const pace = candidates
      .filter((c) => c.taperKind === 'none' && c.remaining > 0)
      .reduce((s, c) => s + c.remaining / c.daysLeft, 0);
    const maxSessions = Math.floor(capLeft / settings.sessionMin);
    if (settings.dailyCapMin < settings.sessionMin) warnings.push('The daily cap is shorter than one session, so nothing can be planned.');
    const staleCourses = new Set<string>();
    const courseIds = [...new Set(candidates.filter((c) => c.taperKind === 'none' && c.dd >= 2).map((c) => c.exam.courseId))];
    for (const cid of courseIds) {
      const last = lastStudy(cid);
      const firstOpen = candidates
        .filter((c) => c.exam.courseId === cid && c.dd >= 2)
        .map((c) => addDays(c.exam.date, -windowDays(c.exam)))
        .reduce((a, b) => (a < b ? a : b));
      const anchor = last && last > addDays(firstOpen, -1) ? last : addDays(firstOpen, -1);
      if (diffDays(date, anchor) >= 2 && !kept.some((k) => k.courseId === cid && k.status !== 'missed')) staleCourses.add(cid);
    }
    const taperCount = candidates.filter((c) => c.taperKind !== 'none').reduce((s, c) => {
      const lim = c.taperKind === 'day-before' ? TAPER_SESSIONS_DAY_BEFORE : TAPER_SESSIONS_EXAM_DAY;
      return s + lim;
    }, 0);
    const wanted = Math.max(Math.ceil((pace * 1.15) / settings.sessionMin), staleCourses.size, pace > 0 ? 1 : 0) + taperCount;
    const target = Math.min(wanted, maxSessions);

    let prevCourse: string | null = null;
    let usedSlots = 0;
    const chosen: Array<{ slot: Slot; cand: Candidate; carried: boolean }> = [];

    for (const slot of slots) {
      if (usedSlots >= target) break;
      let best: { cand: Candidate; score: number } | null = null;
      for (const c of candidates) {
        if (!eligible(c, slot)) continue;
        const cid = c.exam.courseId;
        let score: number;
        if (c.taperKind !== 'none') score = 100000;
        else {
          const rem = c.remaining - (usedByExam.get(c.exam.id) ?? 0);
          score = (rem / c.daysLeft) * (1 + 0.1 * c.exam.weight);
          if (staleCourses.has(cid)) score += 5000;
          score += (carryLeft.get(cid) ?? 0) * 40;
          if (prevCourse === cid) score *= 0.7;
        }
        if (best === null || score > best.score || (score === best.score && c.exam.id < best.cand.exam.id)) best = { cand: c, score };
      }
      if (!best) continue;
      const c = best.cand;
      const cid = c.exam.courseId;
      if (c.taperKind !== 'none') reviewByExam.set(c.exam.id, (reviewByExam.get(c.exam.id) ?? 0) + 1);
      usedByExam.set(c.exam.id, (usedByExam.get(c.exam.id) ?? 0) + (slot.end - slot.start));
      staleCourses.delete(cid);
      const carriedHere = (carryLeft.get(cid) ?? 0) > 0 && c.taperKind === 'none';
      if (carriedHere) carryLeft.set(cid, (carryLeft.get(cid) ?? 0) - 1);
      chosen.push({ slot, cand: c, carried: carriedHere });
      prevCourse = cid;
      usedSlots += 1;
    }

    // 7. Materialise chosen sessions into blocks.
    const placedCount = new Map<string, number>();
    for (let i = 0; i < chosen.length; i++) {
      const { slot, cand, carried } = chosen[i] as (typeof chosen)[number];
      const cid = cand.exam.courseId;
      const code = courseLabel(ctx, cid);
      const taper = cand.taperKind !== 'none';
      const topics = ctx.topics.filter((t) => t.courseId === cid);
      let topic: (typeof topics)[number] | null = null;
      if (topics.length > 0) {
        const order = new Map(ctx.topics.map((t, idx) => [t.id, idx]));
        topic = [...topics].sort((a, b) => (topicCount.get(a.id) ?? 0) - (topicCount.get(b.id) ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))[0] as (typeof topics)[number];
        topicCount.set(topic.id, (topicCount.get(topic.id) ?? 0) + 1);
      }
      const seqIndex = (courseCount.get(cid) ?? 0) + (placedCount.get(cid) ?? 0);
      placedCount.set(cid, (placedCount.get(cid) ?? 0) + 1);
      let method: Method;
      if (cand.exam.kind === 'deadline') method = 'write';
      else if (taper) method = REVIEW_METHODS[seqIndex % REVIEW_METHODS.length] as Method;
      else method = METHOD_SEQUENCE[seqIndex % METHOD_SEQUENCE.length] as Method;
      const topicTitle = topic?.title ?? cand.exam.title;
      const seed = `${cid}:${date}:${i}`;
      const note = taper ? `${TAPER_NOTE} ${noteFor(method, seed, topicTitle, code)}` : noteFor(method, seed, topicTitle, code);
      const kind = taper ? 'review' : 'study';
      placed.push(
        mk({
          start: slot.start,
          end: slot.end,
          kind,
          title: cand.exam.kind === 'deadline' ? `Work on ${cand.exam.title}` : `${code} ${taper ? 'light review' : 'study'}`,
          courseId: cid,
          examId: cand.exam.id,
          topicId: topic?.id ?? null,
          topicTitle,
          method,
          note,
          carried,
          id: `${date}:${slot.start}:${kind}:${cand.exam.id}`,
        }),
      );
      if (i < chosen.length - 1 && slot.breakAfter > 0 && (chosen[i + 1] as (typeof chosen)[number]).slot.start === slot.end + slot.breakAfter) {
        placed.push(mk({ start: slot.end, end: slot.end + slot.breakAfter, kind: 'break', title: slot.breakAfter > settings.breakMin ? 'Long break' : 'Break', id: `${date}:${slot.end}:break` }));
      }
    }

    for (const cid of staleCourses) warnings.push(`${courseLabel(ctx, cid)} has gone more than 2 days without study and there was no room today.`);
    // shortfall warnings
    for (const c of candidates) {
      if (c.taperKind !== 'none' || c.remaining <= 0) continue;
      const capacity = Math.max(1, c.daysLeft) * Math.floor(settings.dailyCapMin / settings.sessionMin) * settings.sessionMin;
      if (c.remaining > capacity) warnings.push(`${c.exam.title} needs ${Math.ceil((c.remaining - capacity) / 60)}h more than the daily cap allows.`);
    }
  }

  const blocks = [...fixed, ...kept, ...placed].sort((a, b) => a.start - b.start || a.end - b.end);
  const studyMin = blocks.filter((b) => isStudy(b) && b.status !== 'missed').reduce((s, b) => s + (b.end - b.start), 0);
  return { date, blocks, warnings, state, studyMin };
};

/** Plans [from, to] assuming every scheduled session gets done. Used for previews and simulation. */
export const planHorizon = (ctx: PlanContext, from: string, to: string, nowMin: number | null): DayPlan[] => {
  const out: DayPlan[] = [];
  let blocks = [...ctx.blocks];
  for (let d = from, first = true; d <= to; d = addDays(d, 1), first = false) {
    const plan = planDay({ ...ctx, blocks }, d, { nowMin: first ? nowMin : null });
    out.push(plan);
    const assumed = plan.blocks.filter(isStudy).map((b) => (b.status === 'planned' ? { ...b, status: 'done' as const } : b));
    blocks = [...blocks.filter((b) => !(b.date === d && isStudy(b))), ...assumed];
  }
  return out;
};
