import { UserAvatar } from '@/components/leases/UserAvatar';
import { initialsFrom } from '@/lib/userInitials';
import type { RepositoryRead, UserRead } from '@/types/api';

export interface DecisionSubjectProps {
  user: Pick<UserRead, 'name' | 'login'>;
  repository: Pick<RepositoryRead, 'owner' | 'name'>;
}

/**
 * Kogo i czego dotyczy decyzja — najważniejsza informacja w modalu, więc dwa razy większa od
 * tytułu (`text-5xl` przy `text-2xl`): imię z awatarem (jak w tabelach, bez powtórzonego loginu),
 * a pod nim repozytorium w `font-mono`. Długa nazwa repozytorium łamie się, zamiast rozpychać okno.
 */
export function DecisionSubject({ user, repository }: DecisionSubjectProps): React.JSX.Element {
  return (
    <span className="flex flex-col items-center gap-2 text-5xl leading-tight text-foreground">
      <span className="flex items-center gap-3">
        <span className="font-medium">{user.name}</span>
        <UserAvatar initials={initialsFrom(user)} login={user.login} size="xl" />
      </span>
      <span className="font-mono break-all">{`${repository.owner}/${repository.name}`}</span>
    </span>
  );
}
