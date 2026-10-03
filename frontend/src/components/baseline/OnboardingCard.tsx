import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { useApplyOnboarding } from '@/hooks/useApplyOnboarding';
import { getRoleLabel } from '@/lib/statusBadges';
import type { BaselineEntry, OnboardingProposal } from '@/types/api';

export interface OnboardingCardProps {
  proposal: OnboardingProposal;
}

interface EntriesTableProps {
  label: string;
  entries: BaselineEntry[];
  empty_message: string;
}

/**
 * Lista wpisów standardu: repozytorium i rola z `getRoleLabel` (jedno źródło etykiet ról).
 * Pustą listę tłumaczymy zdaniem, a nie pustą tabelą — administrator ma wiedzieć, dlaczego
 * nic tu nie ma (ADR 0011 §5.2: `apply` jest idempotentne, więc drugie kliknięcie nie ma czego nadać).
 */
function EntriesTable({ label, entries, empty_message }: EntriesTableProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{label}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty_message}</p>
      ) : (
        <Table aria-label={label}>
          <TableHeader>
            <TableRow>
              <TableHead>Repozytorium</TableHead>
              <TableHead>Rola</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.repository.id}>
                <TableCell className="font-mono">
                  {entry.repository.owner}/{entry.repository.name}
                </TableCell>
                <TableCell>{getRoleLabel(entry.proposed_role)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Onboarding nowego członka zespołu jednym kliknięciem (UC-1): co zatwierdzenie standardu nada
 * (`to_grant`), a co osoba już ma (`already_granted`). Sukces potwierdza toast, błąd pokazujemy
 * w miejscu akcji, żeby administrator nie musiał zgadywać, czy standard został nadany.
 */
export function OnboardingCard({ proposal }: OnboardingCardProps): React.JSX.Element {
  const apply = useApplyOnboarding();

  function handleApply(): void {
    apply.mutate(proposal.user.login, {
      onSuccess: () => toast.success('Standard zatwierdzony'),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {proposal.user.name} ({proposal.user.login})
        </CardTitle>
        <CardDescription>
          Nowy członek zespołu {proposal.team.name}. Zatwierdzenie standardu nada dostęp zgodny z
          propozycjami powyżej — bez ręcznego konfigurowania każdego repozytorium.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <EntriesTable
          label="Do nadania"
          entries={proposal.to_grant}
          empty_message="Standard zespołu jest już nadany — nie ma nic do zatwierdzenia."
        />
        <EntriesTable
          label="Już nadane"
          entries={proposal.already_granted}
          empty_message="Brak nadanych dostępów z tego standardu."
        />
        {proposal.to_grant.length === 0 ? null : (
          <Button
            type="button"
            className="self-start"
            disabled={apply.isPending}
            onClick={handleApply}
          >
            Zatwierdź standard
          </Button>
        )}
        {apply.error === null ? null : (
          <Alert variant="destructive">
            <AlertTitle>Nie udało się zatwierdzić standardu</AlertTitle>
            <AlertDescription>{apply.error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/** Szkielet karty onboardingu — strona pokazuje go w układzie docelowym razem z tabelami. */
export function OnboardingCardSkeleton(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-96" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-40" />
      </CardContent>
    </Card>
  );
}
