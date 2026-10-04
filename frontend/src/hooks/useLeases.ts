import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchLeases } from '@/api/leases';
import { useActiveService } from '@/services/ServicesContext';
import type { LeaseOverview } from '@/types/api';

/**
 * Lista dostępów **aktywnej usługi** — prefiks `['leases', <id usługi>]` trzyma integracje
 * w osobnych wpisach cache, więc przełączenie usługi w pickerze nie pokazuje cudzych dostępów.
 *
 * `enabled` jest istotne, nie kosmetyczne i ma pin w `useServiceScopedGates.test.tsx`: milczący
 * katalog rozstrzyga się z rejestru frontendu (spec §5.2), więc `activeService.id` jest **niepuste**
 * już w trakcie oczekiwania — z zapisanym wyborem albo, gdy go nie ma, z domyślnym `github`. Bez
 * `!isPending` każde wejście na stronę strzelałoby więc przed potwierdzeniem katalogu, a odpowiedź
 * zdążyłaby namalować tabelę, którą zmiana klucza zaraz zastępuje (Ruling 28a). Druga połowa bramki
 * (`id !== ''`) obejmuje katalog, który osiadł **pusty**: jest wypowiedzią, więc nie ma usługi,
 * której można by przypisać dane. Gdy katalog **padnie**, bramka się otwiera — nie wypowie się już
 * w tej sesji, więc rejestr jest jedynym autorytetem i dane domyślnego `github` (albo usługi wybranej
 * w tym oknie — Ruling 25) są lepsze niż pusta powłoka (Ruling 35).
 */
export function useLeases(): UseQueryResult<LeaseOverview[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['leases', activeService.id],
    queryFn: fetchLeases,
    enabled: !isPending && activeService.id !== '',
  });
}
