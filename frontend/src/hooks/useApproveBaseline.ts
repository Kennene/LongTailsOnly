import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postApproveBaseline } from '@/api/baseline';

export interface ApproveBaselineVariables {
  team_slug: string;
  user_login: string;
}

/**
 * Zatwierdzenie standardu dla nowego członka zespołu (UC-1).
 *
 * Po sukcesie unieważniamy standard (nowy członek znika z listy), dzierżawy (backend właśnie
 * je utworzył) i audyt (nowe zdarzenie) — bez tego demo pokazywałoby nieaktualne dane.
 */
export function useApproveBaseline(): UseMutationResult<void, Error, ApproveBaselineVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ team_slug, user_login }: ApproveBaselineVariables) =>
      postApproveBaseline(team_slug, user_login),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['baseline'] });
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
