import { describe, expect, it } from 'vitest';
import { Budget } from '@borrowdale/core';
import { fitPath } from '@borrowdale/core/internal';

const square = { x: 0, y: 0, width: 100, height: 100 };
// 20,000 chained curves: more points along them than an engine takes as arguments to one call.
const longChain = `M0 0${Array.from({ length: 20_000 }, (_, i) => ` C${(i * 3 + 1) % 1000} 50 ${(i * 3 + 2) % 1000} -50 ${(i * 3 + 3) % 1000} 0`).join('')}`;

/** Fitting, run later, so that an error it throws can be expected. */
function fitting(d: string, budget = new Budget(10_000)) {
  return () => fitPath(d, square, budget);
}

describe('fitPath', () => {
  it('scales a path to fit the box, keeping its proportions, and centres it', () => {
    // 10 by 20 scaled by 5 is 50 by 100: 25 to spare on each side.
    expect(fitPath('M0 0 L10 0 L10 20 L0 20 Z', square, new Budget(10_000)))
      .toEqual({ d: 'M 25 0 L 75 0 L 75 100 L 25 100 Z', box: { x: 25, y: 0, width: 50, height: 100 } });
  });

  it('writes relative moves and lines as absolute ones', () => {
    expect(fitPath('m10 10 l10 0 l0 10 z', { x: 0, y: 0, width: 10, height: 10 }, new Budget(10_000)).d).toBe('M 0 0 L 10 0 L 10 10 Z');
  });

  it('takes the extent from the curve, not from its control points', () => {
    // The curve rises 7.5 of the control points' 10, so it is taller than wide only by its own rise.
    const fitted = fitPath('M0 0 C0 -10 10 -10 10 0', { x: 0, y: 0, width: 10, height: 10 }, new Budget(10_000));

    expect(fitted.d.startsWith('M 0 8.7')).toBe(true);
    expect(fitted.box.height).toBeCloseTo(7.5, 1);
  });

  it('takes the extent of a curve from its highest point, not from points along it', () => {
    // From 0 0 to 1 0, the curve peaks at a third of the way, 4/9 above its ends: 100 wide, 400/9 high.
    expect(fitPath('M0 0 C0 -1 1 0 1 0 Z', square, new Budget(10_000)).box.height).toBeCloseTo(400 / 9, 9);
  });

  it('fits a path alike whatever units it is written in', () => {
    expect(fitPath('M0 0 C0 -0.01 0.01 0 0.01 0 Z', square, new Budget(10_000)).d)
      .toBe(fitPath('M0 0 C0 -1000 1000 0 1000 0 Z', square, new Budget(10_000)).d);
  });

  it('fits a path with more points than an engine takes as arguments to one call', () => {
    expect(fitPath(longChain, square, new Budget(100_000_000)).box.width).toBe(100);
  });

  it('charges the parsing to the budget', () => {
    expect(fitting('M0 0 L10 0 L10 20 L0 20 Z', new Budget(1))).toThrow('Drawing too complex');
  });

  it('rejects a path with no width or no height', () => {
    expect(fitting('M0 0 L10 0')).toThrow('Invalid shape: path.d needs a width and a height to fit a box');
  });

  it('rejects path data it cannot draw, as sketch does', () => {
    expect(fitting('M0 0 L1e7 0 L0 1')).toThrow('outside ±1000000');
  });
});
