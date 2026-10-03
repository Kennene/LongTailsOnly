import type { AppealOverview, ClockRead, DashboardStats, LeaseOverview } from '@/types/api';

import { fetchAppeals } from './appeals';
import { shouldUseFixtures } from './config';
import { countDashboard, dashboardFixture } from './fixtures/dashboard';
import { fetchLeases } from './leases';
import { fetchClock } from './simulation';

/**
 * Liczniki KPI pulpitu.
 *
 * Backend **nie serwuje** `GET /api/v1/dashboard` (krok 4.6B dorzuca
 * `GET /api/v1/dashboard/stats`, plan `docs/superpowers/plans/2026-10-03-p4-4.6-dashboard-graph.md`),
 * więc liczymy je tutaj **tą samą regułą co backend**
 * (`app/domain/insights.py::compute_dashboard_counters`, odbicie w `fixtures/dashboard.ts`)
 * z danych, które API już oddaje:
 *
 * - `GET /api/v1/leases` → wszystkie liczniki poza `pending_appeals`,
 * - `GET /api/v1/simulation/clock` → `generated_at` (czas symulowany, nie zegar przeglądarki),
 * - `GET /api/v1/appeals` → `pending_appeals` z jednej strony listy (filtr `status` należy do
 *   backendu; strona i tak wraca w całości, więc liczymy po `status === 'PENDING'`).
 *
 * Trzy odczyty idą razem (`Promise.all`): licznik bez jednego ze źródeł byłby liczbą z sufitu,
 * a pulpit ma pokazywać albo pełny stan, albo błąd z „Odśwież”. Gdy 4.6B wyląduje, ta funkcja
 * zamienia się na jedno `getJson<DashboardStats>('/api/v1/dashboard/stats')` — **bez** try-404
 * i cichego fallbacku, bo dwie ścieżki danych to dwa różne pulpitery.
 *
 * `onboarding_candidates` zostaje przy wspólnym fixture'cie użytkowników: lista dzierżaw niesie
 * wyłącznie osoby, które dzierżawę mają, a API nie ma odczytu „wszystkie osoby z zespołem”
 * (jest tylko `GET /api/v1/onboarding/{login}` per osoba). Tę jedną liczbę rozstrzygnie 4.6B.
 */
export async function fetchDashboard(): Promise<DashboardStats> {
  if (shouldUseFixtures()) {
    return dashboardFixture;
  }

  const [leases, clock, appeals]: [LeaseOverview[], ClockRead, AppealOverview[]] =
    await Promise.all([fetchLeases(), fetchClock(), fetchAppeals()]);

  // `countDashboard` liczy `pending_appeals` z fixture'u odwołań — w trybie live nadpisujemy tę
  // jedną liczbę odpowiedzią API, żeby reszta reguły (ta sama co backend) została nietknięta.
  return { ...countDashboard(leases, clock.now), pending_appeals: countPendingAppeals(appeals) };
}

/** Licznik `pending_appeals` z reguły backendu (`AppealStatus.PENDING`, `insights_service`). */
function countPendingAppeals(appeals: AppealOverview[]): number {
  return appeals.filter((appeal: AppealOverview): boolean => appeal.status === 'PENDING').length;
}
