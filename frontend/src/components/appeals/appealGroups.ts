import { groupBy } from '@/lib/grouping';
import type { AppealOverview, UserRead } from '@/types/api';

/** Odwołania jednej osoby: lista pokazuje ją raz, a poszczególne wnioski po rozwinięciu. */
export interface AppealGroup {
  user: UserRead;
  /** Od najnowszego. */
  appeals: AppealOverview[];
  /** Ile wniosków czeka na decyzję administratora. */
  pendingCount: number;
  /** `created_at` najnowszego wniosku. */
  latestAt: string;
}

function newestFirst(left: AppealOverview, right: AppealOverview): number {
  return Date.parse(right.created_at) - Date.parse(left.created_at);
}

/**
 * Jedna grupa na osobę. Najpierw osoby z oczekującymi wnioskami (to na nie czeka administrator),
 * a w obrębie każdej części — od najświeższego wniosku.
 */
export function groupAppealsByUser(appeals: AppealOverview[]): AppealGroup[] {
  const byUser: Map<number, AppealOverview[]> = groupBy(
    appeals,
    (appeal: AppealOverview): number => appeal.user.id,
  );

  const groups: AppealGroup[] = [...byUser.values()].map(
    (userAppeals: AppealOverview[]): AppealGroup => {
      const sorted: AppealOverview[] = userAppeals.toSorted(newestFirst);
      return {
        user: sorted[0].user,
        appeals: sorted,
        pendingCount: sorted.filter(
          (appeal: AppealOverview): boolean => appeal.status === 'PENDING',
        ).length,
        latestAt: sorted[0].created_at,
      };
    },
  );

  return groups.toSorted(
    (left: AppealGroup, right: AppealGroup): number =>
      Number(right.pendingCount > 0) - Number(left.pendingCount > 0) ||
      Date.parse(right.latestAt) - Date.parse(left.latestAt),
  );
}
