/* eslint-disable react-refresh/only-export-components -- Kontrakt spec §5.2: provider i oba
   hooki czytające ten sam kontekst mieszkają w jednym module, więc Fast Refresh i tak nie
   obejmie tego pliku. Rozbicie na dwa pliki rozjechałoby eksporty wymagane przez zadania 7 i 8. */
import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

import { useServices } from '@/hooks/useServices';
import { getServiceConfig, type ServiceRoute } from '@/services/serviceRegistry';
import type { ServiceRead } from '@/types/api';

/**
 * Zapisany wybór usługi to **goły identyfikator**, nie JSON — dlatego nie ma tu `JSON.parse`,
 * a walidacja polega wyłącznie na sprawdzeniu obecności w katalogu z backendu.
 */
const STORAGE_KEY = 'lease-governor.service';

/**
 * Placeholder, gdy **osiadły** katalog nie wskazuje żadnej usługi — czyli gdy jest pusty. Milczący
 * katalog (w drodze albo po błędzie) rozstrzyga się z rejestru frontendu, więc tu nie trafia; gdyby
 * rejestr nie znał nawet domyślnego `github`, placeholder jest ostatnim zastępstwem.
 * Identyfikator jest pusty (`getServiceConfig('')` → `undefined`), więc `getDefaultPath('')`
 * prowadzi na pulpit, a `isRouteSupported('', '/')` jest `true` — strażnik nie odrzuca własnego
 * celu przekierowania i powłoka nigdy nie zostaje pusta. `kind: 'vcs'` jest **bez znaczenia,
 * dopóki nikt nie czyta `ServiceRead.kind`** (dziś nic w `src/` tego nie robi); gdyby ikona albo
 * plakietka zaczęła zależeć od `kind`, ta wartość stałaby się nieprawdziwym twierdzeniem.
 * Sygnał „nic nie jest dostępne” niosą `is_available: false` i `capabilities: []`, a `name` —
 * polski komunikat dla kontrolki.
 */
const NO_SERVICE: ServiceRead = {
  id: '',
  name: 'Brak usług',
  kind: 'vcs',
  capabilities: [],
  is_available: false,
};

export interface ServiceContextValue {
  activeService: ServiceRead;
  services: ServiceRead[];
  setActiveService: (id: string) => void;
  isPending: boolean;
  isError: boolean;
}

const ServicesContext = createContext<ServiceContextValue | null>(null);

function readStoredServiceId(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    return stored === null || stored === '' ? null : stored;
  } catch {
    return null;
  }
}

function persistServiceId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Prywatny tryb Safari i przekroczony limit quota rzucają przy zapisie. Wybór działa dalej
    // w stanie providera — trwałość jest wygodą, nie warunkiem działania panelu.
  }
}

/**
 * Usługa znana rejestrowi frontendu, której katalog **nie potwierdził** — żądanie jest w drodze
 * albo padło. Kształt jest ten sam co `NO_SERVICE`, bo to również zastępstwo, ale każda wartość
 * jest brana z tego, co rejestr naprawdę deklaruje: `name` z identyfikatora (rejestr nie zna nazw
 * wyświetlanych — te są w katalogu), `capabilities` z tras (dokładnie te identyfikatory, które
 * katalog zwraca dla znanych usług), a `is_available: false` znaczy „nie potwierdzam dostępności”,
 * nie „usługa jest wyłączona”.
 */
function unconfirmedService(id: string): ServiceRead | null {
  const config = getServiceConfig(id);

  if (config === undefined) {
    return null;
  }

  return {
    id: config.id,
    name: config.id,
    kind: 'vcs',
    capabilities: config.routes.map((route: ServiceRoute): string => route.id),
    is_available: false,
  };
}

/**
 * Kolejność rozstrzygania (spec §5.2): zapis obecny w katalogu → `github` z katalogu → pierwszy
 * wpis katalogu → placeholder. Zapis spoza katalogu **zostaje** w `localStorage` (nie kasujemy go
 * po cichu), a wybór degraduje się tylko na czas sesji.
 *
 * Trzeci argument dotyczy katalogu **nierozstrzygniętego**: gdy żądanie jest w drodze albo padło,
 * katalog nie jest autorytetem, więc rozstrzyga rejestr frontendu — najpierw zapisany identyfikator
 * (Ruling 21: wybór przyjęty w tym oknie musi faktycznie zadziałać, bo gdy żądanie padło, nie ma już
 * niczego, co mogłoby go później poprawić), a gdy zapisu nie ma albo rejestr go nie zna, domyślny
 * `github` (spec §5.2: „użytkownik wraca do domyślnej (`github`)”). Inaczej pierwsza wizyta
 * zaczynałaby się od pustej nawigacji, a po nieudanym katalogu powłoka ogłaszałaby „Brak usług”
 * przez całą sesję, choć kontrolka obok oferuje `github` — dokładnie w stanie „backend leży”,
 * w którym plan wymaga nawigowalności. Osiadły katalog — także **pusty** — jest stwierdzeniem,
 * więc rejestr go nie przebija i placeholder zostaje (spec §5.6.1).
 */
