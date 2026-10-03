import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ExpandToggleProps {
  expanded: boolean;
  onToggle: () => void;
  /** Co się rozwija, np. „dostępy” — trafia do etykiety „Pokaż dostępy: Kamil”. */
  subject: string;
  /** Czyja to grupa: osoba albo aktor. */
  owner: string;
}

/**
 * Strzałka rozwijania wiersza grupy. Stan niesie `aria-expanded`, nie kolor ani obrót;
 * `stopPropagation`, bo klik w cały wiersz grupy też ją przełącza.
 */
export function ExpandToggle({
  expanded,
  onToggle,
  subject,
  owner,
}: ExpandToggleProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Ukryj' : 'Pokaż'} ${subject}: ${owner}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <ChevronRight
        aria-hidden
        className={cn('transition-transform', expanded ? 'rotate-90' : null)}
      />
    </Button>
  );
}

export interface ExpandAllButtonProps {
  allExpanded: boolean;
  onToggleAll: () => void;
}

/** „Rozwiń wszystkie” / „Zwiń wszystkie” nad listą grup. */
export function ExpandAllButton({
  allExpanded,
  onToggleAll,
}: ExpandAllButtonProps): React.JSX.Element {
  return (
    <Button variant="outline" size="sm" onClick={onToggleAll}>
      {allExpanded ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
      {allExpanded ? 'Zwiń wszystkie' : 'Rozwiń wszystkie'}
    </Button>
  );
}
