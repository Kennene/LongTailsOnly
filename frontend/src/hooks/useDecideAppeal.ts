import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postAppealDecision } from '@/api/appeals';
import type { AppealOverview, DecisionRequest } from '@/types/api';

export interface DecideAppealVariables {
  appeal_id: number;
  /** `EXTEND` (z `extension`) zatwierdza wniosek, `DOWNSCOPE`/`REVOKE` zamykają go odrzuceniem. */
  request: DecisionRequest;
}

/**
 * Rozstrzygnięcie odwołania decyzją o dostępie (UC-3) —
 * `POST /api/v1/appeals/{appeal_id}/decision`.
 *
 * Decyzja zmienia **dwie** rzeczy naraz: dostęp z odwołania (przedłużenie, deeskalacja albo
 * odebranie dostępu) i sam wniosek (`APPROVED`/`REJECTED`, `resolved_at`). Unieważniamy więc
 * wszystko, co jedno z drugim łączy: listę odwołań, dostępy, licznik `pending_appeals` pulpitu,
 * dziennik audytu (`LEASE_EXTENDED`/`LEASE_DOWNSCOPED`/`LEASE_REVOKED` + zamknięcie wniosku),
 * statystyki aktywności modala oraz graf, którego krawędzie niosą status dostępu (spec §7.3).
 */
export function useDecideAppeal(): UseMutationResult<AppealOverview, Error, DecideAppealVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appeal_id, request }: DecideAppealVariables) =>
      postAppealDecision(appeal_id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      void queryClient.invalidateQueries({ queryKey: ['activity-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['graph'] });
    },
  });
}
