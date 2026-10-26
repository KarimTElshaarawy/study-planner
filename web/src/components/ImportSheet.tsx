import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { EXAM_KIND_LABEL, fmtDate } from '../lib/format';
import type { ExamDraft } from '../lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Seg } from './ui';

interface Preview {
  items: ExamDraft[];
  errors: string[];
}

export const ImportSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'csv' | 'ics'>('csv');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const run = useMutation({ mutationFn: () => api<Preview>('POST', '/api/import/preview', { kind, text }), onSuccess: setPreview });
  const commit = useMutation({
    mutationFn: () => api<{ created: number }>('POST', '/api/import/commit', { items: (preview?.items ?? []).map((i) => ({ ...i, course: i.course || 'GENERAL' })) }),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      toast(`Imported ${r.created}`);
      setPreview(null);
      setText('');
      onClose();
    },
  });
  const onFile = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setKind(f.name.toLowerCase().endsWith('.ics') ? 'ics' : 'csv');
    setText(await f.text());
    setPreview(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Import">
      <div className="stack">
        <Seg label="Format" value={kind} onChange={setKind} options={[['csv', 'CSV'], ['ics', 'Calendar (.ics)']]} />
        <label className="btn secondary" style={{ cursor: 'pointer' }}>
          Choose file
          <input type="file" accept=".csv,.ics,text/csv,text/calendar" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <textarea className="textarea" aria-label="Paste data" placeholder={kind === 'csv' ? 'course,title,date,time,kind\nBIO101,Midterm 1,2026-11-05,09:30,midterm' : 'BEGIN:VCALENDAR…'} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
        <button className="btn secondary" disabled={!text.trim() || run.isPending} onClick={() => run.mutate()}>Preview</button>
        {run.error && <div className="banner" role="alert">{run.error.message}</div>}
        {preview && (
          <>
            {preview.errors.length > 0 && <div className="banner" role="status"><div>{preview.errors.map((e) => <div key={e}>{e}</div>)}</div></div>}
            <div className="list">
              {preview.items.map((i, n) => (
                <div key={n} className="list-row">
                  <div className="grow"><b>{i.title}</b><div className="t-cap">{i.course || 'No course'} · {EXAM_KIND_LABEL[i.kind]} · {fmtDate(i.date)} {i.time}</div></div>
                </div>
              ))}
            </div>
            <button className="btn" disabled={preview.items.length === 0 || commit.isPending} onClick={() => commit.mutate()}>Add {preview.items.length}</button>
          </>
        )}
      </div>
    </Sheet>
  );
};
