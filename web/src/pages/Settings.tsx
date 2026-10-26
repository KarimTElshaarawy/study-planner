import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ImportSheet } from '../components/ImportSheet';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Field, Seg, Skeleton, Switch, TextField, TimeField, cvar } from '../components/ui';
import { api } from '../lib/api';
import { WEEKDAYS } from '../lib/format';
import { applyTheme, getTheme, type ThemePref } from '../lib/hooks';
import { clearLocalData, useBoot } from '../lib/query';
import type { Boot, Commitment, Course, Settings as S } from '../lib/types';

export const usePatchSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<S>) => api<S>('PUT', '/api/settings', patch),
    onSuccess: () => void qc.invalidateQueries(),
  });
};

/** Text-ish input that commits on blur so typing never fights the server round trip. */
export const Commit = ({ label, value, onCommit, ...p }: { label: string; value: string | number; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return <TextField label={label} {...p} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== String(value) && onCommit(v)} />;
};

const zones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
};

const CommitmentSheet = ({ item, open, onClose }: { item: Commitment | null; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [d, setD] = useState<Omit<Commitment, 'id'>>({ label: '', kind: 'class', days: [1, 3], start: '10:00', end: '11:30' });
  useEffect(() => {
    if (open) setD(item ? { label: item.label, kind: item.kind, days: item.days, start: item.start, end: item.end } : { label: '', kind: 'class', days: [1, 3], start: '10:00', end: '11:30' });
  }, [open, item]);
  const save = useMutation({
    mutationFn: () => (item ? api('PUT', `/api/commitments/${item.id}`, d) : api('POST', '/api/commitments', d)),
    onSuccess: () => { void qc.invalidateQueries(); onClose(); },
  });
  const del = useMutation({ mutationFn: () => api('DELETE', `/api/commitments/${item?.id}`), onSuccess: () => { void qc.invalidateQueries(); onClose(); } });
  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Edit commitment' : 'Add commitment'}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (d.label.trim() && d.days.length) save.mutate(); }}>
        <TextField label="Name" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Lectures, shift, training" />
        <Field label="Type"><Seg label="Type" value={d.kind} onChange={(kind) => setD({ ...d, kind })} options={[['class', 'Class'], ['work', 'Work'], ['training', 'Training'], ['other', 'Other']]} /></Field>
        <Field label="Days">
          <div className="day-toggle">
            {WEEKDAYS.map((w, i) => (
              <button type="button" key={w} aria-pressed={d.days.includes(i + 1)} aria-label={w} onClick={() => setD({ ...d, days: d.days.includes(i + 1) ? d.days.filter((x) => x !== i + 1) : [...d.days, i + 1].sort() })}>{w[0]}</button>
            ))}
          </div>
        </Field>
        <div className="form-grid">
          <TimeField label="Starts" value={d.start} onChange={(v) => setD({ ...d, start: v })} />
          <TimeField label="Ends" value={d.end} onChange={(v) => setD({ ...d, end: v })} />
        </div>
        {(save.error ?? del.error) && <div className="banner" role="alert">{(save.error ?? del.error)?.message}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {item ? <button type="button" className="btn danger" onClick={() => del.mutate()}>Delete</button> : <span />}
          <button className="btn" disabled={!d.label.trim() || d.days.length === 0}>Save</button>
        </div>
      </form>
    </Sheet>
  );
};

const CourseSheet = ({ boot, course, open, onClose }: { boot: Boot; course: Course | null; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [d, setD] = useState({ code: '', name: '', color: 0 });
  useEffect(() => { if (course) setD({ code: course.code, name: course.name, color: course.color }); }, [course]);
  const topics = boot.topics.filter((t) => t.courseId === course?.id);
  const [newTopic, setNewTopic] = useState('');
  const refresh = (): void => void qc.invalidateQueries();
  const save = useMutation({ mutationFn: () => api('PUT', `/api/courses/${course?.id}`, { ...d, code: d.code.trim().toUpperCase() }), onSuccess: () => { refresh(); onClose(); } });
  const del = useMutation({ mutationFn: () => api('DELETE', `/api/courses/${course?.id}`), onSuccess: () => { refresh(); onClose(); } });
  const addTopic = useMutation({ mutationFn: () => api('POST', '/api/topics', { courseId: course?.id, title: newTopic.trim() }), onSuccess: () => { setNewTopic(''); refresh(); } });
  const rename = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => api('PUT', `/api/topics/${id}`, { title }), onSuccess: refresh });
  const rm = useMutation({ mutationFn: (id: string) => api('DELETE', `/api/topics/${id}`), onSuccess: refresh });
  return (
    <Sheet open={open && !!course} onClose={onClose} title="Course">
      <div className="stack">
        <div className="form-grid">
          <TextField label="Code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />
          <TextField label="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <Field label="Color">
          <div className="color-swatches">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} className="swatch" style={{ background: cvar(i) }} aria-pressed={d.color === i} aria-label={`Color ${i + 1}`} onClick={() => setD({ ...d, color: i })} />
            ))}
          </div>
        </Field>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>Topics</div>
          <div className="list">
            {topics.map((t) => (
              <div className="list-row" key={t.id} style={{ minHeight: 48, padding: '6px 0' }}>
                <input className="input grow" style={{ height: 40 }} defaultValue={t.title} aria-label="Topic" onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && rename.mutate({ id: t.id, title: e.target.value.trim() })} />
                <button className="btn ghost small icon" aria-label={`Remove ${t.title}`} onClick={() => rm.mutate(t.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (newTopic.trim()) addTopic.mutate(); }}>
            <input className="input grow" style={{ height: 40 }} placeholder="Add a topic" aria-label="New topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <button className="btn secondary small" disabled={!newTopic.trim()}>Add</button>
          </form>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn danger" onClick={() => del.mutate()}>Delete course</button>
          <button className="btn" onClick={() => save.mutate()} disabled={!d.code.trim()}>Save</button>
        </div>
      </div>
    </Sheet>
  );
};

