import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { buildEmail } from '../shared/email/build';
import { addDays, diffDays, examEndMs, examStartMs, isValidTimezone } from '../shared/time';
import type { SeedFile } from '../shared/seed';
import { cookieMaxAge, cookieName, makeToken, safeEqual, Throttle, verifyToken } from './auth';
import type { Config } from './config';
import { openDb } from './db';
import { buildDigest, runDailyEmail } from './digest';
import { parseCsv, parseIcs } from './importers';
import { activeProvider, sendMail } from './mailer';
import { Repo } from './repo';
import { Scheduler } from './scheduler';
import { applySeed, PLACEHOLDER_TOPICS } from './seedData';
import { Service } from './service';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = (lo: number, hi: number) => z.number().int().min(lo).max(hi);

const settingsPatch = z
  .object({
    name: z.string().max(60),
    timezone: z.string().refine(isValidTimezone, 'Unknown timezone'),
    email: z.union([z.literal(''), z.string().email()]),
    wakeTime: hhmm,
    sleepTime: hhmm,
    sessionMin: int(20, 120),
    breakMin: int(0, 60),
    longBreakMin: int(0, 90),
    longBreakEvery: int(2, 8),
    dailyCapMin: int(60, 960),
    windDownMin: int(0, 180),
    morningMin: int(0, 180),
    meals: z.array(z.object({ label: z.string().min(1).max(30), time: hhmm, durationMin: int(10, 120) })).max(6),
    emailTime: hhmm,
    emailEnabled: z.boolean(),
    setupDone: z.boolean(),
  })
  .partial();

const courseBody = z.object({ code: z.string().min(1).max(20), name: z.string().max(80).default(''), color: int(0, 7).default(0) });
const examBody = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(100),
  kind: z.enum(['quiz', 'midterm', 'final', 'deadline']),
  date: isoDate,
  time: hhmm,
  durationMin: int(0, 480),
  weight: int(1, 5),
  confidence: int(1, 5),
});
const commitmentBody = z.object({
  label: z.string().min(1).max(60),
  kind: z.enum(['class', 'work', 'training', 'other']),
  days: z.array(int(1, 7)).min(1).max(7),
  start: hhmm,
  end: hhmm,
  from: isoDate.nullish(),
  to: isoDate.nullish(),
});

export interface AppBundle {
  app: FastifyInstance;
  svc: Service;
  scheduler: Scheduler;
  repo: Repo;
}

