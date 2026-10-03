import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { servicesFixture } from '@/api/fixtures/services';
import { useActivityStats } from '@/hooks/useActivityStats';
import { useAppeals } from '@/hooks/useAppeals';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useDashboard } from '@/hooks/useDashboard';
import { useGraph } from '@/hooks/useGraph';
import { useLeases } from '@/hooks/useLeases';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useTeamBaseline } from '@/hooks/useTeamBaseline';
import { useActiveService } from '@/services/ServicesContext';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

/**
 * Bramka czytników to **ośmiokrotnie powtórzone wyrażenie** (`enabled: !isPending &&
 * activeService.id !== ''`), a przed zadaniem 10 pinował je tylko jeden zasób: `LeasesProbe`
 * w `useServiceScopedKeys.test.tsx`. Zdjęcie bramki z któregokolwiek z pozostałych siedmiu
 * czytników przechodziło przez suite na zielono — i wracało zmarnowane żądanie w namespace `''`
 * oraz mignięcie treści, którą zmiana klucza zaraz zastępuje (uzasadnienie: `useLeases.ts`).
 *
 * Każdy przypadek montuje **jeden** czytnik, bo tylko wtedy liczba żądań pod daną ścieżką należy do
 * niego: `useDashboard` i `useGraph` wołają `fetchLeases()` wewnątrz własnego `queryFn`, więc
 * w grupie zasoby dzieliłyby jeden licznik.
 *
 * Cztery ramiona bramki, cztery bloki: okno `isPending` **z pustym `localStorage`**, to samo okno
 * **z zapisanym identyfikatorem** (pinuje koniunkcję `!isPending`, bo wtedy `activeService.id` jest
 * niepuste już przed katalogiem), katalog, który **padł**, i katalog, który osiadł **pusty** (pinuje
 * drugą połowę koniunkcji, `id !== ''`; przed tym blokiem żaden zamontowany czytnik nie widział
 * osiadłego pustego katalogu, więc zdjęcie `id !== ''` przechodziło na zielono).
 *
 * Osobny plik, a nie dopisanie do `useServiceScopedKeys.test.tsx`: tamten ma 262 z 300 linii
 * objętych regułą `max-lines` (`skipBlankLines`/`skipComments`).
 */

const STORAGE_KEY = 'lease-governor.service';
const GITHUB = 'github';
const LEASE_ID = 1;
const TEAM_SLUG = 'dev';
const ONBOARDING_LOGIN = 'nowy-dev';

/** Jeden czytnik danych razem z bramką, którą pinujemy. */
interface GatedReader {
  /** Nazwa zasobu — pierwszy człon klucza cache i etykieta przypadku w `it.each`. */
  resource: string;
  /** Endpoint, o który ten czytnik pyta jako pierwszy. */
  path: string;
  /** Dalsze człony klucza po identyfikatorze usługi (`[]` dla kluczy gołych). */
  tail: unknown[];
  Probe: () => React.JSX.Element;
}

function LeasesProbe(): React.JSX.Element {
  useLeases();

  return <span />;
}

function AppealsProbe(): React.JSX.Element {
  useAppeals();

  return <span />;
}

function DashboardProbe(): React.JSX.Element {
  useDashboard();

  return <span />;
}

function GraphProbe(): React.JSX.Element {
  useGraph();

  return <span />;
}

function AuditProbe(): React.JSX.Element {
  useAuditLog();

  return <span />;
}

function ActivityStatsProbe(): React.JSX.Element {
  useActivityStats(LEASE_ID);

  return <span />;
}

function BaselineProbe(): React.JSX.Element {
  useTeamBaseline(TEAM_SLUG);

  return <span />;
}

function OnboardingProbe(): React.JSX.Element {
  useOnboarding(ONBOARDING_LOGIN);

  return <span />;
}

/** Pozwala poczekać na **osiadły** błąd katalogu, zamiast zgadywać, czy żądanie już się rozstrzygnęło. */
function CatalogErrorProbe(): React.JSX.Element {
  const { isError } = useActiveService();

  return <span data-testid="catalog-error">{String(isError)}</span>;
}

/**
 * Pozwala poczekać, aż katalog przestanie być **nierozstrzygnięty** — czyli także wtedy, gdy osiadł
 * pusty. Asercja postawiona w oknie `isPending` przechodzi z pierwszego członu bramki, więc nie
 * mówi nic o drugim; potrzebny jest stan, w którym katalog już się wypowiedział.
 */
function CatalogUnresolvedProbe(): React.JSX.Element {
  const { isError, isPending } = useActiveService();

  return <span data-testid="catalog-unresolved">{String(isPending || isError)}</span>;
}

