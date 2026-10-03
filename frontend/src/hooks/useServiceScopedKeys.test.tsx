import { type Query, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppealsQuery } from '@/api/appeals';
import { leasesFixture } from '@/api/fixtures';
import { servicesFixture } from '@/api/fixtures/services';
import { useActivityStats } from '@/hooks/useActivityStats';
import { useAppeals } from '@/hooks/useAppeals';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useDashboard } from '@/hooks/useDashboard';
import { useGraph } from '@/hooks/useGraph';
import { useLeaseDecision } from '@/hooks/useLeaseDecision';
import { useLeases } from '@/hooks/useLeases';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useServices } from '@/hooks/useServices';
import { useSimulatedClock } from '@/hooks/useSimulatedClock';
import { useSubmitAppeal } from '@/hooks/useSubmitAppeal';
import { useTeamBaseline } from '@/hooks/useTeamBaseline';
import { useActiveService } from '@/services/ServicesContext';
import { resetAppealsMswState } from '@/test/msw/domains/appeals';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ServiceSwitcherProbe } from '@/test/serviceProbe';

/**
 * Cache TanStack Query jest namespace'owany **po usłudze**: `[<zasób>, <id usługi>, ...]`.
 * Ten plik pinuje obie strony tego kontraktu, bo rozjazd między nimi jest cichy:
 *
 * - **czytający** buduje klucz z `useActiveService()`,
 * - **unieważniający** (mutacje) musi trafić dokładnie w ten sam prefiks.
 *
 * Dopóki drugi element klucza był obiektem (`['appeals', query]`), unieważnienie
 * `['appeals', 'github']` **nie** dopasowałoby go (dopasowanie prefiksu porównuje elementy),
 * a mutacja nadal kończyłaby się sukcesem — widok po prostu zostałby z nieświeżymi danymi.
 * Dlatego obok czytników stoją tu asercje na prefiksy inwalidacji.
 *
 * Granica tego mechanizmu, zmierzona a nie założona: **goły** prefiks (`['appeals']`) czytelnika
 * z id **nie** gubi — dopasowanie po prefiksie go łapie — więc brak namespace'u w inwalidacji nie
 * jest cichym błędem, tylko niepotrzebnym unieważnieniem danych wszystkich usług. Cichy jest
 * rozjazd **drugiego elementu** (`['appeals', 'github']` kontra `['appeals', { lease_id }]`) i to
 * jego pinują asercje niżej.
 *
 * `['clock']` i `['services']` zostają **globalne**: zegar symulowany i katalog usług nie należą
 * do żadnej usługi (katalog wręcz ją wyznacza), a `useDemoReset`/`useTimeTravel` unieważniają
 * cały cache, co obejmuje wszystkie namespace'y.
 */
const STORAGE_KEY = 'lease-governor.service';
const DEMO_TRACKER = 'demo-tracker';
const GITHUB = 'github';
const LEASE_ID = 1;
const TEAM_SLUG = 'dev';
const ONBOARDING_LOGIN = 'nowy-dev';
const JUSTIFICATION = 'Prowadzę release v2.1 w przyszłym tygodniu';
const SUBMIT_APPEAL_LABEL = 'Złóż odwołanie';
const DECIDE_LABEL = 'Rozstrzygnij';

function cachedKeys(queryClient: QueryClient): QueryKey[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((query: Query): QueryKey => query.queryKey);
}

/** Sonda czytnika dzierżaw — jedyny zasób, którego klucz był dotąd goły. */
function LeasesProbe(): React.JSX.Element {
  useLeases();

  return <span data-testid="leases-probe" />;
}

/** Sonda zegara symulowanego — klucz globalny, więc `renderWithProviders` wystarcza. */
function ClockProbe(): React.JSX.Element {
  useSimulatedClock();

  return <span data-testid="clock-probe" />;
}

/** Sonda katalogu usług — drugi klucz, który **musi** zostać globalny. */
function ServicesProbe(): React.JSX.Element {
  useServices();

  return <span data-testid="services-probe" />;
}

/**
 * Sonda odwołań z filtrem: to jedyny czytnik, którego drugi element klucza jest **obiektem**,
 * więc pominięcie go przy namespace'owaniu psuje dopasowanie prefiksu inwalidacji.
 */
function AppealsProbe({ query }: { query: AppealsQuery }): React.JSX.Element {
  useAppeals(query);

  return <span data-testid="appeals-probe" />;
}

/**
 * Sonda pozostałych czytników: pinuje kształt klucza każdego z nich w jednym montażu, żeby
 * „przeoczenie jednego hooka przy namespace'owaniu” miało test, a nie tylko przegląd kodu.
 */
