import type { UseQueryResult } from '@tanstack/react-query';

import type { BaselineResponse } from '@/api/baseline';
import { BaselineApproval } from '@/components/baseline/BaselineApproval';
import { BaselineTable, BaselineTableSkeleton } from '@/components/baseline/BaselineTable';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useBaseline } from '@/hooks/useBaseline';

interface BaselineTeamSectionProps {
  title: string;
  result: UseQueryResult<BaselineResponse>;
}

/**
 * Sekcja jednego zespołu: stan błędu (komunikat + „Odśwież”) i gotowy standard. Ładowanie
 * obsługuje strona, żeby obie sekcje pojawiały się w jednym momencie.
 */
function BaselineTeamSection({ title, result }: BaselineTeamSectionProps): React.JSX.Element {
  const { data, isError, error, refetch } = result;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-medium">{title}</h2>
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się pobrać standardu zespołu</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Odśwież
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {data ? (
        <>
          <BaselineTable response={data} />
          <BaselineApproval team_slug={data.team.slug} members={data.new_members} />
        </>
      ) : null}
    </section>
  );
}

/**
 * Widok `/baseline` (UC-1): standard zespołu DEV i QA. Oba zespoły widać naraz, bo administrator
 * porównuje je między sobą, a spec §7.5 opisuje ten widok wprost jako „sekcje DEV i QA”.
 *
 * Czekamy na oba odczyty i dopiero wtedy pokazujemy sekcje (DESIGN §5: bez choreografii wejścia,
 * konsola ładuje się w zadanie). Dzięki temu układ nie „doskakuje”, a testy nie ścigają się
 * z siecią: nagłówek i tabela zespołu są w DOM w tym samym renderze.
 */
export function BaselinePage(): React.JSX.Element {
  const dev = useBaseline('dev');
  const qa = useBaseline('qa');
  const isPending = dev.isPending || qa.isPending;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Standard zespołu</h1>
        <p className="text-sm text-muted-foreground">
          Propozycje dostępu wyliczone z aktywności zespołu w ostatnich 30 dniach. Uprawnienie{' '}
          <span className="font-mono">admin</span> nigdy nie wchodzi do standardu automatycznie.
        </p>
      </header>
      {isPending ? (
        <div role="status" aria-label="Ładowanie standardu zespołu" className="flex flex-col gap-8">
          <BaselineTableSkeleton />
          <BaselineTableSkeleton />
        </div>
      ) : (
        <>
          <BaselineTeamSection title="Zespół DEV" result={dev} />
          <BaselineTeamSection title="Zespół QA" result={qa} />
        </>
      )}
    </section>
  );
}
