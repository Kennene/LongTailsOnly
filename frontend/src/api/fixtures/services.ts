import servicesJson from '@shared/fixtures/services.json';

import type { ServiceRead } from '@/types/api';

/**
 * Katalog usług demo — **wspólne** dane z `shared/fixtures/`, a nie literał wymyślony na
 * frontendzie.
 *
 * Dwa rekordy pokrywają oba stany `is_available` i oba używane `kind`: `github` (dostępny, pełny
 * zestaw capabilities) oraz `demo-tracker` (integracja demonstracyjna, niedostępna). Picker usług
 * ma więc co renderować także bez backendu.
 *
 * Rzutowanie na `ServiceRead[]` jest jedynym miejscem, w którym deklarujemy kształt: brak pola
 * albo literał spoza unii (`ServiceKind`) wywala `tsc`. Kolejności **nie zmieniamy** —
 * `capabilities` przychodzą z backendu w kolejności deklaracji rejestru, nie posortowane.
 */
export const servicesFixture: ServiceRead[] = servicesJson as ServiceRead[];
