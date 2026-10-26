import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Skeleton } from './components/ui';
import { api, onUnauthorized } from './lib/api';
import { clearLocalData, useBoot } from './lib/query';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { About } from './pages/About';
import { Today } from './pages/Today';

const Exams = lazy(() => import('./pages/Exams').then((m) => ({ default: m.Exams })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));
const Week = lazy(() => import('./pages/Week').then((m) => ({ default: m.Week })));

const Splash = () => (
  <div className="center-screen" aria-busy="true">
    <Skeleton h={120} w={120} r={60} />
  </div>
);

const Authed = ({ onLogout }: { onLogout: () => void }) => {
  const boot = useBoot();
  if (!boot.data) return boot.isError ? <div className="center-screen"><p className="muted">Could not load. Check your connection.</p></div> : <Splash />;
  const done = boot.data.settings.setupDone;
  return (
    <Routes>
      <Route path="/setup" element={done ? <Navigate to="/today" replace /> : <Setup />} />
      <Route element={done ? <Shell /> : <Navigate to="/setup" replace />}>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/week" element={<Week />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings onLogout={onLogout} />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const Gate = () => {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: () => api<{ authenticated: boolean }>('GET', '/api/session'), staleTime: 60_000, retry: false });
  useEffect(
    () =>
      onUnauthorized(() => {
        void clearLocalData({ keepQueue: true }).then(() => qc.setQueryData(['session'], { authenticated: false }));
      }),
    [qc],
  );
  const authed = session.data?.authenticated ?? (session.isError ? true : undefined);
  if (authed === undefined) return <Splash />;
  if (!authed) return <Login onDone={() => void qc.invalidateQueries().then(() => qc.setQueryData(['session'], { authenticated: true }))} />;
  return <Authed onLogout={() => qc.setQueryData(['session'], { authenticated: false })} />;
};

export const App = () => (
  <BrowserRouter>
    <Suspense fallback={<Splash />}>
    <Routes>
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Gate />} />
    </Routes>
    </Suspense>
  </BrowserRouter>
);
