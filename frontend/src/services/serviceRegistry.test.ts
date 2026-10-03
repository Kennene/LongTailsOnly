import { Blocks } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GitHubIcon, GitLabIcon } from '@/services/brandIcons';
import {
  fallbackIcon,
  getDefaultPath,
  getServiceConfig,
  isRouteSupported,
  SERVICE_REGISTRY,
  type ServiceConfig,
  type ServiceIconComponent,
  type ServiceRouteId,
} from '@/services/serviceRegistry';

/** The six route ids the backend advertises as `github` capabilities (service-picker spec §5.1). */
const ALL_ROUTE_IDS: ServiceRouteId[] = [
  'dashboard',
  'leases',
  'appeals',
  'baseline',
  'graph',
  'audit',
];

/** Path, Polish nav label and nav order are the ones the pre-registry `Sidebar.tsx` used. */
const SIDEBAR_ROUTES: [ServiceRouteId, string, string][] = [
  ['dashboard', '/', 'Pulpit'],
  ['leases', '/leases', 'Dzierżawy'],
  ['appeals', '/appeals', 'Odwołania'],
  ['baseline', '/baseline', 'Standard zespołu'],
  ['graph', '/graph', 'Graf'],
  ['audit', '/audit', 'Audyt'],
];

describe('SERVICE_REGISTRY', () => {
  it('gives every registered service a non-empty route list', () => {
    for (const config of Object.values(SERVICE_REGISTRY)) {
      expect(config.routes.length).toBeGreaterThan(0);
    }
  });

  it('points every defaultRouteId at a route the service actually has', () => {
    for (const config of Object.values(SERVICE_REGISTRY)) {
      expect(config.routes.map((route): ServiceRouteId => route.id)).toContain(
        config.defaultRouteId,
      );
    }
  });

  it('keys every entry by its own id and registers exactly the two known services', () => {
    expect(Object.keys(SERVICE_REGISTRY).sort()).toEqual(['demo-tracker', 'github']);

    for (const config of Object.values(SERVICE_REGISTRY)) {
      expect(SERVICE_REGISTRY[config.id]).toBe(config);
    }
  });

  it('declares exactly the six route ids the backend grants github', () => {
    const github = SERVICE_REGISTRY.github;
    expect(github.routes.map((route): ServiceRouteId => route.id).sort()).toEqual([
      'appeals',
      'audit',
      'baseline',
      'dashboard',
      'graph',
      'leases',
    ]);
  });

  it('keeps the sidebar order, paths and Polish labels for every route id', () => {
    const actual: [ServiceRouteId, string, string][] = SERVICE_REGISTRY.github.routes.map(
      (route): [ServiceRouteId, string, string] => [route.id, route.path, route.label],
    );

    expect(actual).toEqual(SIDEBAR_ROUTES);
    expect(SERVICE_REGISTRY.github.routes.map((route): ServiceRouteId => route.id)).toEqual(
      ALL_ROUTE_IDS,
    );
  });

  it('gives demo-tracker exactly the dashboard and audit routes', () => {
    expect(
      SERVICE_REGISTRY['demo-tracker'].routes.map((route): ServiceRouteId => route.id),
    ).toEqual(['dashboard', 'audit']);
  });

  it('reuses the shared route objects instead of duplicating them per service', () => {
    const githubRoutes = SERVICE_REGISTRY.github.routes;

    for (const route of SERVICE_REGISTRY['demo-tracker'].routes) {
      expect(githubRoutes.find((candidate): boolean => candidate.id === route.id)).toBe(route);
    }
  });

  it('gives each service its own brand mark', () => {
    const icons: [ServiceConfig, ServiceIconComponent][] = [
      [SERVICE_REGISTRY.github, GitHubIcon],
      [SERVICE_REGISTRY['demo-tracker'], GitLabIcon],
    ];

    for (const [config, icon] of icons) {
      expect(config.icon).toBe(icon);
      expect(config.icon).not.toBe(fallbackIcon);
    }
  });
});

describe('getServiceConfig', () => {
  it.each<string>(['does-not-exist', 'toString', 'constructor'])(
    'returns undefined for the unregistered service %s',
    (id: string) => {
      expect(getServiceConfig(id)).toBeUndefined();
    },
  );

  it('returns the config of a registered service', () => {
    expect(getServiceConfig('demo-tracker')).toBe(SERVICE_REGISTRY['demo-tracker']);
  });
});

describe('isRouteSupported', () => {
  it('supports /audit in both services but /leases only in github', () => {
    expect(isRouteSupported('github', '/audit')).toBe(true);
    expect(isRouteSupported('demo-tracker', '/audit')).toBe(true);
    expect(isRouteSupported('github', '/leases')).toBe(true);
    expect(isRouteSupported('demo-tracker', '/leases')).toBe(false);
  });

  it.each<string>(['does-not-exist', 'toString'])(
    'returns false for every path of the unregistered service %s',
    (id: string) => {
      expect(isRouteSupported(id, '/')).toBe(false);
      expect(isRouteSupported(id, '/audit')).toBe(false);
    },
  );

  it('returns false for a path no route declares', () => {
    expect(isRouteSupported('github', '/nope')).toBe(false);
    expect(isRouteSupported('github', '/leases/42')).toBe(false);
  });
});

describe('getDefaultPath', () => {
  it('resolves the default path of a service without leases to the dashboard', () => {
    expect(getDefaultPath('demo-tracker')).toBe('/');
  });

  it('resolves github to its dashboard route', () => {
    expect(getDefaultPath('github')).toBe('/');
  });

  it.each<string>(['does-not-exist', 'toString'])(
    'falls back to the dashboard for the unregistered service %s',
    (id: string) => {
      expect(getDefaultPath(id)).toBe('/');
    },
  );
});

describe('brand icons', () => {
  /**
   * Markup statyczny zamiast `render` z Testing Library: znaki marek są celowo
   * `aria-hidden`, więc nie mają roli, po której mogłaby je znaleźć zapytanie dostępnościowe.
   */
  function markupOf(icon: ServiceIconComponent, className?: string): string {
    return renderToStaticMarkup(createElement(icon, { className }));
  }

  it.each<[string, ServiceIconComponent, string]>([
    ['GitHubIcon', GitHubIcon, '<path'],
    ['GitLabIcon', GitLabIcon, '<polygon'],
  ])(
    '%s renders a monochrome 24px mark that forwards className',
    (_name: string, Icon: ServiceIconComponent, shape: string) => {
      const view: string = markupOf(Icon, 'size-4');

      expect(view).toContain('viewBox="0 0 24 24"');
      expect(view).toContain('fill="currentColor"');
      expect(view).toContain('aria-hidden="true"');
      expect(view).toContain('class="size-4"');
      expect(view).toContain(shape);
    },
  );

  it('draws the two brand marks as different silhouettes', () => {
    expect(markupOf(GitHubIcon)).not.toBe(markupOf(GitLabIcon));
  });

  it('falls back to the lucide Blocks icon for an unregistered service', () => {
    expect(fallbackIcon).toBe(Blocks);

    const view: string = markupOf(fallbackIcon, 'size-4');

    expect(view).toContain('viewBox="0 0 24 24"');
    expect(view).toContain('aria-hidden="true"');
    // lucide dokłada własne klasy (`lucide lucide-blocks size-4`), więc sprawdzamy sam człon.
    expect(view).toContain('size-4');
  });
});
