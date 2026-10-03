import { describe, expect, it } from 'vitest';

import {
  type BadgeStyle,
  getAppealStatusBadge,
  getRecommendationBadge,
  getRecommendationLabel,
  getRoleLabel,
  getStatusBadge,
} from '@/lib/statusBadges';
import type { AppealStatus, LeaseStatus, Recommendation, Role } from '@/types/api';

const STATUSES: LeaseStatus[] = ['ACTIVE', 'WARNING', 'EXPIRED'];
const APPEAL_STATUSES: AppealStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const ROLES: Role[] = ['admin', 'write', 'read'];
const RECOMMENDATIONS: Recommendation[] = ['KEEP', 'DOWNSCOPE', 'REVOKE'];

/** Any raw Tailwind palette colour, e.g. `bg-emerald-500` or `text-amber-400`. */
const RAW_PALETTE_COLOUR =
  /(?:bg|text|border|ring|from|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone)-\d{2,3}/;

describe('getStatusBadge', () => {
  it('maps every lease status to its Polish label', () => {
    expect(STATUSES.map((status: LeaseStatus): string => getStatusBadge(status).label)).toEqual([
      'Aktywna',
      'Wygasa wkrótce',
      'Wygasła',
    ]);
  });

  it('gives every lease status a distinct class name', () => {
    const classNames: string[] = STATUSES.map(
      (status: LeaseStatus): string => getStatusBadge(status).className,
    );

    expect(new Set(classNames).size).toBe(3);
  });

  it.each<[LeaseStatus, string]>([
    ['ACTIVE', 'active'],
    ['WARNING', 'warning'],
    ['EXPIRED', 'expired'],
  ])('styles %s with the %s semantic token utilities', (status: LeaseStatus, token: string) => {
    const { className }: { className: string } = getStatusBadge(status);

    expect(className).toContain(`bg-status-${token}-subtle`);
    expect(className).toContain(`text-status-${token}`);
    expect(className).toContain(`border-status-${token}-border`);
  });
});

describe('getRoleLabel', () => {
  it('maps every role to its Polish label', () => {
    expect(ROLES.map((role: Role): string => getRoleLabel(role))).toEqual([
      'Administrator',
      'Zapis (write)',
      'Odczyt (read)',
    ]);
  });
});

describe('getRecommendationLabel', () => {
  it('maps every recommendation to its Polish label', () => {
    expect(
      RECOMMENDATIONS.map((value: Recommendation): string => getRecommendationLabel(value)),
    ).toEqual(['Bez zmian', 'Zdeeskaluj', 'Odbierz']);
  });
});

describe('getRecommendationBadge', () => {
  it('labels every recommendation exactly like getRecommendationLabel', () => {
    expect(
      RECOMMENDATIONS.map((value: Recommendation): string => getRecommendationBadge(value).label),
    ).toEqual(
      RECOMMENDATIONS.map((value: Recommendation): string => getRecommendationLabel(value)),
    );
  });

  it('gives every recommendation a distinct, non-empty class name', () => {
    const classNames: string[] = RECOMMENDATIONS.map(
      (value: Recommendation): string => getRecommendationBadge(value).className,
    );

    expect(new Set(classNames).size).toBe(3);
    expect(classNames.filter((className: string): boolean => className.length === 0)).toEqual([]);
  });

  it('paints KEEP with the neutral muted tokens', () => {
    expect(getRecommendationBadge('KEEP').className).toBe(
      'border-border bg-muted text-muted-foreground',
    );
  });

  it.each<[Recommendation, string]>([
    ['DOWNSCOPE', 'downscope'],
    ['REVOKE', 'revoke'],
  ])(
    'styles %s with the status-%s family tokens',
    (recommendation: Recommendation, token: string) => {
      const { className }: BadgeStyle = getRecommendationBadge(recommendation);

      expect(className).toContain(`bg-status-${token}-subtle`);
      expect(className).toContain(`text-status-${token}`);
      expect(className).toContain(`border-status-${token}-border`);
    },
  );
});

describe('getAppealStatusBadge', () => {
  it('maps every appeal status to its Polish label', () => {
    expect(
      APPEAL_STATUSES.map((status: AppealStatus): string => getAppealStatusBadge(status).label),
    ).toEqual(['Oczekujące', 'Zatwierdzone', 'Odrzucone']);
  });

  it('gives every appeal status a distinct, non-empty class name', () => {
    const classNames: string[] = APPEAL_STATUSES.map(
      (status: AppealStatus): string => getAppealStatusBadge(status).className,
    );

    expect(new Set(classNames).size).toBe(3);
    expect(classNames.filter((className: string): boolean => className.length === 0)).toEqual([]);
  });
});

describe('semantic status tokens', () => {
  it('never falls back to raw Tailwind palette colours', () => {
    const classNames: string[] = [
      ...STATUSES.map((status: LeaseStatus): string => getStatusBadge(status).className),
      ...APPEAL_STATUSES.map(
        (status: AppealStatus): string => getAppealStatusBadge(status).className,
      ),
      ...RECOMMENDATIONS.map(
        (value: Recommendation): string => getRecommendationBadge(value).className,
      ),
    ];

    expect(
      classNames.filter((className: string): boolean => RAW_PALETTE_COLOUR.test(className)),
    ).toEqual([]);
  });
});
