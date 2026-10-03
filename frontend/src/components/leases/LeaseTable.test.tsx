import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import { groupLeasesByUser } from '@/components/leases/leaseGroups';
import { LeaseTable } from '@/components/leases/LeaseTable';
import { getRoleBadge, getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import { initialsFrom } from '@/lib/userInitials';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

/** Dostęp `kamil-dev` w `payment-service` — reprezentant zespołu DEV. */
const DEV_LEASE: LeaseOverview = leasesFixture[0];
const ADMIN_LEASE: LeaseOverview = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.current_role === 'admin',
)[0];
const USER_COUNT: number = new Set(leasesFixture.map((lease: LeaseOverview) => lease.user.id)).size;

function fullName(lease: LeaseOverview): string {
  return `${lease.repository.owner}/${lease.repository.name}`;
}

/** Nagłówki tabeli, żeby kolumny adresować nazwą, a nie numerem. */
function columnIndex(name: string): number {
  return within(screen.getAllByRole('row')[0])
    .getAllByRole('columnheader')
    .findIndex((cell: HTMLElement): boolean => cell.textContent === name);
}

function toggleFor(lease: LeaseOverview): HTMLElement {
  const name: string = lease.user.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return screen.getByRole('button', { name: new RegExp(`dostępy: ${name}$`) });
}

/** Wiersz osoby — ten, w którym siedzi jej przycisk rozwijania. */
function groupRow(lease: LeaseOverview): HTMLElement {
  const toggle: HTMLElement = toggleFor(lease);
  const row: HTMLElement | undefined = screen
    .getAllByRole('row')
    .find((candidate: HTMLElement): boolean =>
      within(candidate).queryAllByRole('button').includes(toggle),
    );
  if (row === undefined) {
    throw new Error(`Brak wiersza osoby ${lease.user.login}`);
  }

  return row;
}

/** Wiersz konkretnego repozytorium osoby (widoczny po rozwinięciu). */
function leaseRow(lease: LeaseOverview): HTMLElement {
  const row: HTMLElement | undefined = screen
    .getAllByRole('row')
    .find((candidate: HTMLElement): boolean => candidate.dataset.leaseId === String(lease.id));
  if (row === undefined) {
    throw new Error(`Brak wiersza dostępu ${lease.id}`);
  }

  return row;
}

function cellIn(row: HTMLElement, column: string): HTMLElement {
  return within(row).getAllByRole('cell')[columnIndex(column)];
}

/**
 * Ikona w komórce: `aria-hidden` usuwa ją z drzewa dostępności, więc pytamy o tag. Jedyne
 * miejsce w tym pliku, w którym wolno sięgnąć po `container`.
 */
function iconsIn(cell: HTMLElement): HTMLCollectionOf<SVGSVGElement> {
  return cell.getElementsByTagName('svg');
}

