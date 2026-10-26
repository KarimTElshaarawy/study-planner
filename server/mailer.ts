import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import type { BuiltEmail } from '../shared/email/build';
import type { Config } from './config';

export type Provider = 'resend' | 'smtp' | 'outbox';

export interface SendResult {
  provider: Provider;
  status: 'sent' | 'outbox' | 'failed';
  detail: string | null;
  file: string | null;
}

export const activeProvider = (cfg: Config): Provider => (cfg.resendKey ? 'resend' : cfg.smtp ? 'smtp' : 'outbox');

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const writeOutbox = (cfg: Config, to: string, mail: BuiltEmail, stamp: string): string => {
  mkdirSync(cfg.outboxDir, { recursive: true });
  const base = join(cfg.outboxDir, `${stamp}-${slug(mail.subject)}`);
  writeFileSync(`${base}.html`, mail.html);
  writeFileSync(`${base}.txt`, `To: ${to}\nSubject: ${mail.subject}\n\n${mail.text}`);
  return `${base}.html`;
};

export const sendMail = async (cfg: Config, to: string, mail: BuiltEmail, stamp: string): Promise<SendResult> => {
  const provider = activeProvider(cfg);
  if (provider === 'outbox' || !to) {
    const file = writeOutbox(cfg, to, mail, stamp);
    return {
      provider: 'outbox',
      status: 'outbox',
      detail: to ? 'No email provider configured. Saved to the outbox.' : 'No email address set. Saved to the outbox.',
      file,
    };
  }
  try {
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.mailFrom, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } else if (cfg.smtp) {
      const transport = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
      });
      await transport.sendMail({ from: cfg.mailFrom, to, subject: mail.subject, html: mail.html, text: mail.text });
    }
    return { provider, status: 'sent', detail: null, file: null };
  } catch (err) {
    const file = writeOutbox(cfg, to, mail, stamp);
    return { provider, status: 'failed', detail: err instanceof Error ? err.message : String(err), file };
  }
};
