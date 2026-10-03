import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

/**
 * Konflikt `409` przy decyzji o dzierżawie (kontrakt 3.6, decyzja D13): backend odmawia
 * decyzji na dzierżawie z odwołaniem `PENDING` i odsyła na `POST /api/v1/appeals/{id}/decision`.
 *
 * Backend odpowiada wtedy **po angielsku** (`Lease has a pending appeal; decide it via …`),
 * a panel jest w całości polski — modal musi więc podmienić `detail` na własne zdanie, nie
 * gubiąc przy tym komunikatu serwera, który wskazuje drogę wyjścia z konfliktu.
 *
 * Drugi `409` z tego samego endpointu to `REVOKE` na dzierżawie już odebranej — inne zdanie,
 * bo inna przyczyna; rozróżniamy je po stanie dzierżawy, którym dysponuje frontend.
 */

const DECISION_URL = '/api/v1/leases/:leaseId/decision';
const PENDING_APPEAL_MESSAGE = 'Ta dzierżawa ma nierozpatrzone odwołanie — najpierw je rozpatrz.';
const REVOKED_LEASE_MESSAGE = 'Ta dzierżawa jest już odebrana — nie ma czego zmieniać.';
const REVOKED_DETAIL = 'Lease is already revoked';

const pendingAppeal = appealsFixture[0]; // dzierżawa 5, marta, status PENDING
const pendingAppealDetail = `Lease has a pending appeal; decide it via /api/v1/appeals/${String(pendingAppeal.id)}/decision`;

function findLease(predicate: (lease: LeaseOverview) => boolean): LeaseOverview {
  const lease: LeaseOverview | undefined = leasesFixture.find(predicate);
  if (lease === undefined) {
    throw new Error('Fixture dzierżaw nie zawiera dzierżawy o oczekiwanym kształcie');
  }

  return lease;
}

/** Dzierżawa, której dotyczy oczekujące odwołanie — ta sama, którą widzi administrator. */
const leaseWithAppeal: LeaseOverview = findLease(
  (lease: LeaseOverview): boolean => lease.id === pendingAppeal.lease_id,
);

async function renderModal(lease: LeaseOverview): Promise<void> {
  renderWithProviders(<DecisionModal lease={lease} open onOpenChange={() => {}} />);

  // Wybór daty wymaga czasu symulowanego z API — czekamy, aż modal będzie gotowy.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
  });
}

async function submitExtension(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '+30' }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));
}

describe('DecisionModal — 409 przy decyzji o dzierżawie', () => {
  it('zastępuje angielski detail zdaniem o nierozpatrzonym odwołaniu', async () => {
    server.use(
      http.post(DECISION_URL, () =>
        HttpResponse.json({ detail: pendingAppealDetail }, { status: 409 }),
      ),
    );
    await renderModal(leaseWithAppeal);

    await submitExtension();

    expect(await screen.findByText(PENDING_APPEAL_MESSAGE)).toBeInTheDocument();
    // Komunikat serwera zostaje jako szczegół — wskazuje `/api/v1/appeals/{id}/decision`.
    expect(screen.getByText(pendingAppealDetail)).toBeInTheDocument();
    // 409 to nie sukces: bez toastu i bez zamknięcia modala, wybór przedłużenia zostaje.
    expect(screen.queryByText('Decyzja zapisana')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zatwierdź decyzję' })).toBeEnabled();
  });

  it('nazywa przyczynę po polsku, gdy 409 dotyczy dzierżawy już odebranej', async () => {
    const revokedLease: LeaseOverview = { ...leasesFixture[0], is_active: false };
    server.use(
      http.post(DECISION_URL, () => HttpResponse.json({ detail: REVOKED_DETAIL }, { status: 409 })),
    );
    await renderModal(revokedLease);

    await submitExtension();

    expect(await screen.findByText(REVOKED_LEASE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_APPEAL_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText(REVOKED_DETAIL)).toBeInTheDocument();
  });

  it('nie zmienia obsługi pozostałych błędów decyzji', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    server.use(
      http.post(DECISION_URL, () =>
        HttpResponse.json({ detail: 'Baza danych jest niedostępna' }, { status: 500 }),
      ),
    );
    renderWithProviders(<DecisionModal lease={leaseWithAppeal} open onOpenChange={onOpenChange} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
    });

    await submitExtension();

    expect(await screen.findByText('Baza danych jest niedostępna')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
