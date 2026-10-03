import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchActivityStats } from '@/api/activity';
import { activityEventsFixture, clockFixture, leasesFixture } from '@/api/fixtures';
import { ActivityStats } from '@/components/appeals/ActivityStats';
import { useActivityStats } from '@/hooks/useActivityStats';
import { DAY_MS, formatDateTimePl } from '@/lib/dateTime';
import { activityHandlers } from '@/test/msw/domains/activity';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ActivityEventRead, LeaseActivityStats, LeaseOverview } from '@/types/api';

/**
 * Dowód użycia dzierżawy (UC-3) w kształcie **kontraktu** `LeaseActivityStats`
 * (`backend/app/schemas/lease.py`, krok 3.6) — nie w kształcie, który frontend wymyślił przed
 * dostarczeniem endpointu. Panel jest prezentacją: nie liczy niczego, tylko pokazuje liczniki
 * `push_count` / `review_count` / `comment_count` oraz okno (`window_days`, `last_activity_at`).
 *
 * Warstwę danych testujemy w tym samym pliku, bo komponent jest czysto prezentacyjny — bez tego
 * kroku ścieżka `GET /api/v1/leases/{lease_id}/activity-stats` i kształt odpowiedzi nie miałyby
 * żadnego dowodu.
 */

const LEASE_ID = 1;
const LAST_ACTIVITY = '2026-10-02T10:00:00Z';
const OLDER_THAN_WINDOW = '2026-08-01T10:00:00Z';
const EMPTY_WINDOW_MESSAGE =
  'Brak pushów, review i komentarzy w ostatnich 30 dniach — ta dzierżawa nie ma żadnej aktywności.';
const STALE_ACTIVITY_MESSAGE =
  'Ostatnia aktywność jest starsza niż 30 dni — w tym oknie nie ma dowodu użycia.';

/** Kontraktowy zestaw liczb: prezentacja bierze pola wprost, a okno pochodzi z odpowiedzi API. */
function statsFixture(overrides: Partial<LeaseActivityStats> = {}): LeaseActivityStats {
  return {
    lease_id: LEASE_ID,
    window_days: 30,
    window_start: '2026-09-03T00:00:00Z',
    window_end: clockFixture.now,
    push_count: 0,
    review_count: 0,
    comment_count: 0,
    last_activity_at: null,
    ...overrides,
  };
}

/** Konsument hooka: pokazuje liczniki dopiero, gdy dane dojdą z API. */
function ConnectedActivityStats({ lease_id }: { lease_id: number }): React.JSX.Element {
  const { data } = useActivityStats(lease_id);

  return data === undefined ? <p>Wczytywanie</p> : <ActivityStats stats={data} />;
}

function findIdleLease(): LeaseOverview {
  const lease: LeaseOverview | undefined = leasesFixture.find(
    (candidate: LeaseOverview): boolean =>
      !activityEventsFixture.some(
        (event: ActivityEventRead): boolean =>
          event.user_id === candidate.user.id && event.repo_id === candidate.repository.id,
      ),
  );
  if (lease === undefined) {
    throw new Error('Fixture dzierżaw nie zawiera pary (user, repo) bez ani jednego zdarzenia');
  }

  return lease;
}

describe('ActivityStats', () => {
  it('renders every counter with its Polish label and value', () => {
    renderWithProviders(
      <ActivityStats stats={statsFixture({ review_count: 4, comment_count: 7 })} />,
    );

    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Komentarze')).toBeInTheDocument();
    expect(screen.getByTestId('stat-push')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-review')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-comment')).toHaveTextContent('7');
  });

  it('renders the number as mono data, not as decoration', () => {
    renderWithProviders(
      <ActivityStats stats={statsFixture({ push_count: 5, review_count: 4, comment_count: 7 })} />,
    );

    expect(screen.getByTestId('stat-push')).toHaveClass('font-mono');
    expect(screen.getByTestId('stat-review')).toHaveClass('font-mono');
    expect(screen.getByTestId('stat-comment')).toHaveClass('font-mono');
  });

  it('shows the window and the last activity next to the counters', () => {
    renderWithProviders(
      <ActivityStats stats={statsFixture({ push_count: 2, last_activity_at: LAST_ACTIVITY })} />,
    );

    expect(screen.getByTestId('activity-window')).toHaveTextContent(
      `Ostatnie 30 dni · ostatnia aktywność ${formatDateTimePl(LAST_ACTIVITY)}`,
    );
    expect(screen.queryByTestId('activity-empty')).not.toBeInTheDocument();
  });

  it('keeps the zero counters but explains an empty window', () => {
    renderWithProviders(<ActivityStats stats={statsFixture()} />);

    expect(screen.getByTestId('stat-push')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-review')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-comment')).toHaveTextContent('0');
    expect(screen.getByTestId('activity-window')).toHaveTextContent(
      'Ostatnie 30 dni · brak jakiejkolwiek aktywności',
    );
    expect(screen.getByTestId('activity-empty')).toHaveTextContent(EMPTY_WINDOW_MESSAGE);
  });

  it('explains that the last activity falls outside the window', () => {
    renderWithProviders(
      <ActivityStats stats={statsFixture({ last_activity_at: OLDER_THAN_WINDOW })} />,
    );

    expect(screen.getByTestId('activity-window')).toHaveTextContent(
      `Ostatnie 30 dni · ostatnia aktywność ${formatDateTimePl(OLDER_THAN_WINDOW)}`,
    );
    expect(screen.getByTestId('activity-empty')).toHaveTextContent(STALE_ACTIVITY_MESSAGE);
  });
});

