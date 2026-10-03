import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { type AuditActorFilter, AuditFilters } from '@/components/audit/AuditFilters';
import { AuditLogTable, AuditLogTableSkeleton } from '@/components/audit/AuditLogTable';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { AuditEntry } from '@/types/api';

const EMPTY_LOG = 'Brak zdarzeń w dzienniku';
const EMPTY_FILTER = 'Brak zdarzeń dla wybranego filtra';

/**
 * Widok `/audit` (spec §7.7): dziennik zdarzeń z filtrem aktora po stronie klienta.
 *
 * Dziennik jest tylko do odczytu — jedyne akcje to zmiana filtra i ponowienie odczytu, więc
 * widok jest samodzielny i nie zależy od pozostałych stron.
 */
export function AuditPage(): React.JSX.Element {
  const auditQuery: UseQueryResult<AuditEntry[]> = useAuditLog();
  const [actorType, setActorType] = useState<AuditActorFilter>('ALL');

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audyt</h1>
        <p className="text-sm text-muted-foreground">
          Każda zmiana dostępu zostawia wpis: kto, co i dlaczego. Wpisy aktora SYSTEM powstają bez
          udziału człowieka — z harmonogramu i okna ostrzegawczego.
        </p>
      </header>
      <AuditFilters actorType={actorType} onChange={setActorType} />
      <AuditLog query={auditQuery} actorType={actorType} />
    </section>
  );
}

interface AuditLogProps {
  query: UseQueryResult<AuditEntry[]>;
  actorType: AuditActorFilter;
}

/** Trzy stany widoku: szkielet w układzie docelowym, błąd z „Odśwież”, pustka zamiast tabeli. */
function AuditLog({ query, actorType }: AuditLogProps): React.JSX.Element {
  if (query.isPending) {
    return <AuditLogTableSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Nie udało się pobrać dziennika audytu</AlertTitle>
        <AlertDescription>{query.error?.message}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Odśwież
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const allEntries: AuditEntry[] = query.data;
  const entries: AuditEntry[] = filterByActor(allEntries, actorType);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {allEntries.length === 0 ? EMPTY_LOG : EMPTY_FILTER}
      </p>
    );
  }

  return <AuditLogTable entries={entries} />;
}

/** Filtr działa na tym, co już pobrane — dziennik jednego demo jest krótki. */
function filterByActor(entries: AuditEntry[], actorType: AuditActorFilter): AuditEntry[] {
  if (actorType === 'ALL') {
    return entries;
  }

  return entries.filter((entry: AuditEntry): boolean => entry.actor_type === actorType);
}
