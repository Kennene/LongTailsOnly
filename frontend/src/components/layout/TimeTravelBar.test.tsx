import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { TimeTravelBar } from '@/components/layout/TimeTravelBar';
import { server } from '@/test/msw/server';
import {
  BASE_SIMULATED_NOW,
  getDemoResetCount,
  getLastTimeTravelRequest,
  getSimulatedNow,
} from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';

const INITIAL_CLOCK = /3 października 2026/;
const CUSTOM_DAYS_LABEL = 'Własna liczba dni';

/** Tytuły toastów zarejestrowanych przez Sonnera — realna biblioteka, bez mocków. */
function toastTitles(): string[] {
  return toast
    .getHistory()
    .map((entry) => ('title' in entry && typeof entry.title === 'string' ? entry.title : ''))
    .filter((title) => title !== '');
}

it('renders the simulated clock and offset read from the API', async () => {
  renderWithProviders(<TimeTravelBar />);

  expect(await screen.findByText(INITIAL_CLOCK)).toBeInTheDocument();
  expect(screen.getByText('Przesunięcie: 0 dni')).toBeInTheDocument();
});

it('advances the clock with the +15 dni preset', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await user.click(screen.getByRole('button', { name: '+15 dni' }));

  await waitFor(() => expect(getLastTimeTravelRequest()).toEqual({ days: 15 }));
  expect(getSimulatedNow()).toBe('2026-10-18T00:00:00.000Z');
  expect(await screen.findByText(/18 października 2026/)).toBeInTheDocument();
  expect(screen.getByText('Przesunięcie: +15 dni')).toBeInTheDocument();
});

it('advances the clock by the custom number of days and clears the input', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  const input = screen.getByLabelText(CUSTOM_DAYS_LABEL);
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

  await user.type(screen.getByLabelText(CUSTOM_DAYS_LABEL), '400');
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

    await user.type(screen.getByLabelText(CUSTOM_DAYS_LABEL), value);
    await user.click(screen.getByRole('button', { name: 'Przesuń' }));

    expect(await screen.findByText('Podaj dodatnią liczbę dni')).toBeInTheDocument();
    expect(getLastTimeTravelRequest()).toBeNull();
  },
);

it('resets the demo scenario to the seeded clock after confirmation', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);

  await user.click(screen.getByRole('button', { name: '+30 dni' }));
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

  await user.click(screen.getByRole('button', { name: '+15 dni' }));

  expect(screen.getByRole('button', { name: '+30 dni' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Przesuń' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();

  await waitFor(() => expect(screen.getByRole('button', { name: '+30 dni' })).toBeEnabled());
});

it('announces a successful jump with a toast', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TimeTravelBar />);
  await screen.findByText(INITIAL_CLOCK);
  const toastsBefore = toastTitles().length;

  await user.click(screen.getByRole('button', { name: '+15 dni' }));

  await waitFor(() => expect(toastTitles()).toHaveLength(toastsBefore + 1));
  expect(toastTitles().at(-1)).toBe('Zmieniono czas symulowany');
});
