import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { Sidebar } from '@/components/layout/Sidebar';
import { renderWithProviders } from '@/test/renderWithProviders';

const STORAGE_KEY = 'lease-governor.service';

/** Sześć tras `github` w kolejności z rejestru usług — tej samej, którą nawigacja renderuje. */
const GITHUB_LABELS = ['Pulpit', 'Dzierżawy', 'Odwołania', 'Standard zespołu', 'Graf', 'Audyt'];

/**
 * Nawigacja startuje pusta, bo trasy pochodzą z aktywnej usługi, a ta istnieje dopiero po
 * rozstrzygnięciu katalogu (podczas `isPending` identyfikator jest pusty). Dlatego każdy test
 * najpierw czeka na link, którego się spodziewa, a dopiero potem liczy pozostałe.
 */
async function waitForNav(anyLabel: string): Promise<HTMLElement> {
  const nav = await screen.findByRole('navigation', { name: 'Nawigacja główna' });
  await within(nav).findByRole('link', { name: anyLabel });

  return nav;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Sidebar', () => {
  it('renders six links driven by the registry for the default github service', async () => {
    renderWithProviders(<Sidebar />);

    const nav = await waitForNav('Pulpit');

    expect(within(nav).getAllByRole('link')).toHaveLength(GITHUB_LABELS.length);
    for (const label of GITHUB_LABELS) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('Dostęp: GitHub')).toBeInTheDocument();
  });

  it('narrows navigation to the two views demo-tracker serves', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'demo-tracker');
    renderWithProviders(<Sidebar />);

    const nav = await waitForNav('Audyt');

    expect(within(nav).getAllByRole('link')).toHaveLength(2);
    expect(within(nav).getByRole('link', { name: 'Pulpit' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Audyt' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Dzierżawy' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Dostęp: Demo Tracker (integracja demonstracyjna)'),
    ).toBeInTheDocument();
  });
});
