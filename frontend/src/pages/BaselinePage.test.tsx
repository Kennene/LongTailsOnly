import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, expect, it, vi } from 'vitest';

import { findBaselineFixture } from '@/api/fixtures/baseline';
import { BaselinePage } from '@/pages/BaselinePage';
import { getLastBaselineApproval, resetBaselineApproval } from '@/test/msw/domains/baseline';
import { server } from '@/test/msw/server';
import { renderWithProviders, type RenderWithProvidersResult } from '@/test/renderWithProviders';

/** `Toaster` (i stub `matchMedia`) dostarcza `renderWithProviders` — drugi toaster dublowałby toast. */
function renderBaselinePage(): RenderWithProvidersResult {
  return renderWithProviders(<BaselinePage />);
}

beforeEach(() => {
  resetBaselineApproval();
});

it('renders baseline entries for both teams and never proposes administrator access', async () => {
  renderBaselinePage();

  expect(await screen.findByRole('heading', { name: 'Zespół DEV' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Zespół QA' })).toBeInTheDocument();

  // Obie sekcje pojawiają się w tym samym renderze (strona czeka na oba odczyty), więc asercje
  // niżej mogą być synchroniczne — inaczej ścigałyby się z siecią.
  expect(screen.getByText('longtails/core-api')).toBeInTheDocument();
  expect(screen.getByText('longtails/qa-automation')).toBeInTheDocument();
  // Kolumna „Udział aktywnych (30 dni)” — sama liczba, bez powtarzania nagłówka w każdej komórce.
  expect(screen.getByText('11/12')).toBeInTheDocument();
  expect(screen.getByText('6/6')).toBeInTheDocument();

  expect(screen.getAllByText('Zapis (write)').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Odczyt (read)').length).toBeGreaterThan(0);
  expect(screen.queryByText('Administrator')).not.toBeInTheDocument();
});

it('approves the DEV standard for the selected new member and confirms with a toast', async () => {
  const user = userEvent.setup();
  renderBaselinePage();

  await user.click(await screen.findByRole('button', { name: 'Zatwierdź standard' }));

  await waitFor(() => {
    expect(getLastBaselineApproval()).toEqual({
      team_slug: 'dev',
      body: { user_login: 'nowy-dev' },
    });
  });
  expect(await screen.findByText('Standard zatwierdzony')).toBeInTheDocument();
});

it('shows the API error message with a retry action when the standard cannot be loaded', async () => {
  server.use(
    http.get('/api/v1/baseline/:teamSlug', () =>
      HttpResponse.json({ detail: 'Baza standardu jest niedostępna' }, { status: 500 }),
    ),
  );

  renderBaselinePage();

  expect(await screen.findAllByText('Baza standardu jest niedostępna')).not.toHaveLength(0);
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Odśwież' }).length).toBeGreaterThan(0);
  });
});

it('shows the API error message when approving the standard fails', async () => {
  server.use(
    http.post('/api/v1/baseline/:teamSlug/approve', () =>
      HttpResponse.json({ detail: 'Onboarding nie powiódł się' }, { status: 500 }),
    ),
  );
  const user = userEvent.setup();
  renderBaselinePage();

  await user.click(await screen.findByRole('button', { name: 'Zatwierdź standard' }));

  expect(await screen.findByText('Onboarding nie powiódł się')).toBeInTheDocument();
});

it('offers the approval action only for the team that has new members', async () => {
  renderBaselinePage();

  expect(await screen.findByText('Brak nowych członków do zatwierdzenia.')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Zatwierdź standard' })).toHaveLength(1);
  });
});

it('shows the skeleton in the target layout while the standard is loading', async () => {
  server.use(
    http.get('/api/v1/baseline/:teamSlug', async ({ params }) => {
      await delay(50);
      return HttpResponse.json(findBaselineFixture(String(params.teamSlug)));
    }),
  );

  renderBaselinePage();

  expect(screen.getByRole('status', { name: 'Ładowanie standardu zespołu' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Zespół DEV' })).toBeInTheDocument();
});

it('explains an empty standard instead of showing an empty table', async () => {
  server.use(
    http.get('/api/v1/baseline/:teamSlug', () =>
      HttpResponse.json({
        team: { id: 1, name: 'DEV', slug: 'dev' },
        entries: [],
        new_members: [],
      }),
    ),
  );

  renderBaselinePage();

  expect(
    await screen.findAllByText(
      'Za mało aktywnych członków w ostatnich 30 dniach — ten zespół nie ma jeszcze propozycji standardu.',
    ),
  ).not.toHaveLength(0);
});

it('invalidates the baseline, lease and audit caches after approving the standard', async () => {
  const user = userEvent.setup();
  const { queryClient } = renderBaselinePage();
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

  await user.click(await screen.findByRole('button', { name: 'Zatwierdź standard' }));

  await waitFor(() => {
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['baseline'] });
  });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['leases'] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audit'] });
});
