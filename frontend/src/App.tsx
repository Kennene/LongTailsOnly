import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { AppealsPage } from '@/pages/AppealsPage';
import { AuditPage } from '@/pages/AuditPage';
import { BaselinePage } from '@/pages/BaselinePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { GraphPage } from '@/pages/GraphPage';
import { LeasesPage } from '@/pages/LeasesPage';
import { MocksPage } from '@/pages/MocksPage';
import { ServiceRouteGuard } from '@/services/ServiceRouteGuard';
import { ServicesProvider } from '@/services/ServicesContext';

/**
 * Trasy w trybie deklaratywnym. Router zakłada `main.tsx` (`BrowserRouter`), a testy —
 * `renderWithProviders` (`MemoryRouter`), więc definicja tras istnieje tylko tutaj.
 *
 * `ServicesProvider` otacza `AppShell`, bo to on renderuje kontrolkę usługi i nawigację;
 * `ServiceRouteGuard` stoi **wewnątrz** powłoki i **poza** widokami: layout zostaje na ekranie,
 * a nieobsługiwana trasa przekierowuje na trasę domyślną aktywnej usługi (spec §5.4).
 */
export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ServicesProvider>
            <AppShell />
          </ServicesProvider>
        }
      >
        <Route element={<ServiceRouteGuard />}>
          <Route index element={<DashboardPage />} />
          <Route path="leases" element={<LeasesPage />} />
          <Route path="appeals" element={<AppealsPage />} />
          <Route path="baseline" element={<BaselinePage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="audit" element={<AuditPage />} />
          {/* `/mocks` is a developer view documenting every mock system, so the registry declares
              it for every service rather than scoping it to one (spec §5.1). */}
          <Route path="mocks" element={<MocksPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
