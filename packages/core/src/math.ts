// The stroke engine's own sine and cosine, for code that must compute the same coordinates in every
// JavaScript engine: `Math.sin` and `Math.cos` may differ in the last bit between engines. Published
// as `@borrowdale/core/math` so other packages use these rather than a copy.
import { cos as engineCos, sin as engineSin } from './engine/math.js';
import { show } from './show.js';

// The largest |x| these functions accept. They are accurate to about 2^20 · π/2.
const MAX_ARGUMENT = 1e6;

/**
 * The sine of `x` radians. Throws a `RangeError` unless `x` is a finite number within ±1,000,000.
 */
export function sin(x: number): number {
  return engineSin(checkArgument('sin', x));
}

/**
 * The cosine of `x` radians. Throws a `RangeError` unless `x` is a finite number within ±1,000,000.
 */
export function cos(x: number): number {
  return engineCos(checkArgument('cos', x));
}

// Beyond the range the engine's argument reduction is no longer exact, and the result is a
// plausible but wrong number rather than an error.
function checkArgument(name: string, x: number): number {
  if (!(typeof x === 'number' && Math.abs(x) <= MAX_ARGUMENT)) {
    throw new RangeError(`Invalid argument: ${name}(x) must be a finite number within ±${MAX_ARGUMENT}, got ${show(x)}`);
  }
  return x;
}
