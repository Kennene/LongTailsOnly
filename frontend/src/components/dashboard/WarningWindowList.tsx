import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeases } from '@/hooks/useLeases';
import { formatDaysRemaining } from '@/lib/dateTime';
import type { LeaseOverview } from '@/types/api';

const EMPTY_WARNING_WINDOW =
  'Brak dostępów w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.';

const SKELETON_ROWS: readonly number[] = [0, 1];

/**
 * Sekcja pulpitu pod kartami KPI: dostępy w oknie ostrzegawczym, czyli te, które wymagają
 * decyzji, zanim uprawnienia wygasną. Gęsta lista wierszy (`h-9`) zamiast drugiej tabeli —
 * DESIGN.md §4 zakazuje stawiania kart w kartach i rozdymania pulpitu.
 *
 * Wiersz jest linkiem do `/leases` (tam zapada decyzja), więc cała lista prowadzi do jednego
 * miejsca akcji. Status bierzemy z `LeaseStatusBadge` (jedno mapowanie status → kolor),
 * a pozostały czas z `formatDaysRemaining` — nic nie formatujemy lokalnie.
 */
export function WarningWindowList(): React.JSX.Element {
  const leasesQuery: UseQueryResult<LeaseOverview[]> = useLeases();
  const leases: LeaseOverview[] = leasesQuery.data ?? [];
  const warnings: LeaseOverview[] = leases
    .filter((lease: LeaseOverview): boolean => lease.status === 'WARNING')
    .toSorted(compareDaysRemaining);

  return (
    <Card data-testid="warning-window">
      <CardHeader className="border-b">
        <CardTitle>W oknie ostrzegawczym</CardTitle>
        <CardDescription>
          Dostępy wygasające w oknie ostrzegawczym — wymagają decyzji administratora.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {leasesQuery.isPending ? <WarningWindowSkeleton /> : null}

        {leasesQuery.isError ? (
          <Alert variant="destructive" className="mx-4">
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

        {leasesQuery.isSuccess && warnings.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{EMPTY_WARNING_WINDOW}</p>
        ) : null}

        {leasesQuery.isSuccess && warnings.length > 0 ? (
          <ul className="divide-y divide-border">
            {warnings.map((lease: LeaseOverview): React.JSX.Element => (
              <li key={lease.id}>
                {/* Od `sm` wiersz ma stałe 36 px; na wąskim ekranie termin i status schodzą do
                    drugiej linii, zamiast ściskać nazwę i repozytorium do zera (`truncate`). */}
                <Link
                  to="/leases"
                  className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:h-9 sm:flex-nowrap sm:py-0"
                >
                  <span className="shrink-0 font-medium">{lease.user.name}</span>
                  <span className="min-w-0 truncate font-mono text-muted-foreground">
                    {`${lease.repository.owner}/${lease.repository.name}`}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatDaysRemaining(lease.days_remaining)}
                    </span>
                    <LeaseStatusBadge status={lease.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
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

/** Najpilniejsze najpierw — dostęp z najmniejszym `days_remaining` wymaga decyzji pierwszy. */
function compareDaysRemaining(a: LeaseOverview, b: LeaseOverview): number {
  return (a.days_remaining ?? 0) - (b.days_remaining ?? 0);
}
