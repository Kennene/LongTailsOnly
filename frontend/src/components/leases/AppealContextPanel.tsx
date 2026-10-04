import { ActivityStats } from '@/components/appeals/ActivityStats';
import { AppealHistory } from '@/components/appeals/AppealHistory';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivityStats } from '@/hooks/useActivityStats';
import { useAppeals } from '@/hooks/useAppeals';
import type { AppealOverview } from '@/types/api';

export interface AppealContextPanelProps {
  appeal: AppealOverview;
}

/**
 * Kontekst odwołania w modalu decyzji (UC-3): uzasadnienie wniosku, dowód użycia dostępu i historia
 * odwołań. Renderowany wyłącznie w trybie odwołania, więc zapytania o historię i statystyki startują
 * dopiero, gdy administrator kliknie „Rozpatrz” — zwykła decyzja o dostępie nie płaci za te żądania.
 *
 * Historia bierze filtr `lease_id` wprost z `GET /api/v1/appeals` (backend filtruje po stronie
 * bazy), a statystyki z `GET /api/v1/leases/{lease_id}/activity-stats`.
 *
 * Kolejność idzie za wagą przy decyzji: najpierw **co osoba pisze**, potem **czy faktycznie używa
 * dostępu**, a historia — rzadziej potrzebna — jest zwinięta w `<details>`. Osoba i repozytorium
 * **nie** są tu powtarzane: niesie je nagłówek modala.
 */
export function AppealContextPanel({ appeal }: AppealContextPanelProps): React.JSX.Element {
  const appealsQuery = useAppeals({ lease_id: appeal.lease_id });
  const statsQuery = useActivityStats(appeal.lease_id);
  const history: AppealOverview[] = appealsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">Uzasadnienie odwołania</h3>
        <blockquote
          className="max-w-prose border-l-2 border-border pl-3 text-sm break-words"
          data-testid="appeal-justification"
        >
          {appeal.justification}
        </blockquote>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">Aktywność w dostępie</h3>
        <div data-testid="appeal-activity">
          {statsQuery.data === undefined ? (
            <div className="flex gap-4" role="status">
              <span className="sr-only">Wczytywanie statystyk aktywności…</span>
              {[0, 1, 2].map((index: number): React.JSX.Element => (
                <Skeleton aria-hidden="true" className="h-5 w-16" key={index} />
              ))}
            </div>
          ) : (
            <ActivityStats stats={statsQuery.data} />
          )}
        </div>
      </section>

      <details className="group text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
          Historia odwołań
        </summary>
        <div className="mt-2">
          {appealsQuery.isPending ? (
            <div className="flex flex-col gap-2" role="status">
              <span className="sr-only">Wczytywanie historii odwołań…</span>
              <Skeleton aria-hidden="true" className="h-10 w-full" />
            </div>
          ) : (
            <div data-testid="appeal-history">
              <AppealHistory appeals={history} />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
