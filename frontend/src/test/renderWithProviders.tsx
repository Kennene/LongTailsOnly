import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';

export interface RenderWithProvidersOptions {
  route?: string;
}

export type RenderWithProvidersResult = ReturnType<typeof render> & { queryClient: QueryClient };

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Wrapper dla testów komponentów i stron: świeży `QueryClient`, `MemoryRouter`
 * i jeden `Toaster`, żeby testy mogły asertować komunikaty bez montowania go lokalnie
 * (dwa toastery w drzewie dają zduplikowane komunikaty).
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>
          {children}
          <Toaster />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return Object.assign(render(ui, { wrapper: Wrapper }), { queryClient });
}
