import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';

const navItems = [
  { to: '/clients', label: 'Clients' },
  { to: '/reports', label: 'Reports' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white p-5 md:flex">
        <div className="mb-8">
          <div className="text-lg font-bold text-brand-800">Windbrook</div>
          <div className="text-xs uppercase tracking-wider text-slate-500">Client Report Portal</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-500">
          <div className="font-semibold text-slate-800">{user?.full_name || user?.email}</div>
          <div className="capitalize">{user?.role}</div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm font-medium text-slate-700">AW Client Report Portal</div>
          <button type="button" className="btn-secondary" onClick={() => void logout()}>
            Sign out
          </button>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
