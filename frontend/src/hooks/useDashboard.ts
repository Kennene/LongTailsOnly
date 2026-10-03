import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchDashboard } from '@/api/dashboard';
import type { DashboardStats } from '@/types/api';

/**
 * Liczniki KPI pulpitu (`fetchDashboard`, krok 4.6B podmieni je na `GET /api/v1/dashboard/stats`).
 *
 * Do czasu 4.6B liczniki powstają po stronie frontendu z listy dostępów, zegara i odwołań
 * (patrz `api/dashboard.ts`), więc klucz `['dashboard']` unieważniany po decyzji, odwołaniu,
 * onboardingu i podróży w czasie odświeża całą trójkę odczytów.
 */
export function useDashboard(): UseQueryResult<DashboardStats> {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
}
