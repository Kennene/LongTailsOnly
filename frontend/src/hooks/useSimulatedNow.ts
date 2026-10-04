import { useSimulatedClock } from '@/hooks/useSimulatedClock';

/**
 * Czas symulowany jako ISO albo `null`, dopóki zegar się nie wczyta — podstawa „X dni temu”
 * w całej aplikacji. Wszystkie wywołania dzielą jeden wpis cache `['clock']`.
 */
export function useSimulatedNow(): string | null {
  return useSimulatedClock().data?.now ?? null;
}
