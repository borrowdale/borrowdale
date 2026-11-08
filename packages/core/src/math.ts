// The stroke engine's own sine and cosine, and the natural logarithm and exponential, for code that
// must compute the same numbers in every JavaScript engine: `Math.sin`, `Math.cos`, `Math.log` and
// `Math.exp` may differ in the last bit between engines. Published as `@borrowdale/core/math` so
// other packages use these rather than a copy.
import { exp as portableExp, log as portableLog } from './logarithm.js';
import { show } from './show.js';
import { cos as engineCos, MAX_ANGLE, sin as engineSin } from './trig.js';

export { MAX_ANGLE };

/**
 * The sine of `x` radians. Throws a `RangeError` unless `x` is a finite number within ±MAX_ANGLE.
 */
export function sin(x: number): number {
  return engineSin(checkArgument('sin', x));
}

/**
 * The cosine of `x` radians. Throws a `RangeError` unless `x` is a finite number within ±MAX_ANGLE.
 */
export function cos(x: number): number {
  return engineCos(checkArgument('cos', x));
}

/** The largest |x| that `exp` accepts: e^709 is about 8.2e307, and e^710 overflows a double. */
export const MAX_EXPONENT = 709;

/**
 * The natural logarithm of `x`. Throws a `RangeError` unless `x` is a finite number above 0. Within 1
 * unit in the last place of the true value, and the same in every JavaScript engine.
 */
export function log(x: number): number {
  if (!(typeof x === 'number' && x > 0 && x < Number.POSITIVE_INFINITY)) {
    throw new RangeError(`Invalid argument: log(x) must be a finite number above 0, got ${show(x)}`);
  }
  return portableLog(x);
}

/**
 * e to the power `x`. Throws a `RangeError` unless `x` is a finite number within ±MAX_EXPONENT. Within 1 unit
 * in the last place of the true value, and the same in every JavaScript engine.
 */
export function exp(x: number): number {
  if (!(typeof x === 'number' && Math.abs(x) <= MAX_EXPONENT)) {
    throw new RangeError(`Invalid argument: exp(x) must be a finite number within ±${MAX_EXPONENT}, got ${show(x)}`);
  }
  return portableExp(x);
}

// Beyond the range the engine's argument reduction is no longer exact, and the result is a
// plausible but wrong number rather than an error.
function checkArgument(name: string, x: number): number {
  if (!(typeof x === 'number' && Math.abs(x) <= MAX_ANGLE)) {
    throw new RangeError(`Invalid argument: ${name}(x) must be a finite number within ±${MAX_ANGLE}, got ${show(x)}`);
  }
  return x;
}
