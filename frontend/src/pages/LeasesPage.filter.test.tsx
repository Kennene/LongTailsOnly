import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import { LeasesPage } from '@/pages/LeasesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

const ALL_CHIP = 'Wszystkie';
const NO_TEAM_CHIP = 'Bez zespołu';

/** Zespoły obecne w fixture'ach — chip ma powstać dla każdego, a nie dla listy z góry. */
const TEAMS: string[] = [
  ...new Set(
    leasesFixture
      .map((lease: LeaseOverview): string | null => lease.user.team?.name ?? null)
      .filter((name: string | null): name is string => name !== null),
  ),
].sort();

const DEV_LEASE: LeaseOverview = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.user.team?.name === 'DEV',
)[0];
const QA_LEASE: LeaseOverview = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.user.team?.name === 'QA',
)[0];
const NO_TEAM_LEASE: LeaseOverview = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.user.team === null,
)[0];

/** Renderuje stronę i zwraca wiersze tabeli (nagłówek + dostępy). */
async function loadRows(): Promise<HTMLElement[]> {
  renderWithProviders(<LeasesPage />);
  await screen.findByRole('table');

  return within(screen.getByRole('table')).getAllByRole('row');
}

function tableRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row');
}

/** Loginy widoczne w tabeli, w kolejności wierszy. */
function shownLogins(): string {
  return tableRows()
    .slice(1)
    .map((row: HTMLElement): string => within(row).getAllByRole('cell')[0].textContent ?? '')
    .join(' ');
}

function chip(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('LeasesPage team filter', () => {
  it('offers a chip for every team present in the inventory, plus the catch-alls', async () => {
    await loadRows();

    TEAMS.forEach((team: string): void => {
      expect(chip(team)).toBeInTheDocument();
    });
    expect(chip(ALL_CHIP)).toBeInTheDocument();
    expect(chip(NO_TEAM_CHIP)).toBeInTheDocument();
  });

  it('starts on "Wszystkie" with every lease visible', async () => {
    const rows = await loadRows();

    expect(chip(ALL_CHIP)).toHaveAttribute('aria-pressed', 'true');
    expect(rows).toHaveLength(leasesFixture.length + 1);
  });

  it('narrows the table to one team and reports the selection in aria-pressed', async () => {
    const user = userEvent.setup();
    await loadRows();

    await user.click(chip('DEV'));

    expect(chip('DEV')).toHaveAttribute('aria-pressed', 'true');
    expect(chip(ALL_CHIP)).toHaveAttribute('aria-pressed', 'false');

    const devCount: number = leasesFixture.filter(
      (lease: LeaseOverview): boolean => lease.user.team?.name === 'DEV',
    ).length;

    expect(tableRows()).toHaveLength(devCount + 1);
    expect(shownLogins()).toContain(DEV_LEASE.user.login);
    expect(shownLogins()).not.toContain(QA_LEASE.user.login);
  });

  it('groups the leases of users without a team behind their own chip', async () => {
    const user = userEvent.setup();
    await loadRows();

    await user.click(chip(NO_TEAM_CHIP));

    expect(shownLogins()).toContain(NO_TEAM_LEASE.user.login);
    expect(shownLogins()).not.toContain(DEV_LEASE.user.login);
  });

  it('brings every lease back when the filter returns to "Wszystkie"', async () => {
    const user = userEvent.setup();
    await loadRows();

    await user.click(chip('DEV'));
    await user.click(chip(ALL_CHIP));

    expect(tableRows()).toHaveLength(leasesFixture.length + 1);
  });

  it('can never filter the table away: every chip comes from the rows it filters', async () => {
    const user = userEvent.setup();
    await loadRows();

    const teamCount: number = TEAMS.length + 1; // zespoły z danych + „Bez zespołu”

    for (const team of [...TEAMS, NO_TEAM_CHIP]) {
      await user.click(chip(ALL_CHIP));
      await user.click(chip(team));

      expect(tableRows().length).toBeGreaterThan(1);
    }
    expect(teamCount).toBeGreaterThan(1);
  });

  it('insets the chip row, so the chips do not collide with the page edge or the table', async () => {
    await loadRows();

    const group: HTMLElement = screen.getByRole('group', { name: 'Filtr zespołu' });

    expect(group.className).toContain('px-2');
    expect(group.className).toContain('py-2');
  });

  it('keeps every chip on screen after a selection, so the filter is never a dead end', async () => {
    const user = userEvent.setup();
    await loadRows();

    await user.click(chip('DEV'));

    TEAMS.forEach((team: string): void => {
      expect(chip(team)).toBeInTheDocument();
    });
    expect(chip(ALL_CHIP)).toBeInTheDocument();
    expect(chip(NO_TEAM_CHIP)).toBeInTheDocument();
  });
});
