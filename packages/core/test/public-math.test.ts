import { describe, expect, it } from 'vitest';
// Before the module, so a Math.sin it called or kept a reference to would throw.
import './support/forbid-unportable-math.js';
import { cos, MAX_ANGLE, sin } from '@borrowdale/core/math';

// The published functions are the engine's own, so each value is the same in every JavaScript
// engine. The expected values are Math.sin and Math.cos in Node, which agree here.
describe('@borrowdale/core/math', () => {
  it('exports the bound it checks', () => {
    expect(MAX_ANGLE).toBe(1_000_000);
  });

  it.each<[string, number, (x: number) => number, number]>([
    ['sin', 1, sin, 0.8414709848078965],
    ['cos', 1, cos, 0.5403023058681398],
    ['sin', -2.5, sin, -0.5984721441039564],
    ['cos', 1e6, cos, 0.9367521275331447],
    ['sin', -1e6, sin, 0.34999350217129294],
  ])('computes %s(%s)', (_name, x, fn, expected) => {
    expect(fn(x)).toBe(expected);
  });

  it.each<[string, unknown, (x: number) => number, string]>([
    ['sin', 1e6 + 1, sin, '1000001'],
    ['cos', -1e6 - 1, cos, '-1000001'],
    ['sin', Number.NaN, sin, 'NaN'],
    ['cos', Number.POSITIVE_INFINITY, cos, 'Infinity'],
    ['sin', '1', sin, '"1"'],
    ['cos', Object.create(null), cos, 'object'],
  ])('%s rejects %s with a RangeError', (name, x, fn, shown) => {
    expect(() => fn(x as number)).toThrow(
      new RangeError(`Invalid argument: ${name}(x) must be a finite number within ±1000000, got ${shown}`),
    );
  });
});
