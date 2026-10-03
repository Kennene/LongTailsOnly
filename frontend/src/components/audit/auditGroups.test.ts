import { describe, expect, it } from 'vitest';

import type { AuditGroup } from '@/components/audit/auditGroups';
import { formatActorIdentity, groupAuditByActor } from '@/components/audit/auditGroups';
import type { ActorType, AuditEntry } from '@/types/api';

function entry(
  id: number,
  actorType: ActorType,
  actorLogin: string | null,
  timestamp: string,
  actorId: number | null = actorLogin === null ? null : id,
): AuditEntry {
  return {
    id,
    timestamp,
    actor_type: actorType,
    actor_id: actorId,
    actor_login: actorLogin,
    action: 'LEASE_EXPIRED',
    target: 'kamil@core-api',
    details: {},
    justification: null,
  };
}

function ids(group: AuditGroup): number[] {
  return group.entries.map((item: AuditEntry): number => item.id);
}

describe('groupAuditByActor', () => {
  it('groups entries by the actor login, newest entry first', () => {
    const [group] = groupAuditByActor([
      entry(1, 'ADMIN', 'tomasz-admin', '2026-09-01T10:00:00Z'),
      entry(2, 'ADMIN', 'tomasz-admin', '2026-09-03T10:00:00Z'),
    ]);

    expect(group.actorType).toBe('ADMIN');
    expect(group.identity).toBe('tomasz-admin');
    expect(ids(group)).toEqual([2, 1]);
    expect(group.latestAt).toBe('2026-09-03T10:00:00Z');
  });

  it('puts every SYSTEM entry into one group without a person', () => {
    const groups: AuditGroup[] = groupAuditByActor([
      entry(1, 'SYSTEM', null, '2026-09-01T10:00:00Z'),
      entry(2, 'SYSTEM', null, '2026-09-02T10:00:00Z'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].identity).toBe('—');
    expect(groups[0].owner).toBe('SYSTEM');
  });

  it('keeps an admin and a user with the same login apart', () => {
    const groups: AuditGroup[] = groupAuditByActor([
      entry(1, 'ADMIN', 'kamil', '2026-09-01T10:00:00Z'),
      entry(2, 'USER', 'kamil', '2026-09-02T10:00:00Z'),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('orders groups by their most recent entry', () => {
    const groups: AuditGroup[] = groupAuditByActor([
      entry(1, 'USER', 'kamil', '2026-09-05T10:00:00Z'),
      entry(2, 'SYSTEM', null, '2026-09-01T10:00:00Z'),
      entry(3, 'ADMIN', 'tomasz-admin', '2026-09-09T10:00:00Z'),
    ]);

    expect(groups.map((group: AuditGroup): string => group.owner)).toEqual([
      'tomasz-admin',
      'kamil',
      'SYSTEM',
    ]);
  });
});

describe('formatActorIdentity', () => {
  it('prefers the login, then the numeric id, then a dash', () => {
    expect(formatActorIdentity(entry(1, 'USER', 'kamil', '2026-09-01T10:00:00Z'))).toBe('kamil');
    expect(formatActorIdentity(entry(7, 'USER', null, '2026-09-01T10:00:00Z', 7))).toBe('#7');
    expect(formatActorIdentity(entry(1, 'SYSTEM', null, '2026-09-01T10:00:00Z'))).toBe('—');
  });
});
