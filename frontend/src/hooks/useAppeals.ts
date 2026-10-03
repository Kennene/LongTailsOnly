import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type AppealsQuery, fetchAppeals } from '@/api/appeals';
import type { AppealOverview } from '@/types/api';

/**
 * Lista odwołań wprost z `GET /api/v1/appeals` — **goła tablica** `AppealOverview`, bez koperty.
 *
 * Filtr wchodzi do klucza zapytania, więc lista całego panelu (`{}`) i historia pojedynczej
 * dzierżawy (`{ lease_id }`) to osobne wpisy cache; inwalidacja po prefiksie `['appeals']`
 * pokrywa oba.
 */
export function useAppeals(query: AppealsQuery = {}): UseQueryResult<AppealOverview[]> {
  return useQuery({
    queryKey: ['appeals', query],
    queryFn: () => fetchAppeals(query),
  });
}
