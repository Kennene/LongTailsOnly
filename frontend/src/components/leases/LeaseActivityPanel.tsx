import { ActivityStats } from '@/components/appeals/ActivityStats';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivityStats } from '@/hooks/useActivityStats';

export interface LeaseActivityPanelProps {
  lease_id: number;
}

const STATS_ERROR_MESSAGE = 'Nie udało się pobrać statystyk użycia.';
const SKELETON_PLACEHOLDERS: number[] = [0, 1, 2];

/**
 * Dowód użycia dostępu w modalu decyzji (UC-3, `DESIGN.md` §4) — push, review i komentarze
 * z `GET /api/v1/leases/{lease_id}/activity-stats`.
 *
 * Panel należy wyłącznie do trybu zwykłej decyzji: tryb odwołania renderuje te same liczniki
 * wewnątrz `AppealContextPanel`, więc montowanie obu dałoby dwa zapytania o jeden dostęp.
 * Dlatego `DecisionModal` sięga po ten komponent tylko przy `appeal === null`.
 *
 * Liczby są danymi, nie statusem — `ActivityStats` trzyma je na tokenach neutralnych.
 */
export function LeaseActivityPanel({ lease_id }: LeaseActivityPanelProps): React.JSX.Element {
  const statsQuery = useActivityStats(lease_id);

  return (
    <section
      className="flex flex-col gap-2 border-t border-border pt-4"
      data-testid="lease-activity"
    >
      <h3 className="text-sm font-medium">Aktywność w dostępie</h3>
      {statsQuery.data !== undefined ? (
        <ActivityStats stats={statsQuery.data} />
      ) : statsQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {STATS_ERROR_MESSAGE}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2" role="status">
          <span className="sr-only">Wczytywanie statystyk aktywności…</span>
          {SKELETON_PLACEHOLDERS.map((index: number): React.JSX.Element => (
            <Skeleton
              aria-hidden="true"
              className="h-16 w-full"
              data-testid="lease-activity-skeleton"
              key={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
