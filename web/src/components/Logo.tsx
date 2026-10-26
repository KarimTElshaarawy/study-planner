export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="51.8 17.3" transform="rotate(-90 16 16)" />
    <circle cx="8.2" cy="8.2" r="2.4" fill="var(--accent)" />
  </svg>
);
