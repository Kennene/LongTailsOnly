import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { servicesFixture } from '@/api/fixtures/services';
import { useActiveService, useServicesContext } from '@/services/ServicesContext';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ServiceRead } from '@/types/api';

/** Zapisany wybór to goły identyfikator, nie JSON (spec §5.2). */
const STORAGE_KEY = 'lease-governor.service';

/**
 * Katalog z usługą, której **nie zna rejestr frontendu** — dokładnie ten przypadek, dla którego
 * istnieją `fallbackIcon` i `getServiceConfig → undefined` (Ruling 12). Picker oferuje ją jako
 * opcję, więc wybór musi być możliwy.
 */
const UNREGISTERED_ON_FRONTEND: ServiceRead[] = [
  {
    id: 'linkedin-sourced',
    name: 'LinkedIn Sourced',
    kind: 'cloud_iam',
    capabilities: ['dashboard'],
    is_available: true,
  },
];

/** Katalog, w którym backend nie zna `github` — przypadek „integracja wyrejestrowana”. */
const DEMO_TRACKER_ONLY: ServiceRead[] = [
  {
    id: 'demo-tracker',
    name: 'Demo Tracker (integracja demonstracyjna)',
    kind: 'issue_tracker',
    capabilities: ['dashboard', 'audit'],
    is_available: false,
  },
];

function catalogStateLabel(isPending: boolean, isError: boolean): string {
  if (isPending) {
    return 'wczytywanie';
  }

  return isError ? 'błąd' : 'gotowe';
}

function ActiveServiceProbe(): React.JSX.Element {
  const { activeService, services, isPending, isError } = useActiveService();

  return (
    <div>
      <span data-testid="active-service">{activeService.id}</span>
      <span data-testid="catalog-state">{catalogStateLabel(isPending, isError)}</span>
      <span data-testid="services-count">{services.length}</span>
    </div>
  );
}

function ServiceSwitcherProbe(): React.JSX.Element {
  const { activeService, services, setActiveService } = useActiveService();

  return (
    <div>
      <span data-testid="active-service">{activeService.id}</span>
      {services.map((service: ServiceRead): React.JSX.Element => (
        <button key={service.id} type="button" onClick={() => setActiveService(service.id)}>
          {`Przełącz na ${service.id}`}
        </button>
      ))}
      <button type="button" onClick={() => setActiveService('decommissioned')}>
        Wybierz nieznaną usługę
      </button>
    </div>
  );
}

/**
 * Sonda z zaszytymi opcjami: przyciski **nie** pochodzą z `services`, więc da się nią klikać także
 * wtedy, gdy katalog jest pusty, w drodze albo martwy. Każdy przycisk reprezentuje inną komórkę
 * macierzy „rejestr frontendu × katalog”: `github` i `demo-tracker` zna rejestr, `linkedin-sourced`
 * zna tylko katalog, a `decommissioned` nie zna żadne z nich.
 */
function FixedSwitcherProbe(): React.JSX.Element {
  const { activeService, isPending, isError, setActiveService } = useActiveService();

  return (
    <div>
      <span data-testid="active-service">{activeService.id}</span>
      <span data-testid="catalog-state">{catalogStateLabel(isPending, isError)}</span>
      <button type="button" onClick={() => setActiveService('github')}>
        Przełącz na github
      </button>
      <button type="button" onClick={() => setActiveService('demo-tracker')}>
        Przełącz na demo-tracker
      </button>
      <button type="button" onClick={() => setActiveService('linkedin-sourced')}>
        Przełącz na linkedin-sourced
      </button>
      <button type="button" onClick={() => setActiveService('decommissioned')}>
        Wybierz nieznaną usługę
      </button>
    </div>
  );
}

function ServicesContextProbe(): React.JSX.Element {
  const { activeService } = useServicesContext();

  return <span data-testid="context-active-service">{activeService.id}</span>;
}

/**
 * Katalog dochodzi asynchronicznie, a provider renderuje dzieci już w trakcie oczekiwania —
 * `await findByTestId(...)` rozwiązałoby się na pierwszym renderze i **nie** ponowiło asercji.
 * Dlatego najpierw czekamy na rozstrzygnięcie, a dopiero potem asertujemy identyfikator.
 * „gotowe” znaczy, że provider podjął już decyzję na podstawie katalogu.
 */
