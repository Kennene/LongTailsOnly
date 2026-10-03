import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { activityStatsFixture } from '@/api/activity';
import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { getRecommendationBadge } from '@/lib/statusBadges';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealRead, LeaseOverview } from '@/types/api';

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

const activeLease: LeaseOverview = leasesFixture[0]; // Kamil Nowak, write, 30 dni do końca
const pendingAppeal: AppealRead = appealsFixture[0]; // dzierżawa 3, status PENDING
const appealLease: LeaseOverview = { ...activeLease, id: pendingAppeal.lease_id };

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

    expect(await within(panel).findByTestId('stat-push')).toHaveTextContent(
      String(activityStatsFixture.push),
    );
    expect(within(panel).getByTestId('stat-review')).toHaveTextContent(
      String(activityStatsFixture.review),
    );
    expect(within(panel).getByTestId('stat-comment')).toHaveTextContent(
      String(activityStatsFixture.comment),
    );
  });

  it('pokazuje szkielet w miejscu liczników, dopóki statystyki się wczytują', async () => {
    server.use(
      http.get(ACTIVITY_URL, async () => {
        await delay('infinite');
        return HttpResponse.json(activityStatsFixture);
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
    const revokeLease: LeaseOverview = leasesFixture[2]; // Piotr Lewandowski, rekomendacja REVOKE

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
    expect(await within(appealActivity).findByTestId('stat-push')).toHaveTextContent(
      String(activityStatsFixture.push),
    );
    expect(screen.getAllByTestId('stat-push')).toHaveLength(1);
  });
});
