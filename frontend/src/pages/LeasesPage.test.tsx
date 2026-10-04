import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { expiredLeasesFixture, leasesFixture } from '@/api/fixtures';
import { LeaseTable } from '@/components/leases/LeaseTable';
import { formatDaysRemaining, formatOverdueDays } from '@/lib/dateTime';
import { formatCountPl } from '@/lib/grouping';
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

/** Renderuje stronę i zwraca wiersze tabeli: nagłówek + jeden wiersz na osobę. */
async function loadLeaseRows(): Promise<HTMLElement[]> {
  renderWithProviders(<LeasesPage />);
  await screen.findByRole('table');

  return screen.getAllByRole('row');
}

/** Jak `loadLeaseRows`, ale z rozwiniętymi repozytoriami każdej osoby. */
async function loadExpandedRows(): Promise<HTMLElement[]> {
  const user = userEvent.setup();
  await loadLeaseRows();
  await user.click(screen.getByRole('button', { name: 'Rozwiń wszystkie' }));

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

/** Wiersze osób (te z przyciskiem rozwijania), w kolejności tabeli. */
function groupRows(rows: HTMLElement[]): HTMLElement[] {
  return rows.filter(
    (row: HTMLElement): boolean =>
      within(row).queryByRole('button', { name: /dostępy: / }) !== null,
  );
}

/** Wiersz konkretnego dostępu po rozwinięciu. */
function rowFor(rows: HTMLElement[], lease: LeaseOverview): HTMLElement {
  const row: HTMLElement | undefined = rows.find(
    (candidate: HTMLElement): boolean => candidate.dataset.leaseId === String(lease.id),
  );

  if (row === undefined) {
    throw new Error(`Brak wiersza dla ${lease.user.login}@${fullName(lease)}`);
  }

  return row;
}

/** Ranga statusu w kolejności pilności — jak w `leaseGroups.ts`. */
const STATUS_ORDER: string[] = ['EXPIRED', 'WARNING', 'ACTIVE', 'PERMANENT', 'REVOKED'].map(
  (status: string): string => getStatusBadge(status as LeaseOverview['status']).label,
);

/** Loginy osób w kolejności wierszy — do porównania dwóch renderów. */
function shownLogins(): string[] {
  return groupRows(screen.getAllByRole('row')).map(
    (row: HTMLElement): string => cellsOf(row)[0].textContent ?? '',
  );
}

describe('LeasesPage', () => {
  it('renders one row per person from the shared inventory', async () => {
    const people: number = new Set(leasesFixture.map((lease: LeaseOverview) => lease.user.id)).size;

    expect(await loadLeaseRows()).toHaveLength(people + 1);
  });

  it('renders every lease of the shared inventory after expanding', async () => {
    const people: number = new Set(leasesFixture.map((lease: LeaseOverview) => lease.user.id)).size;

    expect(await loadExpandedRows()).toHaveLength(people + leasesFixture.length + 1);
  });

  it('renders the pinned columns in order', async () => {
    const rows = await loadLeaseRows();

    const headers: (string | null)[] = within(rows[0])
      .getAllByRole('columnheader')
      .map((cell: HTMLElement): string | null => cell.textContent);

    expect(headers).toEqual(COLUMNS);
  });

  it('puts the person with the most urgent lease first, with the expired count and no status', async () => {
    const rows = await loadLeaseRows();
    const row: HTMLElement = rows[1];

    expect(within(row).getByText(MOST_URGENT.user.name)).toBeInTheDocument();
    // Osoba z wygasłymi dostępami: wiersz mówi, ile ich wygasło (dni pokazują wiersze repozytoriów).
    const expiredCount: number = leasesFixture.filter(
      (lease: LeaseOverview): boolean =>
        lease.user.id === MOST_URGENT.user.id && lease.status === 'EXPIRED',
    ).length;
    expect(
      within(row).getByText(
        formatCountPl(expiredCount, { one: 'wygasły', few: 'wygasłe', many: 'wygasłych' }),
      ),
    ).toBeInTheDocument();
    expect(cellsOf(row)[columnIndex(rows, 'Status')].textContent).toBe('');
  });

  it('orders people by their worst status: expired, then warning, then active', async () => {
    const rows = await loadLeaseRows();
    // Wiersz osoby nie pokazuje statusu, więc rangę liczymy z jej dostępów w danych.
    const ranks: number[] = groupRows(rows).map((row: HTMLElement): number => {
      const label: string =
        within(row)
          .getByRole('button', { name: /dostępy: / })
          .getAttribute('aria-label') ?? '';
      const name: string = label.replace(/^.*dostępy: /, '');

      return Math.min(
        ...leasesFixture
          .filter((lease: LeaseOverview): boolean => lease.user.name === name)
          .map((lease: LeaseOverview): number =>
            STATUS_ORDER.indexOf(getStatusBadge(lease.status).label),
          ),
      );
    });

    expect(ranks).toEqual(ranks.toSorted((left: number, right: number): number => left - right));
  });

  it('shows each lease with its days and status once the person is expanded', async () => {
    const rows = await loadExpandedRows();

    [MOST_URGENT, ...WARNING_LEASES, FIRST_ACTIVE].forEach((lease: LeaseOverview): void => {
      const row: HTMLElement = rowFor(rows, lease);

      expect(within(row).getByText(fullName(lease))).toBeInTheDocument();
      // Wygasły dostęp mówi, ile dni jest po terminie; pozostałe — ile im zostało.
      const days: string =
        lease.status === 'EXPIRED'
          ? formatOverdueDays(-(lease.days_remaining ?? 0))
          : formatDaysRemaining(lease.days_remaining);
      expect(within(row).getByText(days)).toBeInTheDocument();
      expect(within(row).getByText(getStatusBadge(lease.status).label)).toBeInTheDocument();
    });
  });

  it('keeps the person without expiring leases at the end with dashes', async () => {
    const rows = await loadLeaseRows();
    const adminRow: HTMLElement = rows[rows.length - 1];
    const cells: HTMLElement[] = cellsOf(adminRow);

    expect(within(adminRow).getByText(LAST_PERMANENT.user.name)).toBeInTheDocument();
    expect(cells[columnIndex(rows, 'Pozostało')]).toHaveTextContent('—');
    expect(cells[columnIndex(rows, 'Zespół')]).toHaveTextContent('—');
  });

  it('shows the admin level on the expanded permanent lease', async () => {
    const rows = await loadExpandedRows();
    const row: HTMLElement = rowFor(rows, LAST_PERMANENT);

    expect(within(row).getByText(fullName(LAST_PERMANENT))).toBeInTheDocument();
    expect(within(row).getByText(getRoleLabel('admin'))).toBeInTheDocument();
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

    // Pierwsza osoba ma najpilniejszy dostęp, a po rozwinięciu stoi on na samej górze jej listy.
    await user.click(screen.getAllByRole('button', { name: /^Pokaż dostępy: / })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Decyzja' })[0]);

    expect(decided).toEqual([MOST_URGENT.id]);
  });

  it('sorts by urgency regardless of the payload order', () => {
    const view = renderWithProviders(<LeaseTable leases={leasesFixture} />);
    const loginsInOrder: string[] = shownLogins();
    view.unmount();

    renderWithProviders(<LeaseTable leases={leasesFixture.toReversed()} />);

    expect(shownLogins()).toEqual(loginsInOrder);
    expect(loginsInOrder[0]).toContain(MOST_URGENT.user.name);
    expect(loginsInOrder[loginsInOrder.length - 1]).toContain(LAST_PERMANENT.user.name);
  });
});
