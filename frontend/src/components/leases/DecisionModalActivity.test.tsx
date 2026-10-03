import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { fetchActivityStats, type LeaseActivityStats } from '@/api/activity';
import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { getRecommendationBadge } from '@/lib/statusBadges';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealOverview, LeaseOverview } from '@/types/api';

/**
 * Dowód użycia w modalu decyzji (UC-3, `DESIGN.md` §4): tryb zwykłej dzierżawy pokazuje
 * statystyki aktywności obok kontekstu, a tryb odwołania zostaje przy `AppealContextPanel`
 * i nie renderuje liczników drugi raz.
 *
 * Osobny plik od `DecisionModal.test.tsx` (ścieżka decyzji o dzierżawie) i
 * `DecisionModalAppeal.test.tsx` (tryb odwołania) — tamte są siatką regresji i zostają
 * nietknięte. Tutaj sprawdzamy wyłącznie warstwę dowodów: obecność panelu, stany
 * wczytywania i błędu oraz brak duplikatu w trybie odwołania.
 */

const LEASE_ACTIVITY_TEST_ID = 'lease-activity';
const APPEAL_ACTIVITY_TEST_ID = 'appeal-activity';
const ACTIVITY_URL = '/api/v1/leases/:leaseId/activity-stats';
const STATS_ERROR_MESSAGE = 'Nie udało się pobrać statystyk użycia.';

const activeLease: LeaseOverview = leasesFixture[0]; // pierwsza dzierżawa z fixture'ów, ACTIVE
const pendingAppeal: AppealOverview = appealsFixture[0]; // dzierżawa 5, status PENDING
const appealLease: LeaseOverview = { ...activeLease, id: pendingAppeal.lease_id };

/**
 * Liczniki zawsze pytamy przez API (`GET /api/v1/leases/{id}/activity-stats`), zamiast wpisywać
 * je na sztywno: zależą od pary `(user_id, repo_id)` dzierżawy i od `shared/fixtures/activity.json`.
 */

/** Dzierżawa o zadanym kształcie ze stanu MSW — fixture'y dzielą inne zadania. */
function findLease(predicate: (lease: LeaseOverview) => boolean): LeaseOverview {
  const lease: LeaseOverview | undefined = leasesFixture.find(predicate);
  if (lease === undefined) {
    throw new Error('Fixture dzierżaw nie zawiera dzierżawy o oczekiwanym kształcie');
  }

  return lease;
}

async function renderModalWithLease(lease: LeaseOverview): Promise<void> {
  renderWithProviders(<DecisionModal lease={lease} open onOpenChange={() => {}} />);

  // Wybór daty wymaga czasu symulowanego z API — czekamy, aż modal będzie gotowy.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
  });
}

describe('DecisionModal — dowód użycia w trybie dzierżawy', () => {
  it('pokazuje statystyki użycia dzierżawy obok kontekstu decyzji', async () => {
    await renderModalWithLease(activeLease);

    const panel = screen.getByTestId(LEASE_ACTIVITY_TEST_ID);
    const expected: LeaseActivityStats = await fetchActivityStats(activeLease.id);

    expect(await within(panel).findByTestId('stat-push')).toHaveTextContent(String(expected.push));
    expect(within(panel).getByTestId('stat-review')).toHaveTextContent(String(expected.review));
    expect(within(panel).getByTestId('stat-comment')).toHaveTextContent(String(expected.comment));
  });

  it('pokazuje szkielet w miejscu liczników, dopóki statystyki się wczytują', async () => {
    const expected: LeaseActivityStats = await fetchActivityStats(activeLease.id);
    server.use(
      http.get(ACTIVITY_URL, async () => {
        await delay('infinite');
        return HttpResponse.json(expected);
      }),
    );

    await renderModalWithLease(activeLease);

    const panel = screen.getByTestId(LEASE_ACTIVITY_TEST_ID);
    const loading = within(panel).getByRole('status');

    expect(within(loading).getAllByTestId('lease-activity-skeleton')).toHaveLength(3);
    expect(within(panel).queryByTestId('stat-push')).not.toBeInTheDocument();
  });

  it('renderuje rekomendację jako badge z etykietą i tokenami wspólnego helpera', async () => {
    await renderModalWithLease(activeLease);

    const expected = getRecommendationBadge(activeLease.recommendation);
    const badge = screen.getByText(expected.label);

    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveAttribute('data-variant', 'outline');
    expect(badge).toHaveClass(expected.className);
  });

  it('używa rodzin tokenów rekomendacji także dla „Odbierz”', async () => {
    const revokeLease: LeaseOverview = findLease(
      (lease: LeaseOverview): boolean => lease.recommendation === 'REVOKE',
    );

    await renderModalWithLease(revokeLease);

    const expected = getRecommendationBadge(revokeLease.recommendation);
    const badge = screen.getByText(expected.label);

    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge).toHaveClass(expected.className);
  });

  it('pokazuje krótkie zdanie, gdy statystyki się nie wczytają', async () => {
    server.use(
      http.get(ACTIVITY_URL, () =>
        HttpResponse.json({ detail: 'Baza danych jest niedostępna' }, { status: 500 }),
      ),
    );

    await renderModalWithLease(activeLease);

    expect(await screen.findByText(STATS_ERROR_MESSAGE)).toBeInTheDocument();

    const panel = screen.getByTestId(LEASE_ACTIVITY_TEST_ID);
    expect(within(panel).queryByTestId('stat-push')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('DecisionModal — brak duplikatu dowodu w trybie odwołania', () => {
  it('nie montuje panelu dzierżawy, więc statystyki renderują się tylko raz', async () => {
    renderWithProviders(
      <DecisionModal appeal={pendingAppeal} lease={appealLease} open onOpenChange={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
    });

    // Panel dzierżawy należy wyłącznie do trybu bez odwołania — inaczej liczniki i zapytanie
    // o statystyki startowałyby dwa razy dla tej samej dzierżawy.
    expect(screen.queryByTestId(LEASE_ACTIVITY_TEST_ID)).not.toBeInTheDocument();

    const appealActivity = await screen.findByTestId(APPEAL_ACTIVITY_TEST_ID);
    // Panel w trybie odwołania pyta o statystyki **dzierżawy wskazanej przez odwołanie**
    // (`AppealOverview.lease_id`), a nie tej, którą ktoś podał w propie `lease`.
    const expected: LeaseActivityStats = await fetchActivityStats(pendingAppeal.lease_id);
    expect(await within(appealActivity).findByTestId('stat-push')).toHaveTextContent(
      String(expected.push),
    );
    expect(screen.getAllByTestId('stat-push')).toHaveLength(1);
  });
});
