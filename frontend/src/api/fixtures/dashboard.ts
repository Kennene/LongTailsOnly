import type { DashboardCounters } from '@/api/dashboard';

/**
 * Fixture liczników dashboardu — dokładnie w kształcie oczekiwanej odpowiedzi 4.6.
 *
 * Trzymamy ją jako literał TS z jawnym typem (nie `.json`), więc literówka w nazwie pola
 * jest błędem kompilacji, a nie pustą kartą na demo. Wartości są spójne z seedem backendu
 * i z testem integracyjnym przepływu pitch (`kpi-warning` = 1 na starcie).
 */
export const dashboardFixture: DashboardCounters = {
  active: 12,
  warning: 1,
  expired: 1,
  downscope_recommendations: 1,
};
