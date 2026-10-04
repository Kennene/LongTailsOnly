import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { clockFixture, leasesFixture } from '@/api/fixtures';
import { ACTIVITY_STALE_DAYS, latestActivityAt } from '@/components/leases/leaseGroups';
import { LeaseTable } from '@/components/leases/LeaseTable';
import {
  daysSince,
  formatDateTimeShortPl,
  formatDaysAgo,
  formatDaysRemaining,
  formatOverdueDays,
} from '@/lib/dateTime';
import { formatCountPl } from '@/lib/grouping';
import {
  ACTIVITY_RECENT_TEXT_CLASS,
  ACTIVITY_STALE_TEXT_CLASS,
  OVERDUE_TEXT_CLASS,
} from '@/lib/statusBadges';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

/**
 * Wygasłe dostępy w tabeli: wiersz osoby liczy wygasłe (na czerwono) i mówi, ile dni temu była
 * ostatnia aktywność; po rozwinięciu dostęp pokazuje „Po terminie X dni”, dokładną datę aktywności
 * i jej wiek — kolorowany tylko przy wygasłym dostępie. Osobny plik od `LeaseTable.test.tsx`.
 */

function columnIndex(name: string): number {
  return within(screen.getAllByRole('row')[0])
    .getAllByRole('columnheader')
    .findIndex((cell: HTMLElement): boolean => cell.textContent === name);
}

function toggleFor(lease: LeaseOverview): HTMLElement {
  const name: string = lease.user.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return screen.getByRole('button', { name: new RegExp(`dostępy: ${name}$`) });
}

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

describe('LeaseTable — kolumna „Pozostało” przy wygasłych dostępach', () => {
  const expiredLease: LeaseOverview | undefined = leasesFixture.find(
    (lease: LeaseOverview): boolean => lease.status === 'EXPIRED',
  );
  if (expiredLease === undefined) {
    throw new Error('Fixture dostępów nie ma wygasłego dostępu');
  }
  const expiredCount: number = leasesFixture.filter(
    (lease: LeaseOverview): boolean =>
      lease.user.id === expiredLease.user.id && lease.status === 'EXPIRED',
  ).length;
  const healthyLease: LeaseOverview | undefined = leasesFixture.find(
    (candidate: LeaseOverview): boolean =>
      leasesFixture.every(
        (lease: LeaseOverview): boolean =>
          lease.user.id !== candidate.user.id ||
          (lease.status !== 'EXPIRED' && lease.days_remaining !== null),
      ),
  );

  it('shows on the person row how many leases expired, not how long ago', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    const cell: HTMLElement = cellIn(groupRow(expiredLease), 'Pozostało');

    expect(cell).toHaveTextContent(
      formatCountPl(expiredCount, { one: 'wygasły', few: 'wygasłe', many: 'wygasłych' }),
    );
    expect(cell).not.toHaveTextContent(/Wygasł .* temu/);
  });

  it('shows "Po terminie X dni" in red on an expired lease after expanding', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaseTable leases={leasesFixture} />);
    await user.click(toggleFor(expiredLease));

    const overdue: HTMLElement = within(cellIn(leaseRow(expiredLease), 'Pozostało')).getByText(
      formatOverdueDays(-(expiredLease.days_remaining ?? 0)),
    );

    expect(overdue).toHaveClass(OVERDUE_TEXT_CLASS);
  });

  it('keeps "Pozostało X dni" for a person without expired leases', () => {
    if (healthyLease === undefined) {
      throw new Error('Fixture dostępów nie ma osoby bez wygasłych dostępów');
    }
    const mostUrgent: number = Math.min(
      ...leasesFixture
        .filter((lease: LeaseOverview): boolean => lease.user.id === healthyLease.user.id)
        .map((lease: LeaseOverview): number => lease.days_remaining ?? Number.MAX_SAFE_INTEGER),
    );
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    expect(cellIn(groupRow(healthyLease), 'Pozostało')).toHaveTextContent(
      formatDaysRemaining(mostUrgent),
    );
  });
});

