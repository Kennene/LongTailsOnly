/**
 * Fixture'y w kształcie kontraktu (`frontend/src/types/api.ts`, generowanego z Pydantic).
 *
 * Każdy plik jest literałem TS z jawnym typem, a ten barrel go re-eksportuje — dzięki temu
 * brak pola, literówka w nazwie albo literał spoza unii (`Role`, `LeaseStatus`, `Recommendation`,
 * `ActorType`, `AppealStatus`) jest **błędem kompilacji**, a nie pustą kolumną na demo.
 * Gdy Osoba 6 dostarczy surowe JSON-y (krok 6.1), opakowujemy je w plikach domenowych tym samym typem.
 */

export { appealsFixture } from './appeals';
export { auditFixture } from './audit';
export { baselineFixture } from './baseline';
export { clockFixture } from './clock';
export { dashboardFixture } from './dashboard';
export { leasesFixture } from './leases';
