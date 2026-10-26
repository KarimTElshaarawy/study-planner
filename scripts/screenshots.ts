import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const out = process.argv[2] ?? 'screenshots/review';
const port = 4010;
const base = `http://localhost:${port}`;
const password = 'screenshot-password';
mkdirSync(out, { recursive: true });

const dir = mkdtempSync(join(tmpdir(), 'dayfold-shots-'));
const server: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), APP_PASSWORD: password, DATA_DIR: dir, OUTBOX_DIR: join(dir, 'outbox'), RESEND_API_KEY: '', NODE_ENV: 'production', FAKE_NOW: '2026-10-26T03:30:00Z' },
  stdio: 'ignore',
});
const stop = (): void => {
  server.kill('SIGTERM');
};
process.on('exit', stop);

const waitUp = async (): Promise<void> => {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
};

const sizes = [
  { name: 'mobile', width: 390, height: 844, scale: 3, mobile: true },
  { name: 'desktop', width: 1440, height: 900, scale: 2, mobile: false },
];

const shoot = async (page: Page, name: string, full = false): Promise<void> => {
  await page.waitForTimeout(name.startsWith('about') ? 1600 : 800);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
};

let token = '';
const login = async (page: Page, ready = '.tl-row'): Promise<void> => {
  if (!token) {
    const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    token = /dayfold_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  }
  await page.context().addCookies([{ name: 'dayfold_session', value: token, url: base }]);
  await page.goto(`${base}/today`);
  await page.waitForSelector(ready);
};

await waitUp();
const browser = await chromium.launch();
try {
  // Phase A: the setup wizard on a fresh database
  for (const scheme of ['light', 'dark'] as const) {
    for (const size of sizes) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale, isMobile: size.mobile, hasTouch: size.mobile, colorScheme: scheme });
      const page = await ctx.newPage();
      const tag = `${size.name}-${scheme}`;
      await page.goto(`${base}/today`);
      await shoot(page, `login-${tag}`);
      await login(page, 'text=Who is studying?');
      await shoot(page, `setup-1-${tag}`);
      await page.getByLabel('Your name').fill('Sam');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await shoot(page, `setup-4-${tag}`);
      await ctx.close();
    }
  }
  // finish setup through the UI once, with demo data
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, 'text=Who is studying?');
    await page.getByLabel('Your name').fill('Sam');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Use demo data' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Start planning' }).click();
    await page.waitForSelector('.tl-row');
    await ctx.close();
  }
  // a believable day: two sessions already done, same state in every theme and size
  {
    const headers = { 'Content-Type': 'application/json', cookie: `dayfold_session=${token}` };
    const day = (await (await fetch(`${base}/api/plan/2026-10-26`, { headers })).json()) as { blocks: Array<{ id: string; kind: string }> };
    for (const b of day.blocks.filter((x) => x.kind === 'study').slice(0, 2)) {
      await fetch(`${base}/api/blocks/${encodeURIComponent(b.id)}`, { method: 'PATCH', headers, body: JSON.stringify({ done: true }) });
    }
  }
  // Phase B: every screen
  for (const scheme of ['light', 'dark'] as const) {
    for (const size of sizes) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale, isMobile: size.mobile, hasTouch: size.mobile, colorScheme: scheme });
      const page = await ctx.newPage();
      const tag = `${size.name}-${scheme}`;
      await page.goto(`${base}/about`);
      await shoot(page, `about-hero-${tag}`);
      for (const [label, frac] of [['scroll', 0.3], ['bento', 0.62], ['end', 1]] as const) {
        await page.evaluate((f) => window.scrollTo(0, (document.body.scrollHeight - window.innerHeight) * f), frac);
        await shoot(page, `about-${label}-${tag}`);
      }
      await login(page);
      await page.waitForSelector('.tl-row');
      await shoot(page, `today-${tag}`);
      {
        // tick one more for the picture, then put it back so every theme shows the same state
        const open = page.getByRole('checkbox', { checked: false }).first();
        await open.click();
        await shoot(page, `today-ticked-${tag}`);
        await page.getByRole('checkbox', { checked: true }).last().click();
        await page.waitForTimeout(400);
      }
      await page.goto(`${base}/exams`);
      await page.waitForSelector('.cd-card');
      await shoot(page, `exams-${tag}`);
      await page.goto(`${base}/week`);
      await shoot(page, `week-${tag}`);
      await page.goto(`${base}/stats`);
      await shoot(page, `stats-${tag}`);
      await page.goto(`${base}/settings`);
      await shoot(page, `settings-${tag}`);
      await page.goto(`${base}/nope`);
      await shoot(page, `404-${tag}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  stop();
}
console.log(`screenshots in ${out}`);
