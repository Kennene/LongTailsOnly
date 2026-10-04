import { useSimulatedNow } from '@/hooks/useSimulatedNow';
import {
  daysSince,
  formatDateTimePl,
  formatDaysAgo,
  formatDaysRemaining,
  formatOverdueDays,
} from '@/lib/dateTime';
import { formatCountPl } from '@/lib/grouping';
import { OVERDUE_TEXT_CLASS } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';

/**
 * Jeden wzór czasu w całej aplikacji (tabele, listy, modale):
 * - termin: wygasły dostęp mówi na czerwono „Po terminie X dni”, pozostałe — „Pozostało X dni”,
 * - wiersz grupy liczy wygasłe na czerwono („2 wygasłe”),
 * - wiersz grupy pokazuje tylko wiek („8 dni temu”), a rozwinięty wpis — dokładną datę i wiek.
 */

export interface RemainingDaysProps {
  days: number | null;
  /** Dostęp po terminie (status `EXPIRED`): wtedy liczba dni idzie na czerwono. */
  expired: boolean;
}

export function RemainingDays({ days, expired }: RemainingDaysProps): React.JSX.Element {
  if (expired && days !== null) {
    return <span className={OVERDUE_TEXT_CLASS}>{formatOverdueDays(-days)}</span>;
  }

  return <>{formatDaysRemaining(days)}</>;
}

export function ExpiredCount({ count }: { count: number }): React.JSX.Element {
  return (
    <span className={OVERDUE_TEXT_CLASS}>
      {formatCountPl(count, { one: 'wygasły', few: 'wygasłe', many: 'wygasłych' })}
    </span>
  );
}

export interface DaysAgoProps {
  stamp: string;
  className?: string;
  /** Format zapasowy, gdy zegar symulowany jeszcze się nie wczytał. */
  formatFallback?: (stamp: string) => string;
}

/** Sam wiek („8 dni temu”) — dla wiersza grupy; do wczytania zegara pokazuje datę. */
export function DaysAgo({
  stamp,
  className,
  formatFallback = formatDateTimePl,
}: DaysAgoProps): React.JSX.Element {
  const now: string | null = useSimulatedNow();

  return (
    <span className={className}>
      {now === null ? formatFallback(stamp) : formatDaysAgo(daysSince(stamp, now))}
    </span>
  );
}

export interface StampWithAgeProps {
  stamp: string;
  /** Format dokładnej daty — pełny (`formatDateTimePl`) albo krótki w gęstej tabeli. */
  format?: (stamp: string) => string;
  /** Klasa koloru wieku (np. czerwień/zieleń przy wygasłym dostępie); domyślnie neutralny. */
  ageClassName?: (days: number) => string | undefined;
}

/** Dokładna data, a pod nią wiek — dla rozwiniętego wpisu. */
export function StampWithAge({
  stamp,
  format = formatDateTimePl,
  ageClassName,
}: StampWithAgeProps): React.JSX.Element {
  const now: string | null = useSimulatedNow();
  const days: number | null = now === null ? null : daysSince(stamp, now);

  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="font-mono">{format(stamp)}</span>
      {days === null ? null : (
        <span className={cn('text-xs text-muted-foreground', ageClassName?.(days))}>
          {formatDaysAgo(days)}
        </span>
      )}
    </span>
  );
}
