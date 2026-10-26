import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useEffect } from 'react';
import { api, ApiError } from './api';
import { useToast } from '../components/Toast';
import { buzz } from './format';
import type { Block, Boot, DayView, Stats } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 1000 * 60 * 60 * 24,
      networkMode: 'offlineFirst',
      retry: (n, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 400)) && n < 2,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

export const persister = createSyncStoragePersister({
  storage: (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })(),
  key: 'cadence-cache',
});

const QUEUE_KEY = 'cadence-queue';
interface Pending {
  id: string;
  done: boolean;
}
const readQueue = (): Pending[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as Pending[];
  } catch {
    return [];
  }
};
const writeQueue = (q: Pending[]): void => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // storage unavailable
  }
};
export const enqueue = (p: Pending): void => writeQueue([...readQueue().filter((x) => x.id !== p.id), p]);
export const flushQueue = async (): Promise<boolean> => {
  const q = readQueue();
  if (q.length === 0) return false;
  for (const p of q) {
    try {
      await api('PATCH', `/api/blocks/${encodeURIComponent(p.id)}`, { done: p.done });
    } catch (e) {
      // offline or signed out: keep the tick and try again later
      if (e instanceof ApiError && (e.status === 0 || e.status === 401)) return false;
    }
    writeQueue(readQueue().filter((x) => x.id !== p.id));
  }
  return true;
};

export const clearLocalData = async (opts: { keepQueue?: boolean } = {}): Promise<void> => {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
  try {
    localStorage.removeItem('cadence-cache');
    if (!opts.keepQueue) localStorage.removeItem(QUEUE_KEY);
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    // ignore
  }
};

export const useBoot = () => useQuery({ queryKey: ['boot'], queryFn: () => api<Boot>('GET', '/api/bootstrap'), refetchInterval: 60_000 });
export const useDay = (date: string | undefined) =>
  useQuery({ queryKey: ['plan', date], queryFn: () => api<DayView>('GET', `/api/plan/${date}`), enabled: !!date });
export const useWeek = (start: string | null) =>
  useQuery({ queryKey: ['week', start], queryFn: () => api<DayView[]>('GET', `/api/week?start=${start}`), enabled: !!start });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('GET', '/api/stats') });

/** Replays offline toggles when the connection returns, then refreshes everything. */
export const useOfflineSync = (): void => {
  const qc = useQueryClient();
  useEffect(() => {
    const run = async (): Promise<void> => {
      if (await flushQueue()) await qc.invalidateQueries();
    };
    void run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [qc]);
};

const applyToggle = (day: DayView, id: string, done: boolean): DayView => {
  const blocks = day.blocks.map((b): Block => (b.id === id ? { ...b, status: done ? 'done' : 'planned', doneAt: done ? new Date().toISOString() : null } : b));
  const study = blocks.filter((b) => b.kind === 'study' || b.kind === 'review');
  return {
    ...day,
    blocks,
    done: study.filter((b) => b.status === 'done').length,
    doneMin: study.filter((b) => b.status === 'done').reduce((s, b) => s + b.end - b.start, 0),
  };
};

export const useToggle = (date: string) => {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api('PATCH', `/api/blocks/${encodeURIComponent(id)}`, { done }),
    onMutate: async ({ id, done }) => {
      buzz(done ? 12 : 6);
      await qc.cancelQueries({ queryKey: ['plan', date] });
      const prev = qc.getQueryData<DayView>(['plan', date]);
      if (prev) qc.setQueryData(['plan', date], applyToggle(prev, id, done));
      return { prev };
    },
    onError: (err, vars, ctx) => {
      if (err instanceof ApiError && err.status === 0) {
        enqueue(vars);
        return;
      }
      if (err instanceof ApiError && err.status === 409) toast(err.message);
      if (ctx?.prev) qc.setQueryData(['plan', date], ctx.prev);
    },
    onSettled: (_d, err) => {
      if (err instanceof ApiError && err.status === 0) return;
      void qc.invalidateQueries({ queryKey: ['plan'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['week'] });
    },
  });
};

