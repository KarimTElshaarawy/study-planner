import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../server/db';
import { Repo } from '../server/repo';
import { applySeed } from '../server/seedData';
import type { SeedFile } from '../shared/seed';

try {
  process.loadEnvFile('.env');
} catch {
  // optional
}

const kind = process.argv[2];
if (kind !== 'demo' && kind !== 'personal') {
  console.error('Usage: tsx scripts/seed.ts <demo|personal>');
  process.exit(1);
}
const file = join('seed', `${kind}.json`);
if (!existsSync(file)) {
  console.error(kind === 'personal' ? 'seed/personal.json not found. Copy seed/demo.json to seed/personal.json and edit it; that file is gitignored.' : `${file} not found`);
  process.exit(1);
}
const dir = process.env.DATA_DIR ?? 'data';
const repo = new Repo(openDb(join(dir, 'dayfold.db')), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
applySeed(repo, JSON.parse(readFileSync(file, 'utf8')) as SeedFile, { settings: true });
console.log(`Loaded ${file} into ${join(dir, 'dayfold.db')}. Existing exams, courses and plans were replaced.`);
