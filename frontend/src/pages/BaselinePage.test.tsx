import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, expect, it, vi } from 'vitest';

import { findTeamBaselineFixture } from '@/api/fixtures/baseline';
import { BaselinePage } from '@/pages/BaselinePage';
import { getLastBaselineApproval, resetBaselineMswState } from '@/test/msw/domains/baseline';
import { server } from '@/test/msw/server';
import { renderWithProviders, type RenderWithProvidersResult } from '@/test/renderWithProviders';

const DEV_SECTION = 'Zespół DEV';
const QA_SECTION = 'Zespół QA';
const ONBOARDING_SECTION = 'Onboarding nowego członka';
const APPROVE_LABEL = 'Zatwierdź standard';
const EMPTY_STANDARD =
  'Za mało aktywnych członków w ostatnich 30 dniach — ten zespół nie ma jeszcze propozycji standardu.';
const NOTHING_TO_GRANT = 'Standard zespołu jest już nadany — nie ma nic do zatwierdzenia.';

/**
 * `Toaster` (i stub `matchMedia`) dostarcza `renderWithProviders` — drugi toaster dublowałby toast.
 * `POST /api/v1/onboarding/:login/apply` zmienia stan MSW, więc każdy test zaczyna od świeżej
 * propozycji (`resetBaselineMswState`).
 */
function renderBaselinePage(): RenderWithProvidersResult {
  return renderWithProviders(<BaselinePage />);
}

beforeEach(() => {
  resetBaselineMswState();
});

it('renders baseline entries for both teams and never proposes administrator access', async () => {
  renderBaselinePage();

  const dev = await screen.findByRole('region', { name: DEV_SECTION });
  const qa = screen.getByRole('region', { name: QA_SECTION });

  // Wszystkie odczyty (DEV, QA, onboarding) rozstrzygają się w jednym renderze, więc asercje niżej
  // mogą być synchroniczne — inaczej ścigałyby się z siecią.
  expect(within(dev).getByText('longtails/core-api')).toBeInTheDocument();
  expect(within(dev).getByText('longtails/auth-service')).toBeInTheDocument();
  expect(within(dev).getByText('longtails/payment-service')).toBeInTheDocument();
  // Kolumna „Aktywni członkowie” — sama liczba, bez powtarzania nagłówka w każdej komórce.
  expect(within(dev).getByText('10/12')).toBeInTheDocument();
  expect(within(dev).getAllByText('Zapis (write)')).toHaveLength(2);
  expect(within(dev).getByText('Odczyt (read)')).toBeInTheDocument();

  expect(within(qa).getByText('longtails/qa-automation')).toBeInTheDocument();
  expect(within(qa).getByText('6/6')).toBeInTheDocument();
  expect(within(qa).getByText('Odczyt (read)')).toBeInTheDocument();

  // ADR 0005: `admin` nigdy nie wchodzi do standardu — ani w tabelach, ani w propozycji.
  expect(screen.queryByText('Administrator')).not.toBeInTheDocument();
});

it('shows what the standard would grant the demo login and what is already granted', async () => {
  renderBaselinePage();

  const card = await screen.findByRole('region', { name: ONBOARDING_SECTION });
  expect(within(card).getByText('Nowy Developer (nowy-dev)')).toBeInTheDocument();
  expect(within(card).getByText(/zespołu DEV/)).toBeInTheDocument();

  const toGrant = within(card).getByRole('table', { name: 'Do nadania' });
  const coreApi = within(toGrant).getByRole('row', { name: /core-api/ });
  expect(within(coreApi).getByText('Zapis (write)')).toBeInTheDocument();
  const authService = within(toGrant).getByRole('row', { name: /auth-service/ });
  expect(within(authService).getByText('Zapis (write)')).toBeInTheDocument();
  const paymentService = within(toGrant).getByRole('row', { name: /payment-service/ });
  expect(within(paymentService).getByText('Odczyt (read)')).toBeInTheDocument();
  expect(within(toGrant).queryByText('Administrator')).not.toBeInTheDocument();

  expect(within(card).getByText('Brak nadanych dostępów z tego standardu.')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: APPROVE_LABEL })).toBeInTheDocument();
});

it('approves the standard for the demo login and confirms with a toast', async () => {
  const user = userEvent.setup();
  renderBaselinePage();

  await user.click(await screen.findByRole('button', { name: APPROVE_LABEL }));

  await waitFor(() => {
    expect(getLastBaselineApproval()).toEqual({ login: 'nowy-dev' });
  });
  expect(await screen.findByText('Standard zatwierdzony')).toBeInTheDocument();
});

