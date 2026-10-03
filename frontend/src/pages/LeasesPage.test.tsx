import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { expiredLeasesFixture, leasesFixture } from '@/api/fixtures';
import { LeaseTable } from '@/components/leases/LeaseTable';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
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

/** Najpilniejszy dostęp: wygasły i z najmniejszą liczbą dni — pierwszy wiersz tabeli. */
const MOST_URGENT: LeaseOverview = expiredLeasesFixture.reduce(
  (left: LeaseOverview, right: LeaseOverview): LeaseOverview =>
    (right.days_remaining ?? 0) < (left.days_remaining ?? 0) ? right : left,
);

const WARNING_LEASES: LeaseOverview[] = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.status === 'WARNING',
);

/** Pierwszy aktywny dostęp: z najmniejszą liczbą dni w swojej grupie. */
const FIRST_ACTIVE: LeaseOverview = leasesFixture
  .filter((lease: LeaseOverview): boolean => lease.status === 'ACTIVE')
  .reduce((left: LeaseOverview, right: LeaseOverview): LeaseOverview =>
    (right.days_remaining ?? Number.MAX_SAFE_INTEGER) <
    (left.days_remaining ?? Number.MAX_SAFE_INTEGER)
      ? right
      : left,
  );

/** Dostępy stałe (bez terminu) — tabela trzyma je na końcu, z myślnikiem zamiast dni. */
const PERMANENT_LEASES: LeaseOverview[] = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.expires_at === null,
);
const LAST_PERMANENT: LeaseOverview = PERMANENT_LEASES[PERMANENT_LEASES.length - 1];

/** Renderuje stronę i zwraca wiersze tabeli: nagłówek + dostępy z MSW. */
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

/** Pełna nazwa repozytorium w komórce tabeli (`owner/name`, jak w `LeaseTable`). */
function fullName(lease: LeaseOverview): string {
  return `${lease.repository.owner}/${lease.repository.name}`;
}

function cellsOf(row: HTMLElement): HTMLElement[] {
  return within(row).getAllByRole('cell');
}

/** Wiersz konkretnego dostępu — pary (login, repozytorium) są w fixture'ach unikalne. */
function rowFor(rows: HTMLElement[], lease: LeaseOverview): HTMLElement {
  const row: HTMLElement | undefined = rows
    .slice(1)
    .find(
      (candidate: HTMLElement): boolean =>
        within(candidate).queryByText(lease.user.login) !== null &&
        within(candidate).queryByText(fullName(lease)) !== null,
    );

  if (row === undefined) {
    throw new Error(`Brak wiersza dla ${lease.user.login}@${fullName(lease)}`);
  }

  return row;
}

/** Loginy w kolejności wierszy — do porównania dwóch renderów. */
function shownLogins(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row: HTMLElement): string => cellsOf(row)[0].textContent ?? '');
}

describe('LeasesPage', () => {
  it('renders the whole shared inventory in urgency order', async () => {
    const rows = await loadLeaseRows();

    // 15 dostępów z `shared/fixtures` (8 bieżących + 7 wygasłych) plus wiersz nagłówka.
    expect(rows).toHaveLength(leasesFixture.length + 1);
    expect(within(rows[rows.length - 1]).getByText(LAST_PERMANENT.user.name)).toBeInTheDocument();
  });

  it('renders the pinned columns in order', async () => {
    const rows = await loadLeaseRows();

    const headers: (string | null)[] = within(rows[0])
      .getAllByRole('columnheader')
      .map((cell: HTMLElement): string | null => cell.textContent);

    expect(headers).toEqual(COLUMNS);
  });

  it('puts the expired lease with the fewest days first, with its days and status', async () => {
    const rows = await loadLeaseRows();
    const row: HTMLElement = rows[1];

    expect(within(row).getByText(MOST_URGENT.user.name)).toBeInTheDocument();
    expect(within(row).getByText(fullName(MOST_URGENT))).toBeInTheDocument();
    expect(
      within(row).getByText(formatDaysRemaining(MOST_URGENT.days_remaining)),
    ).toBeInTheDocument();
    expect(within(row).getByText(getStatusBadge(MOST_URGENT.status).label)).toBeInTheDocument();
  });

  it('orders expired before warning and warning before active', async () => {
    const rows = await loadLeaseRows();
    const activeRowIndex: number = rows.indexOf(rowFor(rows, FIRST_ACTIVE));

    expect(rows.indexOf(rowFor(rows, MOST_URGENT))).toBeLessThan(activeRowIndex);

    WARNING_LEASES.forEach((lease: LeaseOverview): void => {
      const row: HTMLElement = rowFor(rows, lease);

      expect(within(row).getByText(formatDaysRemaining(lease.days_remaining))).toBeInTheDocument();
      expect(within(row).getByText(getStatusBadge(lease.status).label)).toBeInTheDocument();
      expect(rows.indexOf(row)).toBeLessThan(activeRowIndex);
    });
  });

  it('keeps the lease without an expiry at the end with a dash for its remaining days', async () => {
    const rows = await loadLeaseRows();
    const adminRow: HTMLElement = rows[rows.length - 1];
    const cells: HTMLElement[] = cellsOf(adminRow);

    expect(within(adminRow).getByText(LAST_PERMANENT.user.name)).toBeInTheDocument();
    expect(within(adminRow).getByText(fullName(LAST_PERMANENT))).toBeInTheDocument();
    expect(within(adminRow).getByText(getRoleLabel('admin'))).toBeInTheDocument();
    expect(cells[columnIndex(rows, 'Pozostało')]).toHaveTextContent('—');
    expect(cells[columnIndex(rows, 'Zespół')]).toHaveTextContent('—');
  });

  it('replaces the table with the loading state until the inventory arrives', async () => {
    renderWithProviders(<LeasesPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie dostępów…');
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
    expect(alert).toHaveTextContent('Nie udało się pobrać dostępów');

    server.resetHandlers();
    await user.click(within(alert).getByRole('button', { name: 'Odśwież' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('renders the empty state when the API returns no leases', async () => {
    server.use(http.get('/api/v1/leases', () => HttpResponse.json([])));
    renderWithProviders(<LeasesPage />);

    expect(await screen.findByText('Brak dostępów do wyświetlenia')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('LeaseTable', () => {
  it('renders the empty state when there are no leases', () => {
    renderWithProviders(<LeaseTable leases={[]} />);

    expect(screen.getByText('Brak dostępów do wyświetlenia')).toBeInTheDocument();
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

    expect(decided).toEqual([MOST_URGENT.id]); // pierwszy wiersz to najpilniejszy dostęp
  });

  it('sorts by urgency regardless of the payload order', () => {
    const view = renderWithProviders(<LeaseTable leases={leasesFixture} />);
    const loginsInOrder: string[] = shownLogins();
    view.unmount();

    renderWithProviders(<LeaseTable leases={leasesFixture.toReversed()} />);

    expect(shownLogins()).toEqual(loginsInOrder);
    expect(loginsInOrder[0]).toContain(MOST_URGENT.user.login);
    expect(loginsInOrder[loginsInOrder.length - 1]).toContain(LAST_PERMANENT.user.login);
  });
});
