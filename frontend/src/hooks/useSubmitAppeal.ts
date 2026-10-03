import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postAppeal } from '@/api/appeals';
import type { AppealCreate, AppealOverview } from '@/types/api';

/**
 * Złożenie odwołania (UC-3) — `POST /api/v1/appeals` odpowiada `201` i zwraca `AppealOverview`
 * nowego wniosku (z osobą i repozytorium), więc lista nie musi dopytywać o nic więcej.
 *
 * Inwalidujemy trzy rzeczy: listę odwołań, licznik `pending_appeals` dashboardu i dziennik
 * audytu (backend dopisuje tam `APPEAL_SUBMITTED`). Dzierżawy **nie** ruszamy — złożenie
 * wniosku nic w niej nie zmienia.
 */
export function useSubmitAppeal(): UseMutationResult<AppealOverview, Error, AppealCreate> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appeal: AppealCreate) => postAppeal(appeal.lease_id, appeal.justification),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
