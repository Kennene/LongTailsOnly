import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getDefaultPath, isRouteSupported } from '@/services/serviceRegistry';
import { useActiveService } from '@/services/ServicesContext';

/**
 * Bramka tras wewnątrz `AppShell`: przepuszcza trasę, którą obsługuje aktywna usługa, a w przeciwnym
 * razie przekierowuje **deklaratywnie** na jej trasę domyślną (`<Navigate replace>` — bez migotania
 * treści i bez podwójnego renderu, jakiego wymagałby `useEffect`).
 *
 * Dopóki katalog jest w drodze, strażnik nie podejmuje decyzji i oddaje trasę routerowi: pierwszy
 * render widzi placeholder (pusty identyfikator), więc przekierowanie na tej podstawie wyrzuciłoby
 * użytkownika z trasy, którą aktywna usługa jednak obsługuje — np. z `/leases` przy zapisanym
 * `github`. Po rozstrzygnięciu katalogu bez żadnej usługi placeholder prowadzi na pulpit, bo tylko
 * tę trasę `isRouteSupported` uznaje dla nieznanego identyfikatora (zadanie 4); dzięki temu strażnik
 * nigdy nie odrzuca własnego celu przekierowania i nie zapętla się.
 */
export function ServiceRouteGuard(): React.JSX.Element {
  const { activeService, isPending } = useActiveService();
  const { pathname } = useLocation();

  if (!isPending && !isRouteSupported(activeService.id, pathname)) {
    return <Navigate to={getDefaultPath(activeService.id)} replace />;
  }

  return <Outlet />;
}
