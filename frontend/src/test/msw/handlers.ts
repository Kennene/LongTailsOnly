import type { HttpHandler } from 'msw';

import { activityHandlers } from './domains/activity';
import { appealsHandlers } from './domains/appeals';
import { auditHandlers } from './domains/audit';
import { baselineHandlers } from './domains/baseline';
import { dashboardHandlers } from './domains/dashboard';
import { graphHandlers } from './domains/graph';
import { leasesHandlers } from './domains/leases';
import { servicesHandlers } from './domains/services';
import { simulationHandlers } from './domains/simulation';

/**
 * Jedyne miejsce, w którym spina się handlery MSW. Każda domena ma własny plik
 * w `./domains/`, więc zadania mogą być realizowane równolegle bez konfliktów.
 */
export const handlers: HttpHandler[] = [
  ...leasesHandlers,
  ...simulationHandlers,
  ...dashboardHandlers,
  ...baselineHandlers,
  ...appealsHandlers,
  ...activityHandlers,
  ...graphHandlers,
  ...auditHandlers,
  ...servicesHandlers,
];
