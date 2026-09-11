import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  BarChart3,
  FlaskConical,
  Beaker,
  Bell,
  FileText,
  Droplets,
  ScanLine,
  LogOut,
  Shield,
  MapPin,
  Award,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/',           label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/map',        label: 'Map View',   Icon: Map },
  { to: '/analysis',   label: 'Analysis',   Icon: BarChart3 },
  { to: '/interventions', label: 'Interventions', Icon: Award },
  { to: '/simulator',  label: 'Recommendation Engine',  Icon: FlaskConical },
  { to: '/simulation', label: 'Impact Simulation', Icon: Beaker },
  { to: '/geo-intel',  label: 'Geo Image Intel', Icon: ScanLine },
  { to: '/alerts',     label: 'Alerts',     Icon: Bell },
  { to: '/reports',    label: 'Reports',    Icon: FileText },
];

const Navbar: React.FC = () => {
  const officer = useAuthStore(s => s.officer);
  const authMode = useAuthStore(s => s.authMode);
  const logout = useAuthStore(s => s.logout);

  return (
    <header className="bg-primary-600 text-white shadow-lg print:hidden z-50 relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-primary-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-400 flex items-center justify-center shadow">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight leading-none">JalDrishti</span>
            <span className="block text-xs text-primary-200 leading-none mt-0.5">
              Watershed Monitoring &amp; Decision Support — SIH26015
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {officer && (
            <div className="flex items-center gap-2 bg-primary-700/60 rounded-full pl-1 pr-3 py-1">
              <div className="w-6 h-6 rounded-full bg-primary-400 flex items-center justify-center flex-shrink-0">
                {officer.isAdmin
                  ? <Shield className="w-3 h-3 text-white" />
                  : <MapPin className="w-3 h-3 text-white" />}
              </div>
              <div className="hidden md:block leading-none">
                <span className="text-xs font-semibold block">{officer.name}</span>
                <span className="text-[10px] text-primary-200">
                  {officer.isAdmin ? 'All Districts' : `${officer.district} District`}
                  {authMode === 'real' && (
                    <span
                      className="ml-1.5 px-1 rounded bg-tertiary-500/40"
                      title="Authenticated against the real backend (bcrypt + JWT)"
                    >
                      Backend Auth
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="ml-1 w-6 h-6 rounded-full hover:bg-primary-600 flex items-center justify-center transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-primary-100" />
              </button>
            </div>
          )}
          <div className="text-right hidden sm:block">
            <span className="text-xs text-primary-200 block">Ministry of Rural Development</span>
            <span className="text-xs font-semibold text-primary-100">Code Whisperers</span>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-1 px-4 py-1 overflow-x-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary-500 text-white'
                  : 'text-primary-100 hover:bg-primary-700 hover:text-white',
              ].join(' ')
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
};

export default Navbar;
