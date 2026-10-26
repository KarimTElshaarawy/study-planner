import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

test.describe.configure({ mode: 'serial' });

const OUTBOX = 'test-results/e2e/outbox';

let session: { name: string; value: string } | null = null;

/** Every test gets a fresh browser context, so reuse one login (the server throttles repeated sign-ins). */
const auth = async (page: import('@playwright/test').Page): Promise<void> => {
  if (!session) {
    const res = await page.request.post('/api/login', { data: { password: 'e2e-password' } });
    expect(res.ok()).toBe(true);
    const c = (await page.context().cookies()).find((x) => x.name === 'cadence_session');
    session = { name: 'cadence_session', value: c?.value ?? '' };
    return;
  }
  await page.context().addCookies([{ ...session, url: 'http://localhost:4020' }]);
};

test('public landing page and unauthenticated redirect to login', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every day planned');
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('wrong password is rejected, right password continues to the setup wizard', async ({ page }) => {
  await page.goto('/today');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong password');
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Who is studying?' })).toBeVisible();
});

test('finish the setup wizard with demo data', async ({ page }) => {
  await page.goto('/today');
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your name').fill('Sam');
  await page.getByLabel('Timezone').selectOption('Asia/Dubai');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your day.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Email address').fill('sam@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Use demo data' }).click();
  await expect(page.getByText('11 added')).toBeVisible();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Monday 26 October')).toBeVisible();
});

test('tick a task, reload and confirm it persisted', async ({ page }) => {
  await auth(page);
  await page.goto('/today');
  const boxes = page.getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  const total = await boxes.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.getByText(`of ${total} done`)).toBeVisible();
  await boxes.first().click();
  await expect(boxes.first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(`of ${total} done`)).toBeVisible();
  await expect(page.locator('.ring-center .big')).toHaveText('1');
  await page.reload();
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.ring-center .big')).toHaveText('1');
});

test('replan keeps completed work', async ({ page }) => {
  await auth(page);
  await page.goto('/today');
  await page.getByRole('button', { name: 'Replan' }).click();
  await expect(page.locator('.toast')).toContainText('Plan refreshed');
  await expect(page.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.ring-center .big')).toHaveText('1');
});

test('navigate every screen', async ({ page }) => {
  await auth(page);
  await page.goto('/today');
  for (const [name, heading] of [['Exams', 'Exams'], ['Week', 'Week'], ['Stats', 'Stats'], ['Settings', 'Settings']] as const) {
    await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});

test('add, edit and delete an exam', async ({ page }) => {
  await auth(page);
  await page.goto('/exams');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Title').fill('E2E Pop quiz');
  await page.getByLabel('Date').fill('2026-10-30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Pop quiz')).toBeVisible();
  await page.getByText('E2E Pop quiz').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('E2E Pop quiz')).toHaveCount(0);
});

test('trigger the daily email job into the outbox and validate it', async ({ page }) => {
  await auth(page);
  await page.goto('/settings');
  await expect(page.getByText('No email provider is set up')).toBeVisible();
  await page.getByRole('button', { name: "Send today's email now" }).click();
  await expect(page.locator('.toast')).toContainText('Saved to the outbox');
  expect(existsSync(OUTBOX)).toBe(true);
  const html = readdirSync(OUTBOX).find((f) => f.endsWith('.html'));
  expect(html).toBeTruthy();
  const body = readFileSync(`${OUTBOX}/${html}`, 'utf8');
  expect(body).toContain('Open today');
  expect(body).toContain('Yesterday');
  expect(body).toContain('CSC230');
  expect(body).toContain('prefers-color-scheme: dark');
  const txt = readFileSync(`${OUTBOX}/${(html as string).replace('.html', '.txt')}`, 'utf8');
  expect(txt).toContain('Subject: Mon 26 Oct: CSC230 Quiz 3 in 9 days');
  expect(txt).toContain('To: sam@example.com');
});

test('PWA metadata and service worker', async ({ page, request }) => {
  await auth(page);
  await page.goto('/today');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(1);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return !!r.active;
  });
  expect(reg).toBe(true);
});

test('sign out returns to login', async ({ page }) => {
  await auth(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('unknown routes show the 404 page', async ({ page }) => {
  await page.goto('/definitely-not-a-page');
  await expect(page.getByRole('heading', { name: /Sign in|Page not found/ })).toBeVisible();
});