export const buildApp = async (cfg: Config, opts: { now?: () => number; dbFile?: string; logger?: boolean } = {}): Promise<AppBundle> => {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1_000_000, trustProxy: cfg.trustProxy });
  const db = openDb(opts.dbFile ?? join(cfg.dataDir, 'dayfold.db'));
  const bootedAt = Date.now();
  const fake = cfg.fakeNow;
  const clock = opts.now ?? (fake !== null && !Number.isNaN(fake) ? () => fake + (Date.now() - bootedAt) : Date.now);
  const repo = new Repo(db, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', clock);
  const svc = new Service(repo, clock);
  const scheduler = new Scheduler(svc, cfg, (m) => app.log.info(m));
  const throttle = new Throttle();
  const nowMs = (): number => svc.now();

  await app.register(fastifyCookie);
  await app.register(fastifyCompress, { threshold: 512 });

  app.addHook('onRequest', async (req, reply) => {
    // Use the matched route, not the raw URL: the router decodes percent-encoding (/%61pi/...) before matching.
    const route = req.routeOptions?.url ?? '';
    if (!route.startsWith('/api/')) return;
    if (route === '/api/login' || route === '/api/health' || route === '/api/session') return;
    if (!verifyToken(cfg.sessionSecret, req.cookies[cookieName], nowMs())) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: 'invalid', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') return reply.code(409).send({ error: 'That already exists.' });
    const code = err.statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.code(code).send({ error: code >= 500 ? 'server error' : err.message });
  });

  const afterEdit = (): void => {
    svc.replanToday();
  };

  const secureCookie = (req: FastifyRequest): boolean => req.protocol === 'https' || cfg.appUrl.startsWith('https://');

  // --- auth
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/session', async (req) => ({ authenticated: verifyToken(cfg.sessionSecret, req.cookies[cookieName], nowMs()) }));
  app.post('/api/login', async (req, reply) => {
    const body = z.object({ password: z.string().min(1).max(500) }).parse(req.body);
    if (!throttle.allow(req.ip, nowMs())) return reply.code(429).send({ error: 'Too many attempts. Wait a few minutes.' });
    if (!cfg.appPassword || !safeEqual(body.password, cfg.appPassword)) return reply.code(401).send({ error: 'Wrong password.' });
    reply.setCookie(cookieName, makeToken(cfg.sessionSecret, nowMs()), {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(req),
      path: '/',
      maxAge: cookieMaxAge,
    });
    return { ok: true };
  });
  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  // --- bootstrap
  const emailInfo = () => {
    const { date } = svc.clock();
    const last = repo.emailLog(date);
    return {
      provider: activeProvider(cfg),
      configured: activeProvider(cfg) !== 'outbox' && !!repo.getSettings().email,
      today: last ? { status: last.status, at: last.sent_at, detail: last.detail } : null,
    };
  };
  app.get('/api/bootstrap', async () => {
    const settings = repo.getSettings();
    return {
      settings,
      courses: repo.listCourses(),
      exams: repo.listExams().map((e) => ({ ...e, startMs: examStartMs(e, settings.timezone), endMs: examEndMs(e, settings.timezone) })),
      topics: repo.listTopics(),
      commitments: repo.listCommitments(),
      clock: { ...svc.clock(), timezone: settings.timezone, nowMs: nowMs() },
      email: emailInfo(),
    };
  });

  // --- settings
  app.put('/api/settings', async (req) => {
    const patch = settingsPatch.parse(req.body);
    const before = repo.getSettings();
    const settings = repo.saveSettings(patch);
    if (patch.timezone && patch.timezone !== before.timezone) scheduler.restart();
    afterEdit();
    return settings;
  });

  // --- courses
  const seedTopics = (courseId: string): void => {
    for (const title of PLACEHOLDER_TOPICS) repo.createTopic({ courseId, title });
  };
  app.post('/api/courses', async (req, reply) => {
    const b = courseBody.parse(req.body);
    const course = repo.tx(() => {
      const c = repo.createCourse({ ...b, code: b.code.trim().toUpperCase() });
      seedTopics(c.id);
      return c;
    });
    return reply.code(201).send(course);
  });
  app.put('/api/courses/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const patch = courseBody.partial().parse(req.body);
    const c = repo.updateCourse(id, patch.code ? { ...patch, code: patch.code.trim().toUpperCase() } : patch);
    if (!c) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return c;
  });
  app.delete('/api/courses/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const removed = repo.tx(() => {
      repo.db.prepare("DELETE FROM blocks WHERE course_id = ? AND status != 'done'").run(id);
      repo.db.prepare('UPDATE blocks SET course_id = NULL, exam_id = NULL, topic_id = NULL WHERE course_id = ?').run(id);
      return repo.deleteCourse(id);
    });
    if (!removed) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return { ok: true };
  });

  // --- exams
  app.post('/api/exams', async (req, reply) => {
    const b = examBody.parse(req.body);
    if (!repo.getCourse(b.courseId)) return reply.code(400).send({ error: 'unknown course' });
    const e = repo.createExam(b);
    afterEdit();
    return reply.code(201).send(e);
  });
  app.put('/api/exams/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const patch = examBody.partial().parse(req.body);
    if (patch.courseId && !repo.getCourse(patch.courseId)) return reply.code(400).send({ error: 'unknown course' });
    const e = repo.updateExam(id, patch);
    if (!e) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return e;
  });
  app.delete('/api/exams/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!repo.deleteExam(id)) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return { ok: true };
  });

  // --- topics
  app.post('/api/topics', async (req, reply) => {
    const b = z.object({ courseId: z.string(), title: z.string().min(1).max(100) }).parse(req.body);
    if (!repo.getCourse(b.courseId)) return reply.code(400).send({ error: 'unknown course' });
    const t = repo.createTopic(b);
    afterEdit();
    return reply.code(201).send(t);
  });
  app.put('/api/topics/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = z.object({ title: z.string().min(1).max(100) }).parse(req.body);
    if (!repo.updateTopic(id, b.title)) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return { ok: true };
  });
  app.delete('/api/topics/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!repo.deleteTopic(id)) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return { ok: true };
  });

  // --- commitments
  app.post('/api/commitments', async (req, reply) => {
    const c = repo.createCommitment(commitmentBody.parse(req.body));
    afterEdit();
    return reply.code(201).send(c);
  });
  app.put('/api/commitments/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const c = repo.updateCommitment(id, commitmentBody.partial().parse(req.body));
    if (!c) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return c;
  });
  app.delete('/api/commitments/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!repo.deleteCommitment(id)) return reply.code(404).send({ error: 'not found' });
    afterEdit();
    return { ok: true };
  });

  // --- plan
  app.get('/api/plan/:date', async (req) => {
    const { date } = z.object({ date: isoDate }).parse(req.params);
    return svc.day(date);
  });
  app.get('/api/week', async (req, reply) => {
    const q = z.object({ start: isoDate }).parse(req.query);
    const { date: today } = svc.clock();
    if (Math.abs(diffDays(q.start, today)) > 400) return reply.code(400).send({ error: 'start is out of range' });
    return svc.range(q.start, addDays(q.start, 6));
  });
  app.post('/api/plan/replan', async () => svc.replanToday());
  app.patch('/api/blocks/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = z.object({ done: z.boolean() }).parse(req.body);
    const block = svc.toggle(id, b.done);
    if (!block) return reply.code(409).send({ error: 'That session changed. The plan was refreshed.' });
    return { ok: true, block, day: svc.day(block.date) };
  });
  app.get('/api/stats', async () => svc.stats());

  // --- import
  app.post('/api/import/preview', async (req) => {
    const b = z.object({ kind: z.enum(['csv', 'ics']), text: z.string().max(500_000) }).parse(req.body);
    return b.kind === 'csv' ? parseCsv(b.text) : parseIcs(b.text, repo.getSettings().timezone);
  });
  app.post('/api/import/commit', async (req) => {
    const b = z
      .object({
        items: z
          .array(
            z.object({
              course: z.string().min(1).max(20),
              title: z.string().min(1).max(100),
              kind: z.enum(['quiz', 'midterm', 'final', 'deadline']),
              date: isoDate,
              time: hhmm,
              durationMin: int(0, 480),
              weight: int(1, 5),
              confidence: int(1, 5),
            }),
          )
          .max(300),
      })
      .parse(req.body);
    const created = repo.tx(() => {
      let n = 0;
      for (const it of b.items) {
        const code = it.course.trim().toUpperCase();
        const dup = repo.listExams().some((e) => e.date === it.date && e.time === it.time && e.title === it.title && repo.getCourse(e.courseId)?.code === code);
        if (dup) continue;
        let course = repo.listCourses().find((c) => c.code === code);
        if (!course) {
          course = repo.createCourse({ code, name: '', color: repo.listCourses().length % 8 });
          seedTopics(course.id);
        }
        repo.createExam({ courseId: course.id, title: it.title, kind: it.kind, date: it.date, time: it.time, durationMin: it.durationMin, weight: it.weight, confidence: it.confidence });
        n += 1;
      }
      return n;
    });
    afterEdit();
    return { created };
  });

  // --- demo data
  app.post('/api/seed/demo', async (_req, reply) => {
    if (repo.listExams().length > 0 || repo.listCourses().length > 0 || repo.listCommitments().length > 0 || repo.studyHistory().length > 0) {
      return reply.code(409).send({ error: 'Demo data can only be loaded into an empty planner.' });
    }
    const file = join(process.cwd(), 'seed', 'demo.json');
    if (!existsSync(file)) return reply.code(404).send({ error: 'Demo data not found.' });
    applySeed(repo, JSON.parse(readFileSync(file, 'utf8')) as SeedFile, { settings: false });
    afterEdit();
    return { ok: true };
  });

  // --- email
  app.get('/api/email/status', async () => emailInfo());
  app.get('/api/email/preview', async (_req, reply) => {
    svc.ensureToday();
    return reply.type('text/html').send(buildEmail(buildDigest(svc, cfg.appUrl)).html);
  });
  app.post('/api/email/test', async () => {
    svc.ensureToday();
    const mail = buildEmail(buildDigest(svc, cfg.appUrl));
    const s = repo.getSettings();
    return sendMail(cfg, s.email, { ...mail, subject: `Test: ${mail.subject}` }, `test-${Date.now()}`);
  });
  app.post('/api/email/send-now', async () => {
    const res = await runDailyEmail(svc, cfg, { force: true });
    return res;
  });

  // --- static app
  if (existsSync(cfg.webDir)) {
    await app.register(fastifyStatic, { root: cfg.webDir, wildcard: false, setHeaders: (res, path) => {
      if (path.endsWith('sw.js') || path.endsWith('index.html')) res.header('Cache-Control', 'no-cache');
      else if (path.includes('/assets/')) res.header('Cache-Control', 'public, max-age=31536000, immutable');
    } });
    const indexHtml = (reply: FastifyReply): FastifyReply => reply.type('text/html').header('Cache-Control', 'no-cache').send(readFileSync(join(cfg.webDir, 'index.html')));
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/assets/')) return reply.code(404).send({ error: 'not found' });
      return indexHtml(reply);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not found' }));
  }

  return { app, svc, scheduler, repo };
};