describe('LeaseTable — jedna osoba, jeden wiersz', () => {
  it('pokazuje każdą osobę raz, a jej repozytoria chowa do czasu rozwinięcia', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    expect(screen.getAllByRole('button', { name: /^Pokaż dostępy: / })).toHaveLength(USER_COUNT);
    expect(screen.getAllByRole('row')).toHaveLength(USER_COUNT + 1);
    expect(screen.queryByText(fullName(DEV_LEASE))).not.toBeInTheDocument();
  });

  it('rozwija i zwija repozytoria jednej osoby', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaseTable leases={leasesFixture} />);
    const ownLeases: LeaseOverview[] = leasesFixture.filter(
      (lease: LeaseOverview): boolean => lease.user.id === DEV_LEASE.user.id,
    );

    await user.click(toggleFor(DEV_LEASE));

    expect(toggleFor(DEV_LEASE)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('row')).toHaveLength(USER_COUNT + 1 + ownLeases.length);
    expect(within(leaseRow(DEV_LEASE)).getByText(fullName(DEV_LEASE))).toBeInTheDocument();

    await user.click(toggleFor(DEV_LEASE));

    expect(toggleFor(DEV_LEASE)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(fullName(DEV_LEASE))).not.toBeInTheDocument();
  });

  it('„Rozwiń wszystkie” pokazuje każdy dostęp, a potem pozwala wszystko zwinąć', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    await user.click(screen.getByRole('button', { name: 'Rozwiń wszystkie' }));

    expect(screen.getAllByRole('row')).toHaveLength(USER_COUNT + 1 + leasesFixture.length);

    await user.click(screen.getByRole('button', { name: 'Zwiń wszystkie' }));

    expect(screen.getAllByRole('row')).toHaveLength(USER_COUNT + 1);
  });

  it('w wierszu osoby podsumowuje liczbę repozytoriów i status najpilniejszego dostępu', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);
    const group = groupLeasesByUser(leasesFixture).find(
      (candidate): boolean => candidate.user.id === DEV_LEASE.user.id,
    );
    if (group === undefined) {
      throw new Error('Brak grupy osoby z DEV_LEASE');
    }

    const row: HTMLElement = groupRow(DEV_LEASE);

    expect(cellIn(row, 'Repozytorium')).toHaveTextContent(/repozytori/);
    expect(
      within(cellIn(row, 'Status')).getByText(getStatusBadge(group.mostUrgent.status).label),
    ).toBeInTheDocument();
  });

  it('przekazuje do decyzji dokładnie kliknięty dostęp', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn();
    renderWithProviders(<LeaseTable leases={leasesFixture} onDecide={onDecide} />);

    await user.click(toggleFor(DEV_LEASE));
    await user.click(within(leaseRow(DEV_LEASE)).getByRole('button', { name: 'Decyzja' }));

    expect(onDecide).toHaveBeenCalledWith(DEV_LEASE);
  });

  it('dla pustej listy mówi to wprost', () => {
    renderWithProviders(<LeaseTable leases={[]} />);

    expect(screen.getByText('Brak dostępów do wyświetlenia')).toBeInTheDocument();
  });
});

describe('LeaseTable — komórka tożsamości w wierszu osoby', () => {
  it('carries the avatar initials after the username, not before it', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    const userCell: HTMLElement = cellIn(groupRow(DEV_LEASE), 'Użytkownik');
    const login: HTMLElement = within(userCell).getByText(DEV_LEASE.user.login);
    const initials: string = initialsFrom(DEV_LEASE.user);

    expect(within(userCell).getByText(initials)).toBeInTheDocument();
    // Awatar stoi **za** loginem: `compareDocumentPosition` zwraca FOLLOWING.
    expect(login.compareDocumentPosition(within(userCell).getByText(initials))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('hides the avatar from assistive tech: the name and login sit in the same cell', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    const userCell: HTMLElement = cellIn(groupRow(DEV_LEASE), 'Użytkownik');

    expect(within(userCell).getByText(initialsFrom(DEV_LEASE.user))).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('states the team as a chip', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    expect(within(cellIn(groupRow(DEV_LEASE), 'Zespół')).getByText('DEV')).toBeInTheDocument();
  });

  it('keeps the dash for a user without a team', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    expect(cellIn(groupRow(ADMIN_LEASE), 'Zespół')).toHaveTextContent('—');
  });
});

describe('LeaseTable — poziom w wierszu repozytorium', () => {
  it('spells the role out next to its icon', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaseTable leases={leasesFixture} />);
    await user.click(toggleFor(DEV_LEASE));

    const levelCell: HTMLElement = cellIn(leaseRow(DEV_LEASE), 'Poziom');

    expect(within(levelCell).getByText(getRoleLabel(DEV_LEASE.current_role))).toBeInTheDocument();
    expect(iconsIn(levelCell)).toHaveLength(1);
  });

  it('gives the admin row the shield icon from getRoleBadge', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaseTable leases={leasesFixture} />);
    await user.click(toggleFor(ADMIN_LEASE));

    const icon: SVGSVGElement | undefined = iconsIn(cellIn(leaseRow(ADMIN_LEASE), 'Poziom'))[0];

    expect(icon?.getAttribute('class')).toContain(`lucide-${getRoleBadge('admin').slug}`);
  });
});
