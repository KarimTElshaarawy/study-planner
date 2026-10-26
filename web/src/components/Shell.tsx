import { BarChart3, CalendarDays, CircleDot, GraduationCap, Settings as Cog } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { useOfflineSync } from '../lib/query';

const items = [
  { to: '/today', label: 'Today', Icon: CircleDot },
  { to: '/exams', label: 'Exams', Icon: GraduationCap },
  { to: '/week', label: 'Week', Icon: CalendarDays },
  { to: '/stats', label: 'Stats', Icon: BarChart3 },
  { to: '/settings', label: 'Settings', Icon: Cog },
];

export const Shell = () => {
  useOfflineSync();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo />
          Dayfold
        </div>
        {items.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="side-link">
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <div className="page">
          <Outlet />
        </div>
      </main>
      <nav className="tabbar" aria-label="Main">
        {items.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="tab">
            <Icon size={24} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
