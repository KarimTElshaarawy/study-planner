import type { DigestData } from '../shared/email/build';
import { buildEmail } from '../shared/email/build';
import { addDays, diffDays, fmtMin } from '../shared/time';
import { isStudy } from '../shared/types';
import type { Config } from './config';
import { sendMail, type SendResult } from './mailer';
import type { Service } from './service';

export const buildDigest = (svc: Service, appUrl: string): DigestData => {
  const { date } = svc.clock();
  const settings = svc.repo.getSettings();
  const courses = svc.repo.listCourses();
  const plan = svc.day(date);
  const ydayBlocks = svc.repo.blocksOn(addDays(date, -1)).filter(isStudy);
  const done = ydayBlocks.filter((b) => b.status === 'done');
  const missed = ydayBlocks.filter((b) => b.status !== 'done');
  const nowMs = svc.now();
  const upcoming = svc.upcoming(6).map((u) => ({
    title: u.exam.title,
    courseCode: u.course?.code ?? '',
    colorIndex: u.course?.color ?? 7,
    date: u.exam.date,
    time: u.exam.time,
    daysLeft: Math.max(0, diffDays(u.exam.date, date)),
    hoursLeft: Math.max(0, Math.floor((u.startMs - nowMs) / 3_600_000)),
  }));
  return {
    name: settings.name,
    date,
    appUrl,
    courses,
    yesterday: ydayBlocks.length
      ? { done, missed, doneMin: done.reduce((s, b) => s + b.end - b.start, 0) }
      : null,
    carried: plan.blocks.filter((b) => isStudy(b) && b.carried && b.status === 'planned'),
    plan: { blocks: plan.blocks, state: plan.state, warnings: plan.warnings },
    upcoming,
    streak: svc.stats().streak,
  };
};

export interface JobResult extends SendResult {
  skipped: boolean;
  date: string;
  subject: string;
}

export const runDailyEmail = async (svc: Service, cfg: Config, opts: { force: boolean; retry?: boolean }): Promise<JobResult | { skipped: true; date: string }> => {
  const { date } = svc.clock();
  if (!opts.force && !opts.retry && svc.repo.emailLog(date)) return { skipped: true, date };
  if (opts.force) svc.repo.resetEmail(date);
  const settings = svc.repo.getSettings();
  if (opts.retry) {
    if (!svc.repo.beginRetry(date)) return { skipped: true, date };
  } else if (!svc.repo.claimEmail(date, 'pending')) return { skipped: true, date };
  try {
    svc.replanToday();
    const mail = buildEmail(buildDigest(svc, cfg.appUrl));
    const stamp = `${date}-${fmtMin(svc.clock().min).replace(':', '')}`;
    const res = await sendMail(cfg, settings.email, mail, stamp);
    svc.repo.finishEmail(date, res.status, res.detail ?? res.file);
    return { ...res, skipped: false, date, subject: mail.subject };
  } catch (err) {
    svc.repo.finishEmail(date, 'failed', err instanceof Error ? err.message : String(err));
    throw err;
  }
};
