import type { DashboardCounters } from '@/api/dashboard';
import type { LeaseOverview, LeaseStatus } from '@/types/api';

import { leasesFixture } from './leases';

/**
 * Liczniki pulpitu liczone z listy dzierżaw — jedno źródło prawdy dla pulpitu i tabeli `/leases`.
 *
 * Audyt wykazał „Aktywne 12” przy czterech wierszach na `/leases`: liczby wpisane ręcznie
 * rozjeżdżają się z seedem przy każdej jego zmianie. Dlatego fixture liczymy raz, w czasie
 * ładowania modułu, a symulacja backendu (MSW) woła ten sam helper na żywym stanie dzierżaw,
 * dzięki czemu podróż w czasie zmienia liczniki tak samo jak statusy w tabeli.
 *
 * Wartości są spójne z seedem backendu (`TimeProvider` kotwiczy demo na `2026-10-03T00:00:00Z`),
 * a test integracyjny przepływu pitch (`kpi-warning` = 1 na starcie) nadal przechodzi.
 */
export function countDashboard(leases: LeaseOverview[]): DashboardCounters {
  return {
    active: countStatus(leases, 'ACTIVE'),
    warning: countStatus(leases, 'WARNING'),
    expired: countStatus(leases, 'EXPIRED'),
    downscope_recommendations: leases.filter(
      (lease: LeaseOverview): boolean => lease.recommendation === 'DOWNSCOPE',
    ).length,
  };
}

export const dashboardFixture: DashboardCounters = countDashboard(leasesFixture);

function countStatus(leases: LeaseOverview[], status: LeaseStatus): number {
  return leases.filter((lease: LeaseOverview): boolean => lease.status === status).length;
}
