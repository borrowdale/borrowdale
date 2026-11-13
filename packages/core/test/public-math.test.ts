import { describe, expect, it } from 'vitest';
// Before the module, so a Math.sin it called or kept a reference to would throw.
import './support/forbid-unportable-calls.js';
import { acos, atan2, cos, exp, log, MAX_EXPONENT, MAX_ANGLE, sin } from '@borrowdale/core/math';

// A Proxy that throws when anything looks at it, even a test title.
const { proxy: revoked, revoke } = Proxy.revocable([], {});
revoke();
const sinOfRevoked = (): number => sin(revoked as unknown as number);
// Calling `fn` with `x`, to be called by `toThrow`.
const calling = (fn: (x: number) => number, x: unknown) => (): number => fn(x as number);
const callingAtan2 = (y: unknown, x: unknown) => (): number => atan2(y as number, x as number);

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
    expect(calling(fn, x)).toThrow(
      new RangeError(`Invalid argument: ${name}(x) must be a finite number within ±1000000, got ${shown}`),
    );
  });

  it('rejects a revoked Proxy with a RangeError, describing it as an object', () => {
    expect(sinOfRevoked).toThrow(new RangeError('Invalid argument: sin(x) must be a finite number within ±1000000, got an object'));
  });

  // The expected values are Math.log in Node.
  it.each<[number, number]>([
    [1, 0],
    [2, 0.6931471805599453],
    [0.5, -0.6931471805599453],
    [10, 2.302585092994046],
    [1e-300, -690.7755278982137],
    [5e-324, -744.4400719213812],
    [1e-310, -713.8013788281542],
    [1.1125369292536007e-308, -709.0895657128241],
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
    expect(calling(log, x)).toThrow(new RangeError(`Invalid argument: log(x) must be a finite number above 0, got ${shown}`));
  });

  it('exports the bound exp checks', () => {
    expect(MAX_EXPONENT).toBe(709);
  });

  // The expected values are exp's own, within one unit in the last place of the true value. They are
  // not all Math.exp's: exp(1) is one unit above Math.E, and that is not a typo.
  it.each<[number, number]>([
    [0, 1],
    [1, 2.7182818284590455],
    [-1, 0.36787944117144233],
    [0.5, 1.6487212707001282],
    [1e-30, 1],
    [10, 22026.465794806718],
    [709, 8.218407461554972e307],
    [-709, 1.216780750623423e-308],
    [0.34, 1.404947590563594],
    [-708.4, 2.217119081664265e-308],
    [2 ** -29, 1.0000000018626451],
  ])('computes exp(%s)', (x, expected) => {
    expect(exp(x)).toBe(expected);
  });

  it.each<[unknown, string]>([
    [710, '710'],
    [-710, '-710'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
    [Number.NaN, 'NaN'],
    [1n, '1n'],
  ])('exp rejects %s with a RangeError', (x, shown) => {
    expect(calling(exp, x)).toThrow(new RangeError(`Invalid argument: exp(x) must be a finite number within ±709, got ${shown}`));
  });

  // The expected values are Math.acos in Node, which agrees with fdlibm's e_acos.c here.
  it.each<[number, number]>([
    [1, 0],
    [-1, 3.141592653589793],
    [0, 1.5707963267948966],
    [-0, 1.5707963267948966],
    [2 ** -60, 1.5707963267948966],
    [-(2 ** -30), 1.5707963277262191],
    [0.25, 1.318116071652818],
    [0.5, 1.0471975511965979],
    [0.49999999999999994, 1.0471975511965979],
    [-0.5, 2.0943951023931957],
    [-0.75, 2.4188584057763776],
    [0.9999999, 0.00044721359910904126],
  ])('computes acos(%s)', (x, expected) => {
    expect(acos(x)).toBe(expected);
  });

  it.each<[unknown, string]>([
    [1 + 2 ** -52, '1.0000000000000002'],
    [-2, '-2'],
    [Number.NaN, 'NaN'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
    ['0', '"0"'],
  ])('acos rejects %s with a RangeError', (x, shown) => {
    expect(calling(acos, x)).toThrow(new RangeError(`Invalid argument: acos(x) must be a number from -1 to 1, got ${shown}`));
  });

  // The expected values are Math.atan2 in Node, which agrees with fdlibm's e_atan2.c here, signed
  // zeros included.
  it.each<[number, number, number]>([
    [1, 1, 0.7853981633974483],
    [1, -1, 2.356194490192345],
    [-1, -1, -2.356194490192345],
    [-1, 1, -0.7853981633974483],
    [0, 1, 0],
    [-0, 1, -0],
    [0, 2, 0],
    [-0, 2, -0],
    [-1e-300, -1e300, -3.141592653589793],
    [1, 2 ** -40, 1.570796326793987],
    [2 ** -70, 1.5, 5.646886315028669e-22],
    [-1e-300, 2, -5e-301],
    [0, -1, 3.141592653589793],
    [-0, -1, -3.141592653589793],
    [0, 0, 0],
    [-0, -0, -3.141592653589793],
    [1, 0, 1.5707963267948966],
    [-1, -0, -1.5707963267948966],
    [3, 4, 0.6435011087932844],
    [2, 1, 1.1071487177940904],
    [1e300, 1e-300, 1.5707963267948966],
    [1e-300, -1e300, 3.141592653589793],
    [-5, 1e-20, -1.5707963267948966],
    [1, -1e-20, 1.5707963267948966],
    [-1, -1e-20, -1.5707963267948966],
  ])('computes atan2(%s, %s)', (y, x, expected) => {
    expect(atan2(y, x)).toBe(expected);
  });

  it.each<[unknown, unknown, string]>([
    [Number.NaN, 1, 'y = NaN'],
    [1, Number.POSITIVE_INFINITY, 'x = Infinity'],
    [Number.NEGATIVE_INFINITY, 0, 'y = -Infinity'],
    [1, '1', 'x = "1"'],
  ])('atan2 rejects (%s, %s) with a RangeError', (y, x, shown) => {
    expect(callingAtan2(y, x)).toThrow(
      new RangeError(`Invalid argument: atan2(y, x) must be given finite numbers, got ${shown}`),
    );
  });
});
