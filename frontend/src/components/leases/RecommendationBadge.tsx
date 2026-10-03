import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getRecommendationBadge } from '@/lib/statusBadges';
import type { Recommendation } from '@/types/api';

export interface RecommendationBadgeProps {
  recommendation: Recommendation;
}

/**
 * Rekomendacja jako pigułka — ten sam wzór co `LeaseStatusBadge`. Etykieta, klasy i ikona pochodzą
 * wyłącznie z `lib/statusBadges.ts` (jedno mapowanie rekomendacja → kształt i kolor w projekcie),
 * więc „Odbierz” niesie kształt (`Ban`), nie tylko czerwień (DESIGN.md §4 i §6).
 */
export function RecommendationBadge({
  recommendation,
}: RecommendationBadgeProps): React.JSX.Element {
  const badge: BadgeStyle = getRecommendationBadge(recommendation);
  const Icon: BadgeStyle['icon'] = badge.icon;

  return (
    <Badge variant="outline" className={badge.className}>
      <Icon aria-hidden="true" />
      {badge.label}
    </Badge>
  );
}
