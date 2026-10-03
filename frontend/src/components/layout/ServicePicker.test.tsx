import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { servicesFixture } from '@/api/fixtures/services';
import { ServicePicker } from '@/components/layout/ServicePicker';
import { ServiceRouteGuard } from '@/services/ServiceRouteGuard';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ActiveServiceProbe } from '@/test/serviceProbe';
import type { ServiceRead } from '@/types/api';

const STORAGE_KEY = 'lease-governor.service';

/** Katalog, w którym backend nie zna `github` — osiadły katalog rozstrzyga na jego niekorzyść. */
const DEMO_TRACKER_ONLY: ServiceRead[] = [
  {
    id: 'demo-tracker',
    name: 'Demo Tracker (integracja demonstracyjna)',
    kind: 'issue_tracker',
    capabilities: ['dashboard', 'audit'],
    is_available: false,
  },
];

/**
 * Katalog z usługą, której **nie zna rejestr frontendu** (Ruling 23). Kontrolka oferuje wpisy
 * katalogu, więc taka opcja musi być wybieralna — inaczej powstałby martwy klik.
 */
const GITHUB_AND_UNREGISTERED: ServiceRead[] = [
  {
    id: 'github',
    name: 'GitHub',
    kind: 'vcs',
    capabilities: ['dashboard', 'leases', 'appeals', 'baseline', 'graph', 'audit'],
    is_available: true,
  },
  {
    id: 'linkedin-sourced',
    name: 'LinkedIn Sourced',
    kind: 'cloud_iam',
    capabilities: ['dashboard'],
    is_available: true,
  },
];

/**
 * Lokalny fixture tras — kopia z `ServiceRouteGuard.test.tsx` jest świadoma (Ruling 2): wspólny
 * moduł testowy byłby abstrakcją dla dwóch wywołań. Kontrolka stoi **obok** `<Routes>`, bo test
 * przełącza usługę dokładnie tak, jak robi to użytkownik.
 */
function GuardedRoutes(): React.JSX.Element {
  return (
    <>
      <ServicePicker />
      <Routes>
        <Route element={<ServiceRouteGuard />}>
          <Route path="/" element={<p data-testid="dashboard-marker">Pulpit</p>} />
          <Route path="/audit" element={<p data-testid="audit-marker">Audyt</p>} />
          <Route path="/leases" element={<p data-testid="leases-marker">Dzierżawy</p>} />
        </Route>
      </Routes>
    </>
  );
}

