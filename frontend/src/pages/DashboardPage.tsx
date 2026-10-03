import { KpiCard } from '@/components/dashboard/KpiCard';
import { WarningWindowList } from '@/components/dashboard/WarningWindowList';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/useDashboard';

const SKELETON_CARDS: readonly number[] = [0, 1, 2, 3];

/** Ładowanie pokazujemy w docelowym układzie kart (DESIGN.md §4), nigdy jako spinner. */
function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {SKELETON_CARDS.map((index: number): React.JSX.Element => (
        <Skeleton key={index} data-testid="kpi-skeleton" className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

export function DashboardPage(): React.JSX.Element {
  const { data, isError, isPending, refetch } = useDashboard();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Pulpit</h1>

      {isError ? (
        // `data-testid`, bo okno ostrzegawcze pod spodem ma własny alert z własnym „Odśwież” —
        // test musi wiedzieć, który przycisk ponawia liczniki, a który listę dostępów.
        <Alert variant="destructive" data-testid="kpi-error">
          <AlertTitle>Nie udało się pobrać liczników</AlertTitle>
          <AlertDescription>
            Sprawdź, czy backend odpowiada, a następnie spróbuj ponownie.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(): void => {
                void refetch();
              }}
            >
              Odśwież
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {isPending ? <DashboardSkeleton /> : null}

      {data === undefined ? null : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            data-testid="kpi-active"
            label="Aktywne dostępy"
            tone="ACTIVE"
            value={data.active}
            hint="Uprawnienia w mocy"
          />
          <KpiCard
            data-testid="kpi-warning"
            label="Ostrzeżenia"
            tone="WARNING"
            value={data.warning}
            hint="Wygasają w oknie ostrzegawczym"
          />
          <KpiCard
            data-testid="kpi-expired"
            label="Wygaśnięte"
            tone="EXPIRED"
            value={data.expired}
            hint={`Wygasłe w ostatnich ${String(data.expired_window_days)} dniach`}
          />
          <KpiCard
            data-testid="kpi-downscope"
            label="Rekomendacje deeskalacji"
            tone="DOWNSCOPE"
            value={data.downscope_recommendations}
            hint="Zalecana redukcja uprawnień"
          />
        </div>
      )}

      <WarningWindowList />
    </section>
  );
}