describe('useActivityStats', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the typed fixture without touching the network when fixtures are on', async () => {
    // Wzorzec bierzemy z mirroru backendu (MSW), więc test nie zamraża liczb wyliczanych
    // z `shared/fixtures/activity.json` — sprawdza, że fixture i API mówią to samo.
    const expected: LeaseActivityStats = await fetchActivityStats(LEASE_ID);
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchActivityStats(LEASE_ID)).resolves.toEqual(expected);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds the window from the lease repository and the shared clock anchor', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const lease: LeaseOverview = leasesFixture[0];

    const stats: LeaseActivityStats = await fetchActivityStats(LEASE_ID);

    // Okno to `repository.default_lease_duration_days` (backend liczy je tak samo), a jego koniec
    // to czas symulowany — bez backendu stoi na kotwicy demo.
    expect(stats).toMatchObject({
      lease_id: LEASE_ID,
      window_days: lease.repository.default_lease_duration_days,
      window_end: clockFixture.now,
    });
    expect(Date.parse(stats.window_end) - Date.parse(stats.window_start)).toBe(
      stats.window_days * DAY_MS,
    );

    // `last_activity_at` to najnowsze zdarzenie pary (user_id, repo_id) — bez ograniczenia oknem.
    const pairTimestamps: string[] = activityEventsFixture
      .filter(
        (event: ActivityEventRead): boolean =>
          event.user_id === lease.user.id && event.repo_id === lease.repository.id,
      )
      .map((event: ActivityEventRead): string => event.timestamp)
      .sort();

    expect(stats.last_activity_at).toBe(pairTimestamps.at(-1) ?? null);
  });

  it('returns zeros and a null last activity for a pair without any event', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const idleLease: LeaseOverview = findIdleLease();

    await expect(fetchActivityStats(idleLease.id)).resolves.toMatchObject({
      lease_id: idleLease.id,
      push_count: 0,
      review_count: 0,
      comment_count: 0,
      last_activity_at: null,
    });
  });

  it('moves the window with the simulated clock and keeps the last activity a fact', async () => {
    const before: LeaseActivityStats = await fetchActivityStats(LEASE_ID);
    expect(before.push_count).toBeGreaterThan(0);

    advanceSimulatedClock(40);
    const after: LeaseActivityStats = await fetchActivityStats(LEASE_ID);

    // Okno przesunęło się za zdarzenia, więc liczniki spadają do zera, ale fakt ostatniej
    // aktywności zostaje — to on tłumaczy, dlaczego w oknie nie ma dowodu użycia.
    expect(after.push_count + after.review_count + after.comment_count).toBe(0);
    expect(Date.parse(after.window_start)).toBeGreaterThan(Date.parse(before.window_start));
    expect(after.last_activity_at).toBe(before.last_activity_at);
  });

  it('fetches the stats for the lease from the API endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(...activityHandlers);

    renderWithProviders(<ConnectedActivityStats lease_id={LEASE_ID} />);

    const expected: LeaseActivityStats = await fetchActivityStats(LEASE_ID);
    expect(await screen.findByTestId('stat-review')).toHaveTextContent(
      String(expected.review_count),
    );
    expect(screen.getByTestId('stat-comment')).toHaveTextContent(String(expected.comment_count));
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/leases/${LEASE_ID}/activity-stats`,
      expect.anything(),
    );
  });

  it('does not call the API for a non-positive lease id', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(...activityHandlers);

    renderWithProviders(<ConnectedActivityStats lease_id={0} />);

    expect(screen.getByText('Wczytywanie')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
