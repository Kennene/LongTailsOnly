import { ActivityStats } from '@/components/appeals/ActivityStats';
import { AppealHistory } from '@/components/appeals/AppealHistory';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivityStats } from '@/hooks/useActivityStats';
import { useAppeals } from '@/hooks/useAppeals';
import type { AppealRead } from '@/types/api';

export interface AppealContextPanelProps {
  appeal: AppealRead;
}

/**
 * Kontekst odwołania w modalu decyzji (UC-3, zadanie 11): uzasadnienie wniosku, historia
 * odwołań tej dzierżawy i statystyki jej użycia. Renderowany wyłącznie w trybie odwołania,
 * więc zapytania o historię i statystyki startują dopiero, gdy administrator kliknie
 * „Rozpatrz” — zwykła decyzja o dzierżawie nie płaci za te żądania.
 *
 * Historia pochodzi z pełnej listy `GET /api/v1/appeals` filtrowanej po `lease_id`
 * (kontrakt 1.2 nie ma jeszcze historii per dzierżawa — spec §5, krok backendu 4.4),
 * a statystyki z `GET /api/v1/leases/{lease_id}/activity-stats`.
 *
 * Osoba i repozytorium **nie** są tu powtarzane: nagłówek modala bierze je z propa `lease`
 * (`AppealRead` niesie tylko `user_id` i `repo_id`).
 */
export function AppealContextPanel({ appeal }: AppealContextPanelProps): React.JSX.Element {
  const appealsQuery = useAppeals();
  const statsQuery = useActivityStats(appeal.lease_id);
  const history: AppealRead[] =
    appealsQuery.data?.appeals.filter(
      (candidate: AppealRead): boolean => candidate.lease_id === appeal.lease_id,
    ) ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">Uzasadnienie odwołania</h3>
      <p className="max-w-prose text-sm break-words" data-testid="appeal-justification">
        {appeal.justification}
      </p>

      <h4 className="text-sm font-medium text-muted-foreground">Historia odwołań</h4>
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

      <h4 className="text-sm font-medium text-muted-foreground">Aktywność w dzierżawie</h4>
      <div data-testid="appeal-activity">
        {statsQuery.data === undefined ? (
          <div className="grid grid-cols-3 gap-2" role="status">
            <span className="sr-only">Wczytywanie statystyk aktywności…</span>
            {[0, 1, 2].map((index: number): React.JSX.Element => (
              <Skeleton aria-hidden="true" className="h-16 w-full" key={index} />
            ))}
          </div>
        ) : (
          <ActivityStats stats={statsQuery.data} />
        )}
      </div>
    </section>
  );
}
