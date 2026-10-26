import { loadConfig } from './config';
import { buildApp } from './app';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env file; environment variables may come from the host
}

const cfg = loadConfig();
const { app, scheduler, svc } = await buildApp(cfg, { logger: true });

svc.ensureToday();
scheduler.start();
await app.listen({ port: cfg.port, host: cfg.host });

const shutdown = async (): Promise<void> => {
  scheduler.stop();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
