import type { ReactNode } from 'react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Wspólny wzór tabel konsoli (Dostępy, Audyt, Odwołania, Standard zespołu): pierwsza kolumna —
 * tożsamość wiersza — trzyma lewą krawędź, każda kolejna jest wyśrodkowana. Komórki danych
 * dostają `CELL_CENTER`, nagłówki składa `HeadCell`.
 */
export const CELL_CENTER = 'text-center';

export interface HeadCellProps {
  children: string;
  /** Pierwsza kolumna tabeli (tożsamość wiersza) — jedyna wyrównana do lewej. */
  leading?: boolean;
  /**
   * Kolumna opisuje tylko wpisy pod grupą (np. „Poziom”, „Status”): nazwa zostaje w `<thead>`
   * dla czytników ekranu, a na ekranie podpisuje ją `ColumnCaption` w rozwiniętym wierszu grupy.
   */
  srOnly?: boolean;
  className?: string;
}

export function HeadCell({
  children,
  leading = false,
  srOnly = false,
  className,
}: HeadCellProps): React.JSX.Element {
  return (
    <TableHead
      className={cn(leading ? 'text-left' : CELL_CENTER, 'text-muted-foreground', className)}
    >
      {srOnly ? <span className="sr-only">{children}</span> : children}
    </TableHead>
  );
}

/**
 * Podpis kolumny w rozwiniętym wierszu grupy — widoczny zamiennik nagłówka `srOnly`. Ten sam krój
 * co `HeadCell`; `aria-hidden`, żeby czytnik nie czytał nazwy kolumny drugi raz.
 */
export function ColumnCaption({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span aria-hidden="true" className="font-medium text-muted-foreground">
      {children}
    </span>
  );
}