it('moves the granted repositories to „already granted” after applying the standard', async () => {
  const user = userEvent.setup();
  renderBaselinePage();

  const card = await screen.findByRole('region', { name: ONBOARDING_SECTION });
  await user.click(within(card).getByRole('button', { name: APPROVE_LABEL }));

  const granted = await within(card).findByRole('table', { name: 'Już nadane' });
  const coreApi = within(granted).getByRole('row', { name: /core-api/ });
  expect(within(coreApi).getByText('Zapis (write)')).toBeInTheDocument();
  const paymentService = within(granted).getByRole('row', { name: /payment-service/ });
  expect(within(paymentService).getByText('Odczyt (read)')).toBeInTheDocument();

  await waitFor(() => {
    expect(within(card).queryByRole('table', { name: 'Do nadania' })).not.toBeInTheDocument();
  });
  expect(within(card).getByText(NOTHING_TO_GRANT)).toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: APPROVE_LABEL })).not.toBeInTheDocument();
});

it('shows the API error message with a retry action when the standard cannot be loaded', async () => {
  server.use(
    http.get('/api/v1/teams/:slug/baseline', () =>
      HttpResponse.json({ detail: 'Baza standardu jest niedostępna' }, { status: 500 }),
    ),
  );

  renderBaselinePage();

  expect(await screen.findAllByText('Baza standardu jest niedostępna')).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Odśwież' })).toHaveLength(2);
});

it('shows the API error message with a retry action when the onboarding proposal fails', async () => {
  server.use(
    http.get('/api/v1/onboarding/:login', () =>
      HttpResponse.json({ detail: 'Propozycja onboardingu jest niedostępna' }, { status: 500 }),
    ),
  );

  renderBaselinePage();

  const card = await screen.findByRole('region', { name: ONBOARDING_SECTION });
  expect(within(card).getByText('Propozycja onboardingu jest niedostępna')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Odśwież' })).toBeInTheDocument();
  // Standard zespołów ładuje się niezależnie od propozycji onboardingu.
  const dev = screen.getByRole('region', { name: DEV_SECTION });
  expect(within(dev).getByText('longtails/core-api')).toBeInTheDocument();
});

it('shows the API error message when approving the standard fails', async () => {
  server.use(
    http.post('/api/v1/onboarding/:login/apply', () =>
      HttpResponse.json({ detail: 'Onboarding nie powiódł się' }, { status: 500 }),
    ),
  );
  const user = userEvent.setup();
  renderBaselinePage();

  await user.click(await screen.findByRole('button', { name: APPROVE_LABEL }));

  expect(await screen.findByText('Onboarding nie powiódł się')).toBeInTheDocument();
});

it('offers exactly one approval action, in the onboarding card', async () => {
  renderBaselinePage();

  const card = await screen.findByRole('region', { name: ONBOARDING_SECTION });

  expect(screen.getAllByRole('button', { name: APPROVE_LABEL })).toHaveLength(1);
  expect(within(card).getByRole('button', { name: APPROVE_LABEL })).toBeInTheDocument();
});

it('shows the skeleton in the target layout while the standard is loading', async () => {
  server.use(
    http.get('/api/v1/teams/:slug/baseline', async ({ params }) => {
      await delay(50);
      return HttpResponse.json(findTeamBaselineFixture(String(params.slug)));
    }),
  );

  renderBaselinePage();

  expect(screen.getByRole('status', { name: 'Ładowanie standardu zespołu' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: DEV_SECTION })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: ONBOARDING_SECTION })).toBeInTheDocument();
});

it('explains an empty standard instead of showing an empty table', async () => {
  server.use(http.get('/api/v1/teams/:slug/baseline', () => HttpResponse.json([])));

  renderBaselinePage();

  expect(await screen.findAllByText(EMPTY_STANDARD)).toHaveLength(2);
  expect(
    within(screen.getByRole('region', { name: DEV_SECTION })).queryByRole('table'),
  ).not.toBeInTheDocument();
});

it('invalidates the baseline, onboarding, lease, dashboard and audit caches of the active service after approving', async () => {
  const user = userEvent.setup();
  const { queryClient } = renderBaselinePage();
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

  await user.click(await screen.findByRole('button', { name: APPROVE_LABEL }));

  // Prefiksy niosą id usługi, bo cache jest namespace'owany po usłudze: strona działa w kontekście
  // domyślnej usługi testów (`github`, patrz `renderWithProviders`), więc to jej wpisy unieważniamy.
  await waitFor(() => {
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['onboarding', 'github'] });
  });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['baseline', 'github'] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['leases', 'github'] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', 'github'] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audit', 'github'] });
});
