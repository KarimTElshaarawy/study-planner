import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, color INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  duration_min INTEGER NOT NULL, weight INTEGER NOT NULL, confidence INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, days TEXT NOT NULL,
  start TEXT NOT NULL, end TEXT NOT NULL, from_date TEXT, to_date TEXT
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
  kind TEXT NOT NULL, title TEXT NOT NULL, course_id TEXT, exam_id TEXT, topic_id TEXT,
  topic_title TEXT, method TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'planned',
  carried INTEGER NOT NULL DEFAULT 0, done_at TEXT
);
CREATE INDEX IF NOT EXISTS blocks_date ON blocks(date);
CREATE TABLE IF NOT EXISTS email_log (
  date TEXT PRIMARY KEY, sent_at TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, detail TEXT, attempts INTEGER NOT NULL DEFAULT 1
);
`;

export const openDb = (file: string): Db => {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
};
