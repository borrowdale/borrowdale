import { describe, expect, it } from 'vitest';
// Before the module, so a Math.sin it called or kept a reference to would throw.
import './support/forbid-unportable-calls.js';
import { cos, log, MAX_ANGLE, sin } from '@borrowdale/core/math';

// A Proxy that throws when anything looks at it, even a test title.
const { proxy: revoked, revoke } = Proxy.revocable([], {});
revoke();
const sinOfRevoked = (): number => sin(revoked as unknown as number);

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
    ['cos', Object.create(null), cos, 'an object'],
  ])('%s rejects %s with a RangeError', (name, x, fn, shown) => {
    expect(() => fn(x as number)).toThrow(
      new RangeError(`Invalid argument: ${name}(x) must be a finite number within ±1000000, got ${shown}`),
    );
  });

  // The expected values are Math.log in Node.
  it('rejects a revoked Proxy with a RangeError, describing it as an object', () => {
    expect(sinOfRevoked).toThrow(new RangeError('Invalid argument: sin(x) must be a finite number within ±1000000, got an object'));
  });

  it.each<[number, number]>([
    [1, 0],
    [2, 0.6931471805599453],
    [0.5, -0.6931471805599453],
    [10, 2.302585092994046],
    [1e-300, -690.7755278982137],
    [5e-324, -744.4400719213812],
    [1.7976931348623157e308, 709.782712893384],
    [1 + 2 ** -52, 2.2204460492503128e-16],
    [0.9999999, -1.0000000494736474e-7],
    [1.4, 0.33647223662121284],
    [2.8, 1.0296194171811581],
    [1.2, 0.1823215567939546],
  ])('computes log(%s)', (x, expected) => {
    expect(log(x)).toBe(expected);
  });

  it.each<[unknown, string]>([
    [0, '0'],
    [-1, '-1'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [Number.NaN, 'NaN'],
    ['1', '"1"'],
  ])('log rejects %s with a RangeError', (x, shown) => {
    expect(() => log(x as number)).toThrow(new RangeError(`Invalid argument: log(x) must be a finite number above 0, got ${shown}`));
  });
});
