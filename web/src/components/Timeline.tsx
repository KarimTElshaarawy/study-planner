import { Check } from 'lucide-react';
import { m } from 'motion/react';
import type { Block, Course } from '../lib/types';
import { dur, fmtMin, METHOD_LABEL } from '../lib/format';
import { cvar } from './ui';

interface Props {
  blocks: Block[];
  courses: Course[];
  onToggle?: (b: Block, done: boolean) => void;
  nowMin?: number | null;
}

export const Timeline = ({ blocks, courses, onToggle, nowMin }: Props) => {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const nextOpen = blocks.find((b) => (b.kind === 'study' || b.kind === 'review') && b.status === 'planned')?.id;
  return (
    <div className="timeline" role="list">
      {blocks.map((b) => {
        const course = b.courseId ? byId.get(b.courseId) : undefined;
        const task = b.kind === 'study' || b.kind === 'review';
        const done = b.status === 'done';
        const missed = b.status === 'missed';
        const current = nowMin != null && b.start <= nowMin && nowMin < b.end;
        const cls = ['tl-row', task ? '' : 'passive', b.kind === 'break' ? 'break' : '', b.kind === 'exam' ? 'exam' : '', done ? 'done' : '', missed ? 'missed' : ''].join(' ');
        return (
          <m.div
           
            key={b.id}
            role="listitem"
            className={cls}
            initial={false}
            animate={{ scale: 1 }}
            style={{ ['--bar' as string]: task ? cvar(course?.color ?? 7) : b.kind === 'exam' ? 'var(--accent)' : undefined }}
          >
            <div className="tl-time num">
              {fmtMin(b.start)}
              <small>{fmtMin(b.end)}</small>
            </div>
            <div className="tl-body">
              {task && (
                <div className="row" style={{ gap: 6 }}>
                  <span className="t-cap" style={{ fontWeight: 600 }}>{course?.code ?? ''}</span>
                  {b.kind === 'review' && <span className="pill">Light review</span>}
                  {b.carried && !done && <span className="pill accent">Carried over</span>}
                  {missed && <span className="pill accent">Missed</span>}
                  {current && !done && <span className="pill">Now</span>}
                </div>
              )}
              <div className="tl-title">{task ? (b.topicTitle ?? b.title) : b.title}</div>
              {task && (
                <div className="tl-sub">
                  {b.method ? METHOD_LABEL[b.method] : 'Study'} · {dur(b.end - b.start)}
                </div>
              )}
              {task && b.note && b.id === nextOpen && <div className="tl-note">{b.note}</div>}
            </div>
            {task && onToggle ? (
              <button className="check" role="checkbox" aria-checked={done} aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${b.topicTitle ?? b.title}`} onClick={() => onToggle(b, !done)}>
                <Check size={18} strokeWidth={3} />
              </button>
            ) : (
              <span />
            )}
          </m.div>
        );
      })}
    </div>
  );
};
