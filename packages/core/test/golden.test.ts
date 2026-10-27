import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sketch, type Shape, type Sketch, type SketchOptions } from '@borrowdale/core';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Recorded once from rough.js 4.6.6, then frozen. See scripts/record-goldens.mjs for how to add
// cases (from rough.js) and how to re-record after a deliberate change (from this engine).
const cases = corpus as unknown as { name: string; shape: Shape; options: SketchOptions }[];
const expected = goldens as unknown as Record<string, Sketch>;
const names = cases.map((entry) => entry.name);

// Every drawing must come from its seed and the engine's own arithmetic alone. Math.random() is not
// seeded, and these functions may differ in the last bit between JavaScript engines.
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

describe('golden drawings', () => {
  it('has exactly one golden per corpus case, in corpus order', () => {
    expect(Object.keys(expected)).toEqual(names);
  });

  it.each(cases)('$name', ({ name, shape, options }) => {
    expect(sketch(shape, options)).toEqual(expected[name]);
  });
});
