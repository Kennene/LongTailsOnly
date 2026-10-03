import { AppealStatusBadge } from '@/components/appeals/AppealStatusBadge';
import { Button } from '@/components/ui/button';
import { formatDateTimePl, formatDaysRemaining } from '@/lib/dateTime';
import { getRoleLabel } from '@/lib/statusBadges';
import type { AppealOverview } from '@/types/api';

export interface AppealListItemProps {
  appeal: AppealOverview;
  onResolve: (appeal: AppealOverview) => void;
}

/**
 * `AppealOverview` niesie osobę, repozytorium i pozostałe dni, więc lista **nie** łączy się
 * z `useLeases()` — działa też, gdy dostępu spoza okna ostrzegawczego nie ma na liście.
 * Jedynym naprawdę zerowym polem jest `days_remaining` (dla nieaktywnego dostępu) i to ono
 * ma zapasową kreskę w `formatDaysRemaining`.
 */
export function AppealListItem({ appeal, onResolve }: AppealListItemProps): React.JSX.Element {
  const days: string = appeal.lease_is_active
    ? formatDaysRemaining(appeal.days_remaining)
    : 'Dostęp nieaktywny';

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AppealStatusBadge status={appeal.status} />
        <span className="text-sm font-medium">{appeal.user.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{appeal.repository.name}</span>
        <span className="text-xs text-muted-foreground">{`Wniosek: ${getRoleLabel(
          appeal.requested_role,
        )}`}</span>
        <span className="text-xs text-muted-foreground">{`W dostępie: ${getRoleLabel(
          appeal.lease_role,
        )}`}</span>
        <span className="text-xs text-muted-foreground">{days}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatDateTimePl(appeal.created_at)}
        </span>
      </div>
      <p className="max-w-prose text-sm break-words">{appeal.justification}</p>
      {appeal.status === 'PENDING' ? (
        <Button
          className="self-start"
          onClick={() => onResolve(appeal)}
          size="sm"
          type="button"
          variant="outline"
        >
          Rozpatrz
        </Button>
      ) : null}
    </li>
  );
}
