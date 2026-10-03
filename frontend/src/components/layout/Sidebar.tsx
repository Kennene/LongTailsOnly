import { FileCheck2, Gavel, LayoutDashboard, Network, ScrollText, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Pulpit', icon: LayoutDashboard },
  { to: '/leases', label: 'Dostępy', icon: FileCheck2 },
  { to: '/appeals', label: 'Odwołania', icon: Gavel },
  { to: '/baseline', label: 'Standard zespołu', icon: ShieldCheck },
  { to: '/graph', label: 'Graf', icon: Network },
  { to: '/audit', label: 'Audyt', icon: ScrollText },
];

export function Sidebar(): React.JSX.Element {
  return (
    <aside
      data-slot="sidebar"
      className="flex h-dvh w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground xl:w-60"
    >
      <div className="flex h-14 shrink-0 items-center justify-center gap-2.5 border-b border-sidebar-border px-2 xl:justify-start xl:px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        {/* Nazwa produktu zostaje w drzewie dostępności także w zwiniętym pasku (`sr-only`). */}
        <span className="sr-only flex min-w-0 flex-col leading-tight xl:not-sr-only">
          <span className="truncate text-sm font-semibold">Lease Governor</span>
          <span className="truncate text-xs text-muted-foreground">Dostęp do GitHub</span>
        </span>
      </div>

      <nav
        aria-label="Nawigacja główna"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              cn(
                // Poniżej `xl` pasek jest zwinięty do ikon: etykieta jest `sr-only`,
                // więc nazwa dostępna linku nie zależy od widocznego tekstu.
                'flex min-h-9 items-center justify-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors xl:justify-start xl:px-3',
                isActive
                  ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only xl:not-sr-only xl:truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <p className="hidden shrink-0 border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground xl:block">
        Demo — zegar symulowany
      </p>
    </aside>
  );
}
