import { useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const Field = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    {children}
  </label>
);

export const TextField = ({ label, className, ...p }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label} className={className}>
    <input className="input" {...p} />
  </Field>
);

export const SelectField = ({ label, className, children, ...p }: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) => (
  <Field label={label} className={className}>
    <select className="select" {...p}>
      {children}
    </select>
  </Field>
);

/** 24 hour time entry that looks the same on every device (native time inputs follow the OS locale). */
export const TimeField = ({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = (): void => {
    const m = /^(\d{1,2}):?(\d{2})$/.exec(v.trim());
    if (m) {
      const h = Number(m[1]);
      const mi = Number(m[2]);
      if (h < 24 && mi < 60) {
        const t = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
        setV(t);
        if (t !== value) onChange(t);
        return;
      }
    }
    setV(value);
  };
  return (
    <Field label={label} className={className}>
      <input className="input tnum" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </Field>
  );
};

export const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
);

export const Seg = <T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) => (
  <div className="seg" role="group" aria-label={label}>
    {options.map(([v, text]) => (
      <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
        {text}
      </button>
    ))}
  </div>
);

export const Skeleton = ({ h = 20, w = '100%', r }: { h?: number; w?: number | string; r?: number }) => (
  <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />
);

export const Meters = ({ value, label }: { value: number; label: string }) => (
  <span className="meters" role="img" aria-label={`${label} ${value} of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <i key={n} className={n <= value ? 'on' : ''} />
    ))}
  </span>
);

/** Duration with small units so the numbers stay the hero. */
export const DurText = ({ min }: { min: number }) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return <>{m}<span className="u">min</span></>;
  return <>{h}<span className="u">h</span>{m > 0 && <>{m}<span className="u">min</span></>}</>;
};

export const cvar = (i: number): string => `var(--c${((i % 8) + 8) % 8})`;
