import servicesJson from '@shared/fixtures/services.json';

import type { ServiceRead } from '@/types/api';

/**
 * Katalog usług demo — **wspólne** dane z `shared/fixtures/`, a nie literał wymyślony na
 * frontendzie.
 *
 * Dwa rekordy pokrywają oba stany `is_available` i oba używane `kind`: `github` (dostępny, pełny
 * zestaw capabilities) oraz `demo-tracker` (integracja demonstracyjna, niedostępna). Picker usług
 * ma więc co renderować także bez backendu. `capabilities` są posortowane tak jak w payloadzie
 * backendu (`ServiceRead.from_descriptor`), więc kolejność nie niesie znaczenia.
 *
 * Rzutowanie na `ServiceRead[]` **nie pilnuje kształtu** — asercja typu przepuszcza i węższy,
 * i szerszy obiekt. Pilnują go dwa testy: `tests/contract/test_fixtures_match_contract.py`
 * waliduje każdy fixture modelem Pydantic, z którego powstaje `schema.json`, a §7.4 porównuje
 * zbiór capabilities tego fixture'u z rejestrem frontendu (`src/api/services.test.ts`).
 */
export const servicesFixture: ServiceRead[] = servicesJson as ServiceRead[];
