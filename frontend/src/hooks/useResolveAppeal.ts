import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postResolveAppeal } from '@/api/appeals';
import type { AppealRead, DecisionRequest } from '@/types/api';

export interface ResolveAppealVariables {
  appeal_id: number;
  request: DecisionRequest;
}

/**
 * Rozpatrzenie odwołania (UC-3) — `POST /api/v1/appeals/{appeal_id}/decision`.
 *
 * Inwalidacja jest szersza niż przy decyzji o dzierżawie: rozstrzygnięcie wniosku zmienia
 * listę odwołań (status `PENDING` → `APPROVED`) **oraz** dzierżawę, liczniki dashboardu,
 * dziennik audytu i statystyki aktywności pokazywane w tym samym modalu. Klucz
 * `['activity-stats']` unieważniamy po prefiksie, więc pokrywa wszystkie dzierżawy.
 */
export function useResolveAppeal(): UseMutationResult<AppealRead, Error, ResolveAppealVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appeal_id, request }: ResolveAppealVariables) =>
      postResolveAppeal(appeal_id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      void queryClient.invalidateQueries({ queryKey: ['activity-stats'] });
    },
  });
}
