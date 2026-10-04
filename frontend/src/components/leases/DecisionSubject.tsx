import { UserAvatar } from '@/components/leases/UserAvatar';
import { initialsFrom } from '@/lib/userInitials';
import type { RepositoryRead, UserRead } from '@/types/api';

export interface DecisionSubjectProps {
  user: Pick<UserRead, 'name' | 'login'>;
  repository: Pick<RepositoryRead, 'owner' | 'name'>;
}

/**
 * Kogo i czego dotyczy decyzja — najważniejsza informacja w modalu, więc większa od
 * tytułu (`text-3xl` przy `text-2xl`): imię z awatarem (jak w tabelach, bez powtórzonego loginu)
 * i repozytorium w `font-mono` w jednej linii. Za długa linia zawija się, zamiast rozpychać okno.
 */
export function DecisionSubject({ user, repository }: DecisionSubjectProps): React.JSX.Element {
  return (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-3xl leading-tight text-foreground">
      <span className="flex items-center gap-3">
        <span className="font-medium">{user.name}</span>
        <UserAvatar initials={initialsFrom(user)} login={user.login} size="lg" />
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="font-mono break-all">{`${repository.owner}/${repository.name}`}</span>
    </span>
  );
}
