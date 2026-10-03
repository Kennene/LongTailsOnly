import { describe, expect, it } from 'vitest';

import { appealsFixture } from '@/api/fixtures';
import type { AppealGroup } from '@/components/appeals/appealGroups';
import { groupAppealsByUser } from '@/components/appeals/appealGroups';
import type { AppealOverview, AppealStatus } from '@/types/api';

const BASE: AppealOverview = appealsFixture[0];

function appeal(
  id: number,
  userId: number,
  status: AppealStatus,
  createdAt: string,
): AppealOverview {
  return {
    ...BASE,
    id,
    user_id: userId,
    status,
    created_at: createdAt,
    user: { ...BASE.user, id: userId, login: `user-${userId}`, name: `Osoba ${userId}` },
  };
}

function ids(group: AppealGroup): number[] {
  return group.appeals.map((item: AppealOverview): number => item.id);
}

describe('groupAppealsByUser', () => {
  it('puts every appeal of a person into one group, newest first', () => {
    const [group] = groupAppealsByUser([
      appeal(1, 7, 'REJECTED', '2026-09-01T10:00:00Z'),
      appeal(2, 7, 'APPROVED', '2026-09-20T10:00:00Z'),
    ]);

    expect(group.user.id).toBe(7);
    expect(ids(group)).toEqual([2, 1]);
    expect(group.latestAt).toBe('2026-09-20T10:00:00Z');
  });

  it('counts the appeals still waiting for a decision', () => {
    const [group] = groupAppealsByUser([
      appeal(1, 7, 'PENDING', '2026-09-01T10:00:00Z'),
      appeal(2, 7, 'APPROVED', '2026-09-02T10:00:00Z'),
      appeal(3, 7, 'PENDING', '2026-09-03T10:00:00Z'),
    ]);

    expect(group.pendingCount).toBe(2);
  });

  it('puts people with pending appeals first, then the most recent activity', () => {
    const groups: AppealGroup[] = groupAppealsByUser([
      appeal(1, 1, 'APPROVED', '2026-10-01T10:00:00Z'),
      appeal(2, 2, 'PENDING', '2026-09-01T10:00:00Z'),
      appeal(3, 3, 'REJECTED', '2026-09-15T10:00:00Z'),
      appeal(4, 4, 'PENDING', '2026-09-10T10:00:00Z'),
    ]);

    expect(groups.map((group: AppealGroup): number => group.user.id)).toEqual([4, 2, 1, 3]);
  });

  it('returns no groups for no appeals', () => {
    expect(groupAppealsByUser([])).toEqual([]);
  });
});
