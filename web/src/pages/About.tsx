import { BellRing, Brain, CalendarClock, Download, Hourglass, Lock, Smartphone } from 'lucide-react';
import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Ring } from '../components/Ring';
import { Timeline } from '../components/Timeline';
import type { Block, Course } from '../lib/types';
import './about.css';

export const REPO_URL = 'https://github.com/karimtelshaarawy/study-planner';

const courses: Course[] = [
  { id: 'a', code: 'MTH210', name: 'Linear Algebra', color: 0 },
  { id: 'b', code: 'PHY150', name: 'Mechanics', color: 1 },
  { id: 'c', code: 'CHM120', name: 'Chemistry', color: 2 },
];
const blk = (id: string, start: number, end: number, courseId: string, topic: string, method: Block['method'], status: Block['status'] = 'planned'): Block => ({
  id, date: '2026-11-05', start, end, kind: 'study', title: topic, courseId, examId: null, topicId: null, topicTitle: topic, method, note: null, status, carried: false, doneAt: null,
});
const demoBlocks: Block[] = [
  blk('1', 510, 560, 'a', 'Eigenvalues', 'recall', 'done'),
  blk('2', 570, 620, 'b', 'Momentum and impulse', 'practice', 'done'),
  blk('3', 640, 690, 'c', 'Reaction mechanisms', 'association'),
  blk('4', 700, 750, 'a', 'Past paper, section B', 'pastpaper'),
];

const Reveal = ({ children, delay = 0 }: { children: ReactNode; delay?: number }) => {
  const reduce = useReducedMotion();
  return (
    <m.div initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </m.div>
  );
};

const CODE = `git clone ${REPO_URL}.git
cd study-planner
cp .env.example .env   # set APP_PASSWORD
docker compose up -d`;

const Hero = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'start 20%'] });
  const reduce = useReducedMotion();
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [48, 0]);
  return (
    <section className="ab-hero">
      <Reveal><span className="t-eyebrow">Open source study planner</span></Reveal>
      <m.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>Every day planned until your last exam.</m.h1>
      <Reveal delay={0.1}><p className="lead">Dayfold turns your exam dates into a time-blocked day, tracks what you finish, and emails you the plan before you wake up.</p></Reveal>
      <Reveal delay={0.2}>
        <div className="ab-cta">
          <a className="btn" href="#self-host">Self-host in 2 minutes</a>
          <a className="btn secondary" href={REPO_URL}>View on GitHub</a>
        </div>
      </Reveal>
      <div className="ab-stage" ref={ref}>
        <m.div className="ab-device" style={{ y }}>
          <div className="ab-ring-col">
            <Ring value={0.5} size={220} stroke={20} label="2 of 4 sessions done">
              <span className="big">2</span>
              <span className="sub">of 4 done</span>
            </Ring>
            <div className="t-cap">3 days to MTH210 Midterm</div>
          </div>
          <Timeline blocks={demoBlocks} courses={courses} />
        </m.div>
      </div>
    </section>
  );
};

