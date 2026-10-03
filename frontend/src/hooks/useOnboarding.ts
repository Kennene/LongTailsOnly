import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchOnboarding } from '@/api/baseline';
import { useActiveService } from '@/services/ServicesContext';
import type { OnboardingProposal } from '@/types/api';

/**
 * Propozycja onboardingu (`GET /api/v1/onboarding/{login}`) — karta nowego członka na `/baseline`.
 *
 * `enabled: !isPending` — patrz `useLeases`: bramka trzyma odczyt poza namespace „brak usługi”.
 */
export function useOnboarding(login: string): UseQueryResult<OnboardingProposal> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['onboarding', activeService.id, login],
    queryFn: () => fetchOnboarding(login),
    enabled: !isPending,
  });
}
