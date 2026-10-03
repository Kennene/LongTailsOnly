import { FileCheck2, Gavel, LayoutDashboard, Network, ScrollText, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Pulpit', icon: LayoutDashboard },
  { to: '/leases', label: 'Dzierżawy', icon: FileCheck2 },
  { to: '/appeals', label: 'Odwołania', icon: Gavel },
  { to: '/baseline', label: 'Standard zespołu', icon: ShieldCheck },
  { to: '/graph', label: 'Graf', icon: Network },
  { to: '/audit', label: 'Audyt', icon: ScrollText },
];

export function Sidebar(): React.JSX.Element {
  return (
    <aside
      data-slot="sidebar"
      className="flex h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">Lease Governor</span>
          <span className="truncate text-[11px] text-muted-foreground">Dostęp do GitHub</span>
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
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <p className="shrink-0 border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground">
        Demo — zegar symulowany
      </p>
    </aside>
  );
}
