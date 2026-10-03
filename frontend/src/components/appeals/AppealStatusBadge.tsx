import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getAppealStatusBadge } from '@/lib/statusBadges';
import type { AppealStatus } from '@/types/api';

export interface AppealStatusBadgeProps {
  status: AppealStatus;
}

/**
 * Status odwołania jako pigułka — ten sam wzór co `LeaseStatusBadge`. Etykieta, klasy i ikona
 * pochodzą wyłącznie z `lib/statusBadges.ts` (jedno mapowanie stanu na kształt i kolor), a ikona
 * stoi **obok** polskiej etykiety, więc lista odwołań niesie ten sam sygnał co lista dostępów.
 */
export function AppealStatusBadge({ status }: AppealStatusBadgeProps): React.JSX.Element {
  const badge: BadgeStyle = getAppealStatusBadge(status);
  const Icon: BadgeStyle['icon'] = badge.icon;

  return (
    <Badge variant="outline" className={badge.className}>
      <Icon aria-hidden="true" />
      {badge.label}
    </Badge>
  );
}
