import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getStatusBadge } from '@/lib/statusBadges';
import type { LeaseStatus } from '@/types/api';

export interface LeaseStatusBadgeProps {
  status: LeaseStatus;
}

/**
 * Status dostępu jako pigułka. Etykieta, klasy i ikona pochodzą wyłącznie z `lib/statusBadges.ts`
 * (jedno mapowanie status → kształt i kolor w projekcie). Ikona jest `aria-hidden`, bo etykieta
 * po polsku stoi obok — czytnik ekranu nie ma po co czytać nazwy glifu.
 */
export function LeaseStatusBadge({ status }: LeaseStatusBadgeProps): React.JSX.Element {
  const badge: BadgeStyle = getStatusBadge(status);
  const Icon: BadgeStyle['icon'] = badge.icon;

  return (
    <Badge variant="outline" className={badge.className}>
      <Icon aria-hidden="true" />
      {badge.label}
    </Badge>
  );
}
