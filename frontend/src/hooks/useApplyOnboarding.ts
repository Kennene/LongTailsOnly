import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { applyOnboarding } from '@/api/baseline';
import { useActiveService } from '@/services/ServicesContext';
import type { OnboardingProposal } from '@/types/api';

/**
 * Zatwierdzenie standardu dla nowego członka zespołu (UC-1) —
 * `POST /api/v1/onboarding/{login}/apply`.
 *
 * Po sukcesie unieważniamy propozycję (część `to_grant` przechodzi do `already_granted`), standard
 * zespołów (tabele DEV i QA), dostępy (backend właśnie je utworzył), liczniki dashboardu (nowe
 * dostępy wchodzą do KPI) i audyt (zdarzenie `BASELINE_APPLIED`) — bez tego demo pokazywałoby
 * nieaktualne dane. Każdy prefiks niesie id **aktywnej usługi**, bo tylko ona ma te dane w cache.
 */
export function useApplyOnboarding(): UseMutationResult<OnboardingProposal, Error, string> {
  const queryClient = useQueryClient();
  const { activeService } = useActiveService();

  return useMutation({
    mutationFn: (login: string) => applyOnboarding(login),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['baseline', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['onboarding', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['leases', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['audit', activeService.id] });
    },
  });
}