const Sticky = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const value = useTransform(scrollYProgress, [0.1, 0.85], [0.05, 1]);
  const [v, setV] = useState(0.05);
  useMotionValueEvent(value, 'change', (x) => setV(Math.round(x * 50) / 50));
  const steps = ['Plan the day.', 'Tick it off.', 'Watch it close.'];
  const active = v < 0.34 ? 0 : v < 0.7 ? 1 : 2;
  return (
    <div className="ab-sticky" ref={ref}>
      <div className="ab-sticky-in">
        <div className="ab-wrap ab-sticky-grid">
          <Ring value={v} size={280} stroke={26} label={`${Math.round(v * 100)} percent`}>
            <span className="big" style={{ fontSize: 80 }}>{Math.round(v * 100)}</span>
            <span className="sub">percent</span>
          </Ring>
          <div className="ab-steps">
            {steps.map((s, i) => (
              <div key={s} className="ab-step" style={{ color: i === active ? 'var(--ink)' : 'var(--ink-2)' }}>{s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const bento: Array<{ cls: string; Icon: typeof Brain; title: string; text: string; visual: ReactNode }> = [
  {
    cls: 'w4', Icon: CalendarClock, title: 'Plans around your life', text: 'Classes, shifts, training and meals are fixed. Study fills the gaps, never an exam, never the hour after.',
    visual: (
      <div className="stack" style={{ gap: 10 }}>
        {[['var(--c0)', '70%'], ['var(--ink-3)', '36%'], ['var(--c1)', '54%'], ['var(--c2)', '44%']].map(([c, w], i) => (
          <div className="ab-bar" key={i}><i style={{ background: c, width: w, marginLeft: i % 2 ? '28%' : 0 }} /></div>
        ))}
      </div>
    ),
  },
  {
    cls: 'w2', Icon: Hourglass, title: 'Countdowns', text: 'Big numerals. Days, then hours.',
    visual: <div className="t-hero num" style={{ fontSize: 96, color: 'var(--accent-num)' }}>6<span className="muted" style={{ fontSize: 22, letterSpacing: 0, fontWeight: 600 }}> days</span></div>,
  },
  {
    cls: 'w2', Icon: Brain, title: 'Association, built in', text: 'Every session suggests a method, and some ask for an analogy or a mnemonic you write yourself.',
    visual: <div className="pill accent" style={{ width: 'fit-content' }}>Association hook</div>,
  },
  {
    cls: 'w2', Icon: BellRing, title: 'A morning email', text: 'What you finished, what slipped, and today in full.',
    visual: <div className="ab-bar" style={{ height: 56, borderRadius: 16 }}><i style={{ width: '62%', background: 'var(--surface)', borderRadius: 16 }} /></div>,
  },
  {
    cls: 'w2', Icon: Smartphone, title: 'Made for iPhone', text: 'Installs to your home screen and keeps working offline.',
    visual: <div style={{ width: 56, height: 96, borderRadius: 14, border: '3px solid var(--ink)', position: 'relative' }}><i style={{ position: 'absolute', left: 10, right: 10, top: 10, height: 6, borderRadius: 3, background: 'var(--accent)' }} /></div>,
  },
  {
    cls: 'w3', Icon: Lock, title: 'Yours alone', text: 'One user, one SQLite file, no tracking, no paid APIs. The planner is plain code, not a chatbot.',
    visual: <div className="chips"><span className="chip">SQLite</span><span className="chip">Docker</span><span className="chip">MIT</span></div>,
  },
  {
    cls: 'w3', Icon: Download, title: 'Bring your dates', text: 'Add exams by hand, import a CSV, or drop in a calendar file.',
    visual: <div className="chips"><span className="chip">.csv</span><span className="chip">.ics</span></div>,
  },
];

export const About = () => {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(CODE.replace(/ +#.*$/gm, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="about">
      <header className="ab-nav">
        <div className="ab-nav-in">
          <div className="brand"><Logo />Dayfold</div>
          <nav className="ab-links" aria-label="Page">
            <a href="#features">Features</a>
            <a href="#how">How it plans</a>
            <a href="#self-host">Self-host</a>
            <a href={REPO_URL}>GitHub</a>
          </nav>
          <Link className="btn" to="/today">Open app</Link>
        </div>
      </header>
      <main className="ab-wrap">
        <Hero />
        <Sticky />
        <section className="ab-section" id="features">
          <Reveal><h2>Calm by design. <span>Strict where it counts.</span></h2></Reveal>
          <div className="ab-bento">
            {bento.map(({ cls, Icon, title, text, visual }, i) => (
              <m.article key={title} className={`ab-card ${cls}`} initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: (i % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}>
                <div>
                  <Icon size={28} style={{ marginBottom: 16 }} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <div>{visual}</div>
              </m.article>
            ))}
          </div>
        </section>
        <section className="ab-section" id="how">
          <Reveal><h2>A plan that moves with you.</h2></Reveal>
          <Reveal delay={0.1}><p className="sub">More time goes to what is close, high stakes and shaky. The day before an exam turns into light review. Miss a session and it shifts later, it never disappears. Replan whenever the day changes.</p></Reveal>
        </section>
        <section className="ab-section" id="self-host">
          <Reveal><h2>Self-host in 2 minutes.</h2></Reveal>
          <Reveal delay={0.1}>
            <div className="ab-code" style={{ marginTop: 40 }}>
              <div className="ab-code-bar"><span>Terminal</span><button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button></div>
              <pre><code>{CODE.split('\n').map((l, i) => { const [cmd, cm] = l.split('   #'); return <div key={i}>{cmd}{cm !== undefined && <span className="c">   #{cm}</span>}</div>; })}</code></pre>
            </div>
            <p className="sub">Add your own Resend key for the morning email. Without one, emails land in a local outbox folder.</p>
          </Reveal>
        </section>
        <footer className="ab-foot">
          <span>Dayfold. MIT licensed.</span>
          <a href={REPO_URL}>GitHub</a>
        </footer>
      </main>
    </div>
  );
};
