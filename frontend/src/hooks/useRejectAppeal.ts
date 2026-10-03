import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { rejectAppeal } from '@/api/appeals';
import type { AppealOverview } from '@/types/api';

export interface RejectAppealVariables {
  appeal_id: number;
  /** Uzasadnienie odrzucenia jest wymagane (ADR 0005) — backend odrzuca puste pole kodem 422. */
  justification: string;
}

/**
 * Odrzucenie odwołania (UC-3) — `POST /api/v1/appeals/{appeal_id}/reject`.
 *
 * To jedyna droga rozstrzygnięcia wniosku, jaką ma dziś backend: zatwierdzenie wymagałoby
 * decyzji o dzierżawie (3.6/5.5), której jeszcze nie ma. Odrzucenie zmienia listę odwołań,
 * licznik `pending_appeals` dashboardu i dziennik audytu (`APPEAL_REJECTED`); dzierżawy
 * zostawiamy w spokoju, bo odrzucenie wniosku jej nie modyfikuje.
 */
export function useRejectAppeal(): UseMutationResult<AppealOverview, Error, RejectAppealVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appeal_id, justification }: RejectAppealVariables) =>
      rejectAppeal(appeal_id, justification),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
