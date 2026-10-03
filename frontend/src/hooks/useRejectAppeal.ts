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
 * To alternatywa dla rozstrzygnięcia decyzją o dzierżawie (`useDecideAppeal`): odrzucenie zamyka
 * wniosek i **nie dotyka dzierżawy**, więc unieważnia tylko listę odwołań, licznik
 * `pending_appeals` pulpitu i dziennik audytu (`APPEAL_REJECTED`). Dzierżaw ani statystyk
 * aktywności modala nie ruszamy — nic w nich nie zaszło.
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
