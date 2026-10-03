import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchServices } from '@/api/services';
import type { ServiceRead } from '@/types/api';

export function useServices(): UseQueryResult<ServiceRead[]> {
  return useQuery({ queryKey: ['services'], queryFn: fetchServices });
}
