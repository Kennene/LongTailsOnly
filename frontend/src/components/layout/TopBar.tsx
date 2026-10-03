export function TopBar(): React.JSX.Element {
  return (
    <header
      data-slot="top-bar"
      className="flex min-h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-6 py-1.5"
    >
      {/* Obszar kontekstu widoku. Zegar symulowany mieszka w widoku „Mocki” (`/mocks`). */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">
          GitHub Access Lease Governor
        </span>
        <span className="truncate text-xs text-muted-foreground">
          Nadzór nad czasowym dostępem do repozytoriów
        </span>
      </div>
    </header>
  );
}
