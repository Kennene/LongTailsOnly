import { ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { getServiceConfig, type ServiceRoute } from '@/services/serviceRegistry';
import { useActiveService } from '@/services/ServicesContext';

export function Sidebar(): React.JSX.Element {
  const { activeService } = useActiveService();
  // Nawigacja to jedyna lista tras (spec §5.7): rejestr usług jest źródłem prawdy dla sidebaru
  // i strażnika, więc usługa spoza rejestru nie ma własnych pozycji. Milczący katalog — w drodze
  // albo po błędzie — rozstrzyga rejestr frontendu (zapis, a bez zapisu domyślny `github`, spec §5.2),
  // więc nawigacja istnieje od pierwszego renderu; pusta zostaje tylko przy osiadłym pustym katalogu.
  const routes = getServiceConfig(activeService.id)?.routes ?? [];

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
          <span className="truncate text-[11px] text-muted-foreground">
            {`Dostęp: ${activeService.name}`}
          </span>
        </span>
      </div>

      <nav
        aria-label="Nawigacja główna"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        {routes.map((route: ServiceRoute): React.JSX.Element => (
          <NavLink
            key={route.path}
            to={route.path}
            title={route.label}
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
            <route.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only xl:not-sr-only xl:truncate">{route.label}</span>
          </NavLink>
        ))}
      </nav>

      <p className="hidden shrink-0 border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground xl:block">
        Demo — zegar symulowany
      </p>
    </aside>
  );
}
