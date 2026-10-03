import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { TimeTravelBar } from '@/components/mocks/TimeTravelBar';
import { server } from '@/test/msw/server';
import {
  BASE_SIMULATED_NOW,
  getDemoResetCount,
  getLastTimeTravelRequest,
  getSimulatedNow,
} from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { SimulationClock } from '@/types/api';

const INITIAL_CLOCK = /3 października 2026/;
const DAYS_LABEL = 'Liczba dni';

/** Jedyny sposób przesunięcia zegara: wpisanie liczby dni i „Przesuń”. */
async function jumpBy(user: ReturnType<typeof userEvent.setup>, days: string): Promise<void> {
  await user.type(screen.getByLabelText(DAYS_LABEL), days);
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));
}

/** Tytuły toastów zarejestrowanych przez Sonnera — realna biblioteka, bez mocków. */
function toastTitles(): string[] {
  return toast
    .getHistory()
    .map((entry) => ('title' in entry && typeof entry.title === 'string' ? entry.title : ''))
    .filter((title) => title !== '');
}

it('offers no preset jump buttons, only the typed value and reset', async () => {
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  expect(screen.queryByRole('button', { name: /^\+\d+ dni$/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText(DAYS_LABEL)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Przesuń' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
});

it('renders the simulated clock and offset read from the API', async () => {
  renderWithProviders(<TimeTravelBar />);

  expect(await screen.findByText(INITIAL_CLOCK)).toBeInTheDocument();
  expect(screen.getByText('Przesunięcie: 0 dni')).toBeInTheDocument();
});

it('maps `simulated_now` from the clock endpoint onto the bar', async () => {
  // Kontrakt `GET /simulation/clock` to `SimulationClock { simulated_now, offset_days }`,
  // a pasek czyta wewnętrzny `ClockRead { now, offset_days }` — mapowanie należy do `api/simulation.ts`.
  const clock: SimulationClock = {
    simulated_now: '2026-11-05T03:00:00Z',
    offset_days: 33,
  };
  server.use(http.get('/api/v1/simulation/clock', () => HttpResponse.json(clock)));
  renderWithProviders(<TimeTravelBar />);

  expect(await screen.findByText('5 listopada 2026, 04:00')).toBeInTheDocument();
  expect(screen.getByText('Przesunięcie: +33 dni')).toBeInTheDocument();
});

it('advances the clock by the typed number of days', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await jumpBy(user, '15');

  await waitFor(() => expect(getLastTimeTravelRequest()).toEqual({ days: 15 }));
  expect(getSimulatedNow()).toBe('2026-10-18T00:00:00.000Z');
  expect(await screen.findByText(/18 października 2026/)).toBeInTheDocument();
  expect(screen.getByText('Przesunięcie: +15 dni')).toBeInTheDocument();
});

it('advances the clock by the custom number of days and clears the input', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  const input = screen.getByLabelText(DAYS_LABEL);
  await user.type(input, '25');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));

  await waitFor(() => expect(getLastTimeTravelRequest()).toEqual({ days: 25 }));
  expect(await screen.findByText(/28 października 2026/)).toBeInTheDocument();
  expect(input).toHaveValue('');
});

it('rejects a custom value above the API limit without calling the API', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await user.type(screen.getByLabelText(DAYS_LABEL), '400');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));

  expect(await screen.findByText('Podaj liczbę dni z zakresu 1–365')).toBeInTheDocument();
  expect(getLastTimeTravelRequest()).toBeNull();
});

it.each(['0', '-5', 'abc'])(
  'rejects the invalid custom value %s without calling the API',
  async (value: string) => {
    const user = userEvent.setup();
    renderWithProviders(<TimeTravelBar />);
    await screen.findByText(INITIAL_CLOCK);

    await user.type(screen.getByLabelText(DAYS_LABEL), value);
    await user.click(screen.getByRole('button', { name: 'Przesuń' }));

    expect(await screen.findByText('Podaj dodatnią liczbę dni')).toBeInTheDocument();
    expect(getLastTimeTravelRequest()).toBeNull();
  },
);

it('resets the demo scenario to the seeded clock after confirmation', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await jumpBy(user, '30');
  expect(await screen.findByText(/2 listopada 2026/)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Reset' }));
  await user.click(await screen.findByRole('button', { name: 'Potwierdzam reset' }));

  await waitFor(() => expect(getDemoResetCount()).toBe(1));
  expect(getSimulatedNow()).toBe(BASE_SIMULATED_NOW);
  expect(await screen.findByText(INITIAL_CLOCK)).toBeInTheDocument();
  await waitFor(() => expect(toastTitles()).toContain('Przywrócono scenariusz demo'));
});

it('disables every control while the jump is pending', async () => {
  const user = userEvent.setup();
  server.use(
    http.post('/api/v1/simulation/time-travel', async () => {
      await delay(75);

      return HttpResponse.json({ now: BASE_SIMULATED_NOW, offset_days: 15 });
    }),
  );
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await jumpBy(user, '15');

  expect(screen.getByLabelText(DAYS_LABEL)).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Przesuń' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Przesuń' })).toBeEnabled());
});

it('announces a successful jump with a toast', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);
  const toastsBefore = toastTitles().length;

  await jumpBy(user, '15');

  await waitFor(() => expect(toastTitles()).toHaveLength(toastsBefore + 1));
  expect(toastTitles().at(-1)).toBe('Zmieniono czas symulowany');
});

it('surfaces a failed jump instead of looking like a hung button', async () => {
  const user = userEvent.setup();
  server.use(
    http.post('/api/v1/simulation/time-travel', () =>
      HttpResponse.json({ detail: 'Backend nie odpowiada' }, { status: 503 }),
    ),
  );
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await jumpBy(user, '15');

  const message = 'Nie udało się zmienić czasu symulowanego.';
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  await waitFor(() => expect(toastTitles()).toContain(message));
});

it('explains a disabled demo reset (404) instead of looking like a hung button', async () => {
  const user = userEvent.setup();
  server.use(
    http.post('/api/v1/demo/reset', () =>
      HttpResponse.json({ detail: 'Not Found' }, { status: 404 }),
    ),
  );
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await user.click(screen.getByRole('button', { name: 'Reset' }));
  await user.click(await screen.findByRole('button', { name: 'Potwierdzam reset' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Reset demo jest wyłączony na serwerze (ENABLE_DEMO_RESET=false).',
  );
  expect(getDemoResetCount()).toBe(0);
});
