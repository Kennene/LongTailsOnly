import { Badge } from '@/components/ui/badge';
import { formatDateTimePl } from '@/lib/dateTime';
import { type BadgeStyle, getAppealStatusBadge } from '@/lib/statusBadges';
import type { AppealRead } from '@/types/api';

export interface AppealHistoryProps {
  appeals: AppealRead[];
}

/**
 * Historia odwołań w modalu decyzji (UC-3).
 *
 * Kolejność bierzemy z API (`GET /api/v1/appeals` zwraca od najnowszego) — komponent nie
 * porównuje dat, bo porównania i formatowanie czasu żyją wyłącznie w `lib/dateTime.ts`,
 * a etykietę i kolor statusu daje `getAppealStatusBadge` (jedno mapowanie w projekcie).
 */
export function AppealHistory({ appeals }: AppealHistoryProps): React.JSX.Element {
  if (appeals.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak odwołań</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {appeals.map((appeal: AppealRead): React.JSX.Element => {
        const badge: BadgeStyle = getAppealStatusBadge(appeal.status);

        return (
          <li
            className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
            key={appeal.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {formatDateTimePl(appeal.created_at)}
              </span>
              <Badge className={badge.className} variant="outline">
                {badge.label}
              </Badge>
            </div>
            <p className="max-w-prose break-words text-sm">{appeal.justification}</p>
          </li>
        );
      })}
    </ul>
  );
}
