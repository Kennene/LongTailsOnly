import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { applyOnboarding } from '@/api/baseline';
import type { OnboardingProposal } from '@/types/api';

/**
 * Zatwierdzenie standardu dla nowego członka zespołu (UC-1) —
 * `POST /api/v1/onboarding/{login}/apply`.
 *
 * Po sukcesie unieważniamy propozycję (część `to_grant` przechodzi do `already_granted`), standard
 * zespołów (tabele DEV i QA), dzierżawy (backend właśnie je utworzył), liczniki dashboardu (nowe
 * dzierżawy wchodzą do KPI) i audyt (zdarzenie `BASELINE_APPLIED`) — bez tego demo pokazywałoby
 * nieaktualne dane.
 */
export function useApplyOnboarding(): UseMutationResult<OnboardingProposal, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (login: string) => applyOnboarding(login),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['baseline'] });
      void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