async function waitForCatalog(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('catalog-state')).toHaveTextContent('gotowe');
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ServicesProvider', () => {
  it('defaults to github when storage is empty', async () => {
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^github$/);
  });

  it('restores a stored selection', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'demo-tracker');
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it.each<string>(['{', 'null', '[]', 'not-json', ''])(
    'falls back to github for malformed stored value %s',
    async (stored: string) => {
      window.localStorage.setItem(STORAGE_KEY, stored);
      renderWithProviders(<ActiveServiceProbe />);

      await waitForCatalog();

      expect(screen.getByTestId('active-service')).toHaveTextContent(/^github$/);
    },
  );

  it('falls back to github when the stored service is not in the catalog', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'decommissioned');
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^github$/);
  });

  it('does not erase an unknown stored selection when it falls back', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'decommissioned');
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('decommissioned');
  });

  it('still selects for the session when localStorage.setItem throws', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((): void => {
      throw new Error('QuotaExceededError');
    });
    renderWithProviders(<ServiceSwitcherProbe />);

    await user.click(await screen.findByRole('button', { name: 'Przełącz na demo-tracker' }));

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it('falls back to github when localStorage.getItem throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((): never => {
      throw new Error('SecurityError');
    });
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^github$/);
  });

  it('accepts a selection made before the catalog arrives', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/services', async () => {
        await delay(300);

        return HttpResponse.json(servicesFixture);
      }),
    );
    renderWithProviders(<FixedSwitcherProbe />);

    // Warunek wstępny: klikamy, gdy katalog jeszcze nie dotarł — inaczej test nie bada tego okna.
    expect(screen.getByTestId('catalog-state')).toHaveTextContent('wczytywanie');

    await user.click(screen.getByRole('button', { name: 'Przełącz na demo-tracker' }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('demo-tracker');
    // Katalog jest jeszcze w drodze, ale rejestr frontendu wie, kim jest `demo-tracker` — wybór
    // działa od razu, a katalog, który dotrze, potwierdzi go albo zdegraduje (Ruling 20/21).
    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it('does not persist a registry-unknown selection while the catalog is pending', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/services', async () => {
        await delay(300);

        return HttpResponse.json(servicesFixture);
      }),
    );
    renderWithProviders(<FixedSwitcherProbe />);

    expect(screen.getByTestId('catalog-state')).toHaveTextContent('wczytywanie');

    await user.click(screen.getByRole('button', { name: 'Wybierz nieznaną usługę' }));

    // Katalogu nie ma czym potwierdzić, a picker takiej opcji nigdy nie oferuje — literówka
    // nie może trafić do `localStorage` tylko dlatego, że katalog jest w drodze.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('accepts a registry-known selection when the catalog request fails', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<FixedSwitcherProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-state')).toHaveTextContent('błąd');
    });

    await user.click(screen.getByRole('button', { name: 'Przełącz na demo-tracker' }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('demo-tracker');
    // Ruling 21: katalog nie wypowie się już w tej sesji, więc przyjęty wybór musi **zadziałać**
    // od razu — inaczej widoczna opcja byłaby martwym klikiem, a użytkownik zostałby uwięziony
    // na nieaktualnym zapisie.
    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it('restores a stored registry-known service when the catalog request fails', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'demo-tracker');
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<ActiveServiceProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-state')).toHaveTextContent('błąd');
    });

    // Ten sam mechanizm bez kliknięcia: rejestr frontendu zna zapis, więc użytkownik nie zostaje
    // uwięziony na placeholderze, gdy backend leży (Ruling 21).
    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it('does not persist a registry-unknown selection when the catalog request fails', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<FixedSwitcherProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-state')).toHaveTextContent('błąd');
    });

    await user.click(screen.getByRole('button', { name: 'Wybierz nieznaną usługę' }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('active-service')).toBeEmptyDOMElement();
  });

  it('accepts and persists a registry-known selection from a settled catalog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FixedSwitcherProbe />);

    await waitForCatalog();
    await user.click(screen.getByRole('button', { name: 'Przełącz na demo-tracker' }));

    // Komórka „katalog osiadły + wpis w katalogu + znany rejestrowi”: stan dowodzi przyjęcia,
    // ale dopiero odczyt `localStorage` dowodzi zapisu — inaczej „przyjęte, ale niezapisane”
    // przechodzi niezauważone.
    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('demo-tracker');
  });

  it('ignores a registry-known selection that the settled catalog omits', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v1/services', () => HttpResponse.json(DEMO_TRACKER_ONLY)));
    renderWithProviders(<FixedSwitcherProbe />);

    await waitForCatalog();
    await user.click(screen.getByRole('button', { name: 'Przełącz na github' }));

    // Rozstrzygnięty katalog jest jedynym autorytetem — rejestr frontendu nie może go przebić.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it('accepts a catalog service that the frontend registry does not know', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v1/services', () => HttpResponse.json(UNREGISTERED_ON_FRONTEND)));
    renderWithProviders(<FixedSwitcherProbe />);

    await waitForCatalog();
    await user.click(screen.getByRole('button', { name: 'Przełącz na linkedin-sourced' }));

    // Picker oferuje wpisy z katalogu, więc opcja spoza rejestru frontendu musi być wybieralna:
    // dalej degraduje się przez `fallbackIcon` i trasę domyślną (Ruling 12).
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('linkedin-sourced');
  });

  it('ignores a selection that is not in the catalog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ServiceSwitcherProbe />);
    await screen.findByRole('button', { name: 'Przełącz na demo-tracker' });

    await user.click(screen.getByRole('button', { name: 'Wybierz nieznaną usługę' }));

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^github$/);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('renders its children with a placeholder when the catalog is empty', async () => {
    server.use(http.get('/api/v1/services', () => HttpResponse.json([])));
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toBeEmptyDOMElement();
    expect(screen.getByTestId('services-count')).toHaveTextContent('0');
  });

  it('does not claim github is active when the catalog omits it', async () => {
    server.use(http.get('/api/v1/services', () => HttpResponse.json(DEMO_TRACKER_ONLY)));
    renderWithProviders(<ActiveServiceProbe />);

    await waitForCatalog();

    expect(screen.getByTestId('active-service')).toHaveTextContent(/^demo-tracker$/);
  });

  it('reports the error and still renders its children when the catalog request fails', async () => {
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<ActiveServiceProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-state')).toHaveTextContent('błąd');
    });

    expect(screen.getByTestId('services-count')).toHaveTextContent('0');
  });
});

describe('useActiveService', () => {
  it('throws when useActiveService is called outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ActiveServiceProbe />)).toThrow(
      'useActiveService must be used within ServicesProvider',
    );
  });
});

describe('useServicesContext', () => {
  it('exposes the active service alongside useActiveService', async () => {
    renderWithProviders(<ServicesContextProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('context-active-service')).toHaveTextContent(/^github$/);
    });
  });

  it('throws when useServicesContext is called outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ServicesContextProbe />)).toThrow(
      'useServicesContext must be used within ServicesProvider',
    );
  });
});
