import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { DemoRefreshButton } from '@/components/layout/DemoRefreshButton';
import { REFRESHED_USER } from '@/test/msw/domains/simulation';
import { server } from '@/test/msw/server';
import { getDemoRefreshCount, recordDemoReset } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { DemoRefreshResult } from '@/types/api';

const BUTTON = 'Odśwież dane';
const ADDED_TOAST = 'Dodano użytkownika Zofia (zofia) do zespołu DEV';

/** Tytuły toastów zarejestrowanych przez Sonnera — realna biblioteka, bez mocków. */
function toastTitles(): string[] {
  return toast
    .getHistory()
    .map((entry) => ('title' in entry && typeof entry.title === 'string' ? entry.title : ''))
    .filter((title) => title !== '');
}

async function clickRefresh(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: BUTTON }));
}

function respondWith(result: DemoRefreshResult): void {
  server.use(http.post('/api/v1/demo/refresh', () => HttpResponse.json(result)));
}

it('fetches one additional user on the first click and announces them', async () => {
  const user = userEvent.setup();
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  await waitFor(() => expect(toastTitles()).toContain(ADDED_TOAST));
  expect(await screen.findByText(ADDED_TOAST)).toBeInTheDocument();
  expect(getDemoRefreshCount()).toBe(1);
});

it('announces fresh activity instead of a new user on every later click', async () => {
  const user = userEvent.setup();
  renderWithProviders(<DemoRefreshButton />);
  await clickRefresh(user);
  await waitFor(() => expect(getDemoRefreshCount()).toBe(1));
  const addedBefore = toastTitles().filter((title) => title === ADDED_TOAST).length;

  for (const click of [2, 3]) {
    await waitFor(() => expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled());
    const activityBefore = toastTitles().filter((title) =>
      title.startsWith('Nowa aktywność'),
    ).length;
    await clickRefresh(user);
    await waitFor(() => expect(getDemoRefreshCount()).toBe(click));
    await waitFor(() =>
      expect(toastTitles().filter((title) => title.startsWith('Nowa aktywność'))).toHaveLength(
        activityBefore + 1,
      ),
    );
  }

  expect(toastTitles().at(-1)).toBe('Nowa aktywność użytkowników: 3 zdarzenia');
  expect(toastTitles().filter((title) => title === ADDED_TOAST)).toHaveLength(addedBefore);
});

it.each([
  [1, 'Nowa aktywność użytkowników: 1 zdarzenie'],
  [5, 'Nowa aktywność użytkowników: 5 zdarzeń'],
])('declines the event count in Polish (%i)', async (count: number, expected: string) => {
  const user = userEvent.setup();
  respondWith({
    added_users: [],
    events: Array.from({ length: count }, (_, index) => ({
      id: 200 + index,
      user_id: 3 + index,
      repo_id: 1,
      timestamp: '2026-10-03T00:00:00Z',
      action_type: 'PushEvent',
      required_permission: 'write',
    })),
  });
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  await waitFor(() => expect(toastTitles()).toContain(expected));
});

it('adds the user again after a demo reset wiped them', async () => {
  const user = userEvent.setup();
  renderWithProviders(<DemoRefreshButton />);
  await clickRefresh(user);
  await waitFor(() => expect(getDemoRefreshCount()).toBe(1));
  const addedBefore = toastTitles().filter((title) => title === ADDED_TOAST).length;

  recordDemoReset();
  await waitFor(() => expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled());
  await clickRefresh(user);

  await waitFor(() =>
    expect(toastTitles().filter((title) => title === ADDED_TOAST)).toHaveLength(addedBefore + 1),
  );
});

it('names a user without a team without inventing one', async () => {
  const user = userEvent.setup();
  respondWith({ added_users: [{ ...REFRESHED_USER, team: null }], events: [] });
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  await waitFor(() => expect(toastTitles()).toContain('Dodano użytkownika Zofia (zofia)'));
});

it('says so when the refresh brought nothing new', async () => {
  const user = userEvent.setup();
  respondWith({ added_users: [], events: [] });
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  await waitFor(() => expect(toastTitles()).toContain('Brak nowych danych do pobrania'));
});

it('refetches every view after a refresh', async () => {
  const user = userEvent.setup();
  const { queryClient } = renderWithProviders(<DemoRefreshButton />);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  await clickRefresh(user);

  await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
});

it('is disabled while the refresh is pending', async () => {
  const user = userEvent.setup();
  server.use(
    http.post('/api/v1/demo/refresh', async () => {
      await delay(75);

      return HttpResponse.json({ added_users: [], events: [] });
    }),
  );
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  expect(screen.getByRole('button', { name: BUTTON })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled());
});

it('surfaces a failed refresh instead of looking like a hung button', async () => {
  const user = userEvent.setup();
  server.use(
    http.post('/api/v1/demo/refresh', () =>
      HttpResponse.json({ detail: 'Backend nie odpowiada' }, { status: 503 }),
    ),
  );
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  await waitFor(() => expect(toastTitles()).toContain('Nie udało się odświeżyć danych demo.'));
  expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
});

it('explains a disabled demo refresh (404)', async () => {
  const user = userEvent.setup();
  server.use(
    http.post('/api/v1/demo/refresh', () =>
      HttpResponse.json({ detail: 'Not Found' }, { status: 404 }),
    ),
  );
  renderWithProviders(<DemoRefreshButton />);

  await clickRefresh(user);

  await waitFor(() =>
    expect(toastTitles()).toContain(
      'Odświeżanie demo jest wyłączone na serwerze (ENABLE_DEMO_RESET=false).',
    ),
  );
});
