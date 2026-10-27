import { afterEach, beforeEach, vi } from 'vitest';

// Importing this module makes every test in the importing file fail if drawing calls one of these
// Math functions. Drawings must come from their seed and the engine's own arithmetic alone:
// Math.random() is not seeded, and the others may differ in the last bit between JavaScript engines.
const UNPORTABLE = ['random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'exp', 'log', 'hypot', 'cbrt'] as const;

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
