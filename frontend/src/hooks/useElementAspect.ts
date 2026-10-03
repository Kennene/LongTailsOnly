import { useState } from 'react';

export interface ElementAspect {
  /** Ref-callback dla mierzonego elementu (React 19: zwrócona funkcja odłącza obserwatora). */
  ref: (element: HTMLElement | null) => (() => void) | undefined;
  /** Szerokość / wysokość zaokrąglona do 0,1; `null`, dopóki element nie ma wymiarów. */
  aspect: number | null;
}

/** Zaokrąglenie do 0,1: drobne zmiany rozmiaru okna nie przeliczają układu ani widoku grafu. */
function roundAspect(width: number, height: number): number {
  return Math.round((width / height) * 10) / 10;
}

/**
 * Proporcje elementu mierzone `ResizeObserver`em — graf rozciąga pajęczynę do kształtu panelu
 * (`fitLayoutToAspect`). Element bez wysokości (ukryty, jeszcze nie ułożony) zostawia `null`.
 */
export function useElementAspect(): ElementAspect {
  const [aspect, setAspect] = useState<number | null>(null);

  function ref(element: HTMLElement | null): (() => void) | undefined {
    if (element === null) {
      return undefined;
    }

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
      const { width, height } = entries[0].contentRect;

      if (height > 0) {
        setAspect(roundAspect(width, height));
      }
    });
    observer.observe(element);

    return (): void => observer.disconnect();
  }

  return { ref, aspect };
}
