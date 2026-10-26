import cron, { type ScheduledTask } from 'node-cron';
import { toMin } from '../shared/time';
import type { Config } from './config';
import { runDailyEmail } from './digest';
import type { Service } from './service';

const RETRY_AFTER_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

/**
 * Ticks every minute in the user's timezone. A tick sends today's email when the configured time
 * has passed and nothing was logged for today, so a missed send (server asleep) is caught up once.
 */
export class Scheduler {
  private task: ScheduledTask | null = null;
  private running = false;

  constructor(
    private readonly svc: Service,
    private readonly cfg: Config,
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  async tick(): Promise<void> {
    if (this.running) return;
    const s = this.svc.repo.getSettings();
    if (!s.setupDone || !s.emailEnabled) return;
    const { date, min } = this.svc.clock();
    this.svc.repo.markPastMissed(date);
    if (min < toMin(s.emailTime)) return;
    const log = this.svc.repo.emailLog(date);
    const age = log ? this.svc.now() - Date.parse(log.sent_at) : 0;
    const retry = !!log && (log.status === 'failed' || log.status === 'sending') && age > RETRY_AFTER_MS && log.attempts < MAX_ATTEMPTS;
    if (log && !retry) return;
    this.running = true;
    try {
      const res = await runDailyEmail(this.svc, this.cfg, { force: false, retry });
      if (!res.skipped) this.log(`daily email ${res.status} (${res.provider})`);
    } catch (err) {
      this.log(`daily email failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  start(): void {
    this.stop();
    const tz = this.svc.repo.getSettings().timezone;
    this.task = cron.schedule('* * * * *', () => void this.tick(), { timezone: tz });
    void this.tick();
  }

  /** call after the timezone changes */
  restart(): void {
    this.start();
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}
