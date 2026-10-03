import type { GraphHighlight } from '@/lib/graphHighlight';

import { colorModeOf, emphasisOf } from './graphFlow';

const KAMIL: GraphHighlight = { nodeIds: new Set(['user:kamil']), edgeIds: new Set<string>() };

function hasKamil(highlight: GraphHighlight): boolean {
  return highlight.nodeIds.has('user:kamil');
}

function hasNobody(): boolean {
  return false;
}

it('lets the selection win over hover: inside is active, outside fades out', () => {
  expect(emphasisOf(hasKamil, KAMIL, KAMIL)).toBe('active');
  expect(emphasisOf(hasNobody, KAMIL, KAMIL)).toBe('faded');
});

it('lights up hover neighbours softly when nothing is selected', () => {
  expect(emphasisOf(hasKamil, null, KAMIL)).toBe('hovered');
  expect(emphasisOf(hasNobody, null, KAMIL)).toBe('background');
  expect(emphasisOf(hasNobody, null, null)).toBe('none');
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

it('follows the theme resolved by next-themes when there is one', () => {
  document.documentElement.classList.add('dark');

  expect(colorModeOf('light')).toBe('light');
  expect(colorModeOf('dark')).toBe('dark');
});

it('falls back to the class on <html> that sets the app theme (no ThemeProvider)', () => {
  expect(colorModeOf(undefined)).toBe('light');

  document.documentElement.classList.add('dark');

  expect(colorModeOf(undefined)).toBe('dark');
});
