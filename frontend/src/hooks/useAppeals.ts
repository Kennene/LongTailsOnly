import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type AppealsQuery, fetchAppeals } from '@/api/appeals';
import { useActiveService } from '@/services/ServicesContext';
import type { AppealOverview } from '@/types/api';

/**
 * Lista odwołań wprost z `GET /api/v1/appeals` — **goła tablica** `AppealOverview`, bez koperty.
 *
 * Filtr wchodzi do klucza zapytania, więc lista całego panelu (`{}`) i historia pojedynczej
 * dzierżawy (`{ lease_id }`) to osobne wpisy cache; inwalidacja po prefiksie
 * `['appeals', <id usługi>]` pokrywa oba.
 *
 * `enabled` — patrz `useLeases`: bramka nie pyta o dane, dopóki nie ma identyfikatora usługi,
 * której można by je przypisać.
 */
export function useAppeals(query: AppealsQuery = {}): UseQueryResult<AppealOverview[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['appeals', activeService.id, query],
    queryFn: () => fetchAppeals(query),
    enabled: !isPending && activeService.id !== '',
  });
}
