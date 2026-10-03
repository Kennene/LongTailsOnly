import type { UseQueryResult } from '@tanstack/react-query';

import { BaselineTable, BaselineTableSkeleton } from '@/components/baseline/BaselineTable';
import { OnboardingCard, OnboardingCardSkeleton } from '@/components/baseline/OnboardingCard';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useTeamBaseline } from '@/hooks/useTeamBaseline';
import type { BaselineEntry, OnboardingProposal } from '@/types/api';

/**
 * Slugi zespołów pochodzą z `shared/fixtures/teams.json` (i seedu backendu), a login z kroku demo
 * `nowy-dev` — scenariusz D z ADR 0008: osoba bez żadnego dostępu, więc standard DEV jest jedynym
 * źródłem propozycji dostępu.
 */
const DEV_TEAM_SLUG = 'dev';
const QA_TEAM_SLUG = 'qa';
const DEMO_ONBOARDING_LOGIN = 'nowy-dev';

interface BaselineTeamSectionProps {
  section_slug: string;
  title: string;
  result: UseQueryResult<BaselineEntry[]>;
}

/**
 * Sekcja jednego zespołu: stan błędu (komunikat + „Odśwież”) i gotowy standard. Ładowanie
 * obsługuje strona, żeby wszystkie sekcje pojawiały się w jednym momencie.
 */
function BaselineTeamSection({
  section_slug,
  title,
  result,
}: BaselineTeamSectionProps): React.JSX.Element {
  const { data, isError, error, refetch } = result;
  const headingId = `baseline-${section_slug}-heading`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="font-heading text-lg font-medium">
        {title}
      </h2>
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
      {data ? <BaselineTable entries={data} /> : null}
    </section>
  );
}

interface OnboardingSectionProps {
  result: UseQueryResult<OnboardingProposal>;
}

/** Karta onboardingu nowego członka (UC-1) z własnym stanem błędu i akcją ponowienia odczytu. */
function OnboardingSection({ result }: OnboardingSectionProps): React.JSX.Element {
  const { data, isError, error, refetch } = result;

  return (
    <section aria-labelledby="baseline-onboarding-heading" className="flex flex-col gap-4">
      <h2 id="baseline-onboarding-heading" className="font-heading text-lg font-medium">
        Onboarding nowego członka
      </h2>
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się pobrać propozycji onboardingu</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Odśwież
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {data ? <OnboardingCard proposal={data} /> : null}
    </section>
  );
}

/**
 * Widok `/baseline` (UC-1): standard zespołu DEV i QA oraz onboarding nowego członka. Wszystko
 * widać naraz, bo administrator porównuje zespoły między sobą i od razu wie, co zatwierdza
 * (spec §7.5 opisuje ten widok wprost jako „sekcje DEV i QA”).
 *
 * Czekamy na wszystkie trzy odczyty i dopiero wtedy pokazujemy sekcje (DESIGN §5: bez choreografii
 * wejścia, konsola ładuje się w zadanie). Dzięki temu układ nie „doskakuje”, a testy nie ścigają
 * się z siecią: nagłówki i tabele są w DOM w tym samym renderze.
 */
export function BaselinePage(): React.JSX.Element {
  const dev = useTeamBaseline(DEV_TEAM_SLUG);
  const qa = useTeamBaseline(QA_TEAM_SLUG);
  const onboarding = useOnboarding(DEMO_ONBOARDING_LOGIN);
  const isPending = dev.isPending || qa.isPending || onboarding.isPending;

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
          <OnboardingCardSkeleton />
        </div>
      ) : (
        <>
          <BaselineTeamSection section_slug={DEV_TEAM_SLUG} title="Zespół DEV" result={dev} />
          <BaselineTeamSection section_slug={QA_TEAM_SLUG} title="Zespół QA" result={qa} />
          <OnboardingSection result={onboarding} />
        </>
      )}
    </section>
  );
}
