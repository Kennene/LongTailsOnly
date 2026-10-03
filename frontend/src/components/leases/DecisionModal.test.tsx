import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { server } from '@/test/msw/server';
import { getLastDecisionRequest } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { Extension, LeaseOverview } from '@/types/api';

const activeLease = leasesFixture[0]; // Kamil Nowak, write, 30 dni do końca
const readOnlyLease = leasesFixture[1]; // Marta Zielińska, read
const adminLease = leasesFixture[3]; // Tomasz Wiśniewski, admin (ostatni administrator)

const EXTENSION_CASES: [string, Extension][] = [
  ['+7', { preset_days: 7 }],
  ['+14', { preset_days: 14 }],
  ['+30', { preset_days: 30 }],
  ['+90', { preset_days: 90 }],
  ['1,5x', { multiplier: 1.5 }],
  ['2x', { multiplier: 2 }],
];

async function renderModal(
  lease: LeaseOverview,
  onOpenChange: (open: boolean) => void = () => {},
): Promise<void> {
  renderWithProviders(<DecisionModal lease={lease} open onOpenChange={onOpenChange} />);

  // Wybór daty wymaga czasu symulowanego z API — czekamy, aż modal będzie gotowy.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
  });
}

// Sonner trzyma kolejkę toastów w stanie modułu (a `Toaster` montuje `renderWithProviders`),
// więc czyścimy ją między testami — inaczej asercja toasta widzi komunikaty z wcześniejszych testów.
beforeEach(() => {
  toast.dismiss();
});

async function chooseAndSubmit(label: string): Promise<void> {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));
}

it('shows the lease context with labels from the shared helpers', async () => {
  await renderModal(activeLease);

  expect(screen.getByText('Kamil Nowak (kamil)')).toBeInTheDocument();
  expect(screen.getByText('longtails/core-api')).toBeInTheDocument();
  expect(screen.getByText('Zapis (write)')).toBeInTheDocument();
  expect(screen.getByText('Aktywna')).toHaveClass('text-status-active');
  expect(screen.getByText('Pozostało 30 dni')).toBeInTheDocument();
  expect(screen.getByText('Bez zmian')).toBeInTheDocument();
});

it.each(EXTENSION_CASES)('sends %s as exactly one extension field', async (label, extension) => {
  await chooseAndSubmit(label);

  await waitFor(() => {
    expect(getLastDecisionRequest()?.request).toEqual({ action: 'EXTEND', extension });
  });
});

it('sends custom_days when the administrator types a day count', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.type(screen.getByLabelText('Własna liczba dni'), '45');
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  await waitFor(() => {
    expect(getLastDecisionRequest()?.request).toEqual({
      action: 'EXTEND',
      extension: { custom_days: 45 },
    });
  });
});

it('sends until_date as an ISO date when the administrator picks a day', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: 'Data' }));
  await user.click(await screen.findByRole('button', { name: 'sobota, 10 października 2026' }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  await waitFor(() => {
    expect(getLastDecisionRequest()?.request).toEqual({
      action: 'EXTEND',
      extension: { until_date: '2026-10-10' },
    });
  });
});

it('rejects a date in the past without sending a request', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: 'Data' }));
  await user.click(await screen.findByRole('button', { name: 'czwartek, 1 października 2026' }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  expect(
    await screen.findByText('Data musi być późniejsza niż czas symulowany'),
  ).toBeInTheDocument();
  expect(getLastDecisionRequest()).toBeNull();
});

it('rejects a custom day count outside 1-365 without sending a request', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.type(screen.getByLabelText('Własna liczba dni'), '0');
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  expect(await screen.findByText('Podaj liczbę dni z zakresu 1–365')).toBeInTheDocument();
  expect(getLastDecisionRequest()).toBeNull();
});

it('sends REVOKE only after the confirmation click', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: 'Wyłącz' }));
  expect(getLastDecisionRequest()).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

  await waitFor(() => {
    expect(getLastDecisionRequest()).toEqual({ lease_id: 1, request: { action: 'REVOKE' } });
  });
});

it('sends DOWNSCOPE for a lease above read access', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: 'Zdeeskaluj' }));

  await waitFor(() => {
    expect(getLastDecisionRequest()).toEqual({ lease_id: 1, request: { action: 'DOWNSCOPE' } });
  });
});

it('hides Zdeeskaluj when the lease is already read-only', async () => {
  await renderModal(readOnlyLease);

  expect(screen.queryByRole('button', { name: 'Zdeeskaluj' })).not.toBeInTheDocument();
});

it('toasts and closes the modal after a successful decision', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  await renderModal(activeLease, onOpenChange);
  await waitFor(() => {
    expect(screen.queryAllByText('Decyzja zapisana')).toHaveLength(0);
  });

  await user.click(screen.getByRole('button', { name: '+30' }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  expect(await screen.findByText('Decyzja zapisana')).toBeInTheDocument();
  await waitFor(() => {
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  expect(getLastDecisionRequest()).toEqual({
    lease_id: 1,
    request: { action: 'EXTEND', extension: { preset_days: 30 } },
  });
});

it('shows the last-admin protection message on 403', async () => {
  const user = userEvent.setup();
  await renderModal(adminLease);

  await user.click(screen.getByRole('button', { name: 'Wyłącz' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

  expect(
    await screen.findByText('Nie można odebrać uprawnień ostatniemu administratorowi.'),
  ).toBeInTheDocument();
});

it('shows the API message for other failures', async () => {
  server.use(
    http.post('/api/v1/leases/:leaseId/decision', () =>
      HttpResponse.json({ detail: 'Baza danych jest niedostępna' }, { status: 500 }),
    ),
  );
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: '+30' }));
  await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

  expect(await screen.findByText('Baza danych jest niedostępna')).toBeInTheDocument();
});

it('explains the unavailable date picker while the simulated clock is missing', async () => {
  server.use(
    http.get('/api/v1/simulation/clock', () =>
      HttpResponse.json({ detail: 'Zegar jest niedostępny' }, { status: 500 }),
    ),
  );
  renderWithProviders(<DecisionModal lease={activeLease} open onOpenChange={() => {}} />);

  expect(await screen.findByText('Czekam na czas symulowany…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Data' })).toBeDisabled();
});

it('renders nothing when there is no lease', () => {
  renderWithProviders(<DecisionModal lease={null} open onOpenChange={() => {}} />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Decyzja o dzierżawie')).not.toBeInTheDocument();
});
