import type { ChangeEvent } from 'react';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { SELECT_CLASSES } from '@/lib/selectClasses';
import { cn } from '@/lib/utils';
import { fallbackIcon, getServiceConfig, SERVICE_REGISTRY } from '@/services/serviceRegistry';
import { useActiveService } from '@/services/ServicesContext';
import type { ServiceRead } from '@/types/api';

/** Identyfikator kontrolki: `htmlFor` etykiety i `id` pola muszą wskazywać to samo. */
const PICKER_ID = 'service-picker';

/** Dopiski do etykiet opcji — jedyne miejsce, w którym powstają. */
const UNAVAILABLE_SUFFIX = '(niedostępna)';
const UNKNOWN_SUFFIX = '(nieznana)';

/**
 * Opcja kontrolki. `isPlaceholder` oznacza bieżącą wartość, której nie da się wybrać: nie jest
 * usługą z listy, więc `setActiveService` i tak by ją odrzucił.
 */
interface PickerOption {
  id: string;
  label: string;
  isPlaceholder: boolean;
}

/**
 * Dopóki katalog nie jest rozstrzygnięty, opcje pochodzą z rejestru frontendu (spec §5.5) — dzięki
 * temu kontrolka nigdy nie jest spinnerem, a widoczne opcje są wybieralne, bo `setActiveService`
 * przyjmuje identyfikator z rejestru dokładnie w tych dwóch stanach (spec §5.6.1). Rejestr nie zna
 * nazw usług (nazwy są w katalogu), więc w tym oknie etykietą jest identyfikator.
 */
function registryOptions(): PickerOption[] {
  return Object.values(SERVICE_REGISTRY).map((config): PickerOption => ({
    id: config.id,
    label: config.id,
    isPlaceholder: false,
  }));
}

/** Rozstrzygnięty katalog jest źródłem opcji — także wpisów, których rejestr frontendu nie zna. */
function catalogOptions(services: ServiceRead[]): PickerOption[] {
  return services.map((service: ServiceRead): PickerOption => {
    return {
      id: service.id,
      label: service.is_available ? service.name : `${service.name} ${UNAVAILABLE_SUFFIX}`,
      isPlaceholder: false,
    };
  });
}

/**
 * Bieżąca wartość musi istnieć jako opcja, inaczej pole byłoby puste (spec §5.5). Gdy nie ma jej
 * na liście, dochodzi jako opcja **wyłączona**: `setActiveService` odmówiłby jej przyjęcia, więc
 * wyłączona opcja jest widoczną prawdą o stanie, a nie martwym klikiem (Ruling 23).
 */
function withCurrentOption(options: PickerOption[], activeService: ServiceRead): PickerOption[] {
  if (options.some((option: PickerOption): boolean => option.id === activeService.id)) {
    return options;
  }

  const label =
    activeService.id === '' ? activeService.name : `${activeService.name} ${UNKNOWN_SUFFIX}`;

  return [{ id: activeService.id, label, isPlaceholder: true }, ...options];
}

/**
 * Kontrolka wyboru usługi w pasku górnym (spec §5.5). Natywny `<select>` — świadomie ta sama
 * decyzja co w `AppealForm`, `GraphFilters` i `AuditFilters`: Radixowy `Select` nie przyjmuje
 * `userEvent.selectOptions`, a przy dyskretnym rozmiarze natywna strzałka daje afordancję bez
 * nowej zależności. `--primary` zostaje zarezerwowany dla zaznaczenia i fokusu, więc kontrolka
 * nie jest drugim przyciskiem `default`.
 *
 * Gdy katalog padnie, kontrolka **zostaje** widoczna obok alertu (Ruling 21): rejestr frontendu
 * zna usługi, więc użytkownik z nieaktualnym zapisem może się przełączyć, mimo że backend leży.
 */
export function ServicePicker(): React.JSX.Element {
  const { activeService, services, setActiveService, isPending, isError } = useActiveService();
  const isCatalogResolved = !isPending && !isError;
  const options = withCurrentOption(
    isCatalogResolved ? catalogOptions(services) : registryOptions(),
    activeService,
  );
  const ActiveIcon = getServiceConfig(activeService.id)?.icon ?? fallbackIcon;

  return (
    <div className="flex items-center gap-2">
      <Label className="sr-only" htmlFor={PICKER_ID}>
        Usługa
      </Label>
      <span className="text-muted-foreground">
        <ActiveIcon className="size-4" aria-hidden="true" />
      </span>
      <select
        // Rozmiar `h-8` i widoczny fokus pochodzą ze wspólnego rdzenia (spec §6); różnice tego
        // pola to tło chrome, padding (`pr-7` robi miejsce na strzałkę) i rozmiar tekstu chrome.
        // Natywnej strzałki nie ukrywamy (`appearance-none`) — przy `h-8` to ona daje afordancję
        // bez nowej zależności.
        aria-busy={isPending}
        className={cn(SELECT_CLASSES, 'bg-background py-1 pr-7 pl-2 text-xs')}
        id={PICKER_ID}
        onChange={(event: ChangeEvent<HTMLSelectElement>): void =>
          setActiveService(event.target.value)
        }
        value={activeService.id}
      >
        {options.map((option: PickerOption): React.JSX.Element => (
          <option key={option.id} value={option.id} disabled={option.isPlaceholder}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Alert stoi **obok** kontrolki, nigdy zamiast niej (Ruling 21). Jedna linia, bo pasek
          górny ma `min-h-14` i nie rośnie dla komunikatu. */}
      {isError ? (
        <Alert className="w-auto py-1" variant="destructive">
          <AlertTitle>Nie udało się pobrać listy usług</AlertTitle>
        </Alert>
      ) : null}
    </div>
  );
}
