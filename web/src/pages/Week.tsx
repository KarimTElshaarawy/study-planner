import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty } from '../components/Empty';
import { Timeline } from '../components/Timeline';
import { Skeleton, cvar } from '../components/ui';
import { addDays, fmtDate, fmtMin, mondayOf } from '../lib/format';
import { useBoot, useToggle, useWeek } from '../lib/query';
import type { Block, DayView } from '../lib/types';

const HOUR_PX = 44;
const FROM = 6;
const TO = 24;

const WeekGrid = ({ days, today, courses }: { days: DayView[]; today: string; courses: Array<{ id: string; code: string; color: number }> }) => {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const hours = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i);
  const height = (TO - FROM) * HOUR_PX;
  return (
    <div className="week-grid" role="group" aria-label="Week">
      <div className="wg-col" style={{ borderLeft: 0 }}>
        <div className="wg-head" />
        <div className="wg-body" style={{ height }}>
          {hours.map((h) => (
            <div key={h} className="wg-label" style={{ top: (h - FROM) * HOUR_PX }}>{String(h % 24).padStart(2, '0')}:00</div>
          ))}
        </div>
      </div>
      {days.map((d) => (
        <div key={d.date} className="wg-col">
          <div className={`wg-head ${d.date === today ? 'today' : ''}`}>
            {fmtDate(d.date, { weekday: 'short' })}
            <b className="num">{fmtDate(d.date, { day: 'numeric' })}</b>
          </div>
          <div className="wg-body" style={{ height }}>
            {hours.map((h) => (
              <div key={h} className="wg-hour" style={{ top: (h - FROM) * HOUR_PX }} />
            ))}
            {d.blocks
              .filter((b) => b.kind !== 'break')
              .map((b) => {
                const task = b.kind === 'study' || b.kind === 'review';
                const course = b.courseId ? byId.get(b.courseId) : undefined;
                const top = Math.max(0, (b.start / 60 - FROM) * HOUR_PX);
                const h = Math.max(18, ((Math.min(b.end, TO * 60) - b.start) / 60) * HOUR_PX - 2);
                return (
                  <div
                    key={b.id}
                    className={`wg-block ${task ? '' : 'passive'} ${b.kind === 'exam' ? 'exam' : ''} ${b.status === 'done' ? 'done' : ''}`}
                    style={{ top, height: h, ['--bar' as string]: cvar(course?.color ?? 7) }}
                    title={`${fmtMin(b.start)} ${b.title}`}
                  >
                    {task ? (<><div style={{ fontSize: 11 }}>{course?.code}</div><div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.topicTitle}</div></>) : b.title}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};

export const Week = () => {
  const boot = useBoot();
  const today = boot.data?.clock.date;
  const [start, setStart] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (today && !start) {
      setStart(mondayOf(today));
      setSel(today);
    }
  }, [today, start]);
  const week = useWeek(start);
  const toggle = useToggle(today ?? '');
  if (!boot.data || !start || !week.data) return <div className="stack"><Skeleton h={44} w={200} /><Skeleton h={420} r={28} /></div>;
  const days = week.data;
  const shown = days.find((d) => d.date === sel) ?? days[0];
  const shift = (n: number): void => {
    const next = addDays(start, n * 7);
    setStart(next);
    setSel(today && mondayOf(today) === next ? today : next);
  };
  const courses = boot.data.courses;
  return (
    <>
      <header className="page-head">
        <div>
          <div className="t-eyebrow">{fmtDate(start, { day: 'numeric', month: 'short' })} to {fmtDate(addDays(start, 6), { day: 'numeric', month: 'short' })}</div>
          <h1 className="t-title">Week</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn secondary small icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft size={18} /></button>
          {start !== mondayOf(today ?? start) && <button className="btn secondary small" onClick={() => { setStart(mondayOf(today ?? start)); setSel(today ?? start); }}>This week</button>}
          <button className="btn secondary small icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight size={18} /></button>
        </div>
      </header>
      <WeekGrid days={days} today={today ?? ''} courses={courses} />
      <div className="week-mobile">
        <div className="daystrip" role="group" aria-label="Days">
          {days.map((d) => (
            <button key={d.date} className="daychip" aria-pressed={d.date === shown?.date} onClick={() => setSel(d.date)}>
              {fmtDate(d.date, { weekday: 'narrow' })}
              <b>{fmtDate(d.date, { day: 'numeric' })}</b>
              <span className="pips">
                {d.blocks.some((b) => b.kind === 'study' || b.kind === 'review') && <i />}
              </span>
            </button>
          ))}
        </div>
        <div className="card">
          {shown && shown.blocks.length > 0 ? (
            <Timeline blocks={shown.blocks} courses={courses} onToggle={shown.relation === 'today' ? (b: Block, done) => toggle.mutate({ id: b.id, done }) : undefined} nowMin={shown.relation === 'today' ? boot.data.clock.min : null} />
          ) : (
            <Empty variant="calendar" title="A clear day" text="Nothing planned. Rest is part of the plan." />
          )}
        </div>
      </div>
    </>
  );
};
