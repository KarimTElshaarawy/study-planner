import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeApp, NOW, PASSWORD, type TestApp } from './appHelper';

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
  await t.req('PUT', '/api/settings', { timezone: 'Asia/Dubai', name: 'Sam', email: 'sam@example.com', setupDone: true });
  const seed = await t.req('POST', '/api/seed/demo');
  expect(seed.status).toBe(200);
});

describe('auth', () => {
  it('rejects unauthenticated requests and wrong passwords', async () => {
    const anon = await t.app.inject({ method: 'GET', url: '/api/bootstrap' });
    expect(anon.statusCode).toBe(401);
    const bad = await t.app.inject({ method: 'POST', url: '/api/login', payload: { password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    const ok = await t.app.inject({ method: 'POST', url: '/api/login', payload: { password: PASSWORD } });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers['set-cookie'])).toMatch(/HttpOnly/i);
  });
  it('throttles repeated bad logins', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await t.app.inject({ method: 'POST', url: '/api/login', payload: { password: 'x' + i } })).statusCode;
    expect(last).toBe(429);
  });
  it('rejects tampered and expired sessions', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { cookie: 'dayfold_session=9999999999.abc' } });
    expect(res.statusCode).toBe(401);
    t.clock.now = NOW + 40 * 86400_000;
    expect((await t.req('GET', '/api/bootstrap')).status).toBe(401);
  });
});

describe('data', () => {
  it('bootstraps settings, exams and the clock in the user timezone', async () => {
    const r = await t.req('GET', '/api/bootstrap');
    expect(r.json.settings.timezone).toBe('Asia/Dubai');
    expect(r.json.exams.length).toBe(11);
    expect(r.json.clock.date).toBe('2026-10-26');
    expect(r.json.email.provider).toBe('outbox');
    expect(JSON.stringify(r.json)).not.toMatch(/re_[A-Za-z0-9]{10}/);
  });
  it('validates input', async () => {
    expect((await t.req('PUT', '/api/settings', { wakeTime: '25:00' })).status).toBe(400);
    expect((await t.req('PUT', '/api/settings', { timezone: 'Mars/Base' })).status).toBe(400);
    expect((await t.req('POST', '/api/exams', { courseId: 'nope', title: 'x', kind: 'final', date: '2026-11-01', time: '09:00', durationMin: 60, weight: 3, confidence: 3 })).status).toBe(400);
  });
  it('creates, edits and deletes an exam and updates the plan', async () => {
    const before = (await t.req('GET', '/api/plan/2026-10-27')).json;
    const created = await t.req('POST', '/api/exams', { courseId: 'mth210', title: 'MTH210 Pop quiz', kind: 'quiz', date: '2026-10-28', time: '10:00', durationMin: 30, weight: 2, confidence: 1 });
    expect(created.status).toBe(201);
    const id = created.json.id as string;
    const after = (await t.req('GET', '/api/plan/2026-10-27')).json;
    expect(JSON.stringify(after.blocks)).not.toEqual(JSON.stringify(before.blocks));
    expect((await t.req('PUT', `/api/exams/${id}`, { confidence: 5 })).json.confidence).toBe(5);
    expect((await t.req('DELETE', `/api/exams/${id}`)).status).toBe(200);
    expect((await t.req('DELETE', `/api/exams/${id}`)).status).toBe(404);
  });
  it('new courses get placeholder topics', async () => {
    const c = await t.req('POST', '/api/courses', { code: 'bio101', name: 'Biology', color: 3 });
    expect(c.json.code).toBe('BIO101');
    const boot = await t.req('GET', '/api/bootstrap');
    expect(boot.json.topics.filter((x: { courseId: string }) => x.courseId === c.json.id).length).toBe(5);
  });
});

