import { Badge } from '@/components/ui/badge';
import { type BadgeStyle, getRecommendationBadge } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/types/api';

export interface RecommendationBadgeProps {
  recommendation: Recommendation;
  /** Tylko rozmiar (np. większa pigułka w modalu decyzji) — kolor zawsze pochodzi z mapy. */
  className?: string;
}

/**
 * Rekomendacja jako pigułka — ten sam wzór co `LeaseStatusBadge`. Etykieta, klasy i ikona pochodzą
 * wyłącznie z `lib/statusBadges.ts` (jedno mapowanie rekomendacja → kształt i kolor w projekcie),
 * więc „Odbierz” niesie kształt (`Ban`), nie tylko czerwień (DESIGN.md §4 i §6).
 */
export function RecommendationBadge({
  recommendation,
  className,
}: RecommendationBadgeProps): React.JSX.Element {
  const badge: BadgeStyle = getRecommendationBadge(recommendation);
  const Icon: BadgeStyle['icon'] = badge.icon;

  return (
    <Badge variant="outline" className={cn(badge.className, className)}>
      <Icon aria-hidden="true" />
      {badge.label}
    </Badge>
  );
}
