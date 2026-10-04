import { UserAvatar } from '@/components/leases/UserAvatar';
import { initialsFrom } from '@/lib/userInitials';
import type { RepositoryRead, UserRead } from '@/types/api';

export interface DecisionSubjectProps {
  user: Pick<UserRead, 'name' | 'login'>;
  repository: Pick<RepositoryRead, 'owner' | 'name'>;
}

/**
 * Kogo i czego dotyczy decyzja — jedna linia pod tytułem modala: imię z awatarem (jak w tabelach,
 * bez powtórzonego loginu) i repozytorium w `font-mono`.
 */
export function DecisionSubject({ user, repository }: DecisionSubjectProps): React.JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-foreground">{user.name}</span>
        <UserAvatar initials={initialsFrom(user)} login={user.login} />
      </span>
      <span aria-hidden="true">·</span>
      <span className="font-mono text-foreground">{`${repository.owner}/${repository.name}`}</span>
    </span>
  );
}
