import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import { initialsFrom } from '@/lib/userInitials';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

/**
 * Układ modalu decyzji o dostępie: kogo dotyczy decyzja (imię i awatar), stan w jednym rzędzie
 * odznak i kontrolki **jednej** akcji naraz. Ścieżki żądań pilnuje `DecisionModal.test.tsx`.
 */

const activeLease: LeaseOverview = leasesFixture[0]; // kamil@core-api, write, ACTIVE

async function renderModal(lease: LeaseOverview): Promise<void> {
  renderWithProviders(<DecisionModal lease={lease} open onOpenChange={() => {}} />);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
  });
}

async function chooseKind(
  user: UserEvent,
  label: 'Przedłuż' | 'Zdeeskaluj' | 'Odbierz',
): Promise<void> {
  await user.click(
    within(screen.getByRole('group', { name: 'Rodzaj decyzji' })).getByRole('button', {
      name: label,
    }),
  );
}

it('shows the lease context with labels from the shared helpers', async () => {
  await renderModal(activeLease);

  // Osoba to imię i awatar — bez powtórzonego loginu, jak w tabeli Dostępów.
  expect(screen.getByText(activeLease.user.name)).toBeInTheDocument();
  expect(screen.queryByText(activeLease.user.login)).not.toBeInTheDocument();
  expect(screen.getByText(initialsFrom(activeLease.user))).toHaveAttribute('aria-hidden', 'true');
  expect(
    screen.getByText(`${activeLease.repository.owner}/${activeLease.repository.name}`),
  ).toBeInTheDocument();
  expect(screen.getByText(getRoleLabel(activeLease.current_role))).toBeInTheDocument();
  expect(screen.getByText(getStatusBadge(activeLease.status).label)).toHaveClass(
    'text-status-active',
  );
  expect(screen.getByText(formatDaysRemaining(activeLease.days_remaining))).toBeInTheDocument();
  expect(screen.getByText('Bez zmian')).toBeInTheDocument();
});

it('shows the controls of one action at a time', async () => {
  const user = userEvent.setup();
  await renderModal(activeLease);

  // Domyślnie przedłużenie: presety są, pola uzasadnienia nie ma.
  expect(screen.getByRole('button', { name: '+30' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Uzasadnienie')).not.toBeInTheDocument();

  await chooseKind(user, 'Odbierz');

  expect(screen.queryByRole('button', { name: '+30' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Uzasadnienie')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Odbierz dostęp' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Przedłuż dostęp' })).not.toBeInTheDocument();
});

it('offers Zdeeskaluj only for a write lease, the one level the engine downscopes', async () => {
  const adminLease: LeaseOverview | undefined = leasesFixture.find(
    (lease: LeaseOverview): boolean => lease.current_role === 'admin',
  );
  if (adminLease === undefined) {
    throw new Error('Fixture dostępów nie ma dostępu administratora');
  }
  renderWithProviders(<DecisionModal lease={adminLease} open onOpenChange={() => {}} />);

  const kinds: HTMLElement = await screen.findByRole('group', { name: 'Rodzaj decyzji' });

  expect(within(kinds).queryByRole('button', { name: 'Zdeeskaluj' })).not.toBeInTheDocument();
  expect(within(kinds).getByRole('button', { name: 'Odbierz' })).toBeInTheDocument();
});
