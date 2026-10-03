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
 * Placeholder, gdy nie da się wybrać żadnej usługi: pusty katalog, błąd zapytania albo brak
 * providera. Identyfikator jest pusty (`getServiceConfig('')` → `undefined`), więc
 * `getDefaultPath('')` prowadzi na pulpit, a `isRouteSupported('', '/')` jest `true` — strażnik
 * nie odrzuca własnego celu przekierowania i powłoka nigdy nie zostaje pusta. `kind` jest
 * dowolny; żaden widok go nie renderuje, a `name` niesie polski komunikat dla kontrolki.
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

/** Wartość czytana poza providerem: puste usługi zamiast wyjątku (inaczej niż `useActiveService`). */
const FALLBACK_CONTEXT: ServiceContextValue = {
  activeService: NO_SERVICE,
  services: [],
  setActiveService: (): void => undefined,
  isPending: false,
  isError: false,
};

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
    // Wybór spoza katalogu jest ignorowany (spec §5.6), a zapis zostaje nietknięty — inaczej
    // nieznany identyfikator w `localStorage` zostałby po cichu nadpisany przez fallback.
    const isKnown = services.some((service: ServiceRead): boolean => service.id === id);

    if (!isKnown) {
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

export function useServicesContext(): ServiceContextValue {
  return useContext(ServicesContext) ?? FALLBACK_CONTEXT;
}

export function useActiveService(): ServiceContextValue {
  const context = useContext(ServicesContext);

  if (context === null) {
    throw new Error('useActiveService must be used within ServicesProvider');
  }

  return context;
}
