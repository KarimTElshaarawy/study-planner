import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Secret and personal-data scan over every tracked file and the whole git history.
 * Generic patterns always run. If seed/personal.json exists locally, its course codes, name and
 * email are also treated as forbidden strings, so your private data can never leak into a commit.
 */
const patterns: Array<[string, RegExp]> = [
  ['Resend API key', /\bre_[A-Za-z0-9]{20,}\b/],
  ['generic secret assignment', /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9+/_-]{20,}['"]/i],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
];

const forbidden: string[] = [];
/** exam (date, time) pairs of the private schedule: they must not appear together anywhere in the repo */
const privatePairs: Array<[string, string]> = [];
if (existsSync('seed/personal.json')) {
  const p = JSON.parse(readFileSync('seed/personal.json', 'utf8')) as { settings?: { name?: string; email?: string }; courses?: Array<{ code: string }>; exams?: Array<{ date: string; time: string }> };
  for (const e of p.exams ?? []) privatePairs.push([e.date, e.time]);
  for (const v of [p.settings?.name, p.settings?.email, ...(p.courses ?? []).map((c) => c.code)]) if (v && v.length >= 4) forbidden.push(v);
}
const extra = (process.env.SCAN_FORBIDDEN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
forbidden.push(...extra);

const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const files = git(['ls-files']).split('\n').filter(Boolean);
const corpus: Array<[string, string]> = [];
for (const f of files) {
  if (/\.(png|jpg|ico|woff2?)$/.test(f) || f === 'package-lock.json') continue;
  try {
    corpus.push([f, readFileSync(f, 'utf8')]);
  } catch {
    // deleted in the working tree
  }
}
corpus.push(['git history', git(['log', '-p', '--all', '--no-color'])]);

// Commit identities may be the owner's public GitHub handle, but only with a no-reply address (never a private email).
const identities = [...new Set(git(['log', '--all', '--format=%an <%ae>%n%cn <%ce>']).split('\n').filter(Boolean))];
const publicEmail = /<(\d+\+)?[\w.-]+@users\.noreply\.github\.com>$|<noreply@example\.com>$/;
const identityHits = identities.filter((i) => !publicEmail.test(i)).map((i) => `git history: commit identity "${i.slice(0, 2)}…" does not use a no-reply address`);

const hits: string[] = [];
// the repository address is public by definition, so the owner's handle inside it is fine
const stripRepoUrl = (t: string): string => t.replace(/github\.com\/[\w.-]+\/study-planner/g, 'github.com/OWNER/study-planner');
for (const [name, raw] of corpus) {
  // the Author/Commit header lines were checked above; they may carry the owner's public handle
  const text = stripRepoUrl(name === 'git history' ? raw.replace(/^(Author|Commit):.*$/gm, '$1: OWNER') : raw);
  for (const [label, re] of patterns) if (re.test(text)) hits.push(`${name}: ${label}`);
  for (const [date, time] of privatePairs) {
    if (new RegExp(`${date}[^\\n]{0,80}${time}|${time}[^\\n]{0,80}${date}`).test(text)) hits.push(`${name}: private exam slot ${date.slice(0, 7)}-**`);
  }
  for (const word of forbidden) if (text.toLowerCase().includes(word.toLowerCase())) hits.push(`${name}: forbidden personal string "${word.slice(0, 2)}…"`);
}
hits.push(...identityHits);
const tracked = files.filter((f) => f === '.env' || f === 'seed/personal.json' || f.startsWith('data/') || f.startsWith('outbox/'));
for (const f of tracked) hits.push(`${f}: private file is tracked`);

if (hits.length > 0) {
  console.error(`Scan failed:\n${[...new Set(hits)].map((h) => `  - ${h}`).join('\n')}`);
  process.exit(1);
}
console.log(`Scan clean: ${files.length} tracked files and full git history, ${forbidden.length} personal strings and ${privatePairs.length} private exam slots checked.`);
