import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { DecisionModal } from '@/components/leases/DecisionModal';
import { LeaseTable } from '@/components/leases/LeaseTable';
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
      <h1 className="text-2xl font-semibold tracking-tight">Dzierżawy</h1>
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
  if (query.isPending) {
    return <LeaseTableSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Nie udało się pobrać dzierżaw</AlertTitle>
        <AlertDescription>Serwer nie odpowiedział. Spróbuj ponownie.</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Odśwież
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  return <LeaseTable leases={query.data} onDecide={onDecide} />;
}

function LeaseTableSkeleton(): React.JSX.Element {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Wczytywanie dzierżaw…</span>
      <Skeleton aria-hidden className="h-10 w-full" />
      {SKELETON_ROWS.map((row: number): React.JSX.Element => (
        <Skeleton key={row} aria-hidden className="h-9 w-full" />
      ))}
    </div>
  );
}
