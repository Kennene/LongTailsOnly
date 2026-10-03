import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { auditFixture, baselineFixture, leasesFixture } from '@/api/fixtures';
import { AppealCandidatesTable } from '@/components/appeals/AppealCandidatesTable';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { BaselineTable } from '@/components/baseline/BaselineTable';
import { OnboardingCard } from '@/components/baseline/OnboardingCard';
import { getRoleBadge } from '@/lib/statusBadges';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { BaselineEntry, LeaseOverview, OnboardingProposal } from '@/types/api';

/**
 * Wspólny wzór tabel (jak w `Dostępy`): pierwsza kolumna — tożsamość wiersza — trzyma lewą
 * krawędź, każda kolejna jest wyśrodkowana; kolumny, które opisują tylko wpisy pod grupą, są
 * w nagłówku `sr-only`, a na ekranie podpisują się w wierszu grupy dopiero po jej rozwinięciu.
 */
function expectAlignment(table: HTMLElement): void {
  const headers: HTMLElement[] = within(table).getAllByRole('columnheader');

  headers.forEach((header: HTMLElement, index: number): void => {
    expect(header).toHaveClass(index === 0 ? 'text-left' : 'text-center');
    expect(header).toHaveClass('text-muted-foreground');
  });
  within(table)
    .getAllByRole('row')
    .slice(1)
    .forEach((row: HTMLElement): void => {
      within(row)
        .getAllByRole('cell')
        .slice(1)
        .forEach((cell: HTMLElement): void => {
          expect(cell).toHaveClass('text-center');
        });
    });
}

function expectScreenReaderOnlyHeader(table: HTMLElement, name: string): void {
  const header: HTMLElement = within(table).getByRole('columnheader', { name });

  expect(within(header).getByText(name)).toHaveClass('sr-only');
}

function headerIndex(table: HTMLElement, name: string): number {
  return within(table)
    .getAllByRole('columnheader')
    .findIndex((cell: HTMLElement): boolean => cell.textContent === name);
}

function expectRoleBadge(cell: HTMLElement, role: BaselineEntry['proposed_role']): void {
  const label: HTMLElement = within(cell).getByText(getRoleBadge(role).label);

  expect(label).toHaveClass(`bg-role-${role}-subtle`);
}

const DEV_BASELINE: BaselineEntry[] = baselineFixture.dev ?? [];

describe('Audyt — tabela jak w Dostępach', () => {
  it('puts the actor first and centres the rest', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogTable entries={auditFixture} />);
    await user.click(screen.getByRole('button', { name: 'Rozwiń wszystkie' }));

    const table: HTMLElement = screen.getByRole('table');

    expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent('Aktor');
    expectAlignment(table);
  });

  it('captions "Cel" and "Uzasadnienie" on the actor row only after expanding', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogTable entries={auditFixture} />);
    const table: HTMLElement = screen.getByRole('table');
    const toggle: HTMLElement = screen.getByRole('button', { name: 'Pokaż wpisy: SYSTEM' });
    const row = (): HTMLElement =>
      within(table)
        .getAllByRole('row')
        .find((candidate: HTMLElement): boolean =>
          within(candidate).queryAllByRole('button').includes(toggle),
        ) as HTMLElement;

    for (const name of ['Cel', 'Uzasadnienie']) {
      expectScreenReaderOnlyHeader(table, name);
      expect(within(row()).getAllByRole('cell')[headerIndex(table, name)].textContent).toBe('');
    }

    await user.click(toggle);

    for (const name of ['Cel', 'Uzasadnienie']) {
      expect(within(row()).getAllByRole('cell')[headerIndex(table, name)]).toHaveTextContent(name);
    }
  });
});

describe('Odwołania — dostępy wymagające uwagi jak w Dostępach', () => {
  const candidates: LeaseOverview[] = leasesFixture.filter(
    (lease: LeaseOverview): boolean => lease.status === 'WARNING' || lease.status === 'EXPIRED',
  );

  it('names the first column "Użytkownik" and centres the rest', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppealCandidatesTable leases={candidates} />);
    await user.click(screen.getByRole('button', { name: 'Rozwiń wszystkie' }));

    const table: HTMLElement = screen.getByRole('table');

    expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent('Użytkownik');
    expectAlignment(table);
  });

  it('hides "Poziom" and "Status" in the header and captions them after expanding', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppealCandidatesTable leases={candidates} />);
    const table: HTMLElement = screen.getByRole('table');
    const firstRow = (): HTMLElement => within(table).getAllByRole('row')[1];

    for (const name of ['Poziom', 'Status']) {
      expectScreenReaderOnlyHeader(table, name);
      expect(within(firstRow()).getAllByRole('cell')[headerIndex(table, name)].textContent).toBe(
        '',
      );
    }

    await user.click(within(firstRow()).getByRole('button', { name: /^Pokaż dostępy: / }));

    for (const name of ['Poziom', 'Status']) {
      expect(within(firstRow()).getAllByRole('cell')[headerIndex(table, name)]).toHaveTextContent(
        name,
      );
    }
  });

  it('shows the level as the coloured role badge', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppealCandidatesTable leases={candidates.slice(0, 1)} />);
    await user.click(screen.getByRole('button', { name: /^Pokaż dostępy: / }));

    const table: HTMLElement = screen.getByRole('table');
    const leaseRow: HTMLElement = within(table).getAllByRole('row')[2];

    expectRoleBadge(
      within(leaseRow).getAllByRole('cell')[headerIndex(table, 'Poziom')],
      candidates[0].current_role,
    );
  });
});

describe('Standard zespołu — tabele jak w Dostępach', () => {
  it('aligns the baseline table and shows the proposed level as a badge', () => {
    renderWithProviders(<BaselineTable entries={DEV_BASELINE} />);

    const table: HTMLElement = screen.getByRole('table');

    expectAlignment(table);
    expectRoleBadge(
      within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[1],
      DEV_BASELINE[0].proposed_role,
    );
  });

  it('aligns the onboarding tables and shows the level as a badge', () => {
    const proposal: OnboardingProposal = {
      user: leasesFixture[0].user,
      team: { id: 1, name: 'DEV', slug: 'dev' } as OnboardingProposal['team'],
      to_grant: DEV_BASELINE.slice(0, 1),
      already_granted: DEV_BASELINE.slice(1),
    };
    renderWithProviders(<OnboardingCard proposal={proposal} />);

    const table: HTMLElement = screen.getByRole('table', { name: 'Do nadania' });

    expectAlignment(table);
    expectRoleBadge(
      within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[1],
      DEV_BASELINE[0].proposed_role,
    );
  });
});