describe('plan', () => {
  it('returns today from the persisted plan and keeps it stable between calls', async () => {
    const a = (await t.req('GET', '/api/plan/2026-10-26')).json;
    const b = (await t.req('GET', '/api/plan/2026-10-26')).json;
    expect(a.relation).toBe('today');
    expect(b.blocks).toEqual(a.blocks);
    expect(a.blocks.some((x: { kind: string }) => x.kind === 'study')).toBe(true);
  });
  it('ticks a task, persists it, and survives a replan', async () => {
    const day = (await t.req('GET', '/api/plan/2026-10-26')).json;
    const task = day.blocks.find((b: { kind: string }) => b.kind === 'study');
    const r = await t.req('PATCH', `/api/blocks/${encodeURIComponent(task.id)}`, { done: true });
    expect(r.json.block.status).toBe('done');
    expect(r.json.day.done).toBe(1);
    const re = (await t.req('POST', '/api/plan/replan')).json;
    const same = re.blocks.find((b: { id: string }) => b.id === task.id);
    expect(same.status).toBe('done');
    expect(re.blocks.filter((b: { kind: string; status: string }) => b.kind === 'study' && b.status === 'done')).toHaveLength(1);
    const un = await t.req('PATCH', `/api/blocks/${encodeURIComponent(task.id)}`, { done: false });
    expect(un.json.block.status).toBe('planned');
  });
  it('answers 409 for a block that no longer exists', async () => {
    const r = await t.req('PATCH', '/api/blocks/gone', { done: true });
    expect(r.status).toBe(409);
  });
  it('marks yesterday as missed and carries work over', async () => {
    const day = (await t.req('GET', '/api/plan/2026-10-26')).json;
    expect(day.blocks.some((b: { kind: string }) => b.kind === 'study')).toBe(true);
    t.clock.now = NOW + 24 * 3600_000; // next day 10:00
    const today = (await t.req('GET', '/api/plan/2026-10-27')).json;
    const yesterday = (await t.req('GET', '/api/plan/2026-10-26')).json;
    expect(yesterday.relation).toBe('past');
    expect(yesterday.blocks.filter((b: { kind: string; status: string }) => b.kind === 'study').every((b: { status: string }) => b.status === 'missed')).toBe(true);
    expect(today.blocks.some((b: { carried: boolean }) => b.carried)).toBe(true);
  });
  it('previews the week and future days', async () => {
    const w = await t.req('GET', '/api/week?start=2026-10-26');
    expect(w.json).toHaveLength(7);
    expect(w.json[0].relation).toBe('today');
    expect(w.json[3].relation).toBe('future');
  });
  it('reports stats', async () => {
    const day = (await t.req('GET', '/api/plan/2026-10-26')).json;
    const task = day.blocks.find((b: { kind: string }) => b.kind === 'study');
    await t.req('PATCH', `/api/blocks/${encodeURIComponent(task.id)}`, { done: true });
    const s = (await t.req('GET', '/api/stats')).json;
    expect(s.streak).toBe(1);
    expect(s.doneTasks).toBe(1);
    expect(s.trend).toHaveLength(14);
  });
});

describe('import', () => {
  it('previews and commits CSV', async () => {
    const csv = 'course,title,date,time,kind\nBIO101,BIO101 Midterm,2026-11-05,2:30pm,midterm\nBIO101,Lab report,05/11/2026,23:59,deadline\nbad,row,notadate,,';
    const p = await t.req('POST', '/api/import/preview', { kind: 'csv', text: csv });
    expect(p.json.items).toHaveLength(2);
    expect(p.json.items[0].time).toBe('14:30');
    expect(p.json.errors).toHaveLength(1);
    const c = await t.req('POST', '/api/import/commit', { items: p.json.items });
    expect(c.json.created).toBe(2);
    expect((await t.req('GET', '/api/bootstrap')).json.courses.some((x: { code: string }) => x.code === 'BIO101')).toBe(true);
  });
  it('previews ICS in the user timezone', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:PHY150 Final\r\nDTSTART:20261211T060000Z\r\nDTEND:20261211T080000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const p = await t.req('POST', '/api/import/preview', { kind: 'ics', text: ics });
    expect(p.json.items[0]).toMatchObject({ course: 'PHY150', kind: 'final', date: '2026-12-11', time: '10:00', durationMin: 120 });
  });
});

describe('email job', () => {
  it('writes the daily email to the outbox with a visible status when no provider is set', async () => {
    const r = await t.req('POST', '/api/email/send-now');
    expect(r.json.status).toBe('outbox');
    expect(r.json.subject).toMatch(/^Mon 26 Oct: CSC230 Quiz 3 in 9 days$/);
    const files = readdirSync(t.outbox);
    expect(files.some((f) => f.endsWith('.html'))).toBe(true);
    const html = readFileSync(`${t.outbox}/${files.find((f) => f.endsWith('.html'))}`, 'utf8');
    expect(html).toContain('Open today');
    expect(html).toContain('CSC230');
    expect((await t.req('GET', '/api/email/status')).json.today.status).toBe('outbox');
  });
  it('sends once per day from the scheduler tick and catches up after the time passed', async () => {
    await t.req('PUT', '/api/settings', { emailTime: '06:30' }); // now is 10:00, so this is a missed send
    await t.scheduler.tick();
    await t.scheduler.tick();
    const html = readdirSync(t.outbox).filter((f) => f.endsWith('.html'));
    expect(html).toHaveLength(1);
  });
  it('does not send before the configured time', async () => {
    const fresh = await makeApp();
    await fresh.req('PUT', '/api/settings', { timezone: 'Asia/Dubai', emailTime: '18:00', setupDone: true });
    await fresh.scheduler.tick();
    expect(existsSync(fresh.outbox)).toBe(false);
  });
});

