import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ExpandAllButton, ExpandToggle } from '@/components/common/ExpandToggle';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import { formatRepositoryCount, groupLeasesByUser } from '@/components/leases/leaseGroups';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { UserAvatar } from '@/components/leases/UserAvatar';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type ExpandedSet, useExpandedSet } from '@/hooks/useExpandedSet';
import { useLeases } from '@/hooks/useLeases';
import { formatDaysRemaining } from '@/lib/dateTime';
import { initialsFrom } from '@/lib/userInitials';
import type { LeaseOverview } from '@/types/api';

const EMPTY_WARNING_WINDOW =
  'Brak dostępów w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.';

const SKELETON_ROWS: readonly number[] = [0, 1];

/**
 * Sekcja pulpitu pod kartami KPI: dostępy w oknie ostrzegawczym, czyli te, które wymagają
 * decyzji, zanim uprawnienia wygasną. Gęsta lista wierszy (`h-9`) zamiast drugiej tabeli —
 * DESIGN.md §4 zakazuje stawiania kart w kartach i rozdymania pulpitu.
 *
 * Jak w tabeli dostępów: jedna pozycja na osobę (najpilniejszy termin, bez statusu), a jej
 * repozytoria rozwijają się pod nią. Wiersz repozytorium jest linkiem do `/leases` (tam zapada
 * decyzja). Status bierzemy z `LeaseStatusBadge`, a pozostały czas z `formatDaysRemaining`.
 */
export function WarningWindowList(): React.JSX.Element {
  const leasesQuery: UseQueryResult<LeaseOverview[]> = useLeases();
  const expanded: ExpandedSet<number> = useExpandedSet<number>();
  const leases: LeaseOverview[] = leasesQuery.data ?? [];
  const groups: LeaseGroup[] = groupLeasesByUser(
    leases.filter((lease: LeaseOverview): boolean => lease.status === 'WARNING'),
  );
  const userIds: number[] = groups.map((group: LeaseGroup): number => group.user.id);

  return (
    <Card data-testid="warning-window" className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle>W oknie ostrzegawczym</CardTitle>
        <CardDescription>
          Dostępy wygasające w oknie ostrzegawczym — wymagają decyzji administratora.
        </CardDescription>
        {leasesQuery.isSuccess && groups.length > 0 ? (
          <CardAction>
            <ExpandAllButton
              allExpanded={expanded.areAllExpanded(userIds)}
              onToggleAll={() => expanded.toggleAll(userIds)}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {leasesQuery.isPending ? <WarningWindowSkeleton /> : null}

        {leasesQuery.isError ? (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertTitle>Nie udało się pobrać dostępów</AlertTitle>
            <AlertDescription>
              Liczniki powyżej nadal obowiązują. Spróbuj ponownie odczytać listę.
            </AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => void leasesQuery.refetch()}>
                Odśwież
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {leasesQuery.isSuccess && groups.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{EMPTY_WARNING_WINDOW}</p>
        ) : null}

        {leasesQuery.isSuccess && groups.length > 0 ? (
          <ul className="divide-y divide-border">
            {groups.map((group: LeaseGroup): React.JSX.Element => (
              <WarningGroup
                key={group.user.id}
                group={group}
                expanded={expanded.isExpanded(group.user.id)}
                onToggle={() => expanded.toggle(group.user.id)}
              />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface WarningGroupProps {
  group: LeaseGroup;
  expanded: boolean;
  onToggle: () => void;
}

/** Osoba: nazwa, liczba repozytoriów i najpilniejszy termin; po rozwinięciu jej repozytoria. */
function WarningGroup({ group, expanded, onToggle }: WarningGroupProps): React.JSX.Element {
  return (
    <li>
      {/* Poza tabelą przełącza tylko przycisk ze strzałką: `div` z `onClick` nie jest dostępny
          z klawiatury (jsx-a11y), a stan i tak niesie `aria-expanded`. */}
      <div className="flex h-9 items-center gap-3 px-4 text-sm">
        <ExpandToggle
          expanded={expanded}
          onToggle={onToggle}
          subject="dostępy"
          owner={group.user.name}
        />
        <span className="truncate font-medium">{group.user.name}</span>
        <UserAvatar initials={initialsFrom(group.user)} login={group.user.login} />
        <span className="truncate text-muted-foreground">
          {formatRepositoryCount(group.leases.length)}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {formatDaysRemaining(group.mostUrgent.days_remaining)}
        </span>
      </div>
      {expanded ? (
        <ul className="divide-y divide-border border-t bg-muted/20">
          {group.leases.map((lease: LeaseOverview): React.JSX.Element => (
            <li key={lease.id}>
              <Link
                to="/leases"
                className="flex h-9 items-center gap-3 pr-4 pl-14 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="truncate font-mono text-muted-foreground">
                  {`${lease.repository.owner}/${lease.repository.name}`}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatDaysRemaining(lease.days_remaining)}
                </span>
                <LeaseStatusBadge status={lease.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Szkielet w układzie docelowym listy — pulpitu nie pokazujemy jako spinnera (DESIGN.md §4). */
function WarningWindowSkeleton(): React.JSX.Element {
  return (
    <div role="status" data-testid="warning-window-skeleton" className="flex flex-col gap-2 p-4">
      <span className="sr-only">Wczytywanie dostępów w oknie ostrzegawczym…</span>
      {SKELETON_ROWS.map((row: number): React.JSX.Element => (
        <Skeleton key={row} aria-hidden className="h-9 w-full" />
      ))}
    </div>
  );
}
