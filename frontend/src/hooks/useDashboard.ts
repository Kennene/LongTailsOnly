import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchDashboard } from '@/api/dashboard';
import type { DashboardStats } from '@/types/api';

/**
 * Liczniki KPI pulpitu — `GET /api/v1/dashboard/stats` (jedno żądanie, cała dziewiątka pól).
 *
 * Backend liczy je sam (`insights_service.get_dashboard_stats`), więc klucz `['dashboard']`
 * unieważniamy po każdej zmianie, która może ruszyć liczniki: decyzji o dzierżawie, rozstrzygnięciu
 * odwołania, onboardingu i podróży w czasie.
 */
export function useDashboard(): UseQueryResult<DashboardStats> {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
}
