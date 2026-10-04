import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { server } from '@/test/msw/server';
import { getLastDecisionRequest } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { Extension, LeaseOverview, Role } from '@/types/api';

/** Dostęp o zadanym kształcie ze wspólnych fixture'ów — testy nie liczą na kolejność pliku. */
function findLease(predicate: (lease: LeaseOverview) => boolean): LeaseOverview {
  const lease: LeaseOverview | undefined = leasesFixture.find(predicate);
  if (lease === undefined) {
    throw new Error('Fixture dostępów nie zawiera dostępu o oczekiwanym kształcie');
  }

  return lease;
}

function leaseWithRole(role: Role): LeaseOverview {
  return findLease((lease: LeaseOverview): boolean => lease.current_role === role);
}

const activeLease = leasesFixture[0]; // kamil@core-api, write, ACTIVE
const readOnlyLease = leaseWithRole('read'); // marta@frontend-app
const adminLease = leaseWithRole('admin'); // tomasz-admin@core-api (ostatni administrator)

/** Silnik wymaga uzasadnienia przy `DOWNSCOPE`/`REVOKE` (`decision_service._required`, 422). */
const JUSTIFICATION = 'Dostęp nie jest już potrzebny do prac nad v2.1.';
const JUSTIFICATION_REQUIRED = 'Uzasadnienie jest wymagane';
const JUSTIFICATION_ERROR_ID = 'decision-justification-error';
const ADMIN_EXTENSION_BLOCKED = 'Dostęp administratora nie wygasa — nie można go przedłużyć.';
const DECISION_URL = '/api/v1/leases/:leaseId/decision';

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

/** Dostępy bez sekcji przedłużania (admin) nie mają przycisku „Data”, więc czekamy na nagłówek. */
async function renderModalWithoutExtension(lease: LeaseOverview): Promise<void> {
  renderWithProviders(<DecisionModal lease={lease} open onOpenChange={() => {}} />);
  expect(await screen.findByText('Decyzja o dostępie')).toBeInTheDocument();
}

/** Modal pokazuje kontrolki jednej akcji naraz — wybiera ją przełącznik „Przedłuż / Zdeeskaluj / Odbierz”. */
async function chooseKind(
  user: UserEvent,
  label: 'Przedłuż' | 'Zdeeskaluj' | 'Odbierz',
): Promise<void> {
  await user.click(
    within(screen.getByRole('group', { name: 'Rodzaj decyzji' })).getByRole('button', {
      name: label,
    }),
  );
}

/** Uzasadnienie jest wymagane przez silnik przy `DOWNSCOPE`/`REVOKE`. */
async function typeJustification(user: UserEvent, value: string = JUSTIFICATION): Promise<void> {
  await user.type(screen.getByLabelText('Uzasadnienie'), value);
}

/** Pełna ścieżka `REVOKE`: „Odbierz” → uzasadnienie → „Odbierz dostęp” → potwierdzenie. */
async function confirmRevoke(user: UserEvent, value: string = JUSTIFICATION): Promise<void> {
  await chooseKind(user, 'Odbierz');
  await typeJustification(user, value);
  await user.click(screen.getByRole('button', { name: 'Odbierz dostęp' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam odebranie' }));
}

/** Podstawia odpowiedź silnika na decyzję — do pinowania tłumaczeń 422/409. */
function stubDecisionFailure(status: number, detail: string): void {
  server.use(http.post(DECISION_URL, () => HttpResponse.json({ detail }, { status })));
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
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));
}

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
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

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
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

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
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

  expect(
    await screen.findByText('Data musi być późniejsza niż czas symulowany'),
  ).toBeInTheDocument();
  expect(getLastDecisionRequest()).toBeNull();
});

it('rejects a custom day count outside 1-365 without sending a request', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.type(screen.getByLabelText('Własna liczba dni'), '0');
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

  expect(await screen.findByText('Podaj liczbę dni z zakresu 1–365')).toBeInTheDocument();
  expect(getLastDecisionRequest()).toBeNull();
});

it('sends REVOKE only after the confirmation click, with the justification', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await chooseKind(user, 'Odbierz');
  await typeJustification(user);
  await user.click(screen.getByRole('button', { name: 'Odbierz dostęp' }));
  expect(getLastDecisionRequest()).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Potwierdzam odebranie' }));

  await waitFor(() => {
    expect(getLastDecisionRequest()).toEqual({
      lease_id: activeLease.id,
      request: { action: 'REVOKE', justification: JUSTIFICATION },
    });
  });
});

it('sends DOWNSCOPE for a lease above read access, with the justification', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await chooseKind(user, 'Zdeeskaluj');
  await typeJustification(user);
  await user.click(screen.getByRole('button', { name: 'Zdeeskaluj dostęp' }));

  await waitFor(() => {
    expect(getLastDecisionRequest()).toEqual({
      lease_id: activeLease.id,
      request: { action: 'DOWNSCOPE', justification: JUSTIFICATION },
    });
  });
});

