import { Empty } from '../components/Empty';
import { DurText, Skeleton, cvar } from '../components/ui';
import { dur, fmtDate } from '../lib/format';
import { useBoot, useStats } from '../lib/query';

export const Stats = () => {
  const boot = useBoot();
  const stats = useStats();
  if (!boot.data || !stats.data) return <div className="stack"><Skeleton h={44} w={160} /><Skeleton h={120} r={28} /><Skeleton h={260} r={28} /></div>;
  const s = stats.data;
  const courses = boot.data.courses;
  const maxMin = Math.max(1, ...s.courses.map((c) => c.plannedMin));
  const trendMax = Math.max(1, ...s.trend.map((t) => t.total));
  const W = 560;
  const H = 150;
  const bw = W / s.trend.length;
  const empty = s.doneTasks === 0 && s.trend.every((t) => t.total === 0);
  return (
    <>
      <header className="page-head">
        <div>
          <div className="t-eyebrow">Last 14 days</div>
          <h1 className="t-title">Stats</h1>
        </div>
      </header>
      {empty ? (
        <div className="card"><Empty title="Nothing to show yet" text="Tick off a session on Today and your numbers appear here." /></div>
      ) : (
        <div className="stack">
          <div className="big-stats">
            <div className="card tight big-stat"><div className="t-eyebrow">Studied</div><div className="t-title num"><DurText min={s.doneMin} /></div></div>
            <div className="card tight big-stat"><div className="t-eyebrow">Streak</div><div className="t-title num">{s.streak}<span className="u">{s.streak === 1 ? 'day' : 'days'}</span></div></div>
            <div className="card tight big-stat"><div className="t-eyebrow">Week</div><div className="t-title num">{Math.round(s.weekRate * 100)}<span className="u">%</span></div></div>
          </div>
          <section className="card">
            <h2 className="t-head" style={{ marginBottom: 16 }}>Completion</h2>
            <svg className="trend chart" viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label="Sessions planned and completed per day over the last 14 days">
              {s.trend.map((t, i) => {
                const th = (t.total / trendMax) * H;
                const dh = (t.done / trendMax) * H;
                const x = i * bw + bw * 0.2;
                const w = bw * 0.6;
                return (
                  <g key={t.date}>
                    <rect x={x} y={H - th} width={w} height={Math.max(th, 2)} rx={Math.min(8, w / 2)} fill="var(--surface-3)" />
                    {dh > 0 && <rect x={x} y={H - dh} width={w} height={dh} rx={Math.min(8, w / 2)} fill="var(--accent)" />}
                    {(i % 2 === 0 || i === s.trend.length - 1) && (
                      <text x={x + w / 2} y={H + 18} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{fmtDate(t.date, { day: 'numeric' })}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </section>
          <section className="card">
            <h2 className="t-head" style={{ marginBottom: 16 }}>Hours per course</h2>
            <div className="stack">
              {courses.map((c) => {
                const st = s.courses.find((x) => x.courseId === c.id);
                if (!st || st.plannedMin === 0) return null;
                return (
                  <div key={c.id} className="hbar">
                    <div className="row"><span className="dot" style={{ background: cvar(c.color) }} /><b className="grow">{c.code}</b><span className="t-cap num">{dur(st.doneMin)} of {dur(st.plannedMin)}</span></div>
                    <div className="hbar-track" role="img" aria-label={`${c.code}: ${dur(st.doneMin)} done of ${dur(st.plannedMin)} planned`}>
                      <div className="hbar-plan" style={{ ['--bar' as string]: cvar(c.color), width: `${(st.plannedMin / maxMin) * 100}%`, background: 'color-mix(in srgb, var(--bar) 24%, var(--surface-3))' }}>
                        <div className="hbar-fill" style={{ ['--bar' as string]: cvar(c.color), width: st.plannedMin === 0 ? 0 : `${(st.doneMin / st.plannedMin) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
};