const GATED_READERS: GatedReader[] = [
  { resource: 'leases', path: '/api/v1/leases', tail: [], Probe: LeasesProbe },
  { resource: 'appeals', path: '/api/v1/appeals', tail: [{}], Probe: AppealsProbe },
  // Osóbne endpointy: pulpit liczy backend (`/dashboard/stats`), a graf ma własną trasę z filtrem
  // zespołu — `team` należy do klucza, bo `useGraph(team)` trzyma pełny i zawężony graf osobno.
  { resource: 'dashboard', path: '/api/v1/dashboard/stats', tail: [], Probe: DashboardProbe },
  { resource: 'graph', path: '/api/v1/graph', tail: [null], Probe: GraphProbe },
  { resource: 'audit', path: '/api/v1/audit', tail: [], Probe: AuditProbe },
  {
    resource: 'activity-stats',
    path: `/api/v1/leases/${LEASE_ID}/activity-stats`,
    tail: [LEASE_ID],
    Probe: ActivityStatsProbe,
  },
  {
    resource: 'baseline',
    path: `/api/v1/teams/${TEAM_SLUG}/baseline`,
    tail: [TEAM_SLUG],
    Probe: BaselineProbe,
  },
  {
    resource: 'onboarding',
    path: `/api/v1/onboarding/${ONBOARDING_LOGIN}`,
    tail: [ONBOARDING_LOGIN],
    Probe: OnboardingProbe,
  },
];

/** Zdejmowane w `afterEach`, żeby nasłuch nie przeciekał do kolejnych przypadków. */
const stopRecording: (() => void)[] = [];

/**
 * Żądania, które **faktycznie wyszły z warstwy danych**. MSW emituje `request:start` przed
 * dopasowaniem handlera, więc liczymy wywołania sieci, a nie trafienia w mock — inaczej „zero
 * żądań” byłoby prawdą także wtedy, gdy żądanie poszło, a handlera dla niego nie było.
 */
function recordRequests(): string[] {
  const paths: string[] = [];
  const listener = (event: { request: Request }): void => {
    paths.push(new URL(event.request.url).pathname);
  };

  server.events.on('request:start', listener);
  stopRecording.push((): void => server.events.removeListener('request:start', listener));

  return paths;
}

function countRequests(paths: string[], path: string): number {
  return paths.filter((recorded: string): boolean => recorded === path).length;
}

function cached(queryClient: QueryClient, queryKey: QueryKey): Query | undefined {
  return queryClient.getQueryCache().find({ queryKey, exact: true });
}

/** Klucz czytnika dla usługi: `[<zasób>, <id usługi>, ...ogon]` — `''` to placeholder katalogu. */
function keyOf(reader: GatedReader, serviceId: string): QueryKey {
  return [reader.resource, serviceId, ...reader.tail];
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  for (const stop of stopRecording) {
    stop();
  }
  stopRecording.length = 0;
});

