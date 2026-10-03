import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server } from './msw/server';
import { resetMswState } from './msw/state';

function createMatchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

// jsdom nie implementuje `window.matchMedia`, a korzysta z niego sonner (motyw „system”)
// i komponenty Radix. Bez tego stubu testy, które dotykają toasta, wybuchają.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: createMatchMedia,
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  resetMswState();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
