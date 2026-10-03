import { TimeTravelBar } from '@/components/layout/TimeTravelBar';

export function TopBar(): React.JSX.Element {
  return (
    <header
      data-slot="top-bar"
      className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-6 py-1.5"
    >
      {/* Obszar kontekstu widoku — późniejsze zadania mogą tu wstawić tytuł aktywnej trasy. */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">
          GitHub Access Lease Governor
        </span>
        <span className="truncate text-xs text-muted-foreground">
          Nadzór nad czasowym dostępem do repozytoriów
        </span>
      </div>

      {/* Slot paska czasu symulowanego — `TimeTravelBar` (zadanie 5.4b). */}
      <div
        data-slot="time-travel-bar"
        data-testid="time-travel-bar"
        className="flex w-72 shrink-0 items-center justify-end"
      >
        <TimeTravelBar />
      </div>
    </header>
  );
}
