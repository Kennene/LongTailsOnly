import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchLeases } from '@/api/leases';
import { useActiveService } from '@/services/ServicesContext';
import type { LeaseOverview } from '@/types/api';

/**
 * Lista dzierżaw **aktywnej usługi** — prefiks `['leases', <id usługi>]` trzyma integracje
 * w osobnych wpisach cache, więc przełączenie usługi w pickerze nie pokazuje cudzych dzierżaw.
 *
 * `enabled: !isPending` jest istotne, nie kosmetyczne: dopóki katalog jest w drodze,
 * `activeService.id` to `''`, więc bez tej bramki każde wejście na stronę strzelałoby dwa razy —
 * raz w namespace „brak usługi”, raz we właściwy — a pierwsza odpowiedź zdążyłaby namalować
 * tabelę, którą zmiana klucza zaraz zastępuje.
 */
export function useLeases(): UseQueryResult<LeaseOverview[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['leases', activeService.id],
    queryFn: fetchLeases,
    enabled: !isPending && activeService.id !== '',
  });
}
