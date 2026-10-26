import '@fontsource-variable/inter';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { LucideProvider } from 'lucide-react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { applyTheme, getTheme } from './lib/hooks';
import { persister, queryClient } from './lib/query';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

applyTheme(getTheme());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: 'v1' }}>
      <LucideProvider strokeWidth={1.6}>
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <App />
            </ToastProvider>
          </MotionConfig>
        </LazyMotion>
      </LucideProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
