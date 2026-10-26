import { m, useAnimationControls, useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}

/** Activity-style progress ring. Fills with spring physics, pulses when it grows. */
export const Ring = ({ value, size = 220, stroke = 20, color = 'var(--accent)', children, label }: Props) => {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const v = Math.max(0, Math.min(1, value));
  const controls = useAnimationControls();
  const prev = useRef(v);
  useEffect(() => {
    if (v > prev.current && !reduce) void controls.start({ scale: [1, 1.035, 1], transition: { duration: 0.45, ease: 'easeOut' } });
    prev.current = v;
  }, [v, controls, reduce]);
  return (
    <m.div className="ring" style={{ width: size, height: size }} animate={controls} role="img" aria-label={label ?? `${Math.round(v * 100)} percent`}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? v : 0 }}
          animate={{ pathLength: v === 0 ? 0.001 : v, opacity: v === 0 ? 0 : 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </m.div>
  );
};
