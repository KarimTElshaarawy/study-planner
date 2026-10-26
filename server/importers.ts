import { DateTime } from 'luxon';
import { EXAM_DEFAULTS } from '../shared/defaults';
import type { ExamKind } from '../shared/types';

export interface ExamDraft {
  course: string;
  title: string;
  kind: ExamKind;
  date: string;
  time: string;
  durationMin: number;
  weight: number;
  confidence: number;
}

const KIND_WORDS: Array<[RegExp, ExamKind]> = [
  [/\b(final)\b/i, 'final'],
  [/\b(midterm|mid-term|test|exam)\b/i, 'midterm'],
  [/\b(quiz)\b/i, 'quiz'],
  [/\b(lab|report|assignment|homework|project|deadline|due|essay|paper)\b/i, 'deadline'],
];

export const guessKind = (text: string): ExamKind => KIND_WORDS.find(([re]) => re.test(text))?.[1] ?? 'midterm';

export const guessCourse = (text: string): string => /^\s*([A-Za-z]{2,6}\s?\d{2,4}[A-Za-z]?)/.exec(text)?.[1]?.replace(/\s+/g, '').toUpperCase() ?? '';

const draft = (p: { course: string; title: string; kind: ExamKind; date: string; time: string; durationMin?: number; weight?: number; confidence?: number }): ExamDraft => ({
  course: p.course,
  title: p.title,
  kind: p.kind,
  date: p.date,
  time: p.time,
  durationMin: p.durationMin ?? EXAM_DEFAULTS[p.kind].durationMin,
  weight: p.weight ?? EXAM_DEFAULTS[p.kind].weight,
  confidence: p.confidence ?? 3,
});

export const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};

const normTime = (v: string): string | null => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(v.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const normDate = (v: string): string | null => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && DateTime.fromISO(t).isValid) return t;
  const d = DateTime.fromFormat(t, 'd/M/yyyy');
  if (d.isValid) return d.toISODate();
  const d2 = DateTime.fromFormat(t, 'd LLL yyyy');
  return d2.isValid ? d2.toISODate() : null;
};

export interface ParseResult {
  items: ExamDraft[];
  errors: string[];
}

export const parseCsv = (text: string): ParseResult => {
  const rows = parseCsvRows(text);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]): number => header.findIndex((h) => names.includes(h));
  const iCourse = col('course', 'code', 'course code');
  const iTitle = col('title', 'name', 'exam', 'summary');
  const iDate = col('date');
  const iTime = col('time', 'start');
  const iKind = col('kind', 'type');
  const iDur = col('duration', 'durationmin', 'duration_min');
  const iWeight = col('weight', 'stakes');
  const iConf = col('confidence');
  const items: ExamDraft[] = [];
  const errors: string[] = [];
  if (iDate < 0 || (iTitle < 0 && iCourse < 0)) return { items, errors: ['CSV needs at least a date column and a title or course column.'] };
  rows.forEach((r, n) => {
    const date = normDate(r[iDate] ?? '');
    const time = iTime >= 0 ? normTime(r[iTime] ?? '') : '09:00';
    if (!date || !time) {
      errors.push(`Row ${n + 2}: could not read the date or time.`);
      return;
    }
    const title = (r[iTitle] ?? '').trim() || (r[iCourse] ?? '').trim();
    const course = (r[iCourse] ?? '').trim().toUpperCase() || guessCourse(title);
    const kindText = iKind >= 0 ? (r[iKind] ?? '').trim().toLowerCase() : '';
    const kind: ExamKind = (['quiz', 'midterm', 'final', 'deadline'] as const).find((k) => k === kindText) ?? guessKind(`${kindText} ${title}`);
    const num = (i: number, lo: number, hi: number): number | undefined => {
      const v = i >= 0 ? Number(r[i]) : NaN;
      return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined;
    };
    items.push(draft({ course, title, kind, date, time, durationMin: num(iDur, 0, 480), weight: num(iWeight, 1, 5), confidence: num(iConf, 1, 5) }));
  });
  return { items, errors };
};

const unfold = (text: string): string[] => text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);

export const parseIcs = (text: string, timezone: string): ParseResult => {
  const items: ExamDraft[] = [];
  const errors: string[] = [];
  let ev: Record<string, { value: string; params: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT' && ev) {
      const summary = (ev.SUMMARY?.value ?? '').replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
      const start = ev.DTSTART;
      if (!start || !summary) {
        errors.push('Skipped an event without a start or summary.');
      } else {
        const v = start.value;
        const tzid = /TZID=([^;:]+)/.exec(start.params)?.[1];
        let dt: DateTime;
        if (/^\d{8}$/.test(v)) dt = DateTime.fromFormat(v, 'yyyyLLdd', { zone: timezone }).set({ hour: 9 });
        else if (v.endsWith('Z')) dt = DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss'Z'", { zone: 'utc' }).setZone(timezone);
        else dt = DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss", { zone: tzid ?? timezone }).setZone(timezone);
        if (!dt.isValid) errors.push(`Skipped "${summary}": unreadable date.`);
        else {
          const kind = guessKind(summary);
          let durationMin: number | undefined;
          const end = ev.DTEND;
          if (end && /T/.test(end.value) && /T/.test(v)) {
            const e = DateTime.fromFormat(end.value, end.value.endsWith('Z') ? "yyyyLLdd'T'HHmmss'Z'" : "yyyyLLdd'T'HHmmss", { zone: end.value.endsWith('Z') ? 'utc' : tzid ?? timezone });
            const mins = Math.round(e.diff(DateTime.fromFormat(v, v.endsWith('Z') ? "yyyyLLdd'T'HHmmss'Z'" : "yyyyLLdd'T'HHmmss", { zone: v.endsWith('Z') ? 'utc' : tzid ?? timezone }), 'minutes').minutes);
            if (Number.isFinite(mins) && mins > 0 && mins <= 480) durationMin = mins;
          }
          items.push(draft({ course: guessCourse(summary), title: summary, kind, date: dt.toISODate() as string, time: dt.toFormat('HH:mm'), durationMin }));
        }
      }
      ev = null;
    } else if (ev) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m) ev[m[1] as string] = { value: m[3] as string, params: m[2] as string };
    }
  }
  return { items, errors };
};
