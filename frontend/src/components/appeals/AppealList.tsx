import type { AppealGroup } from '@/components/appeals/appealGroups';
import { groupAppealsByUser } from '@/components/appeals/appealGroups';
import { ExpandAllButton, ExpandToggle } from '@/components/common/ExpandToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ExpandedSet, useExpandedSet } from '@/hooks/useExpandedSet';
import { formatDateTimePl, formatDaysRemaining } from '@/lib/dateTime';
import { formatCountPl } from '@/lib/grouping';
import { getAppealStatusBadge, getRoleLabel } from '@/lib/statusBadges';
import type { AppealOverview } from '@/types/api';

export interface AppealListProps {
  appeals: AppealOverview[];
  /** `id` nagłówka karty — lista jest nim podpisana (`aria-labelledby`). */
  labelledBy: string;
  onResolve: (appeal: AppealOverview) => void;
}

/**
 * Złożone odwołania pogrupowane po osobie: wiersz osoby z liczbą wniosków i oczekujących,
 * a pod nim — po rozwinięciu — każdy wniosek z uzasadnieniem i akcją „Rozpatrz”.
 */
export function AppealList({ appeals, labelledBy, onResolve }: AppealListProps): React.JSX.Element {
  const expanded: ExpandedSet<number> = useExpandedSet<number>();
  const groups: AppealGroup[] = groupAppealsByUser(appeals);
  const userIds: number[] = groups.map((group: AppealGroup): number => group.user.id);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ExpandAllButton
          allExpanded={expanded.areAllExpanded(userIds)}
          onToggleAll={() => expanded.toggleAll(userIds)}
        />
      </div>
      <ul aria-labelledby={labelledBy} className="flex flex-col divide-y divide-border">
        {groups.map((group: AppealGroup): React.JSX.Element => (
          <AppealGroupItem
            key={group.user.id}
            group={group}
            expanded={expanded.isExpanded(group.user.id)}
            onToggle={() => expanded.toggle(group.user.id)}
            onResolve={onResolve}
          />
        ))}
      </ul>
    </div>
  );
}

interface AppealGroupItemProps {
  group: AppealGroup;
  expanded: boolean;
  onToggle: () => void;
  onResolve: (appeal: AppealOverview) => void;
}

function AppealGroupItem({
  group,
  expanded,
  onToggle,
  onResolve,
}: AppealGroupItemProps): React.JSX.Element {
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ExpandToggle
          expanded={expanded}
          onToggle={onToggle}
          subject="odwołania"
          owner={group.user.name}
        />
        <span className="text-sm font-medium">{group.user.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatCountPl(group.appeals.length, {
            one: 'odwołanie',
            few: 'odwołania',
            many: 'odwołań',
          })}
        </span>
        {group.pendingCount === 0 ? null : (
          <span className="text-xs font-medium">
            {formatCountPl(group.pendingCount, {
              one: 'oczekujące',
              few: 'oczekujące',
              many: 'oczekujących',
            })}
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatDateTimePl(group.latestAt)}
        </span>
      </div>
      {expanded ? (
        <ul className="mt-1 flex flex-col border-l border-border pl-8">
          {group.appeals.map((appeal: AppealOverview): React.JSX.Element => (
            <AppealListItem appeal={appeal} key={appeal.id} onResolve={onResolve} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface AppealListItemProps {
  appeal: AppealOverview;
  onResolve: (appeal: AppealOverview) => void;
}

/**
 * `AppealOverview` niesie osobę, repozytorium i pozostałe dni, więc lista **nie** łączy się
 * z `useLeases()` — działa też, gdy dostępu spoza okna ostrzegawczego nie ma na liście.
 * Jedynym naprawdę zerowym polem jest `days_remaining` (dla nieaktywnego dostępu) i to ono
 * ma zapasową kreskę w `formatDaysRemaining`. Osobę pokazuje wiersz grupy wyżej.
 */
function AppealListItem({ appeal, onResolve }: AppealListItemProps): React.JSX.Element {
  const badge = getAppealStatusBadge(appeal.status);
  const days: string = appeal.lease_is_active
    ? formatDaysRemaining(appeal.days_remaining)
    : 'Dostęp nieaktywny';

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge className={badge.className} variant="outline">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {badge.label}
        </Badge>
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
