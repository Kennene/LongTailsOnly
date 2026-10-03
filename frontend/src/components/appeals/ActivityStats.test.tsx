import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activityStatsFixture, fetchActivityStats, type LeaseActivityStats } from '@/api/activity';
import { ActivityStats } from '@/components/appeals/ActivityStats';
import { useActivityStats } from '@/hooks/useActivityStats';
import { activityHandlers } from '@/test/msw/domains/activity';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

const ZERO_STATS: LeaseActivityStats = { push: 0, review: 0, comment: 0 };
const LEASE_ID = 1;

/** Konsument hooka: pokazuje liczniki dopiero, gdy dane dojdą z API. */
function ConnectedActivityStats({ lease_id }: { lease_id: number }): React.JSX.Element {
  const { data } = useActivityStats(lease_id);

  return data === undefined ? <p>Wczytywanie</p> : <ActivityStats stats={data} />;
}

describe('ActivityStats', () => {
  it('renders every counter with its Polish label and value', () => {
    renderWithProviders(<ActivityStats stats={{ push: 0, review: 4, comment: 7 }} />);

    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Komentarze')).toBeInTheDocument();
    expect(screen.getByTestId('stat-push')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-review')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-comment')).toHaveTextContent('7');
  });

  it('renders the number as mono data, not as decoration', () => {
    renderWithProviders(<ActivityStats stats={activityStatsFixture} />);

    expect(screen.getByTestId('stat-push')).toHaveClass('font-mono');
    expect(screen.getByTestId('stat-review')).toHaveClass('font-mono');
    expect(screen.getByTestId('stat-comment')).toHaveClass('font-mono');
  });

  it('renders a zero row when the lease has no activity yet', () => {
    renderWithProviders(<ActivityStats stats={ZERO_STATS} />);

    expect(screen.getByTestId('stat-push')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-review')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-comment')).toHaveTextContent('0');
  });
});

/**
 * Warstwa danych dla liczników: `GET /api/v1/leases/{lease_id}/activity-stats` (oczekiwany
 * kontrakt 4.4). Testujemy ją tutaj, bo komponent jest czysto prezentacyjny — bez tego kroku
 * ścieżka i kształt odpowiedzi nie miałyby żadnego dowodu.
 */
describe('useActivityStats', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the typed fixture without touching the network when fixtures are on', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');

    await expect(fetchActivityStats(LEASE_ID)).resolves.toEqual({
      push: 5,
      review: 4,
      comment: 7,
    });
  });

  it('fetches the stats for the lease from the API endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(...activityHandlers);

    renderWithProviders(<ConnectedActivityStats lease_id={LEASE_ID} />);

    expect(await screen.findByTestId('stat-review')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-comment')).toHaveTextContent('7');
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
