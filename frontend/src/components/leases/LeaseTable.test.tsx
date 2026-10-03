import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import { LeaseTable } from '@/components/leases/LeaseTable';
import { getRoleBadge, getRoleLabel } from '@/lib/statusBadges';
import { initialsFrom } from '@/lib/userInitials';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

/** Dostęp `kamil-dev` w `payment-service` — reprezentant zespołu DEV. */
const DEV_LEASE: LeaseOverview = leasesFixture[0];
const ADMIN_LEASE: LeaseOverview = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.current_role === 'admin',
)[0];

/** Nagłówki tabeli, żeby kolumny adresować nazwą, a nie numerem. */
function headers(): HTMLElement[] {
  const header: HTMLElement = screen.getAllByRole('row')[0];
  const cells: HTMLElement[] = within(header).getAllByRole('columnheader');

  if (cells.length === 0) {
    throw new Error('Tabela nie ma nagłówków');
  }

  return cells;
}

function columnIndex(name: string): number {
  return headers().findIndex((cell: HTMLElement): boolean => cell.textContent === name);
}

/** Komórki wiersza konkretnego dostępu. */
function cellsFor(lease: LeaseOverview): HTMLElement[] {
  const row: HTMLElement = screen
    .getAllByRole('row')
    .slice(1)
    .filter(
      (candidate: HTMLElement): boolean => within(candidate).queryByText(lease.user.login) !== null,
    )[0];

  if (row === undefined) {
    throw new Error(`Brak wiersza dla ${lease.user.login}`);
  }

  return within(row).getAllByRole('cell');
}

function renderedTable(): void {
  renderWithProviders(<LeaseTable leases={leasesFixture} />);
}

/**
 * Ikona w komórce: `aria-hidden` usuwa ją z drzewa dostępności, więc pytamy o tag. Jedyne
 * miejsce w tym pliku, w którym wolno sięgnąć po `container`.
 */
function iconsIn(cell: HTMLElement): HTMLCollectionOf<SVGSVGElement> {
  return cell.getElementsByTagName('svg');
}

describe('LeaseTable identity cell', () => {
  it('carries the avatar initials after the username, not before it', () => {
    renderedTable();

    const userCell: HTMLElement = cellsFor(DEV_LEASE)[columnIndex('Użytkownik')];
    const login: HTMLElement = within(userCell).getByText(DEV_LEASE.user.login);
    const initials: string = initialsFrom(DEV_LEASE.user);

    expect(within(userCell).getByText(initials)).toBeInTheDocument();
    // Awatar stoi **za** loginem: `compareDocumentPosition` zwraca FOLLOWING.
    expect(login.compareDocumentPosition(within(userCell).getByText(initials))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('hides the avatar from assistive tech: the name and login sit in the same cell', () => {
    renderedTable();

    const userCell: HTMLElement = cellsFor(DEV_LEASE)[columnIndex('Użytkownik')];

    expect(within(userCell).getByText(initialsFrom(DEV_LEASE.user))).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

describe('LeaseTable team cell', () => {
  it('states the team as a chip', () => {
    renderedTable();

    const teamCell: HTMLElement = cellsFor(DEV_LEASE)[columnIndex('Zespół')];

    expect(within(teamCell).getByText('DEV')).toBeInTheDocument();
  });

  it('keeps the dash for a lease whose user has no team', () => {
    renderedTable();

    const teamCell: HTMLElement = cellsFor(ADMIN_LEASE)[columnIndex('Zespół')];

    expect(teamCell).toHaveTextContent('—');
  });
});

describe('LeaseTable level cell', () => {
  it('spells the role out next to its icon', () => {
    renderedTable();

    const levelCell: HTMLElement = cellsFor(DEV_LEASE)[columnIndex('Poziom')];

    expect(within(levelCell).getByText(getRoleLabel(DEV_LEASE.current_role))).toBeInTheDocument();
    expect(iconsIn(levelCell)).toHaveLength(1);
  });

  it('gives the admin row the shield icon from getRoleBadge', () => {
    renderedTable();

    const levelCell: HTMLElement = cellsFor(ADMIN_LEASE)[columnIndex('Poziom')];
    const icon: SVGSVGElement | undefined = iconsIn(levelCell)[0];

    expect(icon?.getAttribute('class')).toContain(`lucide-${getRoleBadge('admin').slug}`);
  });

  it('draws one icon per level cell, so the eye and the pencil never double up', () => {
    renderedTable();

    expect(iconsIn(cellsFor(DEV_LEASE)[columnIndex('Poziom')])).toHaveLength(1);
  });
});
