import { ACCENT_DARK, ACCENT_LIGHT, courseColor } from '../palette';
import { hash, METHOD_LABEL } from '../planner/templates';
import { formatDateLong, fmtMin } from '../time';
import { isStudy, type Block, type Course } from '../types';

export interface DigestExam {
  title: string;
  courseCode: string;
  colorIndex: number;
  date: string;
  time: string;
  daysLeft: number;
  hoursLeft: number;
}

export interface DigestData {
  name: string;
  date: string;
  appUrl: string;
  courses: Course[];
  yesterday: { done: Block[]; missed: Block[]; doneMin: number } | null;
  carried: Block[];
  plan: { blocks: Block[]; state: string; warnings: string[] };
  upcoming: DigestExam[];
  streak: number;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export const LINES = [
  'Start with the hardest topic while your head is clear.',
  'Fifty focused minutes beat three distracted hours.',
  'Close the notes and write what you remember. The gaps are the plan.',
  'Small, finished sessions add up faster than big intentions.',
  'Sleep is part of the plan. Protect it.',
  'If you only do one block today, do the first one.',
  'Explain it out loud. If you stumble, that is where to look.',
  'Stop on time. Tomorrow needs you rested.',
  'A rough attempt now beats a perfect plan later.',
  'Review what you missed first. It is the cheapest progress.',
];

const esc = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const dur = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const countdownText = (e: DigestExam): string => {
  if (e.daysLeft <= 0) return e.hoursLeft <= 0 ? 'now' : `in ${e.hoursLeft}h`;
  return e.daysLeft === 1 ? 'tomorrow' : `in ${e.daysLeft} days`;
};

export const buildSubject = (d: DigestData): string => {
  const day = formatDateLong(d.date);
  const next = d.upcoming[0];
  if (!next) return `${day}: Your plan for today`;
  const name = next.courseCode && !next.title.toUpperCase().startsWith(next.courseCode.toUpperCase()) ? `${next.courseCode} ${next.title}` : next.title;
  if (next.daysLeft === 0) return `${day}: ${name} today at ${next.time}`;
  if (next.daysLeft === 1) return `${day}: ${name} tomorrow`;
  return `${day}: ${name} in ${next.daysLeft} days`;
};

const colorOf = (d: DigestData, courseId: string | null): number => d.courses.find((c) => c.id === courseId)?.color ?? 7;
const codeOf = (d: DigestData, courseId: string | null): string => d.courses.find((c) => c.id === courseId)?.code ?? '';

const taskLine = (d: DigestData, b: Block): string => `${codeOf(d, b.courseId)} ${b.topicTitle ?? b.title}`.trim();

export const buildEmail = (d: DigestData): BuiltEmail => {
  const subject = buildSubject(d);
  const line = LINES[hash(d.date) % LINES.length] as string;
  const link = `${d.appUrl}/today`;
  const greeting = d.name ? `${esc(d.name)}, here is ${esc(formatDateLong(d.date))}.` : `${esc(formatDateLong(d.date))}.`;
  const next = d.upcoming[0];
  const study = d.plan.blocks.filter(isStudy);
  const timeline = d.plan.blocks.filter((b) => b.kind !== 'break');

  const hero = next
    ? `<div class="num">${next.daysLeft > 0 ? next.daysLeft : next.hoursLeft}</div>
       <div class="unit">${next.daysLeft > 0 ? (next.daysLeft === 1 ? 'day' : 'days') : next.hoursLeft === 1 ? 'hour' : 'hours'} to ${esc(next.title)}</div>`
    : `<div class="num">0</div><div class="unit">exams ahead. All done.</div>`;

  const recap = d.yesterday
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td class="stat"><div class="sn">${d.yesterday.done.length}</div><div class="sl">done</div></td>
        <td class="stat"><div class="sn">${d.yesterday.missed.length}</div><div class="sl">missed</div></td>
        <td class="stat"><div class="sn">${esc(dur(d.yesterday.doneMin))}</div><div class="sl">studied</div></td>
      </tr></table>
      ${d.yesterday.done.map((b) => `<div class="li done">${esc(taskLine(d, b))}</div>`).join('')}
      ${d.yesterday.missed.map((b) => `<div class="li miss">${esc(taskLine(d, b))}</div>`).join('')}`
    : '<div class="muted">No plan was recorded yesterday.</div>';

  const carried = d.carried.length
    ? `<div class="h">Carried over</div>${d.carried.map((b) => `<div class="li">${esc(taskLine(d, b))}</div>`).join('')}`
    : '';

  const rows = timeline
    .map((b) => {
      const color = courseColor(colorOf(d, b.courseId));
      const bar = isStudy(b) ? color : b.kind === 'exam' ? (d.plan.state === 'exam-day' ? ACCENT_LIGHT : color) : '#B9B6AE';
      const sub = isStudy(b) ? [b.topicTitle, b.method ? METHOD_LABEL[b.method] : ''].filter(Boolean).join(' · ') : '';
      return `<tr><td class="tm">${fmtMin(b.start)}<br><span class="tm2">${fmtMin(b.end)}</span></td>
        <td class="tb" style="border-left:3px solid ${bar}"><div class="tt${b.kind === 'exam' ? ' tx' : ''}">${esc(b.title)}</div>${sub ? `<div class="ts">${esc(sub)}</div>` : ''}</td></tr>`;
    })
    .join('');
  const today =
    d.plan.state === 'all-done'
      ? '<div class="muted">Every exam is behind you. Nothing planned.</div>'
      : d.plan.state === 'empty'
        ? '<div class="muted">No exams added yet. Add one in the app and the plan appears here.</div>'
      : timeline.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
        : '<div class="muted">A clear day. Rest.</div>';

  const upcoming = d.upcoming
    .slice(0, 4)
    .map(
      (e) => `<tr><td class="ut"><span class="dot" style="background:${courseColor(e.colorIndex)}"></span>${esc(e.title)}</td>
      <td class="ud">${esc(formatDateLong(e.date))} · ${esc(e.time)}<br><span class="tm2">${esc(countdownText(e))}</span></td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;padding:0;background:#F5F4F1;-webkit-text-size-adjust:100%}
.wrap{width:100%;background:#F5F4F1}
.card{max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:24px;border:1px solid #E7E5DF}
.in{padding:28px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#161616}
.brand{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6B6A66}
.hi{font-size:15px;color:#6B6A66;margin:6px 0 20px}
.num{font-size:96px;line-height:1;font-weight:700;letter-spacing:-.04em;color:#D42A24}
.unit{font-size:17px;color:#161616;margin-top:6px;font-weight:500}
.h{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6B6A66;margin:32px 0 10px}
.stat{width:33%;padding:12px 0}
.sn{font-size:32px;font-weight:700;letter-spacing:-.03em}
.sl{font-size:13px;color:#6B6A66}
.li{font-size:15px;padding:7px 0;border-top:1px solid #EEECE7}
.li.done{color:#6B6A66;text-decoration:line-through}
.li.miss{color:${ACCENT_LIGHT}}
.muted{font-size:15px;color:#6B6A66}
.tm{width:56px;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;vertical-align:top;padding:10px 0}
.tm2{font-weight:400;color:#8A8984;font-size:13px}
.tb{padding:10px 0 10px 12px}
.tt{font-size:15px;font-weight:600}
.tx{color:${ACCENT_LIGHT}}
.ts{font-size:13px;color:#6B6A66;margin-top:2px}
.ut{font-size:15px;padding:10px 0;border-top:1px solid #EEECE7;font-weight:600}
.ud{font-size:13px;color:#6B6A66;text-align:right;padding:10px 0;border-top:1px solid #EEECE7;font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:8px}
.btn{display:inline-block;background:#D42A24;color:#FFFFFF !important;text-decoration:none;font-weight:600;font-size:16px;padding:14px 26px;border-radius:999px}
.quote{font-size:17px;line-height:1.4;font-weight:500;letter-spacing:-.01em;margin:32px 0 24px}
.foot{font-size:12px;color:#8A8984;padding:0 28px 28px;font-family:-apple-system,BlinkMacSystemFont,"Inter",Arial,sans-serif}
@media (prefers-color-scheme: dark){
 body,.wrap{background:#0B0B0C !important}
 .card{background:#161617 !important;border-color:#2A2A2C !important}
 .in{color:#F2F1EE !important}
 .unit,.sn,.tt{color:#F2F1EE !important}
 .num{color:#FF5A52 !important}
 .brand,.hi,.sl,.muted,.ts,.h,.li.done{color:#A3A29D !important}
 .tm2,.foot{color:#8A8984 !important}
 .li,.ut,.ud{border-color:#2A2A2C !important}
 .li.miss,.tx{color:${ACCENT_DARK} !important}
 .btn{background:#DB2F26 !important;color:#FFFFFF !important}
}
@media (max-width:480px){.num{font-size:80px}.in{padding:24px 20px 8px}.foot{padding:0 20px 24px}}
</style></head>
<body><div class="wrap" style="padding:16px 12px"><div class="card"><div class="in">
<div class="brand">Cadence</div>
<div class="hi">${greeting}</div>
${hero}
<div class="h">Yesterday</div>${recap}
${carried}
<div class="h">Today · ${study.length} ${study.length === 1 ? 'session' : 'sessions'}${d.streak > 1 ? ` · ${d.streak}-day streak` : ''}</div>${today}
${d.plan.warnings.length ? `<div class="muted" style="margin-top:12px">${d.plan.warnings.map(esc).join('<br>')}</div>` : ''}
${upcoming ? `<div class="h">Coming up</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${upcoming}</table>` : ''}
<div class="quote">${esc(line)}</div>
<a class="btn" href="${esc(link)}">Open today</a>
<div style="height:28px"></div>
</div><div class="foot">Sent by Cadence. Change the time or turn this off in Settings.</div></div></div></body></html>`;

  const t: string[] = [subject, '', d.name ? `${d.name}, here is ${formatDateLong(d.date)}.` : formatDateLong(d.date), ''];
  if (next) t.push(`${next.daysLeft > 0 ? next.daysLeft + (next.daysLeft === 1 ? ' day' : ' days') : next.hoursLeft + ' h'} to ${next.title}`, '');
  t.push('YESTERDAY');
  if (d.yesterday) {
    t.push(`${d.yesterday.done.length} done, ${d.yesterday.missed.length} missed, ${dur(d.yesterday.doneMin)} studied`);
    for (const b of d.yesterday.done) t.push(`  [x] ${taskLine(d, b)}`);
    for (const b of d.yesterday.missed) t.push(`  [ ] ${taskLine(d, b)}`);
  } else t.push('No plan was recorded.');
  if (d.carried.length) t.push('', 'CARRIED OVER', ...d.carried.map((b) => `  ${taskLine(d, b)}`));
  t.push('', `TODAY (${study.length} sessions)`);
  if (d.plan.state === 'all-done') t.push('Every exam is behind you.');
  else if (d.plan.state === 'empty') t.push('No exams added yet.');
  else for (const b of timeline) t.push(`  ${fmtMin(b.start)}-${fmtMin(b.end)}  ${b.title}${isStudy(b) && b.topicTitle ? ` (${b.topicTitle}, ${b.method ? METHOD_LABEL[b.method] : 'Study'})` : ''}`);
  if (d.upcoming.length) t.push('', 'COMING UP', ...d.upcoming.slice(0, 4).map((e) => `  ${formatDateLong(e.date)} ${e.time}  ${e.title} (${countdownText(e)})`));
  t.push('', line, '', `Open today: ${link}`);
  return { subject, html, text: t.join('\n') };
};
