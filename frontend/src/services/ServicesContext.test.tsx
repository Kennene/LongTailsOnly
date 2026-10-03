import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveService, useServicesContext } from '@/services/ServicesContext';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ServiceRead } from '@/types/api';

/** Zapisany wybór to goły identyfikator, nie JSON (spec §5.2). */
const STORAGE_KEY = 'lease-governor.service';

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

function ServicesContextProbe(): React.JSX.Element {
  const { activeService, services } = useServicesContext();

  return (
    <div>
      <span data-testid="context-active-service">{activeService.id}</span>
      <span data-testid="context-services-count">{services.length}</span>
    </div>
  );
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

  it('returns an empty catalog instead of throwing without a provider', () => {
    render(<ServicesContextProbe />);

    expect(screen.getByTestId('context-active-service')).toBeEmptyDOMElement();
    expect(screen.getByTestId('context-services-count')).toHaveTextContent('0');
  });
});
