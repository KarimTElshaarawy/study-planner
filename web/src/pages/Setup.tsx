import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExamSheet } from '../components/ExamSheet';
import { ImportSheet } from '../components/ImportSheet';
import { Logo } from '../components/Logo';
import { Field, SelectField, Skeleton, TextField, TimeField } from '../components/ui';
import { api } from '../lib/api';
import { EXAM_KIND_LABEL, fmtDate } from '../lib/format';
import { useBoot } from '../lib/query';

const zoneList = (current: string): string[] => {
  try {
    const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    return all.includes(current) ? all : [current, ...all];
  } catch {
    return [current];
  }
};

const STEPS = ['You', 'Day', 'Email', 'Exams'] as const;

export const Setup = () => {
  const boot = useBoot();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [examOpen, setExamOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const browserTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  })();
  const [form, setForm] = useState({ name: '', timezone: browserTz, wakeTime: '07:00', sleepTime: '23:30', email: '' });
  const save = useMutation({ mutationFn: (p: object) => api('PUT', '/api/settings', p), onSuccess: () => void qc.invalidateQueries() });
  const test = useMutation({ mutationFn: () => api<{ status: string; detail: string | null }>('POST', '/api/email/test') });
  const demo = useMutation({ mutationFn: () => api('POST', '/api/seed/demo'), onSuccess: () => void qc.invalidateQueries() });
  const finish = useMutation({
    mutationFn: () => api('PUT', '/api/settings', { setupDone: true }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      nav('/today', { replace: true });
    },
  });
  if (!boot.data) return <div className="center-screen"><Skeleton h={300} w={400} r={28} /></div>;
  const b = boot.data;
  const next = async (): Promise<void> => {
    if (step === 0) await save.mutateAsync({ name: form.name.trim(), timezone: form.timezone });
    if (step === 1) await save.mutateAsync({ wakeTime: form.wakeTime, sleepTime: form.sleepTime });
    if (step === 2) await save.mutateAsync({ email: form.email.trim() });
    setStep(step + 1);
  };
  const can = step === 0 ? form.timezone.length > 0 : true;

  return (
    <div className="center-screen top">
      <div className="wizard">
        <div className="row"><Logo size={36} /><span className="t-eyebrow grow">Set up Dayfold</span><span className="t-cap num">{step + 1} / {STEPS.length}</span></div>
        <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
        <AnimatePresence mode="wait">
          <m.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }} className="stack" style={{ gap: 20 }}>
            {step === 0 && (
              <>
                <h1 className="t-display">Who is studying?</h1>
                <TextField label="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus autoComplete="given-name" />
                <SelectField label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {zoneList(form.timezone).map((z) => <option key={z}>{z}</option>)}
                </SelectField>
              </>
            )}
            {step === 1 && (
              <>
                <h1 className="t-display">Your day.</h1>
                <p className="muted">Dayfold plans between these times. Classes, shifts and training can be added later in Settings.</p>
                <div className="form-grid">
                  <TimeField label="Wake up" value={form.wakeTime} onChange={(v) => setForm({ ...form, wakeTime: v })} />
                  <TimeField label="Sleep" value={form.sleepTime} onChange={(v) => setForm({ ...form, sleepTime: v })} />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className="t-display">Morning email.</h1>
                <p className="muted">Yesterday, today and what is coming. Leave it empty to skip.</p>
                <TextField label="Email address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
                {!b.email.configured && <div className="banner" role="status">No email provider is configured on this server. Emails are saved to the outbox folder until you add a key (README, MANUAL STEPS).</div>}
                {form.email && (
                  <div className="row">
                    <button className="btn secondary small" onClick={async () => { await save.mutateAsync({ email: form.email.trim() }); test.mutate(); }} disabled={test.isPending}>Send test</button>
                    {test.data && <span className="t-cap">{test.data.status === 'sent' ? 'Sent.' : test.data.status === 'outbox' ? 'Saved to the outbox.' : `Failed: ${test.data.detail}`}</span>}
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h1 className="t-display">Your exams.</h1>
                <p className="muted">Add them one by one, import a CSV or calendar, or try demo data.</p>
                <div className="src-btns">
                  <button className="btn secondary small" onClick={() => setExamOpen(true)}>Add exam</button>
                  <button className="btn secondary small" onClick={() => setImpOpen(true)}>Import</button>
                  {b.exams.length === 0 && b.courses.length === 0 && <button className="btn secondary small" onClick={() => demo.mutate()}>Use demo data</button>}
                </div>
                {b.exams.length > 0 && (
                  <Field label={`${b.exams.length} added`}>
                    <div className="card tight flat" style={{ maxHeight: 220, overflow: 'auto' }}>
                      <div className="list">
                        {b.exams.map((e) => (
                          <div className="list-row" key={e.id} style={{ minHeight: 44, padding: '8px 0' }}><b className="grow">{e.title}</b><span className="t-cap">{EXAM_KIND_LABEL[e.kind]} · {fmtDate(e.date)}</span></div>
                        ))}
                      </div>
                    </div>
                  </Field>
                )}
              </>
            )}
          </m.div>
        </AnimatePresence>
        <div className="wiz-actions">
          <button className="btn ghost" style={{ visibility: step === 0 ? 'hidden' : 'visible' }} onClick={() => setStep(Math.max(0, step - 1))}>Back</button>
          {step < STEPS.length - 1 ? (
            <button className="btn" onClick={() => void next()} disabled={!can || save.isPending}>Continue</button>
          ) : (
            <button className="btn" onClick={() => finish.mutate()} disabled={finish.isPending || b.exams.length === 0}>Start planning</button>
          )}
        </div>
        {(save.error ?? finish.error) && <div className="banner" role="alert">{(save.error ?? finish.error)?.message}</div>}
      </div>
      <ExamSheet boot={b} exam={null} open={examOpen} onClose={() => setExamOpen(false)} />
      <ImportSheet open={impOpen} onClose={() => setImpOpen(false)} />
    </div>
  );
};
