import { useState } from 'react';
import { toast } from 'sonner';

import { AppealForm } from '@/components/appeals/AppealForm';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppeals } from '@/hooks/useAppeals';
import { useLeases } from '@/hooks/useLeases';
import { useSubmitAppeal } from '@/hooks/useSubmitAppeal';
import { formatDateTimePl, formatDaysRemaining } from '@/lib/dateTime';
import { getAppealStatusBadge, getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import type { AppealRead, LeaseOverview } from '@/types/api';

const APPEALS_LIST_HEADING_ID = 'appeals-submitted-heading';

interface LeaseCandidatesTableProps {
  leases: LeaseOverview[];
}

/** Dzierżawy, które podlegają odwołaniu: okno ostrzegawcze (`WARNING`) i wygasłe (`EXPIRED`). */
function LeaseCandidatesTable({ leases }: LeaseCandidatesTableProps): React.JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Osoba</TableHead>
          <TableHead>Repozytorium</TableHead>
          <TableHead>Poziom</TableHead>
          <TableHead>Pozostało</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leases.map((lease: LeaseOverview): React.JSX.Element => {
          const badge = getStatusBadge(lease.status);

          return (
            <TableRow key={lease.id}>
              <TableCell className="font-medium">{lease.user.name}</TableCell>
              <TableCell className="font-mono text-xs">{lease.repository.name}</TableCell>
              <TableCell>{getRoleLabel(lease.current_role)}</TableCell>
              <TableCell>{formatDaysRemaining(lease.days_remaining)}</TableCell>
              <TableCell>
                <Badge className={badge.className} variant="outline">
                  {badge.label}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

interface AppealListItemProps {
  appeal: AppealRead;
  lease: LeaseOverview | undefined;
  onResolve: (appeal: AppealRead) => void;
}

/**
 * `AppealRead` niesie tylko `user_id` i `lease_id`, więc osobę i repozytorium bierzemy
 * z listy dzierżaw; gdy dzierżawy nie ma na liście, pokazujemy identyfikatory z kontraktu.
 */
function AppealListItem({ appeal, lease, onResolve }: AppealListItemProps): React.JSX.Element {
  const badge = getAppealStatusBadge(appeal.status);
  const person: string = lease === undefined ? `Użytkownik #${appeal.user_id}` : lease.user.name;
  const repository: string =
    lease === undefined ? `Repozytorium #${appeal.repo_id}` : lease.repository.name;

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge className={badge.className} variant="outline">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {badge.label}
        </Badge>
        <span className="text-sm font-medium">{person}</span>
        <span className="font-mono text-xs text-muted-foreground">{repository}</span>
        <span className="text-xs text-muted-foreground">{getRoleLabel(appeal.requested_role)}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatDateTimePl(appeal.created_at)}
        </span>
      </div>
      <p className="max-w-prose text-sm break-words">{appeal.justification}</p>
      {appeal.status === 'PENDING' ? (
        // Bez dzierżawy na liście nie ma kontekstu dla modala (nagłówek czyta z `lease`),
        // więc przycisk zostaje wyłączony z wyjaśnieniem zamiast otwierać pusty modal.
        <Button
          // Etykieta dostępna tylko w stanie wyłączonym: w normalnym trybie nazwą przycisku
          // zostaje widoczne „Rozpatrz”, żeby nie dublować treści dla czytnika ekranu.
          aria-label={lease === undefined ? 'Rozpatrz (brak dzierżawy na liście)' : undefined}
          className="self-start"
          disabled={lease === undefined}
          onClick={() => onResolve(appeal)}
          size="sm"
          title={
            lease === undefined
              ? 'Odwołanie wskazuje dzierżawę spoza listy — brak kontekstu do decyzji.'
              : undefined
          }
          type="button"
          variant="outline"
        >
          Rozpatrz
        </Button>
      ) : null}
    </li>
  );
}

export function AppealsPage(): React.JSX.Element {
  const leasesQuery = useLeases();
  const appealsQuery = useAppeals();
  const submitAppeal = useSubmitAppeal();
  const [selectedAppeal, setSelectedAppeal] = useState<AppealRead | null>(null);

  const leases: LeaseOverview[] = leasesQuery.data ?? [];
  const candidates: LeaseOverview[] = leases.filter(
    (lease: LeaseOverview): boolean => lease.status !== 'ACTIVE',
  );
  const appeals: AppealRead[] = appealsQuery.data?.appeals ?? [];

  function handleSubmit(lease_id: number, justification: string): void {
    submitAppeal.mutate(
      { lease_id, justification },
      {
        onSuccess: (): void => {
          toast.success('Odwołanie złożone');
        },
      },
    );
  }

  function findLease(lease_id: number): LeaseOverview | undefined {
    return leases.find((lease: LeaseOverview): boolean => lease.id === lease_id);
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Odwołania</h1>
        <p className="text-sm text-muted-foreground">
          Każde odwołanie wymaga nowego uzasadnienia biznesowego — decyzję podejmuje administrator
          (celowe tarcie procesowe, ADR 0005).
        </p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Dzierżawy wymagające uwagi</CardTitle>
          <CardDescription>
            Tylko dzierżawy wygasające i wygasłe mogą zostać przedłużone w drodze odwołania.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leasesQuery.isPending ? <Skeleton className="h-24 w-full" /> : null}

          {leasesQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się pobrać dzierżaw</AlertTitle>
              <AlertDescription>{leasesQuery.error?.message ?? 'Nieznany błąd'}</AlertDescription>
              <AlertAction>
                <Button onClick={() => void leasesQuery.refetch()} size="sm" variant="outline">
                  Odśwież
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {leasesQuery.isSuccess && candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak dzierżaw w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.
            </p>
          ) : null}

          {leasesQuery.isSuccess && candidates.length > 0 ? (
            <LeaseCandidatesTable leases={candidates} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Nowe odwołanie</CardTitle>
          <CardDescription>Uzasadnienie jest wymagane i nie może się powtarzać.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {leasesQuery.isPending ? <Skeleton className="h-24 w-full" /> : null}

          {leasesQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Formularz pojawi się, gdy lista dzierżaw zostanie pobrana.
            </p>
          ) : null}

          {leasesQuery.isSuccess && candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nie ma czego przedłużać — żadna dzierżawa nie jest w oknie ostrzegawczym.
            </p>
          ) : null}

          {leasesQuery.isSuccess && candidates.length > 0 ? (
            // `key` resetuje wybór dzierżawy, gdy kandydaci się zmienią (np. po przedłużeniu
            // albo resecie scenariusza) — inaczej formularz wysłałby nieaktualne `lease_id`.
            <AppealForm
              isSubmitting={submitAppeal.isPending}
              key={candidates.map((lease: LeaseOverview): number => lease.id).join('-')}
              leases={candidates}
              onSubmit={handleSubmit}
            />
          ) : null}

          {submitAppeal.error === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się złożyć odwołania</AlertTitle>
              <AlertDescription>{submitAppeal.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle id={APPEALS_LIST_HEADING_ID}>Złożone odwołania</CardTitle>
          <CardDescription>
            Najnowsze pierwsze; pozycje oczekujące czekają na decyzję.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {appealsQuery.isPending ? <Skeleton className="h-20 w-full" /> : null}

          {appealsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się pobrać odwołań</AlertTitle>
              <AlertDescription>{appealsQuery.error?.message ?? 'Nieznany błąd'}</AlertDescription>
              <AlertAction>
                <Button onClick={() => void appealsQuery.refetch()} size="sm" variant="outline">
                  Odśwież
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {appealsQuery.isSuccess && appeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak złożonych odwołań — wybierz dzierżawę powyżej i uzasadnij wniosek.
            </p>
          ) : null}

          {appealsQuery.isSuccess && appeals.length > 0 ? (
            <ul aria-labelledby={APPEALS_LIST_HEADING_ID} className="flex flex-col">
              {appeals.map((appeal: AppealRead): React.JSX.Element => (
                <AppealListItem
                  appeal={appeal}
                  key={appeal.id}
                  lease={findLease(appeal.lease_id)}
                  onResolve={setSelectedAppeal}
                />
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <DecisionModal
        appeal={selectedAppeal}
        lease={selectedAppeal === null ? null : (findLease(selectedAppeal.lease_id) ?? null)}
        onOpenChange={(open: boolean): void => {
          if (!open) {
            setSelectedAppeal(null);
          }
        }}
        open={selectedAppeal !== null}
      />
    </section>
  );
}
