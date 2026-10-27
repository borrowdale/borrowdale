import { afterEach, beforeEach, vi } from 'vitest';

// Importing this module makes every test in the importing file fail if drawing calls one of these
// Math functions. Drawings must come from their seed and the engine's own arithmetic alone:
// Math.random() is not seeded, and the others may differ in the last bit between JavaScript engines.

/** Every Math function whose result is implementation-approximated, plus random. */
export const UNPORTABLE = [
  'random',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot',
] as const;

/** Every Math function whose result the specification fixes exactly. The engine may call these. */
export const EXACT = [
  'abs', 'ceil', 'clz32', 'f16round', 'floor', 'fround', 'imul', 'max', 'min', 'round', 'sign', 'sqrt', 'trunc',
] as const;

beforeEach(() => {
  for (const name of UNPORTABLE) {
    vi.spyOn(Math, name).mockImplementation(() => {
      throw new Error(`Math.${name}() called while drawing`);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});
