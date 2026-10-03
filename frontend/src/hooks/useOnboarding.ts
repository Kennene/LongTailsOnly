import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchOnboarding } from '@/api/baseline';
import type { OnboardingProposal } from '@/types/api';

/** Propozycja onboardingu (`GET /api/v1/onboarding/{login}`) — karta nowego członka na `/baseline`. */
export function useOnboarding(login: string): UseQueryResult<OnboardingProposal> {
  return useQuery({
    queryKey: ['onboarding', login],
    queryFn: () => fetchOnboarding(login),
  });
}