describe('service-scoped read gates', () => {
  it.each<GatedReader>(GATED_READERS)(
    'does not request $path while the catalog is pending ($resource)',
    async (reader: GatedReader) => {
      const requests: string[] = recordRequests();
      server.use(
        http.get('/api/v1/services', async () => {
          await delay(50);
          return HttpResponse.json(servicesFixture);
        }),
      );

      const { queryClient } = renderWithProviders(<reader.Probe />);

      expect(countRequests(requests, reader.path)).toBe(0);

      await waitFor(() => {
        expect(cached(queryClient, keyOf(reader, GITHUB))?.state.status).toBe('success');
      });
      // Dokładnie jedno żądanie — wyłącznie w namespace rozstrzygniętej usługi. Bez bramki
      // byłyby dwa: jedno pod `''` (od razu), jedno pod `github` (po katalogu).
      expect(countRequests(requests, reader.path)).toBe(1);
    },
  );

  it.each<GatedReader>(GATED_READERS)(
    'stays idle until the catalog settles when a service is already stored ($resource)',
    async (reader: GatedReader) => {
      window.localStorage.setItem(STORAGE_KEY, GITHUB);
      const requests: string[] = recordRequests();
      // Bramka zamiast opóźnienia: katalog **nie może** się rozstrzygnąć przed asercją, więc okno
      // `isPending` jest deterministyczne, a nie zależne od tego, jak szybko maszyna zdąży z timerem.
      let releaseCatalog: () => void = (): void => undefined;
      const catalogGate = new Promise<void>((resolve: () => void): void => {
        releaseCatalog = resolve;
      });
      server.use(
        http.get('/api/v1/services', async () => {
          await catalogGate;
          return HttpResponse.json(servicesFixture);
        }),
      );

      const { queryClient } = renderWithProviders(<reader.Probe />);

      // Zapisany `github` zna rejestr frontendu, więc `activeService.id` jest **niepuste** już
      // w trakcie oczekiwania na katalog (spec §5.2). Tę połowę bramki pinował dotąd żaden test:
      // wszystkie okna `isPending` montowały się z pustym `localStorage`, więc żądanie blokowała
      // druga połowa (`id !== ''`). Bez `!isPending` czytnik strzela przed potwierdzeniem katalogu —
      // dokładnie ten zmarnowany request i mignięcie treści, które usunął Ruling 28a. Makrozadanie
      // daje ewentualnemu żądaniu czas dotrzeć do MSW, który emituje `request:start` już
      // w momencie wywołania `fetch`.
      await new Promise((resolve: (value: undefined) => void) => {
        setTimeout((): void => resolve(undefined), 0);
      });

      expect(cached(queryClient, keyOf(reader, GITHUB))?.state.fetchStatus).toBe('idle');
      expect(countRequests(requests, reader.path)).toBe(0);

      releaseCatalog();

      await waitFor(() => {
        expect(cached(queryClient, keyOf(reader, GITHUB))?.state.status).toBe('success');
      });
      // Dokładnie jedno żądanie, dopiero po rozstrzygnięciu katalogu.
      expect(countRequests(requests, reader.path)).toBe(1);
    },
  );

  it.each<GatedReader>(GATED_READERS)(
    'requests $path once for the registry default when the catalog fails ($resource)',
    async (reader: GatedReader) => {
      const requests: string[] = recordRequests();
      server.use(
        http.get('/api/v1/services', () =>
          HttpResponse.json({ detail: 'Katalog niedostępny' }, { status: 500 }),
        ),
      );

      const { queryClient } = renderWithProviders(
        <>
          <CatalogErrorProbe />
          <reader.Probe />
        </>,
      );

      // Kluczowy warunek tego testu: czekamy na **osiadły** błąd katalogu. Bez tego asercje
      // przechodzą na stanie „katalog w drodze” i nie mówią nic o oknie błędu.
      await waitFor(() => {
        expect(screen.getByTestId('catalog-error')).toHaveTextContent('true');
      });
      // Katalog nie wypowie się już w tej sesji, więc rozstrzyga rejestr frontendu — domyślny
      // `github` (Ruling 35). Czytnik pobiera więc dane **raz**, w namespace tej usługi, zamiast
      // zostawać bezczynnym w nieprzypisanym `''` i zostawiać powłokę bez treści.
      await waitFor(() => {
        expect(cached(queryClient, keyOf(reader, GITHUB))?.state.status).toBe('success');
      });

      expect(countRequests(requests, reader.path)).toBe(1);
      expect(cached(queryClient, keyOf(reader, ''))).toBeUndefined();
    },
  );

  it.each<GatedReader>(GATED_READERS)(
    'stays idle when the catalog settles empty ($resource)',
    async (reader: GatedReader) => {
      const requests: string[] = recordRequests();
      // Pusty, ale **rozstrzygnięty** katalog: `[]` to wypowiedź, nie milczenie (spec §5.6.1), więc
      // `resolveActiveService` zwraca `NO_SERVICE` o `id === ''`.
      server.use(http.get('/api/v1/services', () => HttpResponse.json([])));

      const { queryClient } = renderWithProviders(
        <>
          <CatalogUnresolvedProbe />
          <reader.Probe />
        </>,
      );

      // Kluczowy warunek tego testu: katalog **osiadł**. Bez tego asercje przechodzą na stanie
      // „katalog w drodze”, w którym czytnik milczy już z pierwszego członu bramki, więc o drugim
      // (`id !== ''`) nie mówią nic.
      await waitFor(() => {
        expect(screen.getByTestId('catalog-unresolved')).toHaveTextContent('false');
      });
      // Makrozadanie jak w oknie `isPending`: daje ewentualnemu żądaniu czas dotrzeć do MSW, który
      // emituje `request:start` już w momencie wywołania `fetch`. Bez niego „zero żądań” zależałoby
      // od tego, ile mikrozadań zdąży przejść przed asercją — a fałszywie zielony przebieg tej klasy
      // już się w tym projekcie zdarzył.
      await new Promise((resolve: (value: undefined) => void) => {
        setTimeout((): void => resolve(undefined), 0);
      });

      // Osiadły, pusty katalog nie wskazuje żadnej usługi, więc żądanie w namespace `''` nie ma
      // gospodarza: czytnik zostaje bezczynny. Rozstrzyga licznik żądań pod jego własną ścieżką —
      // `fetchStatus` wraca do `idle` także po pobraniu, które już się odbyło.
      expect(cached(queryClient, keyOf(reader, ''))?.state.fetchStatus).toBe('idle');
      expect(countRequests(requests, reader.path)).toBe(0);
    },
  );
});
