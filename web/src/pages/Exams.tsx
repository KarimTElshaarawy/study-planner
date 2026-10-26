import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Empty } from '../components/Empty';
import { ExamSheet } from '../components/ExamSheet';
import { Meters, Skeleton, cvar } from '../components/ui';
import { countdown, EXAM_KIND_LABEL, fmtDate } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useBoot } from '../lib/query';
import type { ExamX } from '../lib/types';

export const Exams = () => {
  const boot = useBoot();
  const now = useNow(30_000);
  const [editing, setEditing] = useState<ExamX | null>(null);
  const [open, setOpen] = useState(false);
  if (!boot.data) return <div className="stack"><Skeleton h={44} w={200} /><Skeleton h={280} r={28} /><Skeleton h={200} r={28} /></div>;
  const b = boot.data;
  const upcoming = b.exams.filter((e) => e.endMs >= now).sort((a, c) => a.startMs - c.startMs);
  const past = b.exams.filter((e) => e.endMs < now).sort((a, c) => c.startMs - a.startMs);
  const edit = (e: ExamX | null): void => {
    setEditing(e);
    setOpen(true);
  };

  const card = (e: ExamX, i: number) => {
    const cd = countdown(e, now);
    const course = b.courses.find((c) => c.id === e.courseId);
    const lead = i === 0;
    return (
      <button key={e.id} className={`card cd-card ${lead ? 'lead' : ''}`} onClick={() => edit(e)} aria-label={`${e.title}, ${cd.big} ${cd.unit}. Edit`}>
        <div className="cd-top">
          <span className="dot" style={{ background: cvar(course?.color ?? 7) }} />
          {course?.code} · {EXAM_KIND_LABEL[e.kind]}
        </div>
        <div className="nums">
          <span className="t-hero num">{cd.big}</span>
          <span className="unit">{cd.unit}{cd.days >= 1 && cd.hours > 0 ? ` ${cd.hours} h` : ''}</span>
        </div>
        <div className="cd-info">
          <div className="cd-title">{e.title}</div>
          <div className="t-cap">{fmtDate(e.date)} · {e.time}{e.kind !== 'deadline' ? ` · ${e.durationMin} min` : ''}</div>
        </div>
        <div className="meters-grid t-cap">
          <span>Stakes</span><Meters value={e.weight} label="Stakes" />
          <span>Confidence</span><Meters value={e.confidence} label="Confidence" />
        </div>
      </button>
    );
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="t-eyebrow">{upcoming.length} ahead</div>
          <h1 className="t-title">Exams</h1>
        </div>
        <button className="btn" onClick={() => edit(null)}><Plus size={18} /> Add</button>
      </header>
      {upcoming.length === 0 ? (
        <div className="card"><Empty variant="calendar" title="No exams ahead" text="Add an exam or a deadline and Dayfold plans every day up to it." action={<button className="btn" onClick={() => edit(null)}>Add exam</button>} /></div>
      ) : (
        <div className="cd-grid">{upcoming.map(card)}</div>
      )}
      {past.length > 0 && (
        <>
          <h2 className="t-head section-title">Earlier</h2>
          <div className="card tight">
            <div className="list">
              {past.map((e) => (
                <button key={e.id} className="list-row link" onClick={() => edit(e)} style={{ textAlign: 'left' }}>
                  <span className="dot" style={{ background: cvar(b.courses.find((c) => c.id === e.courseId)?.color ?? 7) }} />
                  <span className="grow">{e.title}</span>
                  <span className="t-cap num">{fmtDate(e.date)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <ExamSheet boot={b} exam={editing} open={open} onClose={() => setOpen(false)} />
    </>
  );
};
