import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type AppBundle } from '../server/app';
import { loadConfig } from '../server/config';

export const PASSWORD = 'test-password-123';
/** Mon 26 Oct 2026, 10:00 in Asia/Dubai */
export const NOW = Date.UTC(2026, 9, 26, 6, 0);

export interface TestApp extends AppBundle {
  cookie: string;
  outbox: string;
  clock: { now: number };
  req: (method: string, url: string, body?: unknown) => Promise<{ status: number; json: any; text: string }>;
}

export const makeApp = async (env: Record<string, string> = {}): Promise<TestApp> => {
  const dir = mkdtempSync(join(tmpdir(), 'dayfold-'));
  const cfg = loadConfig({ NODE_ENV: 'test', APP_PASSWORD: PASSWORD, DATA_DIR: dir, OUTBOX_DIR: join(dir, 'outbox'), WEB_DIR: join(dir, 'none'), ...env });
  const clock = { now: NOW };
  const bundle = await buildApp(cfg, { dbFile: ':memory:', now: () => clock.now });
  const login = await bundle.app.inject({ method: 'POST', url: '/api/login', payload: { password: PASSWORD } });
  const cookie = `${String(login.cookies[0]?.name)}=${String(login.cookies[0]?.value)}`;
  const req: TestApp['req'] = async (method, url, body) => {
    const res = await bundle.app.inject({ method: method as 'GET', url, payload: body as object | undefined, headers: { cookie } });
    const parse = (): unknown => {
      try {
        return JSON.parse(res.body);
      } catch {
        return null;
      }
    };
    const json = parse();
    return { status: res.statusCode, json, text: res.body };
  };
  return { ...bundle, cookie, outbox: cfg.outboxDir, clock, req };
};

export const demoSeedText = (): string => readFileSync('seed/demo.json', 'utf8');
