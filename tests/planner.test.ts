import { describe, expect, it } from 'vitest';
import { needMinutes, planDay, planHorizon } from '../shared/planner';
import { toMin } from '../shared/time';
import { isStudy } from '../shared/types';
import { checkDay } from '../shared/validate';
import { demoCtx, doneBlock } from './helpers';

const study = (blocks: ReturnType<typeof planDay>['blocks']) => blocks.filter(isStudy);

describe('planner', () => {
  it('plans from the current time, never in the past', () => {
    const plan = planDay(demoCtx(), '2026-10-26', { nowMin: 14 * 60 + 12 });
    expect(study(plan.blocks).length).toBeGreaterThan(0);
    for (const b of study(plan.blocks)) expect(b.start).toBeGreaterThanOrEqual(14 * 60 + 15);
  });

  it('has no conflicts across the whole horizon', () => {
    const ctx = demoCtx();
    for (const p of planHorizon(ctx, '2026-10-26', '2026-12-09', 600)) expect(checkDay(ctx, p)).toEqual([]);
  });

  it('never studies inside fixed commitments', () => {
    const ctx = demoCtx();
    const monday = planDay(ctx, '2026-10-26', { nowMin: null });
    const lecture = monday.blocks.find((b) => b.kind === 'commitment' && b.title === 'Lectures');
    expect(lecture).toBeDefined();
    for (const s of study(monday.blocks)) expect(s.end <= lecture!.start || s.start >= lecture!.end).toBe(true);
  });

  it('blocks study during an exam, 30 min before and 60 min after', () => {
    const ctx = demoCtx();
    const plan = planDay(ctx, '2026-11-04', { nowMin: null }); // CSC230 quiz 10:00, 60 min
    for (const s of study(plan.blocks)) expect(s.end <= toMin('09:30') || s.start >= toMin('12:00')).toBe(true);
    expect(plan.blocks.some((b) => b.kind === 'exam')).toBe(true);
    expect(plan.state).toBe('exam-day');
  });

  it('tapers the day before an exam to light review for that course', () => {
    const ctx = demoCtx();
    const plan = planDay(ctx, '2026-11-04', { nowMin: null });
    const dayBefore = planDay(ctx, '2026-11-03', { nowMin: null });
    const csc = study(dayBefore.blocks).filter((b) => b.courseId === 'csc230' && b.examId === 'csc230-1');
    expect(csc.length).toBeLessThanOrEqual(2);
    expect(csc.every((b) => b.kind === 'review')).toBe(true);
    expect(study(plan.blocks).filter((b) => b.examId === 'csc230-1').length).toBeLessThanOrEqual(1);
  });

  it('handles two exams on one day', () => {
    const ctx = demoCtx();
    const plan = planDay(ctx, '2026-12-05', { nowMin: null });
    const exams = plan.blocks.filter((b) => b.kind === 'exam');
    expect(exams.map((e) => e.title)).toEqual(['HIS101 Final', 'CSC230 Final']);
    expect(checkDay(ctx, plan)).toEqual([]);
    const review = study(plan.blocks).filter((b) => b.examId === 'csc230-7');
    expect(review.length).toBe(1);
    expect(review[0]!.start).toBeGreaterThanOrEqual(toMin('12:00'));
    expect(review[0]!.end).toBeLessThanOrEqual(toMin('14:15'));
  });

  it('never regenerates completed tasks and keeps them in place', () => {
    const ctx = demoCtx();
    const done = doneBlock({ date: '2026-10-26', start: 11 * 60, end: 11 * 60 + 50, courseId: 'csc230', examId: 'csc230-1' });
    const plan = planDay({ ...ctx, blocks: [done] }, '2026-10-26', { nowMin: 9 * 60 });
    const kept = plan.blocks.filter((b) => b.id === done.id);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.status).toBe('done');
    const overlapping = study(plan.blocks).filter((b) => b.id !== done.id && b.start < done.end && b.end > done.start);
    expect(overlapping).toEqual([]);
  });

  it('counts completed minutes against the exam need', () => {
    const ctx = demoCtx();
    const exam = ctx.exams.find((e) => e.id === 'csc230-1')!;
    const need = needMinutes(exam);
    const blocks = Array.from({ length: Math.ceil(need / 50) }, (_, i) =>
      doneBlock({ date: '2026-10-26', start: 8 * 60 + i * 60, end: 8 * 60 + i * 60 + 50, courseId: 'csc230', examId: 'csc230-1' }),
    );
    const plan = planDay({ ...ctx, blocks }, '2026-10-27', { nowMin: null });
    const forQuiz = study(plan.blocks).filter((b) => b.examId === 'csc230-1' && b.kind === 'study');
    expect(forQuiz.length).toBeLessThanOrEqual(1); // maintenance only
  });

  it('carries missed work forward with raised priority', () => {
    const ctx = demoCtx();
    const missed = doneBlock({ date: '2026-10-26', start: 9 * 60, end: 9 * 60 + 50, courseId: 'phy150', examId: 'phy150-3', status: 'missed' });
    const base = planDay(ctx, '2026-10-27', { nowMin: null });
    const withMissed = planDay({ ...ctx, blocks: [missed] }, '2026-10-27', { nowMin: null });
    expect(study(withMissed.blocks).some((b) => b.carried && b.courseId === 'phy150')).toBe(true);
    expect(study(base.blocks).some((b) => b.carried)).toBe(false);
  });

  it('turns past planned sessions into missed on a same-day replan, and refills the future', () => {
    const ctx = demoCtx();
    const first = planDay(ctx, '2026-10-26', { nowMin: 7 * 60 });
    const persisted = study(first.blocks);
    const later = planDay({ ...ctx, blocks: persisted }, '2026-10-26', { nowMin: 15 * 60 });
    const stale = later.blocks.filter((b) => isStudy(b) && b.start < 15 * 60);
    expect(stale.every((b) => b.status === 'missed')).toBe(true);
    for (const b of later.blocks.filter((b) => isStudy(b) && b.status === 'planned')) expect(b.start).toBeGreaterThanOrEqual(15 * 60);
  });

  it('respects the daily cap', () => {
    const ctx = demoCtx();
    ctx.settings.dailyCapMin = 100;
    for (const p of planHorizon(ctx, '2026-10-26', '2026-11-20', null)) expect(p.studyMin).toBeLessThanOrEqual(100);
  });

  it('shows an all-done state after the last exam and plans nothing', () => {
    const plan = planDay(demoCtx(), '2026-12-20', { nowMin: null });
    expect(plan.state).toBe('all-done');
    expect(study(plan.blocks)).toEqual([]);
  });

  it('never schedules a course after its last exam', () => {
    const ctx = demoCtx();
    const late = planDay(ctx, '2026-12-09', { nowMin: null });
    // HIS101, CSC230, CHM120 are finished by 9 Dec; MTH210 and PHY150 still have finals
    for (const b of study(late.blocks)) expect(['mth210', 'phy150']).toContain(b.courseId);
    expect(study(late.blocks).length).toBeGreaterThan(0);
  });

  it('plans a past date without crashing', () => {
    const plan = planDay(demoCtx(), '2026-10-01', { nowMin: null });
    expect(['rest', 'normal']).toContain(plan.state);
  });

  it('rests on days without demand but keeps meals', () => {
    const ctx = demoCtx();
    ctx.exams = ctx.exams.filter((e) => e.id === 'phy150-10');
    const plan = planDay(ctx, '2026-10-26', { nowMin: null });
    expect(plan.state).toBe('rest');
    expect(plan.blocks.some((b) => b.kind === 'meal')).toBe(true);
  });

  it('is deterministic', () => {
    const ctx = demoCtx();
    expect(planDay(ctx, '2026-11-05', { nowMin: null })).toEqual(planDay(ctx, '2026-11-05', { nowMin: null }));
  });

  it('assigns a concrete topic, method and note to every session', () => {
    const plan = planDay(demoCtx(), '2026-11-05', { nowMin: null });
    for (const s of study(plan.blocks)) {
      expect(s.method).toBeTruthy();
      expect(s.note).toBeTruthy();
      expect(s.topicTitle).toBeTruthy();
    }
  });

  it('flags impossible load with a warning', () => {
    const ctx = demoCtx();
    ctx.settings.dailyCapMin = 50;
    const plan = planDay(ctx, '2026-10-30', { nowMin: null });
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('keeps a shift that only partly touches an exam blackout', () => {
    const ctx = demoCtx();
    const plan = planDay(ctx, '2026-11-17', { nowMin: null }); // CSC230 midterm 15:30, shift 14:00-18:00
    const shift = plan.blocks.find((b) => b.kind === 'commitment' && b.title === 'Part-time shift');
    expect(shift).toBeDefined();
    expect(checkDay(ctx, plan)).toEqual([]);
  });

  it('blocks late evening study before an exam just after midnight', () => {
    const ctx = demoCtx();
    ctx.settings.sleepTime = '02:00';
    ctx.exams.push({ id: 'late', courseId: 'phy150', title: 'Late exam', kind: 'quiz', date: '2026-11-06', time: '00:30', durationMin: 60, weight: 1, confidence: 3 });
    const plan = planDay(ctx, '2026-11-05', { nowMin: null });
    expect(checkDay(ctx, plan)).toEqual([]);
  });

  it('puts a break between back-to-back sessions and never touches sessions', () => {
    const ctx = demoCtx();
    for (const p of planHorizon(ctx, '2026-10-26', '2026-11-20', null)) expect(checkDay(ctx, p).filter((e) => e.includes('back-to-back'))).toEqual([]);
  });

  it('gives a course with an exam tomorrow only light review', () => {
    const ctx = demoCtx();
    const plan = planDay(ctx, '2026-11-03', { nowMin: null });
    const csc = study(plan.blocks).filter((b) => b.courseId === 'csc230');
    expect(csc.length).toBeGreaterThan(0);
    expect(csc.every((b) => b.kind === 'review')).toBe(true);
  });

  it('warns when a stale course cannot be fitted', () => {
    const ctx = demoCtx();
    ctx.settings.dailyCapMin = 50;
    const warned = planHorizon(ctx, '2026-10-26', '2026-11-12', null).some((p) => p.warnings.some((w) => w.includes('without study')));
    expect(warned).toBe(true);
  });

  it('falls back to the exam title when a course has no topics and clamps wild weights', () => {
    const ctx = demoCtx();
    ctx.topics = [];
    ctx.exams[0]!.confidence = 9;
    ctx.exams[0]!.weight = 0;
    expect(needMinutes(ctx.exams[0]!)).toBeGreaterThan(0);
    for (const b of study(planDay(ctx, '2026-10-27', { nowMin: null }).blocks)) expect(b.topicTitle).toBeTruthy();
  });

  it('does not reuse a session id for a different exam after a replan', () => {
    const ctx = demoCtx();
    const first = study(planDay(ctx, '2026-10-26', { nowMin: 7 * 60 }).blocks);
    const second = study(planDay({ ...ctx, blocks: first }, '2026-10-26', { nowMin: 10 * 60 }).blocks);
    for (const b of second) {
      const old = first.find((x) => x.id === b.id);
      if (old) expect(old.examId).toBe(b.examId);
    }
  });
});
