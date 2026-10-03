import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TeamChipProps {
  /** Nazwa zespołu z kontraktu (`TeamRead.name`), np. `DEV`. */
  label: string;
  /** Ustawione tylko wtedy, gdy chip filtruje; brak handlera zostawia samą etykietę. */
  selected?: boolean;
  onClick?: (label: string) => void;
}

/**
 * Chip zespołu — jeden kształt w dwóch rolach: w kolumnie `Zespół` **stwierdza** przynależność,
 * a nad tabelą **filtruje**. Rozróżnia je zachowanie, nie wygląd: wersja filtrująca jest
 * `<button>` z `aria-pressed` (więc stan zaznaczenia jedzie w atrybucie, a nie w kolorze —
 * `DESIGN.md` §6), a wersja stwierdzająca to sam `Badge`, bez roli kontrolki.
 *
 * `selected` jest ignorowane bez `onClick`: samotny `aria-pressed` na nie-interaktywnym `span`
 * obiecywałby sterowanie, którego nie ma.
 */
export function TeamChip({ label, selected, onClick }: TeamChipProps): React.JSX.Element {
  if (onClick === undefined) {
    return (
      <Badge variant="outline" className="border-border bg-muted font-mono text-muted-foreground">
        {label}
      </Badge>
    );
  }

  return (
    <Badge
      asChild
      variant="outline"
      className={cn(
        'cursor-pointer font-mono',
        selected === true
          ? 'border-status-active-border bg-status-active-subtle text-status-active'
          : 'border-border bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      <button type="button" aria-pressed={selected === true} onClick={() => onClick(label)}>
        {label}
      </button>
    </Badge>
  );
}
