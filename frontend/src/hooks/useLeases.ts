import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchLeases } from '@/api/leases';
import type { LeaseOverview } from '@/types/api';

export function useLeases(): UseQueryResult<LeaseOverview[]> {
  return useQuery({ queryKey: ['leases'], queryFn: fetchLeases });
}
