import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getStatusBadge } from '@/lib/statusBadges';
import type { LeaseStatus } from '@/types/api';

export interface LeaseStatusBadgeProps {
  status: LeaseStatus;
}

/**
 * Status dzierżawy jako pigułka. Etykieta i klasy pochodzą wyłącznie z `lib/statusBadges.ts`
 * (jedno mapowanie status → kolor w projekcie).
 */
export function LeaseStatusBadge({ status }: LeaseStatusBadgeProps): React.JSX.Element {
  const badge: BadgeStyle = getStatusBadge(status);

  return (
    <Badge variant="outline" className={badge.className}>
      {badge.label}
    </Badge>
  );
}
