import {
  Blocks,
  FileCheck2,
  Gavel,
  LayoutDashboard,
  Network,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { GitHubIcon, GitLabIcon } from '@/services/brandIcons';

export type ServiceRouteId = 'dashboard' | 'leases' | 'appeals' | 'baseline' | 'graph' | 'audit';

/** Kontrakt ikony usługi: `className` przekazywany dalej, `aria-hidden` jak w lucide. */
export type ServiceIconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

export interface ServiceRoute {
  id: ServiceRouteId;
  path: string;
  label: string;
  icon: ServiceIconComponent;
}

export interface ServiceConfig {
  id: string;
  icon: ServiceIconComponent;
  routes: ServiceRoute[];
  defaultRouteId: ServiceRouteId;
}

/**
 * Sześć tras zdefiniowanych **raz**: kolejność wpisów to kolejność nawigacji, a etykiety
 * i ikony są przeniesione ze `Sidebar.tsx` sprzed rejestru. Wpisy usług współdzielą te same
 * obiekty tras — duplikat etykiety czy ikony jest wtedy niemożliwy.
 */
const ROUTES: Record<ServiceRouteId, ServiceRoute> = {
  dashboard: { id: 'dashboard', path: '/', label: 'Pulpit', icon: LayoutDashboard },
  leases: { id: 'leases', path: '/leases', label: 'Dzierżawy', icon: FileCheck2 },
  appeals: { id: 'appeals', path: '/appeals', label: 'Odwołania', icon: Gavel },
  baseline: { id: 'baseline', path: '/baseline', label: 'Standard zespołu', icon: ShieldCheck },
  graph: { id: 'graph', path: '/graph', label: 'Graf', icon: Network },
  audit: { id: 'audit', path: '/audit', label: 'Audyt', icon: ScrollText },
};

/** Usługa spoza rejestru nie ma własnych tras, więc ląduje na pulpicie. */
const FALLBACK_PATH = ROUTES.dashboard.path;

/** Ikona dla usługi, której rejestr nie zna — nigdy pusty slot w kontrolce. */
export const fallbackIcon: ServiceIconComponent = Blocks;

export const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  github: {
    id: 'github',
    icon: GitHubIcon,
    routes: [
      ROUTES.dashboard,
      ROUTES.leases,
      ROUTES.appeals,
      ROUTES.baseline,
      ROUTES.graph,
      ROUTES.audit,
    ],
    defaultRouteId: 'dashboard',
  },
  'demo-tracker': {
    id: 'demo-tracker',
    icon: GitLabIcon,
    routes: [ROUTES.dashboard, ROUTES.audit],
    defaultRouteId: 'dashboard',
  },
};

/** `Object.hasOwn` zamiast odczytu wprost: `toString` i spółka nie są usługami. */
export function getServiceConfig(id: string): ServiceConfig | undefined {
  return Object.hasOwn(SERVICE_REGISTRY, id) ? SERVICE_REGISTRY[id] : undefined;
}

export function getDefaultPath(id: string): string {
  const config = getServiceConfig(id);

  if (config === undefined) {
    return FALLBACK_PATH;
  }

  const defaultRoute = config.routes.find((route): boolean => route.id === config.defaultRouteId);

  return defaultRoute?.path ?? FALLBACK_PATH;
}

export function isRouteSupported(id: string, path: string): boolean {
  const config = getServiceConfig(id);

  return config?.routes.some((route): boolean => route.path === path) ?? false;
}
