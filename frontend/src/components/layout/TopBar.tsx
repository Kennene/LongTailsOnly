import { DemoRefreshButton } from '@/components/layout/DemoRefreshButton';
import { ServicePicker } from '@/components/layout/ServicePicker';

export function TopBar(): React.JSX.Element {
  return (
    <header
      data-slot="top-bar"
      className="flex min-h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-6 py-1.5"
    >
      {/* Obszar kontekstu widoku — nazwa produktu, nie nazwa integracji: usługa jest widoczna
          w kontrolce obok (spec §5.7), więc nie powtarzamy jej w tytule. */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">TailCut</span>
        <span className="truncate text-xs text-muted-foreground">Nadzór nad czasowym dostępem</span>
      </div>

      {/* Prawa strona jest **jednym** dzieckiem `justify-between` (spec §5.5): kontrolka usługi
          i slot paska czasu symulowanego (zadanie 5.4b) stoją w jednej grupie, żeby trzecie
          dziecko nie konkurowało o miejsce z lewym blokiem. Przycisk odświeżenia demo stoi tu,
          a nie w widoku „Mocki”, bo na scenie ma być pod ręką na każdym ekranie. */}
      <div className="flex shrink-0 items-center justify-end gap-4">
        <ServicePicker />
        <DemoRefreshButton />
      </div>
    </header>
  );
}
