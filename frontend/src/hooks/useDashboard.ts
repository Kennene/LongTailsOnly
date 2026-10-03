import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchDashboard } from '@/api/dashboard';
import type { DashboardStats } from '@/types/api';

export function useDashboard(): UseQueryResult<DashboardStats> {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
}
