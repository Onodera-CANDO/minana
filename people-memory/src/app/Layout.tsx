import { NavLink, Outlet } from 'react-router-dom';
import { UpdateBanner } from '../pwa/UpdateBanner';

const TABS = [
  { to: '/', label: 'ホーム', icon: '⌂', end: true },
  { to: '/camera', label: 'カメラ', icon: '◉' },
  { to: '/people', label: '人物', icon: '☺' },
  { to: '/meetings', label: '履歴', icon: '☰' },
  { to: '/settings', label: '設定', icon: '⚙' },
];

export function Layout() {
  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <UpdateBanner />
      <Outlet />
      <nav
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      >
        <ul className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center text-xs ${isActive ? 'font-bold text-teal-700 dark:text-teal-300' : 'text-slate-500 dark:text-slate-400'}`
                }
              >
                <span aria-hidden className="text-lg leading-none">
                  {t.icon}
                </span>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
