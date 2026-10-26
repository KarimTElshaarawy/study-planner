import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { EXAM_KIND_LABEL } from '../lib/format';
import type { Boot, Exam } from '../lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Field, Seg, SelectField, TextField, TimeField } from './ui';

const DEFAULTS = {
  quiz: { durationMin: 60, weight: 1 },
  midterm: { durationMin: 90, weight: 3 },
  final: { durationMin: 120, weight: 5 },
  deadline: { durationMin: 0, weight: 2 },
} as const;

interface Draft {
  courseId: string;
  newCode: string;
  title: string;
  kind: Exam['kind'];
  date: string;
  time: string;
  durationMin: number;
  weight: number;
  confidence: number;
}

const blank = (boot: Boot): Draft => ({
  courseId: boot.courses[0]?.id ?? 'new',
  newCode: '',
  title: '',
  kind: 'midterm',
  date: boot.clock.date,
  time: '09:00',
  durationMin: 90,
  weight: 3,
  confidence: 3,
});

export const ExamSheet = ({ boot, exam, open, onClose }: { boot: Boot; exam: Exam | null; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => blank(boot));
  const bootRef = useRef(boot);
  bootRef.current = boot;
  useEffect(() => {
    if (open) setD(exam ? { ...exam, newCode: '' } : blank(bootRef.current));
  }, [open, exam]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setD((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      let courseId = d.courseId;
      if (courseId === 'new') {
        const c = await api<{ id: string }>('POST', '/api/courses', { code: d.newCode.trim(), name: '', color: boot.courses.length % 8 });
        courseId = c.id;
      }
      const body = { courseId, title: d.title.trim(), kind: d.kind, date: d.date, time: d.time, durationMin: d.durationMin, weight: d.weight, confidence: d.confidence };
      return exam ? api('PUT', `/api/exams/${exam.id}`, body) : api('POST', '/api/exams', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries();
      toast(exam ? 'Saved' : 'Added');
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api('DELETE', `/api/exams/${exam?.id}`),
    onSuccess: () => {
      void qc.invalidateQueries();
      toast('Deleted');
      onClose();
    },
  });
  const valid = d.title.trim() && d.date && d.time && (d.courseId !== 'new' || d.newCode.trim());
  const pickKind = (k: Exam['kind']): void => setD((p) => ({ ...p, kind: k, ...(exam ? {} : DEFAULTS[k]) }));

  return (
    <Sheet open={open} onClose={onClose} title={exam ? 'Edit' : 'Add'}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field label="Type">
          <Seg label="Type" value={d.kind} onChange={pickKind} options={(['quiz', 'midterm', 'final', 'deadline'] as const).map((k) => [k, EXAM_KIND_LABEL[k] as string])} />
        </Field>
        <div className="form-grid">
          <SelectField label="Course" value={d.courseId} onChange={(e) => set('courseId', e.target.value)}>
            {boot.courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
            <option value="new">New course…</option>
          </SelectField>
          {d.courseId === 'new' ? <TextField label="Course code" value={d.newCode} onChange={(e) => set('newCode', e.target.value)} placeholder="BIO101" /> : <span />}
          <TextField className="wide" label="Title" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={d.kind === 'deadline' ? 'Lab report 2' : 'Midterm 2'} />
          <TextField label="Date" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
          <TimeField label={d.kind === 'deadline' ? 'Due time' : 'Start time'} value={d.time} onChange={(v) => set('time', v)} />
          {d.kind !== 'deadline' && <TextField label="Duration (min)" type="number" min={15} max={480} step={5} value={d.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />}
        </div>
        <Field label="Stakes">
          <Seg label="Stakes" value={d.weight} onChange={(v) => set('weight', v)} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} />
        </Field>
        <Field label="Confidence (1 shaky, 5 solid)">
          <Seg label="Confidence" value={d.confidence} onChange={(v) => set('confidence', v)} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} />
        </Field>
        {(save.error ?? del.error) && <div className="banner" role="alert">{(save.error ?? del.error)?.message}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {exam ? <button type="button" className="btn danger" onClick={() => del.mutate()}>Delete</button> : <span />}
          <button className="btn" disabled={!valid || save.isPending}>Save</button>
        </div>
      </form>
    </Sheet>
  );
};
