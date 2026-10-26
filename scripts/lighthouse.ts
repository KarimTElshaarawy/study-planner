import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 4014;
const base = `http://localhost:${port}`;
const dir = mkdtempSync(join(tmpdir(), 'cadence-lh-'));
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), APP_PASSWORD: 'lh-password', DATA_DIR: dir, OUTBOX_DIR: join(dir, 'outbox'), NODE_ENV: 'production', RESEND_API_KEY: '', FAKE_NOW: '2026-10-26T03:30:00Z' },
  stdio: 'ignore',
});
process.on('exit', () => server.kill('SIGTERM'));

for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    // starting
  }
  await new Promise((r) => setTimeout(r, 250));
}

const json = { 'Content-Type': 'application/json' };
const login = await fetch(`${base}/api/login`, { method: 'POST', headers: json, body: JSON.stringify({ password: 'lh-password' }) });
const cookie = /cadence_session=[^;]+/.exec(login.headers.get('set-cookie') ?? '')?.[0] ?? '';
const auth = { ...json, cookie };
await fetch(`${base}/api/settings`, { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Sam', timezone: 'Asia/Dubai', setupDone: true }) });
await fetch(`${base}/api/seed/demo`, { method: 'POST', headers: auth, body: '{}' });

const pages = [['about', false], ['today', true], ['exams', true], ['week', true], ['stats', true], ['settings', true]] as const;
let failed = false;
for (const [name, needsAuth] of pages) {
  const out = join(dir, `${name}.json`);
  execFileSync(
    'npx',
    ['lighthouse', `${base}/${name}`, '--chrome-flags=--headless=new --no-sandbox', '--extra-headers', JSON.stringify(needsAuth ? { Cookie: cookie } : {}), '--only-categories=performance,accessibility,best-practices', '--output=json', `--output-path=${out}`, '--quiet'],
    { env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' }, stdio: 'ignore' },
  );
  const r = JSON.parse(readFileSync(out, 'utf8')) as { categories: Record<string, { score: number }>; audits: Record<string, { score: number | null; scoreDisplayMode: string; displayValue?: string }> };
  const scores = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log(name.padEnd(9), JSON.stringify(scores));
  if (Object.values(scores).some((s) => s < 95)) {
    failed = true;
    for (const [id, a] of Object.entries(r.audits)) if (a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'numeric') console.log(`   - ${id} ${a.score} ${a.displayValue ?? ''}`);
  }
}
server.kill('SIGTERM');
process.exit(failed ? 1 : 0);
