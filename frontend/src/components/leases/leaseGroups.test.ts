import { describe, expect, it } from 'vitest';

import { leasesFixture } from '@/api/fixtures';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import {
  countPendingRecommendations,
  formatRepositoryCount,
  groupLeasesByUser,
  latestActivityAt,
} from '@/components/leases/leaseGroups';
import type { LeaseOverview, LeaseStatus, Recommendation } from '@/types/api';

const BASE: LeaseOverview = leasesFixture[0];

/** Stabilne `user.id` per login — grupowanie idzie po id, więc różne osoby muszą mieć różne. */
const USER_IDS: Map<string, number> = new Map();

function userId(login: string): number {
  if (!USER_IDS.has(login)) {
    USER_IDS.set(login, USER_IDS.size + 1);
  }

  return USER_IDS.get(login) ?? 0;
}

function lease(
  id: number,
  login: string,
  status: LeaseStatus,
  daysRemaining: number | null,
  overrides: Partial<LeaseOverview> = {},
): LeaseOverview {
  return {
    ...BASE,
    id,
    user: { ...BASE.user, id: userId(login), login, name: login },
    repository: { ...BASE.repository, id, name: `repo-${id}` },
    status,
    days_remaining: daysRemaining,
    ...overrides,
  };
}

describe('groupLeasesByUser', () => {
  it('daje jedną grupę na osobę, zamiast powtarzać ją w każdym wierszu', () => {
    const groups: LeaseGroup[] = groupLeasesByUser([
      lease(1, 'kamil', 'ACTIVE', 20),
      lease(2, 'marta', 'ACTIVE', 10),
      lease(3, 'kamil', 'WARNING', 5),
    ]);

    expect(groups.map((group: LeaseGroup): string => group.user.login)).toEqual(['kamil', 'marta']);
    expect(groups[0].leases.map((item: LeaseOverview): number => item.id)).toEqual([3, 1]);
  });

  it('układa osoby po najpilniejszym dostępie: wygasłe, ostrzeżenia, aktywne, stałe', () => {
    const groups: LeaseGroup[] = groupLeasesByUser([
      lease(1, 'admin', 'PERMANENT', null),
      lease(2, 'ania', 'ACTIVE', 3),
      lease(3, 'kamil', 'ACTIVE', 25),
      lease(4, 'kamil', 'EXPIRED', -4),
      lease(5, 'marta', 'WARNING', 3),
    ]);

    expect(groups.map((group: LeaseGroup): string => group.user.login)).toEqual([
      'kamil',
      'marta',
      'ania',
      'admin',
    ]);
    expect(groups[0].mostUrgent.id).toBe(4);
  });

  it('przy równej pilności rozstrzyga nazwą osoby, więc kolejność jest stabilna', () => {
    const groups: LeaseGroup[] = groupLeasesByUser([
      lease(1, 'zenon', 'ACTIVE', 10),
      lease(2, 'adam', 'ACTIVE', 10),
    ]);

    expect(groups.map((group: LeaseGroup): string => group.user.login)).toEqual(['adam', 'zenon']);
  });

  it('dla pustej listy zwraca pustą listę grup', () => {
    expect(groupLeasesByUser([])).toEqual([]);
  });
});

describe('podsumowanie grupy', () => {
  it.each([
    [1, '1 repozytorium'],
    [2, '2 repozytoria'],
    [4, '4 repozytoria'],
    [5, '5 repozytoriów'],
    [12, '12 repozytoriów'],
    [22, '22 repozytoria'],
  ])('odmienia liczbę repozytoriów: %i → %s', (count: number, expected: string) => {
    expect(formatRepositoryCount(count)).toBe(expected);
  });

  it('liczy dostępy z rekomendacją innej niż „bez zmian”', () => {
    const recommendations: Recommendation[] = ['KEEP', 'DOWNSCOPE', 'REVOKE', 'KEEP'];
    const leases: LeaseOverview[] = recommendations.map(
      (recommendation: Recommendation, index: number): LeaseOverview =>
        lease(index, 'kamil', 'ACTIVE', 10, { recommendation }),
    );

    expect(countPendingRecommendations(leases)).toBe(2);
  });

  it('bierze najświeższą aktywność z dostępów osoby, a gdy żadnej nie ma — null', () => {
    const leases: LeaseOverview[] = [
      lease(1, 'kamil', 'ACTIVE', 10, { last_activity_at: '2026-10-01T10:00:00Z' }),
      lease(2, 'kamil', 'ACTIVE', 10, { last_activity_at: null }),
      lease(3, 'kamil', 'ACTIVE', 10, { last_activity_at: '2026-10-02T10:00:00Z' }),
    ];

    expect(latestActivityAt(leases)).toBe('2026-10-02T10:00:00Z');
    expect(
      latestActivityAt([lease(4, 'ania', 'ACTIVE', 1, { last_activity_at: null })]),
    ).toBeNull();
  });
});
