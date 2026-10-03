import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppealStatusBadge } from '@/components/appeals/AppealStatusBadge';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import {
  getAppealStatusBadge,
  getRecommendationBadge,
  getRoleBadge,
  getStatusBadge,
} from '@/lib/statusBadges';
import type { AppealStatus, LeaseStatus, Recommendation, Role } from '@/types/api';

const STATUSES: LeaseStatus[] = ['ACTIVE', 'WARNING', 'EXPIRED', 'PERMANENT', 'REVOKED'];
const APPEAL_STATUSES: AppealStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const RECOMMENDATIONS: Recommendation[] = ['KEEP', 'DOWNSCOPE', 'REVOKE'];
const ROLES: Role[] = ['admin', 'write', 'read'];

/**
 * Pigułka z ikoną niesie **dwie** informacje: glif (dekoracyjny, `aria-hidden`) i polską
 * etykietę. Test sprawdza obie, bo kolor i kształt nigdy nie mogą być jedynym nośnikiem stanu
 * (`DESIGN.md` §6).
 *
 * Ikony szukamy po tagu, nie po roli: `aria-hidden="true"` **usuwa** drzewo dostępności, więc
 * `getByRole('img')` nie ma tu czego znaleźć (sprawdzone: zero trafień dla `img`, `presentation`
 * i `none`). To jedyne miejsce w testach, w którym wolno sięgnąć po `container`.
 */
function expectIconAndLabel(container: HTMLElement, slug: string, label: string): void {
  // eslint-disable-next-line testing-library/no-node-access -- patrz wyżej
  const icon: SVGSVGElement | undefined = container.getElementsByTagName('svg')[0];

  expect(screen.getByText(label)).toBeInTheDocument();
  expect(icon).toHaveAttribute('aria-hidden', 'true');
  expect(icon?.getAttribute('class')).toContain(`lucide-${slug}`);
}

describe('badge icons', () => {
  it.each<LeaseStatus>(STATUSES)(
    'renders the %s status badge with the icon from getStatusBadge',
    (status: LeaseStatus) => {
      const { container } = render(<LeaseStatusBadge status={status} />);

      expectIconAndLabel(container, getStatusBadge(status).slug, getStatusBadge(status).label);
    },
  );

  it.each<Recommendation>(RECOMMENDATIONS)(
    'renders the %s recommendation badge with the icon from getRecommendationBadge',
    (value: Recommendation) => {
      const { container } = render(<RecommendationBadge recommendation={value} />);

      expectIconAndLabel(
        container,
        getRecommendationBadge(value).slug,
        getRecommendationBadge(value).label,
      );
    },
  );

  it.each<AppealStatus>(APPEAL_STATUSES)(
    'renders the %s appeal status badge with the icon from getAppealStatusBadge',
    (status: AppealStatus) => {
      const { container } = render(<AppealStatusBadge status={status} />);

      expectIconAndLabel(
        container,
        getAppealStatusBadge(status).slug,
        getAppealStatusBadge(status).label,
      );
    },
  );

  it.each<Role>(ROLES)('renders the %s role badge with its label and icon', (role: Role) => {
    const { container } = render(<RoleBadge role={role} />);

    expectIconAndLabel(container, getRoleBadge(role).slug, getRoleBadge(role).label);
  });

  it('draws exactly one icon per badge, so a row never doubles a signal', () => {
    const { container } = render(<LeaseStatusBadge status="WARNING" />);

    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- patrz wyżej
    expect(container.getElementsByTagName('svg')).toHaveLength(1);
  });
});
