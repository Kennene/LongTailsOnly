import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getRoleBadge } from '@/lib/statusBadges';
import type { Role } from '@/types/api';

export interface RoleBadgeProps {
  role: Role;
}

/**
 * Poziom uprawnienia jako pigułka z ikoną: oko czyta, ołówek pisze, tarcza chroni `admin`.
 * Kształt i etykieta pochodzą wyłącznie z `lib/statusBadges.ts` (`getRoleBadge`), więc kolumna
 * `Poziom` i modal decyzji nie mogą się rozjechać.
 *
 * Ikona stoi **obok** polskiej etykiety, nigdy zamiast niej — kolor i kształt wzmacniają sygnał,
 * ale nie są jego jedynym nośnikiem (`DESIGN.md` §6).
 */
export function RoleBadge({ role }: RoleBadgeProps): React.JSX.Element {
  const badge: BadgeStyle = getRoleBadge(role);
  const Icon: BadgeStyle['icon'] = badge.icon;

  return (
    <Badge variant="outline" className={badge.className}>
      <Icon aria-hidden="true" />
      {badge.label}
    </Badge>
  );
}
