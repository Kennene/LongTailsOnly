import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { DecisionModal } from '@/components/leases/DecisionModal';
import { LeaseTable } from '@/components/leases/LeaseTable';
import { TeamChip } from '@/components/leases/TeamChip';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeases } from '@/hooks/useLeases';
import type { LeaseOverview } from '@/types/api';

const SKELETON_ROWS: number[] = [0, 1, 2, 3];

export function LeasesPage(): React.JSX.Element {
  const leasesQuery: UseQueryResult<LeaseOverview[]> = useLeases();
  const [selectedLease, setSelectedLease] = useState<LeaseOverview | null>(null);

  function handleOpenChange(open: boolean): void {
    if (!open) {
      setSelectedLease(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Dostępy</h1>
      <LeaseInventory query={leasesQuery} onDecide={setSelectedLease} />
      <DecisionModal
        lease={selectedLease}
        open={selectedLease !== null}
        onOpenChange={handleOpenChange}
      />
    </section>
  );
}

interface LeaseInventoryProps {
  query: UseQueryResult<LeaseOverview[]>;
  onDecide: (lease: LeaseOverview) => void;
}

/** Trzy stany widoku: szkielet w układzie docelowym, błąd z „Odśwież”, pustka w tabeli. */
function LeaseInventory({ query, onDecide }: LeaseInventoryProps): React.JSX.Element {
  const [teamFilter, setTeamFilter] = useState<TeamFilter>(TEAM_FILTER_ALL);

  if (query.isPending) {
    return <LeaseTableSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Nie udało się pobrać dostępów</AlertTitle>
        <AlertDescription>Serwer nie odpowiedział. Spróbuj ponownie.</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Odśwież
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const visibleLeases: LeaseOverview[] = query.data.filter(
    (lease: LeaseOverview): boolean =>
      teamFilter === TEAM_FILTER_ALL || (lease.user.team?.name ?? TEAM_FILTER_NONE) === teamFilter,
  );

  return (
    <div className="flex flex-col gap-3">
      <TeamFilterRow
        leases={query.data}
        selected={teamFilter}
        onSelect={(team: TeamFilter): void => setTeamFilter(team)}
      />
      <LeaseTable leases={visibleLeases} onDecide={onDecide} />
    </div>
  );
}

/** Chip zespołu spoza kontraktu: użytkownik bez `team` też zasługuje na własną grupę. */
const TEAM_FILTER_NONE = 'Bez zespołu';

/** „Wszystkie” jako `symbol`, żeby nie zderzyło się z nazwą zespołu z GitHuba. */
const TEAM_FILTER_ALL: unique symbol = Symbol('all teams');

type TeamFilter = string | typeof TEAM_FILTER_ALL;

/** Etykieta chipu dla wartości filtra; przy „Wszystkie” etykieta jest osobna. */
const TEAM_FILTER_ALL_LABEL = 'Wszystkie';

interface TeamFilterRowProps {
  leases: LeaseOverview[];
  selected: TeamFilter;
  onSelect: (team: TeamFilter) => void;
}

/**
 * Grupowanie po zespole jako filtr, a nie jako druga oś sortowania: tabela zostaje płaska
 * i posortowana po pilności (wygasłe → ostrzeżenia → aktywne), a administrator zawęża ją do
 * jednego zespołu świadomie. Lista chipów powstaje z **danych**, nie z zamkniętej listy — gdy
 * backend doda zespół, chip pojawi się sam. Wybór jedzie w `aria-pressed` (`TeamChip`), więc
 * stanu nie niesie kolor (`DESIGN.md` §6).
 *
 * Dlatego nie ma tu osobnego stanu pustego „brak dostępów w tym zespole”: każdy chip pochodzi
 * z tych samych wierszy, które filtruje, więc wybrany zespół zawsze ma co najmniej jedną
 * dostęp. Filtr nie może opróżnić tabeli — a gdyby kiedyś mógł (reset demo, przebudowa
 * inwentarza), chip wybranego zespołu zostaje na miejscu, więc jest czym wrócić do „Wszystkie”.
 */
function TeamFilterRow({ leases, selected, onSelect }: TeamFilterRowProps): React.JSX.Element {
  const teamOptions: string[] = [
    ...new Set([
      ...leases.map((lease: LeaseOverview): string => lease.user.team?.name ?? TEAM_FILTER_NONE),
      // Wybrany zespół zostaje na liście także wtedy, gdy zniknął z danych (reset demo, podróż
      // w czasie). Inaczej chip przepada razem z wyborem i nie ma czym wrócić do „Wszystkie”.
      ...(selected === TEAM_FILTER_ALL ? [] : [selected]),
    ]),
  ].toSorted((left: string, right: string): number => left.localeCompare(right));

  return (
    <div
      role="group"
      aria-label="Filtr zespołu"
      className="flex flex-wrap items-center gap-1.5 px-2 py-2"
    >
      <TeamChip
        label={TEAM_FILTER_ALL_LABEL}
        selected={selected === TEAM_FILTER_ALL}
        onClick={() => onSelect(TEAM_FILTER_ALL)}
      />
      {teamOptions.map((team: string): React.JSX.Element => (
        <TeamChip
          key={team}
          label={team}
          selected={selected === team}
          onClick={() => onSelect(team)}
        />
      ))}
    </div>
  );
}

function LeaseTableSkeleton(): React.JSX.Element {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Wczytywanie dostępów…</span>
      <Skeleton aria-hidden className="h-10 w-full" />
      {SKELETON_ROWS.map((row: number): React.JSX.Element => (
        <Skeleton key={row} aria-hidden className="h-9 w-full" />
      ))}
    </div>
  );
}
