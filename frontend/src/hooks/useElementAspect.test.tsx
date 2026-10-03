import { act, render, screen } from '@testing-library/react';

import { useElementAspect } from '@/hooks/useElementAspect';

type Observed = { callback: ResizeObserverCallback; target: Element | null; disconnected: boolean };

const observers: Observed[] = [];

/** jsdom nie ma `ResizeObserver` — atrapa zapamiętuje callback, żeby test sam podał rozmiar. */
beforeEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = class ResizeObserverMock {
    private readonly observed: Observed;

    constructor(callback: ResizeObserverCallback) {
      this.observed = { callback, target: null, disconnected: false };
      observers.push(this.observed);
    }

    observe(target: Element): void {
      this.observed.target = target;
    }

    unobserve(): void {}

    disconnect(): void {
      this.observed.disconnected = true;
    }
  };
});

function resize(width: number, height: number): void {
  const observed: Observed = observers.filter((entry: Observed): boolean => !entry.disconnected)[0];
  const entry = { contentRect: { width, height } } as ResizeObserverEntry;

  act((): void => observed.callback([entry], {} as ResizeObserver));
}

function Probe(): React.JSX.Element {
  const { ref, aspect } = useElementAspect();

  return (
    <div ref={ref} data-testid="probe">
      {aspect === null ? 'none' : String(aspect)}
    </div>
  );
}

it('has no aspect until the element is measured', () => {
  render(<Probe />);

  expect(screen.getByTestId('probe').textContent).toBe('none');
});

it('reports width / height rounded to one decimal, so small resizes do not churn', () => {
  render(<Probe />);

  resize(1000, 480);
  expect(screen.getByTestId('probe').textContent).toBe('2.1');

  resize(1004, 480);
  expect(screen.getByTestId('probe').textContent).toBe('2.1');
});

it('ignores an element without height (hidden or not laid out)', () => {
  render(<Probe />);

  resize(1000, 0);

  expect(screen.getByTestId('probe').textContent).toBe('none');
});

it('stops observing when the element unmounts', () => {
  const { unmount } = render(<Probe />);

  unmount();

  expect(observers.every((entry: Observed): boolean => entry.disconnected)).toBe(true);
});
