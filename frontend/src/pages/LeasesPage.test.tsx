import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { leasesFixture } from '@/api/fixtures';
import { LeaseTable } from '@/components/leases/LeaseTable';
import { LeasesPage } from '@/pages/LeasesPage';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

const COLUMNS: string[] = [
  'Użytkownik',
  'Zespół',
  'Repozytorium',
  'Poziom',
  'Ostatnia aktywność',
  'Pozostało',
  'Status',
  'Rekomendacja',
  'Akcje',
];

/** Renderuje stronę i zwraca wiersze tabeli: nagłówek + dzierżawy z MSW. */
async function loadLeaseRows(): Promise<HTMLElement[]> {
  renderWithProviders(<LeasesPage />);
  await screen.findByRole('table');

  return screen.getAllByRole('row');
}

function columnIndex(rows: HTMLElement[], name: string): number {
  return within(rows[0])
    .getAllByRole('columnheader')
    .findIndex((cell: HTMLElement): boolean => cell.textContent === name);
}

describe('LeasesPage', () => {
  it('renders the lease inventory in urgency order', async () => {
    const rows = await loadLeaseRows();

    expect(rows).toHaveLength(5); // nagłówek + 4 dzierżawy
    expect(within(rows[1]).getByText('piotr')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Wygasła')).toBeInTheDocument();
    expect(within(rows[2]).getByText('marta')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Wygasa wkrótce')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Pozostało 5 dni')).toBeInTheDocument();
    expect(within(rows[3]).getByText('kamil')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Pozostało 30 dni')).toBeInTheDocument();
    expect(within(rows[4]).getByText('tomasz-admin')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Aktywna')).toBeInTheDocument();
  });

  it('renders the pinned columns in order', async () => {
    const rows = await loadLeaseRows();

    const headers: (string | null)[] = within(rows[0])
      .getAllByRole('columnheader')
      .map((cell: HTMLElement): string | null => cell.textContent);

    expect(headers).toEqual(COLUMNS);
  });

  it('keeps the lease without an expiry at the end with a dash for its remaining days', async () => {
    const rows = await loadLeaseRows();
    const adminRow: HTMLElement = rows[4];
    const cells: HTMLElement[] = within(adminRow).getAllByRole('cell');

    expect(within(adminRow).getByText('Tomasz Wiśniewski')).toBeInTheDocument();
    expect(within(adminRow).getByText('Administrator')).toBeInTheDocument();
    expect(cells[columnIndex(rows, 'Pozostało')]).toHaveTextContent('—');
    expect(cells[columnIndex(rows, 'Zespół')]).toHaveTextContent('—');
  });

  it('replaces the table with the loading state until the inventory arrives', async () => {
    renderWithProviders(<LeasesPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie dzierżaw…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await screen.findByRole('table');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows an error alert whose retry button refetches the inventory', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/leases', () =>
        HttpResponse.json({ detail: 'Błąd serwera' }, { status: 500 }),
      ),
    );
    renderWithProviders(<LeasesPage />);

    const alert: HTMLElement = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nie udało się pobrać dzierżaw');

    server.resetHandlers();
    await user.click(within(alert).getByRole('button', { name: 'Odśwież' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('renders the empty state when the API returns no leases', async () => {
    server.use(http.get('/api/v1/leases', () => HttpResponse.json([])));
    renderWithProviders(<LeasesPage />);

    expect(await screen.findByText('Brak dzierżaw do wyświetlenia')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('LeaseTable', () => {
  it('renders the empty state when there are no leases', () => {
    renderWithProviders(<LeaseTable leases={[]} />);

    expect(screen.getByText('Brak dzierżaw do wyświetlenia')).toBeInTheDocument();
  });

  it('omits the decision column without a handler', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    expect(screen.queryByRole('button', { name: 'Decyzja' })).not.toBeInTheDocument();
    expect(
      within(screen.getAllByRole('row')[0]).queryByRole('columnheader', { name: 'Akcje' }),
    ).not.toBeInTheDocument();
  });

  it('reports the clicked lease to the decision handler', async () => {
    const user = userEvent.setup();
    const decided: number[] = [];

    function handleDecide(lease: LeaseOverview): void {
      decided.push(lease.id);
    }

    renderWithProviders(<LeaseTable leases={leasesFixture} onDecide={handleDecide} />);

    const rows: HTMLElement[] = screen.getAllByRole('row');
    await user.click(within(rows[1]).getByRole('button', { name: 'Decyzja' }));

    expect(decided).toEqual([3]); // pierwszy wiersz to wygasła dzierżawa piotra
  });

  it('sorts by urgency regardless of the payload order', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture.toReversed()} />);

    const rows: HTMLElement[] = screen.getAllByRole('row');

    expect(within(rows[1]).getByText('piotr')).toBeInTheDocument();
    expect(within(rows[2]).getByText('marta')).toBeInTheDocument();
    expect(within(rows[3]).getByText('kamil')).toBeInTheDocument();
    expect(within(rows[4]).getByText('tomasz-admin')).toBeInTheDocument();
  });
});
