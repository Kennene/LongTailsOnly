import type { LeaseOverview, LeaseStatus, UserRead } from '@/types/api';

/** Dostępy jednej osoby: tabela pokazuje ją raz, a repozytoria dopiero po rozwinięciu. */
export interface LeaseGroup {
  user: UserRead;
  /** Posortowane od najpilniejszego. */
  leases: LeaseOverview[];
  /** Pierwszy z `leases` — od niego zależy miejsce osoby w tabeli i jej status zbiorczy. */
  mostUrgent: LeaseOverview;
}

/** Ranga pilności (spec §7.2): wygasłe, ostrzeżenia, aktywne, a za nimi stałe (admin) i odebrane. */
const STATUS_RANK: Record<LeaseStatus, number> = {
  EXPIRED: 0,
  WARNING: 1,
  ACTIVE: 2,
  PERMANENT: 3,
  REVOKED: 4,
};

/**
 * Sortowanie z kontraktu: ranga statusu, w grupie rosnąco po `days_remaining`,
 * a dostępy bez terminu (`days_remaining: null`, czyli rola `admin`) na końcu.
 */
export function compareLeases(left: LeaseOverview, right: LeaseOverview): number {
  const rank: number = STATUS_RANK[left.status] - STATUS_RANK[right.status];
  if (rank !== 0) {
    return rank;
  }
  if (left.days_remaining === null && right.days_remaining === null) {
    return 0;
  }
  if (left.days_remaining === null) {
    return 1;
  }
  if (right.days_remaining === null) {
    return -1;
  }

  return left.days_remaining - right.days_remaining;
}

/** Jedna grupa na osobę; osoby po najpilniejszym dostępie, przy remisie po nazwie. */
export function groupLeasesByUser(leases: LeaseOverview[]): LeaseGroup[] {
  const byUser: Map<number, LeaseOverview[]> = new Map();
  for (const lease of leases) {
    byUser.set(lease.user.id, [...(byUser.get(lease.user.id) ?? []), lease]);
  }

  const groups: LeaseGroup[] = [...byUser.values()].map(
    (userLeases: LeaseOverview[]): LeaseGroup => {
      const sorted: LeaseOverview[] = userLeases.toSorted(compareLeases);
      return { user: sorted[0].user, leases: sorted, mostUrgent: sorted[0] };
    },
  );

  return groups.toSorted(
    (left: LeaseGroup, right: LeaseGroup): number =>
      compareLeases(left.mostUrgent, right.mostUrgent) ||
      left.user.name.localeCompare(right.user.name),
  );
}

/** „1 repozytorium”, „2 repozytoria”, „5 repozytoriów” — polska odmiana liczebnika. */
export function formatRepositoryCount(count: number): string {
  const lastDigit: number = count % 10;
  const lastTwoDigits: number = count % 100;
  if (count === 1) {
    return '1 repozytorium';
  }
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} repozytoria`;
  }

  return `${count} repozytoriów`;
}

/** Ile dostępów osoby silnik proponuje zmienić (obniżyć albo odebrać). */
export function countPendingRecommendations(leases: LeaseOverview[]): number {
  return leases.filter((lease: LeaseOverview): boolean => lease.recommendation !== 'KEEP').length;
}

/** Najświeższa aktywność w dostępach osoby; `null`, gdy nie ma żadnej. */
export function latestActivityAt(leases: LeaseOverview[]): string | null {
  const stamps: string[] = leases
    .map((lease: LeaseOverview): string | null => lease.last_activity_at)
    .filter((stamp: string | null): stamp is string => stamp !== null);

  return stamps.length === 0
    ? null
    : stamps.reduce((latest: string, stamp: string): string =>
        Date.parse(stamp) > Date.parse(latest) ? stamp : latest,
      );
}