describe('security and integrity', () => {
  it('cannot bypass auth with percent-encoded API paths', async () => {
    for (const url of ['/%61pi/bootstrap', '/api%2Fbootstrap', '/%2561pi/bootstrap']) {
      const res = await t.app.inject({ method: 'GET', url });
      expect(res.body).not.toContain('"settings"');
    }
    const write = await t.app.inject({ method: 'PUT', url: '/%61pi/settings', payload: { name: 'pwned' } });
    expect(write.statusCode).not.toBe(200);
    expect((await t.req('GET', '/api/bootstrap')).json.settings.name).toBe('Sam');
  });
  it('does not trust X-Forwarded-For for the login throttle', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await t.app.inject({ method: 'POST', url: '/api/login', payload: { password: 'x' + i }, headers: { 'x-forwarded-for': `10.0.0.${i}` } })).statusCode;
    }
    expect(last).toBe(429);
  });
  it('refuses to load demo data over existing data', async () => {
    expect((await t.req('POST', '/api/seed/demo')).status).toBe(409);
    const fresh = await makeApp();
    await fresh.req('POST', '/api/commitments', { label: 'Shift', kind: 'work', days: [1], start: '09:00', end: '12:00' });
    expect((await fresh.req('POST', '/api/seed/demo')).status).toBe(409);
  });
  it('rejects duplicate course codes and normalises edits', async () => {
    expect((await t.req('POST', '/api/courses', { code: 'csc230', name: '', color: 0 })).status).toBe(409);
    const c = await t.req('POST', '/api/courses', { code: 'bio101', name: '', color: 1 });
    const upd = await t.req('PUT', `/api/courses/${c.json.id}`, { code: ' bio102 ' });
    expect(upd.json.code).toBe('BIO102');
  });
  it('keeps done history when a course is deleted and does not re-import duplicates', async () => {
    const day = (await t.req('GET', '/api/plan/2026-10-26')).json;
    const task = day.blocks.find((b: { kind: string; courseId: string }) => b.kind === 'study');
    await t.req('PATCH', `/api/blocks/${encodeURIComponent(task.id)}`, { done: true });
    expect((await t.req('DELETE', `/api/courses/${task.courseId}`)).status).toBe(200);
    expect((await t.req('GET', '/api/stats')).json.doneTasks).toBe(1);
    const item = { course: 'NEW100', title: 'NEW100 Quiz', kind: 'quiz', date: '2026-11-30', time: '10:00', durationMin: 60, weight: 1, confidence: 3 };
    await t.req('POST', '/api/import/commit', { items: [item] });
    expect((await t.req('POST', '/api/import/commit', { items: [item] })).json.created).toBe(0);
  });
  it('previews a far week the same as continuous planning', async () => {
    const week = (await t.req('GET', '/api/week?start=2026-11-02')).json;
    const single = (await t.req('GET', '/api/plan/2026-11-03')).json;
    expect(week[1].blocks).toEqual(single.blocks);
    expect((await t.req('GET', '/api/week?start=2036-01-05')).status).toBe(400);
  });
  it('shows an empty state for a planner without exams', async () => {
    const fresh = await makeApp();
    await fresh.req('PUT', '/api/settings', { timezone: 'Asia/Dubai', setupDone: true });
    expect((await fresh.req('GET', '/api/plan/2026-10-26')).json.state).toBe('empty');
  });
  it('retries a failed daily email after ten minutes', async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? new Response('nope', { status: 500 }) : new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const fresh = await makeApp({ RESEND_API_KEY: 'bad-key' });
      // the settings change starts a tick by itself; wait for it to settle
      await fresh.req('PUT', '/api/settings', { timezone: 'Asia/Dubai', setupDone: true, email: 'a@example.com', emailTime: '06:30' });
      for (let i = 0; i < 50 && fresh.repo.emailLog('2026-10-26')?.status !== 'failed'; i++) {
        await fresh.scheduler.tick();
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(fresh.repo.emailLog('2026-10-26')?.status).toBe('failed');
      await fresh.scheduler.tick();
      expect(calls).toBe(1);
      fresh.clock.now += 11 * 60_000;
      await fresh.scheduler.tick();
      expect(fresh.repo.emailLog('2026-10-26')?.status).toBe('sent');
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
