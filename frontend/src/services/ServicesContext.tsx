/* eslint-disable react-refresh/only-export-components -- Kontrakt spec §5.2: provider i oba
   hooki czytające ten sam kontekst mieszkają w jednym module, więc Fast Refresh i tak nie
   obejmie tego pliku. Rozbicie na dwa pliki rozjechałoby eksporty wymagane przez zadania 7 i 8. */
import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

import { useServices } from '@/hooks/useServices';
import type { ServiceRead } from '@/types/api';

/**
 * Zapisany wybór usługi to **goły identyfikator**, nie JSON — dlatego nie ma tu `JSON.parse`,
 * a walidacja polega wyłącznie na sprawdzeniu obecności w katalogu z backendu.
 */
const STORAGE_KEY = 'lease-governor.service';

/**
 * Placeholder, gdy nie da się wybrać żadnej usługi: pusty katalog albo błąd zapytania.
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
 * Kolejność rozstrzygania (spec §5.2): zapis obecny w katalogu → `github` z katalogu → pierwszy
 * wpis katalogu → placeholder. Zapis spoza katalogu **zostaje** w `localStorage` (nie kasujemy go
 * po cichu), a wybór degraduje się tylko na czas sesji.
 */
function resolveActiveService(services: ServiceRead[], storedId: string | null): ServiceRead {
  if (storedId !== null) {
    const stored = services.find((service: ServiceRead): boolean => service.id === storedId);

    if (stored !== undefined) {
      return stored;
    }
  }

  const github = services.find((service: ServiceRead): boolean => service.id === 'github');

  return github ?? services[0] ?? NO_SERVICE;
}

export function ServicesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { data, isPending, isError } = useServices();
  const [storedId, setStoredId] = useState<string | null>(readStoredServiceId);
  const services: ServiceRead[] = data ?? [];
  const activeService = resolveActiveService(services, storedId);

  function selectService(id: string): void {
    // Wybór ignorujemy tylko wtedy, gdy katalog **już się wypowiedział** i tego identyfikatora w nim
    // nie ma (spec §5.6). Dopóki `/api/v1/services` jest w drodze, katalog milczy, a nie przeczy —
    // a picker renderuje wtedy wpisy z rejestru frontendu, więc odrzucenie wyboru byłoby martwym
    // kliknięciem. Zapis zostaje przy tym nietknięty: nieznany identyfikator w `localStorage` nie
    // może zostać po cichu nadpisany przez fallback.
    const isKnown = services.some((service: ServiceRead): boolean => service.id === id);

    if (!isPending && !isKnown) {
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
