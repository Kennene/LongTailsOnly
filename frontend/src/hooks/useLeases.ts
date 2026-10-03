import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchLeases } from '@/api/leases';
import { useActiveService } from '@/services/ServicesContext';
import type { LeaseOverview } from '@/types/api';

/**
 * Lista dzierżaw **aktywnej usługi** — prefiks `['leases', <id usługi>]` trzyma integracje
 * w osobnych wpisach cache, więc przełączenie usługi w pickerze nie pokazuje cudzych dzierżaw.
 *
 * `enabled` jest istotne, nie kosmetyczne: dopóki katalog jest w drodze, `activeService.id` to
 * `''`, więc bez tej bramki każde wejście na stronę strzelałoby dwa razy — raz w namespace „brak
 * usługi”, raz we właściwy — a pierwsza odpowiedź zdążyłaby namalować tabelę, którą zmiana klucza
 * zaraz zastępuje. Gdy katalog **padnie** i żadnego identyfikatora nie ma, jest tak samo: nie ma
 * usługi, której można by przypisać dane (Ruling 28). Gdy identyfikator jest — potwierdzony
 * katalogiem, odtworzony z rejestru po zapisanym wyborze albo wybrany w oknie błędu (Ruling 25) —
 * pytamy, bo wiemy, o którą usługę chodzi.
 */
export function useLeases(): UseQueryResult<LeaseOverview[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['leases', activeService.id],
    queryFn: fetchLeases,
    enabled: !isPending && activeService.id !== '',
  });
}
