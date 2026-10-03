import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { AppealCandidatesTable } from '@/components/appeals/AppealCandidatesTable';
import { AppealList } from '@/components/appeals/AppealList';
import { getAppealStatusBadge, getStatusBadge } from '@/lib/statusBadges';
import type { LeaseOverview, LeaseStatus } from '@/types/api';

/** Kandydaci do odwołania — status widać dopiero po rozwinięciu wiersza osoby. */
const CANDIDATES: LeaseOverview[] = leasesFixture.filter((lease: LeaseOverview): boolean =>
  ['WARNING', 'EXPIRED', 'REVOKED'].includes(lease.status),
);

/** Osoby są domyślnie zwinięte (jak w tabeli dostępów), a pigułka statusu siedzi w wierszu dostępu. */
async function expandAll(user: UserEvent): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Rozwiń wszystkie' }));
}

/**
 * Ikona w pigułce jest `aria-hidden`, więc drzewo dostępności jej nie zawiera (`getByRole('img')`
 * nie ma tu czego znaleźć) — stąd zejście do `svg` w DOM, wzorem `badgeIcons.test.tsx`.
 */
function expectBadgeIcon(badge: HTMLElement, slug: string): void {
  // eslint-disable-next-line testing-library/no-node-access -- patrz wyżej
  const icon: SVGElement | undefined = badge.getElementsByTagName('svg')[0];

  expect(icon).toHaveAttribute('aria-hidden', 'true');
  expect(icon?.getAttribute('class')).toContain(`lucide-${slug}`);
}

function uniqueStatuses<T extends { status: LeaseStatus }>(rows: T[]): LeaseStatus[] {
  return [...new Set(rows.map((row: T): LeaseStatus => row.status))];
}

describe('pigułki statusu w widoku odwołań', () => {
  it('tabela kandydatów niesie ikonę statusu przy etykiecie', async () => {
    const user = userEvent.setup();
    const statuses: LeaseStatus[] = uniqueStatuses(CANDIDATES);
    expect(statuses.length).toBeGreaterThan(0);
    render(<AppealCandidatesTable leases={CANDIDATES} />);

    await expandAll(user);

    for (const status of statuses) {
      const badge = getStatusBadge(status);
      const [label] = screen.getAllByText(badge.label);

      expectBadgeIcon(label, badge.slug);
    }
  });

  it('lista złożonych odwołań niesie ikonę statusu przy etykiecie', async () => {
    const user = userEvent.setup();
    const statuses: LeaseStatus[] = uniqueStatuses(appealsFixture);
    expect(statuses.length).toBeGreaterThan(0);
    render(
      <AppealList
        appeals={appealsFixture}
        labelledBy="appeal-list-heading"
        onResolve={(): void => undefined}
      />,
    );

    await expandAll(user);

    for (const status of statuses) {
      const badge = getAppealStatusBadge(status);
      const [label] = screen.getAllByText(badge.label);

      expectBadgeIcon(label, badge.slug);
    }
  });
});
