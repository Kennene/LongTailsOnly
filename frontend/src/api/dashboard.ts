import type { DashboardStats } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { dashboardFixture } from './fixtures/dashboard';

/**
 * Liczniki KPI pulpitu — odpowiedź `GET /api/v1/dashboard` (backend 4.6).
 *
 * Typ pochodzi z generowanego kontraktu (`DashboardStats`, ADR 0009) — nie mamy tu własnego
 * interfejsu, bo backend ma już schemat, a `src/types/api.ts` jest jedynym źródłem kształtu.
 */
export async function fetchDashboard(): Promise<DashboardStats> {
  if (shouldUseFixtures()) {
    return dashboardFixture;
  }

  return getJson<DashboardStats>('/api/v1/dashboard');
}
