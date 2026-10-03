import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchClock } from '@/api/simulation';
import type { ClockRead } from '@/types/api';

/** Czas symulowany z backendu — jedyne źródło „teraz” w aplikacji. */
export function useSimulatedClock(): UseQueryResult<ClockRead> {
  return useQuery({ queryKey: ['clock'], queryFn: fetchClock });
}
