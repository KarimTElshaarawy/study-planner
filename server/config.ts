import { resolve } from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  outboxDir: string;
  appUrl: string;
  appPassword: string;
  sessionSecret: string;
  resendKey: string;
  mailFrom: string;
  smtp: { host: string; port: number; user: string; pass: string; secure: boolean } | null;
  isTest: boolean;
  trustProxy: boolean;
  webDir: string;
  /** demo and test only: pretend the server started at this ISO instant */
  fakeNow: number | null;
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const port = Number(env.PORT ?? 3000);
  const appPassword = env.APP_PASSWORD ?? '';
  const isTest = env.NODE_ENV === 'test';
  if (!appPassword && !isTest) {
    throw new Error('APP_PASSWORD is required. Set a long random value in .env (see .env.example).');
  }
  const smtpHost = env.SMTP_HOST ?? '';
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    dataDir: resolve(env.DATA_DIR ?? 'data'),
    outboxDir: resolve(env.OUTBOX_DIR ?? 'outbox'),
    appUrl: (env.APP_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    appPassword,
    sessionSecret: env.SESSION_SECRET || appPassword,
    trustProxy: env.TRUST_PROXY === 'true',
    resendKey: env.RESEND_API_KEY ?? '',
    mailFrom: env.MAIL_FROM ?? 'Dayfold <onboarding@resend.dev>',
    smtp: smtpHost
      ? {
          host: smtpHost,
          port: Number(env.SMTP_PORT ?? 587),
          user: env.SMTP_USER ?? '',
          pass: env.SMTP_PASS ?? '',
          secure: env.SMTP_SECURE === 'true',
        }
      : null,
    isTest,
    webDir: resolve(env.WEB_DIR ?? 'web/dist'),
    fakeNow: env.FAKE_NOW ? Date.parse(env.FAKE_NOW) : null,
  };
};
