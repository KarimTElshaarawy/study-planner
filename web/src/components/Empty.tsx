import type { ReactNode } from 'react';

/** Designed from simple shapes only: a ring, a bar and a dot. */
export const Empty = ({ title, text, action, variant = 'ring' }: { title: string; text: string; action?: ReactNode; variant?: 'ring' | 'calendar' | 'done' }) => (
  <div className="empty">
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden="true">
      {variant === 'calendar' ? (
        <>
          <rect x="18" y="14" width="84" height="70" rx="18" fill="var(--surface-3)" />
          <rect x="34" y="34" width="24" height="8" rx="4" fill="var(--hairline-strong)" />
          <rect x="34" y="50" width="52" height="8" rx="4" fill="var(--hairline-strong)" />
          <circle cx="86" cy="38" r="6" fill="var(--accent)" />
        </>
      ) : variant === 'done' ? (
        <>
          <circle cx="60" cy="48" r="34" stroke="var(--surface-3)" strokeWidth="14" />
          <circle cx="60" cy="48" r="34" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round" strokeDasharray="213 1" transform="rotate(-90 60 48)" />
          <path d="M47 49l9 9 18-19" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="60" cy="48" r="34" stroke="var(--surface-3)" strokeWidth="14" />
          <circle cx="60" cy="48" r="34" stroke="var(--hairline-strong)" strokeWidth="14" strokeLinecap="round" strokeDasharray="60 160" transform="rotate(-90 60 48)" />
          <circle cx="60" cy="48" r="5" fill="var(--accent)" />
        </>
      )}
    </svg>
    <h2 className="t-head">{title}</h2>
    <p>{text}</p>
    {action}
  </div>
);