function resolveActiveService(
  services: ServiceRead[],
  storedId: string | null,
  isCatalogUnresolved: boolean,
): ServiceRead {
  if (storedId !== null) {
    const stored = services.find((service: ServiceRead): boolean => service.id === storedId);

    if (stored !== undefined) {
      return stored;
    }
  }

  const github = services.find((service: ServiceRead): boolean => service.id === 'github');

  if (github !== undefined) {
    return github;
  }

  if (services[0] !== undefined) {
    return services[0];
  }

  if (isCatalogUnresolved) {
    return unconfirmedService(storedId ?? 'github') ?? unconfirmedService('github') ?? NO_SERVICE;
  }

  return NO_SERVICE;
}

export function ServicesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { data, isPending, isError } = useServices();
  const [storedId, setStoredId] = useState<string | null>(readStoredServiceId);
  const services: ServiceRead[] = data ?? [];
  const activeService = resolveActiveService(services, storedId, isPending || isError);

  function selectService(id: string): void {
    // Zapisany identyfikator zostaje nietknięty, gdy wybór odrzucamy: nieznana wartość
    // w `localStorage` nie może zostać po cichu nadpisana przez fallback.
    //
    // Dwa źródła prawdy i trzy stany katalogu:
    // 1. Katalog rozstrzygnięty — obowiązuje **wyłącznie jego zawartość**. Wpis, którego rejestr
    //    frontendu nie zna, jest wybieralny (picker oferuje go z katalogu, a dalej degradują go
    //    `fallbackIcon` i trasa domyślna — Ruling 12); wpis, który katalog pomija, jest ignorowany
    //    nawet wtedy, gdy rejestr go zna.
    // 2. `isPending` — katalog **milczy**, bo jeszcze nie dotarł, a picker renderuje wtedy wpisy
    //    z rejestru frontendu. Przyjmujemy więc to, co rejestr umie pokazać, i `resolveActiveService`
    //    czyni ten wybór aktywnym od razu — katalog, który dotrze, zweryfikuje go albo zdegraduje.
    // 3. `isError` — katalog **nie wypowie się** już w tej sesji, więc reguła jest ta sama co
    //    w punkcie 2 (użytkownik na nieaktualnym zapisie może się przełączyć), a przyjęty wybór
    //    również **działa**: nie ma już katalogu, który mógłby go później poprawić, więc wybór bez
    //    efektu byłby martwym klikiem (Ruling 21).
    // Wspólny mianownik stanów 2 i 3: **dopóki katalog nie jest rozstrzygnięty**, identyfikator
    // spoza rejestru frontendu nie jest wybieralny — picker takiej opcji wtedy nie oferuje, więc
    // nie ma czego przyjmować, a literówka nie trafia do `localStorage`. Gdy katalog już osiadł,
    // obowiązuje wyłącznie on (punkt 1): wpis z katalogu spoza rejestru jest wybieralny.
    const isInCatalog = services.some((service: ServiceRead): boolean => service.id === id);
    const isInRegistry = getServiceConfig(id) !== undefined;
    const isSelectable = isInCatalog || (isInRegistry && (isPending || isError));

    if (!isSelectable) {
      return;
    }

    setStoredId(id);
    persistServiceId(id);
  }

  const value: ServiceContextValue = {
    activeService,
    services,
    setActiveService: selectService,
    isPending,
    isError,
  };

  return <ServicesContext value={value}>{children}</ServicesContext>;
}

/**
 * Rzuca poza providerem, tak samo jak `useActiveService` — brak providera nie może być cichy.
 * Milczący fallback udawałby rozstrzygnięty, pusty katalog (`isPending: false`, `isError: false`),
 * więc konsument nie odróżniłby „brak providera” od „katalog pusty”, a `setActiveService` byłby
 * martwym no-opem. Osobny komunikat wskazuje winowajcę w drzewie.
 */
export function useServicesContext(): ServiceContextValue {
  const context = useContext(ServicesContext);

  if (context === null) {
    throw new Error('useServicesContext must be used within ServicesProvider');
  }

  return context;
}

export function useActiveService(): ServiceContextValue {
  const context = useContext(ServicesContext);

  if (context === null) {
    throw new Error('useActiveService must be used within ServicesProvider');
  }

  return context;
}
