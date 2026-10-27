import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pattern, type Pattern, type PatternOptions } from '@borrowdale/fills';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Recorded from rough.js 4.6.6, then re-recorded from this engine after each deliberate change.
// See scripts/record-goldens.mjs.
const cases = corpus as unknown as { name: string; options: PatternOptions }[];
const expected = goldens as unknown as Record<string, Pattern>;
const names = cases.map((entry) => entry.name);

// As in the core golden test: every pattern must come from its seed and the engine's own arithmetic.
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

describe('golden patterns', () => {
  it('has exactly one golden per corpus case, in corpus order', () => {
    expect(Object.keys(expected)).toEqual(names);
  });

  it.each(cases)('$name', ({ name, options }) => {
    expect(pattern(options)).toEqual(expected[name]);
  });
});
