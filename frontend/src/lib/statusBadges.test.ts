import type { LucideIcon } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  type BadgeStyle,
  getAppealStatusBadge,
  getRecommendationBadge,
  getRecommendationLabel,
  getRoleBadge,
  getRoleLabel,
  getStatusBadge,
} from '@/lib/statusBadges';
import type { AppealStatus, LeaseStatus, Recommendation, Role } from '@/types/api';

const STATUSES: LeaseStatus[] = ['ACTIVE', 'WARNING', 'EXPIRED', 'PERMANENT', 'REVOKED'];
const APPEAL_STATUSES: AppealStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const ROLES: Role[] = ['admin', 'write', 'read'];
const RECOMMENDATIONS: Recommendation[] = ['KEEP', 'DOWNSCOPE', 'REVOKE'];

/** Any raw Tailwind palette colour, e.g. `bg-emerald-500` or `text-amber-400`. */
const RAW_PALETTE_COLOUR =
  /(?:bg|text|border|ring|from|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone)-\d{2,3}/;

describe('getStatusBadge', () => {
  it('maps every lease status to its Polish label', () => {
    expect(STATUSES.map((status: LeaseStatus): string => getStatusBadge(status).label)).toEqual([
      'Aktywny',
      'Wygasa wkrótce',
      'Wygasł',
      'Stały (admin)',
      'Odebrany',
    ]);
  });

  it.each<LeaseStatus>(['PERMANENT', 'REVOKED'])(
    'keeps %s neutral: it needs no decision, so it takes no status colour',
    (status: LeaseStatus) => {
      expect(getStatusBadge(status).className).toContain('bg-muted');
    },
  );

  it('gives every lease status a distinct class name', () => {
    const classNames: string[] = STATUSES.map(
      (status: LeaseStatus): string => getStatusBadge(status).className,
    );

    expect(new Set(classNames).size).toBe(5);
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
  it('prefixes every lease status label with its own lucide icon', () => {
    const slugs: string[] = STATUSES.map(
      (status: LeaseStatus): string => getStatusBadge(status).slug,
    );

    slugs.forEach((slug: string): void => {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });
    expect(new Set(slugs).size).toBe(STATUSES.length);
  });

  it('names the icon slug the way lucide writes it into the svg class', () => {
    // `lucide-react` renderuje `class="lucide lucide-clock"`; slug jest kontraktem między mapą
    // a DOM-em i to on trzyma testy komponentów, bo `icon.name` bywa zminifikowane.
    expect(getStatusBadge('WARNING').slug).toBe('clock');
  });

  it('gives every appeal status an icon too, since the badge shape is shared', () => {
    APPEAL_STATUSES.forEach((status: AppealStatus): void => {
      const { icon }: { icon: LucideIcon } = getAppealStatusBadge(status);

      expect(icon.displayName ?? icon.name).toBeTruthy();
    });
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

  it('prefixes every role label with its own lucide icon', () => {
    const slugs: string[] = ROLES.map((role: Role): string => getRoleBadge(role).slug);

    slugs.forEach((slug: string): void => {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });
    expect(new Set(slugs).size).toBe(ROLES.length);
  });

  it('marks the level icons so a reader can tell the eye from the pencil', () => {
    expect(getRoleBadge('read').slug).toBe('eye');
    expect(getRoleBadge('write').slug).toBe('pencil');
    expect(getRoleBadge('admin').slug).toBe('shield');
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

  it('prefixes every recommendation with its own lucide icon', () => {
    const slugs: string[] = RECOMMENDATIONS.map(
      (value: Recommendation): string => getRecommendationBadge(value).slug,
    );

    expect(new Set(slugs).size).toBe(RECOMMENDATIONS.length);
  });

  it('separates the warning status icon from the downscope action icon', () => {
    expect(getStatusBadge('WARNING').slug).not.toBe(getRecommendationBadge('DOWNSCOPE').slug);
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
