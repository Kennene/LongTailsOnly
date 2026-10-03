import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getAppealStatusBadge } from '@/lib/statusBadges';
import type { AppealStatus } from '@/types/api';

export interface AppealStatusBadgeProps {
  status: AppealStatus;
}

/**
 * Status odwołania jako pigułka — ten sam wzór co `LeaseStatusBadge`. Etykieta, klasy i ikona
 * pochodzą wyłącznie z `lib/statusBadges.ts` (`getAppealStatusBadge`), więc lista odwołań
 * i historia w modalu nie mogą się rozjechać. Ikona jest `aria-hidden`, bo etykieta stoi obok.
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