describe('LeaseTable — wygasłe na czerwono, kolejność i „ile dni temu”', () => {
  const NOW: string = clockFixture.now;
  const expiredWithActivity: LeaseOverview | undefined = leasesFixture.find(
    (lease: LeaseOverview): boolean =>
      lease.status === 'EXPIRED' && lease.last_activity_at !== null,
  );
  const activeWithActivity: LeaseOverview | undefined = leasesFixture.find(
    (lease: LeaseOverview): boolean => lease.status === 'ACTIVE' && lease.last_activity_at !== null,
  );
  if (expiredWithActivity === undefined || activeWithActivity === undefined) {
    throw new Error('Fixture dostępów nie ma wygasłego i aktywnego dostępu z aktywnością');
  }

  it('paints the expired count on the person row red', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    const count: HTMLElement = within(cellIn(groupRow(expiredWithActivity), 'Pozostało')).getByText(
      /wygasł/,
    );

    expect(count).toHaveClass(OVERDUE_TEXT_CLASS);
  });

  it('orders people with expired leases from the most overdue', () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    const overdue: number[] = screen
      .getAllByRole('button', { name: /^Pokaż dostępy: / })
      .map((toggle: HTMLElement): string =>
        (toggle.getAttribute('aria-label') ?? '').replace('Pokaż dostępy: ', ''),
      )
      .map((name: string): number[] =>
        leasesFixture
          .filter(
            (lease: LeaseOverview): boolean =>
              lease.user.name === name && lease.status === 'EXPIRED',
          )
          .map((lease: LeaseOverview): number => lease.days_remaining ?? 0),
      )
      .filter((days: number[]): boolean => days.length > 0)
      .map((days: number[]): number => Math.min(...days));

    expect(overdue).toEqual(overdue.toSorted((left: number, right: number) => left - right));
  });

  it('shows only "X dni temu" as the last activity on the person row', async () => {
    renderWithProviders(<LeaseTable leases={leasesFixture} />);

    const personLeases: LeaseOverview[] = leasesFixture.filter(
      (lease: LeaseOverview): boolean => lease.user.id === expiredWithActivity.user.id,
    );
    const latest: string | null = latestActivityAt(personLeases);
    if (latest === null) {
      throw new Error('Osoba bez aktywności');
    }
    const cell: HTMLElement = cellIn(groupRow(expiredWithActivity), 'Ostatnia aktywność');

    expect(
      await within(cell).findByText(formatDaysAgo(daysSince(latest, NOW))),
    ).toBeInTheDocument();
    expect(cell).not.toHaveTextContent(formatDateTimeShortPl(latest));
  });

  it('shows the exact date and the age after expanding, coloured only on expired leases', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeaseTable leases={leasesFixture} />);
    await user.click(toggleFor(expiredWithActivity));
    if (activeWithActivity.user.id !== expiredWithActivity.user.id) {
      await user.click(toggleFor(activeWithActivity));
    }

    const expiredStamp: string = expiredWithActivity.last_activity_at ?? '';
    const expiredCell: HTMLElement = cellIn(leaseRow(expiredWithActivity), 'Ostatnia aktywność');
    const expiredAge: number = daysSince(expiredStamp, NOW);
    expect(expiredCell).toHaveTextContent(formatDateTimeShortPl(expiredStamp));
    expect(await within(expiredCell).findByText(formatDaysAgo(expiredAge))).toHaveClass(
      expiredAge > ACTIVITY_STALE_DAYS ? ACTIVITY_STALE_TEXT_CLASS : ACTIVITY_RECENT_TEXT_CLASS,
    );

    const activeStamp: string = activeWithActivity.last_activity_at ?? '';
    const activeCell: HTMLElement = cellIn(leaseRow(activeWithActivity), 'Ostatnia aktywność');
    const activeAge: HTMLElement = await within(activeCell).findByText(
      formatDaysAgo(daysSince(activeStamp, NOW)),
    );
    expect(activeAge).not.toHaveClass(ACTIVITY_STALE_TEXT_CLASS);
    expect(activeAge).not.toHaveClass(ACTIVITY_RECENT_TEXT_CLASS);
  });
});