/** Sonda jest obowiązkowa: `ServicePicker` nie posiada `data-testid="active-service"`. */
function pickerWithProbe(): React.JSX.Element {
  return (
    <>
      <ServicePicker />
      <ActiveServiceProbe />
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ServicePicker', () => {
  it('exposes an accessible name for the selector', async () => {
    renderWithProviders(<ServicePicker />);

    expect(await screen.findByLabelText('Usługa')).toBeInTheDocument();
  });

  it('switches the active service through selectOptions', async () => {
    renderWithProviders(pickerWithProbe());

    await userEvent.selectOptions(await screen.findByLabelText('Usługa'), 'demo-tracker');

    expect(await screen.findByTestId('active-service')).toHaveTextContent('demo-tracker');
    // Komórka „katalog osiadły + wpis w katalogu + znany rejestrowi” musi nie tylko przyjąć wybór,
    // ale i go zapisać — inaczej „przyjęte, ale niezapisane” przechodzi niezauważone.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('demo-tracker');
  });

  it('marks an unavailable service in its option label', async () => {
    renderWithProviders(<ServicePicker />);

    const option = await screen.findByRole('option', { name: /Demo Tracker.*niedostępna/ });

    expect(option).toBeInTheDocument();
  });

  it('navigates to the default view when the current one is unsupported', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'github');
    renderWithProviders(<GuardedRoutes />, { route: '/leases' });

    await userEvent.selectOptions(await screen.findByLabelText('Usługa'), 'demo-tracker');

    expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
  });

  it('degrades visibly when the catalog request fails, without trapping the user', async () => {
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(pickerWithProbe());

    expect(await screen.findByRole('alert')).toHaveTextContent(/usług/i);
    // Ruling 21: kontrolka musi przeżyć awarię — użytkownik z nieaktualnym zapisem ma się
    // z niej przełączyć, gdy backend leży.
    expect(screen.getByLabelText('Usługa')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Usługa'), 'github');

    // Przyjęty wybór musi **zadziałać**, nie tylko trafić do `localStorage`: katalog nie wypowie
    // się już w tej sesji, więc wybór bez efektu byłby martwym klikiem i nie miałby go co poprawić
    // (Ruling 21, spec §5.6.1 zdanie 3).
    expect(await screen.findByTestId('active-service')).toHaveTextContent(/^github$/);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('github');
  });

  it('shows the icon of the active service, not a fixed one', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'demo-tracker');
    renderWithProviders(pickerWithProbe());

    // Rejestr daje `demo-tracker` ikonę zastępczą, a `github` — znak firmowy, więc podmiana
    // aktywnej usługi musi podmienić SVG w slocie (spec §7.3).
    const icon = await screen.findByTestId('service-picker-icon');
    const demoIcon = icon.innerHTML;

    await userEvent.selectOptions(await screen.findByLabelText('Usługa'), 'github');

    expect(await screen.findByTestId('active-service')).toHaveTextContent(/^github$/);
    expect(icon).not.toBeEmptyDOMElement();
    expect(icon.innerHTML).not.toBe(demoIcon);
  });

  it('renders registry entries and marks itself busy while the catalog is pending', async () => {
    server.use(
      http.get('/api/v1/services', async () => {
        await delay(150);

        return HttpResponse.json(servicesFixture);
      }),
    );
    renderWithProviders(<ServicePicker />);

    // Zakaz spinnera w treści (`DESIGN.md:98`): kontrolka renderuje się od razu z rejestru
    // frontendu, a `aria-busy` mówi o tym, że katalog jeszcze nie dotarł.
    const select = screen.getByLabelText('Usługa');
    expect(select).toHaveAttribute('aria-busy', 'true');
    expect(select).toHaveValue('');
    // Stan bieżący jest widoczny, a nie pusty: nic nie jest jeszcze aktywne, więc opcja-placeholder
    // jest wyłączona. `setActiveService('')` i tak by jej nie przyjął, a wyłączonej opcji nie da
    // się kliknąć — nie jest to więc martwy klik (Ruling 23).
    expect(within(select).getByRole('option', { name: 'Brak usług' })).toBeDisabled();
    expect(within(select).getByRole('option', { name: 'demo-tracker' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('Usługa')).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('offers a catalog service the frontend registry does not know, and switches to it', async () => {
    server.use(http.get('/api/v1/services', () => HttpResponse.json(GITHUB_AND_UNREGISTERED)));
    renderWithProviders(pickerWithProbe());

    // Czekamy na rozstrzygnięcie katalogu: dopiero wtedy opcje pochodzą z katalogu.
    await waitFor(() => {
      expect(screen.getByTestId('active-service')).toHaveTextContent(/^github$/);
    });

    await userEvent.selectOptions(screen.getByLabelText('Usługa'), 'linkedin-sourced');

    expect(await screen.findByTestId('active-service')).toHaveTextContent('linkedin-sourced');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('linkedin-sourced');
  });

  it('does not offer a registry service that the settled catalog omits', async () => {
    server.use(http.get('/api/v1/services', () => HttpResponse.json(DEMO_TRACKER_ONLY)));
    renderWithProviders(<ServicePicker />);

    // Etykieta z katalogu jest dowodem rozstrzygnięcia — wcześniej opcje pochodzą z rejestru.
    await screen.findByRole('option', { name: /Demo Tracker/ });

    expect(screen.queryByRole('option', { name: /github/i })).not.toBeInTheDocument();
  });
});