it('rejects REVOKE without a justification, pointing at the field', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await chooseKind(user, 'Odbierz');
  await user.click(screen.getByRole('button', { name: 'Odbierz dostęp' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam odebranie' }));

  expect(await screen.findByText(JUSTIFICATION_REQUIRED)).toBeInTheDocument();
  const field = screen.getByLabelText('Uzasadnienie');
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAttribute('aria-describedby', JUSTIFICATION_ERROR_ID);
  expect(screen.getByRole('alert')).toHaveTextContent(JUSTIFICATION_REQUIRED);
  expect(getLastDecisionRequest()).toBeNull();
});

it('treats a whitespace-only justification as empty', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await confirmRevoke(user, '    ');

  expect(await screen.findByText(JUSTIFICATION_REQUIRED)).toBeInTheDocument();
  expect(getLastDecisionRequest()).toBeNull();
});

it('rejects DOWNSCOPE without a justification and sends nothing', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  await chooseKind(user, 'Zdeeskaluj');
  await user.click(screen.getByRole('button', { name: 'Zdeeskaluj dostęp' }));

  expect(await screen.findByText(JUSTIFICATION_REQUIRED)).toBeInTheDocument();
  expect(screen.getByLabelText('Uzasadnienie')).toHaveAttribute('aria-invalid', 'true');
  expect(getLastDecisionRequest()).toBeNull();
});

it('hides the extension controls of an admin lease and explains why', async () => {
  await renderModalWithoutExtension(adminLease);

  expect(screen.queryByRole('button', { name: '+7' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+30' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Data' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Własna liczba dni')).not.toBeInTheDocument();
  expect(screen.getByText(ADMIN_EXTENSION_BLOCKED)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Przedłuż dostęp' })).toBeDisabled();
});

it('keeps the extension controls for a revoked read/write lease, which the engine restores', async () => {
  const revokedLease: LeaseOverview = { ...activeLease, is_active: false, status: 'REVOKED' };
  await renderModal(revokedLease);

  expect(screen.getByRole('button', { name: '+30' })).toBeEnabled();
  expect(screen.queryByText(ADMIN_EXTENSION_BLOCKED)).not.toBeInTheDocument();
});

it('translates the 422 about a new end that is not later than the current one', async () => {
  const serverDetail = 'The new end of the lease must be later than the current one';
  stubDecisionFailure(422, serverDetail);
  const user = userEvent.setup();
  await renderModal(activeLease);

  await user.click(screen.getByRole('button', { name: '+30' }));
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

  expect(
    await screen.findByText('Nowy termin musi być późniejszy niż obecny.'),
  ).toBeInTheDocument();
  // Angielski `detail` silnika zostaje jako szczegół — nie gubimy przyczyny.
  expect(screen.getByText(serverDetail)).toBeInTheDocument();
  expect(screen.queryByText('Decyzja zapisana')).not.toBeInTheDocument();
});

it('translates the 422 about a missing justification', async () => {
  const serverDetail = 'A justification is required to downscope or revoke access';
  stubDecisionFailure(422, serverDetail);
  const user = userEvent.setup();
  await renderModal(activeLease);

  await confirmRevoke(user);

  expect(
    await screen.findByText('Uzasadnienie jest wymagane do odebrania lub zdeeskalowania dostępu.'),
  ).toBeInTheDocument();
  expect(screen.getByText(serverDetail)).toBeInTheDocument();
});

it('translates the 409 of an already revoked lease', async () => {
  const serverDetail = 'Lease is already revoked';
  const revokedLease: LeaseOverview = { ...activeLease, is_active: false, status: 'REVOKED' };
  stubDecisionFailure(409, serverDetail);
  const user = userEvent.setup();
  await renderModal(revokedLease);

  await confirmRevoke(user);

  expect(
    await screen.findByText('Ten dostęp jest już odebrany — nie ma czego zmieniać.'),
  ).toBeInTheDocument();
  expect(screen.getByText(serverDetail)).toBeInTheDocument();
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
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

  expect(await screen.findByText('Decyzja zapisana')).toBeInTheDocument();
  await waitFor(() => {
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  expect(getLastDecisionRequest()).toEqual({
    lease_id: activeLease.id,
    request: { action: 'EXTEND', extension: { preset_days: 30 } },
  });
});

it('shows the last-admin protection message on 403', async () => {
  const user = userEvent.setup();
  // Admin nie ma sekcji przedłużania, ale sekcja odebrania dostępu zostaje — to jej pilnuje ochrona.
  await renderModalWithoutExtension(adminLease);

  await confirmRevoke(user);

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
  await user.click(screen.getByRole('button', { name: 'Przedłuż dostęp' }));

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
  expect(screen.queryByText('Decyzja o dostępie')).not.toBeInTheDocument();
});
