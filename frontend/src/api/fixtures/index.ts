/**
 * Fixture'y w kształcie kontraktu (`frontend/src/types/api.ts`, generowanego z Pydantic).
 *
 * Dane pochodzą ze **wspólnego** katalogu `shared/fixtures/` (alias `@shared`, patrz
 * `shared/fixtures/README.md`) i są tam walidowane tym samym modelem Pydantic, który generuje
 * kontrakt. Ten barrel tylko je re-eksportuje, żeby widoki nie sięgały po pliki JSON bezpośrednio,
 * a brak pola albo literał spoza unii (`Role`, `LeaseStatus`, `Recommendation`) był błędem
 * kompilacji, a nie pustą kolumną na demo.
 */

export { activityEventsFixture, countActivityStats } from './activity';
export { appealsFixture } from './appeals';
export { auditFixture } from './audit';
export { baselineFixture } from './baseline';
export { clockFixture } from './clock';
export { countDashboard, dashboardFixture } from './dashboard';
export { buildGraphFixture, graphFixture } from './graph';
export { expiredLeasesFixture, leasesFixture } from './leases';
export { servicesFixture } from './services';