function AllReadersProbe(): React.JSX.Element {
  useDashboard();
  useGraph();
  useAuditLog();
  useActivityStats(LEASE_ID);
  useTeamBaseline(TEAM_SLUG);
  useOnboarding(ONBOARDING_LOGIN);

  return <span data-testid="all-readers-probe" />;
}

/**
 * Sonda stanu katalogu — pozwala poczekać na **osiadły** błąd, zamiast zgadywać, czy żądanie
 * katalogu już się rozstrzygnęło.
 */
function CatalogErrorProbe(): React.JSX.Element {
  const { isError } = useActiveService();

  return <span data-testid="catalog-error">{String(isError)}</span>;
}

function SubmitAppealProbe(): React.JSX.Element {
  const submitAppeal = useSubmitAppeal();

  return (
    <button
      type="button"
      onClick={() => submitAppeal.mutate({ lease_id: LEASE_ID, justification: JUSTIFICATION })}
    >
      {SUBMIT_APPEAL_LABEL}
    </button>
  );
}

function DecisionProbe(): React.JSX.Element {
  const decision = useLeaseDecision();

  return (
    <button
      type="button"
      onClick={() =>
        decision.mutate({
          lease_id: LEASE_ID,
          request: { action: 'DOWNSCOPE', justification: JUSTIFICATION },
        })
      }
    >
      {DECIDE_LABEL}
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetAppealsMswState();
});

