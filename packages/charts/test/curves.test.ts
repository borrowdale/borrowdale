import { describe, expect, it } from 'vitest';
import type { Point } from '@borrowdale/core';
import { areaPath, linePath } from '../src/curves.js';

// A level stretch, a rise, a level stretch: an overshooting curve would dip below 0 or above 10.
const rise: Point[] = [[0, 0], [10, 0], [20, 10], [30, 10]];

describe('linePath', () => {
  it.each<[string, Point[], Parameters<typeof linePath>[1], boolean, string]>([
    ['joins points with straight lines', [[0, 0], [10, 5], [20, 2]], 'linear', false, 'M0 0 L10 5 L20 2'],
    ['keeps a monotone curve within its points, level where they are level', rise, 'monotone', false, 'M0 0 C3.33 0 6.67 0 10 0 C13.33 0 16.67 10 20 10 C23.33 10 26.67 10 30 10'],
    ['limits steep tangents, so a curve between nearly level points stays between them', [[0, 0], [10, 0.1], [20, 10], [30, 10.1]], 'monotone', false, 'M0 0 C3.33 0 6.67 0 10 0.1 C13.33 0.2 16.67 9.9 20 10 C23.33 10.1 26.67 10.1 30 10.1'],
    ['scales back a tangent from just past the limit, so a curve stays level where its points are', [[0, 1], [10, 0], [20, 1], [30, 6.2]], 'monotone', false, 'M0 1 C3.33 0.67 6.67 0 10 0 C13.33 0 16.67 0 20 1 C23.33 2 26.67 4.47 30 6.2'],
    ['scales back a tangent just too steep for its segment', [[0, 0], [10, 1], [20, 8]], 'monotone', false, 'M0 0 C3.33 0.24 6.67 0.03 10 1 C13.33 1.97 16.67 5.67 20 8'],
    ['changes value halfway between points for step', [[0, 0], [10, 5], [20, 2]], 'step', false, 'M0 0 L5 0 L5 5 L10 5 L15 5 L15 2 L20 2'],
    ['changes value at the point for step-before', [[0, 0], [10, 5]], 'step-before', false, 'M0 0 L0 5 L10 5'],
    ['changes value at the next point for step-after', [[0, 0], [10, 5]], 'step-after', false, 'M0 0 L10 0 L10 5'],
    ['swaps the coordinates for a chart with categories on y', [[0, 0], [10, 5]], 'step-after', true, 'M0 0 L0 10 L5 10'],
    ['rounds to two decimals', [[0.123, 1.005], [2.5, 3.333333]], 'linear', false, 'M0.12 1 L2.5 3.33'],
  ])('%s', (_case, points, curve, swap, d) => {
    expect(linePath(points, curve, swap)).toBe(d);
  });
});

describe('areaPath', () => {
  it('runs along the top, then back along the bottom, and closes', () => {
    expect(areaPath([[0, 1], [10, 2]], [[0, 5], [10, 5]], 'linear', false)).toBe('M0 1 L10 2 L10 5 L0 5 Z');
  });

  it('draws the bottom curve backwards with its control points swapped', () => {
    expect(areaPath([[0, 1], [10, 2], [20, 1]], [[0, 5], [10, 6], [20, 5]], 'monotone', false)).toBe(
      'M0 1 C3.33 1.33 6.67 2 10 2 C13.33 2 16.67 1.33 20 1 L20 5 C16.67 5.33 13.33 6 10 6 C6.67 6 3.33 5.33 0 5 Z',
    );
  });
});