export const Settings = ({ onLogout }: { onLogout: () => void }) => {
  const boot = useBoot();
  const patch = usePatchSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePref>(getTheme());
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [cOpen, setCOpen] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [impOpen, setImpOpen] = useState(false);
  const tzList = useRef(zones()).current;
  const email = useMutation({
    mutationFn: (kind: 'test' | 'send-now') => api<{ status: string; detail: string | null }>('POST', `/api/email/${kind}`),
    onSuccess: (r) => { void qc.invalidateQueries(); toast(r.status === 'sent' ? 'Email sent' : r.status === 'outbox' ? 'Saved to the outbox' : `Failed: ${r.detail ?? 'unknown error'}`); },
  });
  const demo = useMutation({ mutationFn: () => api('POST', '/api/seed/demo'), onSuccess: () => { void qc.invalidateQueries(); toast('Demo data loaded'); } });
  if (!boot.data) return <div className="stack"><Skeleton h={44} w={200} /><Skeleton h={300} r={28} /></div>;
  const b = boot.data;
  const s = b.settings;
  const save = (p: Partial<S>): void => patch.mutate(p);
  const logout = async (): Promise<void> => {
    await api('POST', '/api/logout');
    await clearLocalData();
    onLogout();
  };
  const hours = (m: number): string => String(m / 60);

  return (
    <>
      <header className="page-head"><div><div className="t-eyebrow">Dayfold</div><h1 className="t-title">Settings</h1></div></header>
      {patch.error && <div className="banner" role="alert" style={{ marginBottom: 16 }}>{patch.error.message}</div>}
      <div className="stack">
        <div className="set-cols">
          <section className="card stack">
            <h2 className="t-head">Profile</h2>
            <Commit label="Name" value={s.name} onCommit={(v) => save({ name: v })} />
            <Field label="Timezone">
              <select className="select" value={s.timezone} onChange={(e) => save({ timezone: e.target.value })}>
                {(tzList.includes(s.timezone) ? tzList : [s.timezone, ...tzList]).map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
            <Field label="Appearance"><Seg label="Appearance" value={theme} onChange={(t) => { setTheme(t); applyTheme(t); }} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} /></Field>
          </section>
          <section className="card stack">
            <h2 className="t-head">Your day</h2>
            <div className="form-grid">
              <TimeField label="Wake up" value={s.wakeTime} onChange={(v) => save({ wakeTime: v })} />
              <TimeField label="Sleep" value={s.sleepTime} onChange={(v) => save({ sleepTime: v })} />
              <Commit label="Session (min)" type="number" min={20} max={120} value={s.sessionMin} onCommit={(v) => save({ sessionMin: Number(v) })} />
              <Commit label="Break (min)" type="number" min={0} max={60} value={s.breakMin} onCommit={(v) => save({ breakMin: Number(v) })} />
              <Commit label="Long break (min)" type="number" min={0} max={90} value={s.longBreakMin} onCommit={(v) => save({ longBreakMin: Number(v) })} />
              <Commit label="Daily cap (hours)" type="number" min={1} max={16} step={0.5} value={hours(s.dailyCapMin)} onCommit={(v) => save({ dailyCapMin: Math.round(Number(v) * 60) })} />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="row"><h2 className="t-head grow">Commitments</h2><button className="btn secondary small" onClick={() => { setCommitment(null); setCOpen(true); }}><Plus size={16} /> Add</button></div>
          {b.commitments.length === 0 ? <p className="t-cap" style={{ marginTop: 8 }}>Classes, shifts and training that Dayfold plans around.</p> : (
            <div className="list" style={{ marginTop: 8 }}>
              {b.commitments.map((c) => (
                <button key={c.id} className="list-row link" style={{ textAlign: 'left' }} onClick={() => { setCommitment(c); setCOpen(true); }}>
                  <div className="grow"><b>{c.label}</b><div className="t-cap">{c.days.map((d) => WEEKDAYS[d - 1]).join(' ')} · {c.start} to {c.end}</div></div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="t-head">Meals</h2>
          <div className="list" style={{ marginTop: 8 }}>
            {s.meals.map((m, i) => (
              <div key={i} className="list-row">
                <input className="input grow" aria-label="Meal name" defaultValue={m.label} onBlur={(e) => e.target.value !== m.label && e.target.value.trim() && save({ meals: s.meals.map((x, j) => (j === i ? { ...x, label: e.target.value.trim() } : x)) })} />
                <input className="input tnum" style={{ width: 96 }} inputMode="numeric" maxLength={5} aria-label="Meal time" defaultValue={m.time} onBlur={(e) => { const t = /^([01]?\d|2[0-3]):?([0-5]\d)$/.exec(e.target.value.trim()); if (t) { const v = `${t[1]!.padStart(2, '0')}:${t[2]}`; e.target.value = v; if (v !== m.time) save({ meals: s.meals.map((x, j) => (j === i ? { ...x, time: v } : x)) }); } else e.target.value = m.time; }} />
                <button className="btn ghost small icon" aria-label={`Remove ${m.label}`} onClick={() => save({ meals: s.meals.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => save({ meals: [...s.meals, { label: 'Snack', time: '16:00', durationMin: 20 }] })}><Plus size={16} /> Add meal</button>
        </section>

        <section className="card">
          <div className="row"><h2 className="t-head grow">Courses</h2></div>
          <div className="list" style={{ marginTop: 8 }}>
            {b.courses.map((c) => (
              <button key={c.id} className="list-row link" style={{ textAlign: 'left' }} onClick={() => setCourse(c)}>
                <span className="dot" style={{ background: cvar(c.color) }} />
                <div className="grow"><b>{c.code}</b> <span className="t-cap">{c.name}</span></div>
                <span className="t-cap">{b.topics.filter((t) => t.courseId === c.id).length} topics</span>
              </button>
            ))}
            {b.courses.length === 0 && <p className="t-cap">Courses appear when you add an exam.</p>}
          </div>
        </section>

        <section className="card stack">
          <h2 className="t-head">Daily email</h2>
          <div className="row"><span className="grow">Send every morning</span><Switch label="Daily email" checked={s.emailEnabled} onChange={(v) => save({ emailEnabled: v })} /></div>
          <div className="form-grid">
            <Commit label="Address" type="email" value={s.email} onCommit={(v) => save({ email: v })} placeholder="you@example.com" />
            <TimeField label="Send at" value={s.emailTime} onChange={(v) => save({ emailTime: v })} />
          </div>
          {!b.email.configured && (
            <div className="banner" role="status"><Mail size={18} /><div>No email provider is set up, so emails are saved as HTML files in the outbox folder. See MANUAL STEPS in the README.</div></div>
          )}
          {b.email.today && <p className="t-cap">Today: {b.email.today.status}{b.email.today.detail ? ` (${b.email.today.detail})` : ''}</p>}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn secondary small" onClick={() => email.mutate('test')} disabled={email.isPending}>Send test</button>
            <button className="btn secondary small" onClick={() => email.mutate('send-now')} disabled={email.isPending}>Send today&apos;s email now</button>
            <a className="btn ghost small" href="/api/email/preview" target="_blank" rel="noreferrer">Preview</a>
          </div>
        </section>

        <section className="card stack">
          <h2 className="t-head">Data</h2>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn secondary small" onClick={() => setImpOpen(true)}>Import CSV or calendar</button>
            {b.exams.length === 0 && b.courses.length === 0 && b.commitments.length === 0 && <button className="btn secondary small" onClick={() => demo.mutate()}>Load demo data</button>}
            <button className="btn ghost small" onClick={() => void logout()}>Sign out</button>
          </div>
        </section>
      </div>
      <CommitmentSheet item={commitment} open={cOpen} onClose={() => setCOpen(false)} />
      <CourseSheet boot={b} course={course} open={!!course} onClose={() => setCourse(null)} />
      <ImportSheet open={impOpen} onClose={() => setImpOpen(false)} />
    </>
  );
};