describe('service-scoped query keys', () => {
  it('namespaces the leases key by the active service', async () => {
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<LeasesProbe />);

    await waitFor(() => {
      expect(cachedKeys(queryClient)).toContainEqual(['leases', DEMO_TRACKER]);
    });
  });

  it('namespaces the filtered appeals key by the active service', async () => {
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<AppealsProbe query={{ lease_id: LEASE_ID }} />);

    await waitFor(() => {
      expect(cachedKeys(queryClient)).toContainEqual([
        'appeals',
        DEMO_TRACKER,
        { lease_id: LEASE_ID },
      ]);
    });
  });

  it('namespaces every remaining reader key by the active service', async () => {
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<AllReadersProbe />);

    await waitFor(() => {
      expect(cachedKeys(queryClient)).toContainEqual(['dashboard', DEMO_TRACKER]);
    });
    expect(cachedKeys(queryClient)).toContainEqual(['graph', DEMO_TRACKER]);
    expect(cachedKeys(queryClient)).toContainEqual(['audit', DEMO_TRACKER]);
    expect(cachedKeys(queryClient)).toContainEqual(['activity-stats', DEMO_TRACKER, LEASE_ID]);
    expect(cachedKeys(queryClient)).toContainEqual(['baseline', DEMO_TRACKER, TEAM_SLUG]);
    expect(cachedKeys(queryClient)).toContainEqual(['onboarding', DEMO_TRACKER, ONBOARDING_LOGIN]);
  });

  it('does not request data in the placeholder namespace while the catalog is pending', async () => {
    // Katalog bez zapisu w `localStorage`: rejestr frontendu rozstrzyga go na `github` już
    // w trakcie oczekiwania, więc klucz czytnika to od pierwszego renderu `['leases', 'github']` —
    // ale pozostaje bezczynny, dopóki katalog się nie rozstrzygnie (spec §5.2, Ruling 28a).
    const requestedLeaseUrls: string[] = [];
    server.use(
      http.get('/api/v1/leases', ({ request }) => {
        requestedLeaseUrls.push(request.url);
        return HttpResponse.json(leasesFixture);
      }),
      http.get('/api/v1/services', async () => {
        await delay(50);
        return HttpResponse.json(servicesFixture);
      }),
    );

    const { queryClient } = renderWithProviders(<LeasesProbe />);

    // Klucz powstaje (budujemy go zawsze z `activeService.id`), ale żądanie nie wychodzi: poszłoby
    // pod usługę, której katalog jeszcze nie potwierdził, a jego odpowiedź zdążyłaby namalować
    // tabelę, którą zmiana klucza zaraz zastępuje.
    expect(cachedKeys(queryClient)).toContainEqual(['leases', GITHUB]);
    expect(requestedLeaseUrls).toEqual([]);

    // Dokładnie jedno żądanie i dopiero po rozstrzygnięciu katalogu.
    await waitFor(() => {
      expect(requestedLeaseUrls).toHaveLength(1);
    });
    expect(cachedKeys(queryClient)).toContainEqual(['leases', GITHUB]);
  });

  it('never asks for data in the unattributed namespace when the catalog fails', async () => {
    // Ruling 35: katalog, który padł, milczy — więc rozstrzyga rejestr frontendu i usługą jest
    // domyślny `github`. Czytnik pobiera dane raz, w namespace tej usługi; namespace `''`
    // („brak usługi”) nie powstaje wcale.
    const requestedLeaseUrls: string[] = [];
    server.use(
      http.get('/api/v1/leases', ({ request }) => {
        requestedLeaseUrls.push(request.url);
        return HttpResponse.json(leasesFixture);
      }),
      http.get('/api/v1/services', () =>
        HttpResponse.json({ detail: 'Katalog niedostępny' }, { status: 500 }),
      ),
    );

    const { queryClient } = renderWithProviders(
      <>
        <CatalogErrorProbe />
        <LeasesProbe />
      </>,
    );

    // Kluczowy warunek tego testu: czekamy na **osiadły** błąd katalogu. Bez tego asercje
    // przechodzą na stanie „katalog w drodze” i nie mówią nic o oknie błędu.
    await waitFor(() => {
      expect(screen.getByTestId('catalog-error')).toHaveTextContent('true');
    });
    await waitFor(() => {
      expect(requestedLeaseUrls).toHaveLength(1);
    });

    expect(cachedKeys(queryClient)).toContainEqual(['leases', GITHUB]);
    expect(cachedKeys(queryClient)).not.toContainEqual(['leases', '']);
  });

  it('still loads the service the user picks while the catalog is down', async () => {
    // Ruling 25: wybór przyjęty w oknie błędu katalogu ma **zadziałać** — także dla danych.
    // Ten test jest granicą Ruling 28: bramka oparta na `isError` blokowałaby nie tylko namespace
    // `''`, ale i realny identyfikator, który użytkownik właśnie wybrał.
    const user = userEvent.setup();
    const requestedLeaseUrls: string[] = [];
    server.use(
      http.get('/api/v1/leases', ({ request }) => {
        requestedLeaseUrls.push(request.url);
        return HttpResponse.json(leasesFixture);
      }),
      http.get('/api/v1/services', () =>
        HttpResponse.json({ detail: 'Katalog niedostępny' }, { status: 500 }),
      ),
    );

    const { queryClient } = renderWithProviders(
      <>
        <CatalogErrorProbe />
        <ServiceSwitcherProbe />
        <LeasesProbe />
      </>,
    );

    // Klikamy **po** osiadłym błędzie katalogu — inaczej test nie odróżniłby bramki
    // „katalog w drodze” od „katalog padł”.
    await waitFor(() => {
      expect(screen.getByTestId('catalog-error')).toHaveTextContent('true');
    });

    // Milczący katalog rozstrzygnął się na domyślnym `github`, więc jedno żądanie już poszło
    // (Ruling 35). Liczymy **przyrost** po kliknięciu, żeby ten test nadal pytał wyłącznie o wybór.
    const beforePick = requestedLeaseUrls.length;

    await user.click(screen.getByRole('button', { name: 'Przełącz na demo-tracker' }));

    await waitFor(() => {
      expect(requestedLeaseUrls).toHaveLength(beforePick + 1);
    });
    expect(cachedKeys(queryClient)).toContainEqual(['leases', DEMO_TRACKER]);
  });

  it('keeps the clock key global', async () => {
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<ClockProbe />);

    await waitFor(() => {
      expect(cachedKeys(queryClient)).toContainEqual(['clock']);
    });

    // Zegar symulowany nie należy do usługi — prefiks byłby regresją.
    expect(cachedKeys(queryClient)).not.toContainEqual(['clock', DEMO_TRACKER]);
  });

  it('keeps the services catalog key global', async () => {
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<ServicesProbe />);

    await waitFor(() => {
      expect(cachedKeys(queryClient)).toContainEqual(['services']);
    });

    // Katalog wyznacza aktywną usługę, więc nie może zależeć od niej samego.
    expect(cachedKeys(queryClient)).not.toContainEqual(['services', DEMO_TRACKER]);
  });

  it('invalidates the appeal prefixes of the active service after submitting an appeal', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<SubmitAppealProbe />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: SUBMIT_APPEAL_LABEL }));

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['appeals', DEMO_TRACKER] });
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', DEMO_TRACKER] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audit', DEMO_TRACKER] });
    // Goły prefiks unieważniłby dane **wszystkich** usług — to nie jest kontrakt tego zadania.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['appeals'] });
  });

  it('derives the appeal invalidation prefix from the active service, not a literal', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, GITHUB);
    const { queryClient } = renderWithProviders(<SubmitAppealProbe />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: SUBMIT_APPEAL_LABEL }));

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['appeals', GITHUB] });
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['appeals', DEMO_TRACKER] });
  });

  it('invalidates every lease-derived prefix of the active service after a decision', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<DecisionProbe />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: DECIDE_LABEL }));

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['leases', DEMO_TRACKER] });
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', DEMO_TRACKER] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audit', DEMO_TRACKER] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['appeals', DEMO_TRACKER] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['graph', DEMO_TRACKER] });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['leases'] });
  });
});
