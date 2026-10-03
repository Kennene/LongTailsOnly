import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { AppealsPage } from '@/pages/AppealsPage';
import { AuditPage } from '@/pages/AuditPage';
import { BaselinePage } from '@/pages/BaselinePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { GraphPage } from '@/pages/GraphPage';
import { LeasesPage } from '@/pages/LeasesPage';
import { MocksPage } from '@/pages/MocksPage';

/**
 * Trasy w trybie deklaratywnym. Router zakłada `main.tsx` (`BrowserRouter`), a testy —
 * `renderWithProviders` (`MemoryRouter`), więc definicja tras istnieje tylko tutaj.
 */
export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="leases" element={<LeasesPage />} />
        <Route path="appeals" element={<AppealsPage />} />
        <Route path="baseline" element={<BaselinePage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="mocks" element={<MocksPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
