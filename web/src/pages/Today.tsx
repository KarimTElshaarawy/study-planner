import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flame, RefreshCw, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Empty } from '../components/Empty';
import { Ring } from '../components/Ring';
import { Timeline } from '../components/Timeline';
import { useToast } from '../components/Toast';
import { DurText, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { countdown, dur, fmtDate } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useBoot, useDay, useStats, useToggle } from '../lib/query';
import type { Block, DayView } from '../lib/types';

export const NextExam = ({ boot }: { boot: NonNullable<ReturnType<typeof useBoot>['data']> }) => {
  const now = useNow(30_000);
  const next = useMemo(() => boot.exams.filter((e) => e.endMs >= now).sort((a, b) => a.startMs - b.startMs)[0], [boot.exams, now]);
  if (!next) return null;
  const cd = countdown(next, now);
  const course = boot.courses.find((c) => c.id === next.courseId);
  return (
    <div className="card next-card">
      <div className="t-eyebrow">Next up</div>
      <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
        <span className="t-hero num">{cd.big}</span>
        <span className="t-head muted">{cd.unit}</span>
      </div>
      <div className="t-head">{next.title}</div>
      <div className="t-cap">
        {course?.code} · {fmtDate(next.date)} at {next.time}
      </div>
    </div>
  );
};

export const Today = () => {
  const boot = useBoot();
  const date = boot.data?.clock.date;
  const day = useDay(date);
  const stats = useStats();
  const toggle = useToggle(date ?? '');
  const qc = useQueryClient();
  const toast = useToast();
  const replan = useMutation({
    mutationFn: () => api<DayView>('POST', '/api/plan/replan'),
    onSuccess: (d) => {
      qc.setQueryData(['plan', d.date], d);
      void qc.invalidateQueries({ queryKey: ['week'] });
      toast('Plan refreshed');
    },
  });

  if (!boot.data || !day.data) {
    return (
      <div className="stack" aria-busy="true">
        <Skeleton h={20} w={140} />
        <Skeleton h={44} w={220} />
        <Skeleton h={300} r={28} />
        <Skeleton h={360} r={28} />
      </div>
    );
  }
  const b = boot.data;
  const d = day.data;
  const tasks = d.blocks.filter((x) => x.kind === 'study' || x.kind === 'review');
  const open = tasks.filter((x) => x.status !== 'missed');
  const value = open.length === 0 ? 0 : d.done / open.length;
  const leftMin = open.filter((x) => x.status !== 'done').reduce((s, x) => s + x.end - x.start, 0);
  const onToggle = (blk: Block, done: boolean): void => toggle.mutate({ id: blk.id, done });
  const allDone = d.state === 'all-done';
  const empty = d.state === 'empty';
  const failedMail = b.email.today?.status === 'failed' ? b.email.today.detail : null;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="t-eyebrow">{fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="t-title">{allDone ? 'All done' : 'Today'}</h1>
        </div>
        {!allDone && !empty && (
          <button className="btn secondary small" onClick={() => replan.mutate()} disabled={replan.isPending}>
            <RefreshCw size={16} /> Replan
          </button>
        )}
      </header>
      {d.warnings.length > 0 && (
        <div className="banner" style={{ marginBottom: 16 }} role="status">
          <TriangleAlert size={18} />
          <div>{d.warnings.map((w) => <div key={w}>{w}</div>)}</div>
        </div>
      )}
      {failedMail && (
        <div className="banner" style={{ marginBottom: 16 }} role="status">
          <TriangleAlert size={18} />
          <div>Today&apos;s email could not be sent: {failedMail}. It will retry automatically.</div>
        </div>
      )}
      {empty ? (
        <div className="card">
          <Empty variant="calendar" title="No exams yet" text="Add your first exam and Cadence plans every day up to it." action={<Link className="btn" to="/exams">Add an exam</Link>} />
        </div>
      ) : allDone ? (
        <div className="card">
          <Empty variant="done" title="Every exam is behind you" text="Nothing left to plan. Add an exam in Exams if something new comes up." />
        </div>
      ) : (
        <div className="today-grid">
          <section className="card" aria-label="Plan">
            <div className="row" style={{ marginBottom: 8 }}>
              <h2 className="t-head grow">Plan</h2>
              <span className="t-cap num">{dur(d.studyMin)} of study</span>
            </div>
            {d.blocks.length === 0 ? (
              <Empty title="Nothing scheduled" text="No sessions fit today. Rest, or press Replan after changing your schedule." />
            ) : (
              <Timeline blocks={d.blocks} courses={b.courses} onToggle={onToggle} nowMin={b.clock.min} />
            )}
          </section>
          <aside className="today-side">
            <div className="card hero-card">
              <Ring value={value} label={`${d.done} of ${open.length} sessions done`}>
                <span className="big">{d.done}</span>
                <span className="sub">of {open.length} done</span>
              </Ring>
              <div className="hero-meta">
                <div className="meta">
                  <b className="num"><DurText min={d.doneMin} /></b>
                  <span>studied</span>
                </div>
                <div className="meta">
                  <b className="num"><DurText min={leftMin} /></b>
                  <span>left</span>
                </div>
                <div className="meta">
                  <b className="num" style={{ gap: 6 }}>
                    <Flame size={20} style={{ color: 'var(--ink-2)' }} />
                    {stats.data?.streak ?? 0}
                  </b>
                  <span>day streak</span>
                </div>
              </div>
            </div>
            <NextExam boot={b} />
          </aside>
        </div>
      )}
    </>
  );
};
