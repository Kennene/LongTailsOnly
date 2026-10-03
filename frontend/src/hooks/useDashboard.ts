import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type DashboardCounters, fetchDashboard } from '@/api/dashboard';

export function useDashboard(): UseQueryResult<DashboardCounters> {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
}
