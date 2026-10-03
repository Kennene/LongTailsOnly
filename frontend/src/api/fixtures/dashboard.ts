import appealsJson from '@shared/fixtures/appeals.json';
import clockJson from '@shared/fixtures/clock.json';
import usersJson from '@shared/fixtures/users.json';

import type { AppealRead, ClockRead, DashboardStats, LeaseOverview, UserRead } from '@/types/api';

import { leasesFixture } from './leases';

/**
 * Liczniki pulpitu w kształcie kontraktu (`DashboardStats`) — liczone z listy dzierżaw.
 *
 * Jedno źródło prawdy dla pulpitu i tabeli `/leases`: audyt wykazał „Aktywne 12” przy czterech
 * wierszach, bo liczby były wpisane ręcznie. Dlatego pulpitu nie wypełniamy własnymi wartościami,
 * tylko liczymy je **tą samą regułą co backend** (`app/domain/insights.py::compute_dashboard_counters`):
 * dzierżawy stałe (`admin`, `expires_at: null`) idą do `permanent`, wyłączone do `revoked`,
 * a statusy i rekomendacje liczymy wyłącznie po dzierżawach czynnych i nie-stałych.
 *
 * `pending_appeals` i `onboarding_candidates` nie wynikają z samych dzierżaw, więc bierzemy je
 * ze wspólnych fixture'ów (`appeals.json`, `users.json`) zamiast wpisywać liczby z sufitu.
 * Stan odwołań w symulacji MSW żyje w domenie „appeals”, więc te dwa liczniki są na razie stałe.
 */
const DEMO_ANCHOR: string = (clockJson as ClockRead).now;

export function countDashboard(leases: LeaseOverview[], generatedAt: string): DashboardStats {
  const live: LeaseOverview[] = leases.filter((lease: LeaseOverview): boolean => lease.is_active);
  const leased: LeaseOverview[] = live.filter(
    (lease: LeaseOverview): boolean => lease.current_role !== 'admin',
  );

  return {
    generated_at: generatedAt,
    active: countWhere(leased, (lease: LeaseOverview): boolean => lease.status === 'ACTIVE'),
    warning: countWhere(leased, (lease: LeaseOverview): boolean => lease.status === 'WARNING'),
    expired: countWhere(leased, (lease: LeaseOverview): boolean => lease.status === 'EXPIRED'),
    permanent: live.length - leased.length,
    revoked: leases.length - live.length,
    downscope_recommendations: countWhere(
      leased,
      (lease: LeaseOverview): boolean => lease.recommendation === 'DOWNSCOPE',
    ),
    revoke_recommendations: countWhere(
      leased,
      (lease: LeaseOverview): boolean => lease.recommendation === 'REVOKE',
    ),
    pending_appeals: countPendingAppeals(),
    onboarding_candidates: countOnboardingCandidates(live),
  };
}

/** Liczniki bez zegara symulowanego (tryb `VITE_USE_FIXTURES=true`) — stan na kotwicę demo. */
export const dashboardFixture: DashboardStats = countDashboard(leasesFixture, DEMO_ANCHOR);

function countWhere(leases: LeaseOverview[], matches: (lease: LeaseOverview) => boolean): number {
  return leases.filter(matches).length;
}

function countPendingAppeals(): number {
  return (appealsJson as AppealRead[]).filter(
    (appeal: AppealRead): boolean => appeal.status === 'PENDING',
  ).length;
}

/** Osoba z zespołem, bez uprawnień administracyjnych i bez czynnej dzierżawy — kandydat do UC-1. */
function countOnboardingCandidates(live: LeaseOverview[]): number {
  const withAccess = new Set<string>(live.map((lease: LeaseOverview): string => lease.user.login));

  return (usersJson as UserRead[]).filter(
    (user: UserRead): boolean =>
      user.team !== null && !user.is_admin && !withAccess.has(user.login),
  ).length;
}
