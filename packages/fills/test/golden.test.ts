import { describe, expect, it } from 'vitest';
import { pattern, type Pattern, type PatternOptions } from '@borrowdale/fills';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };
import '../../core/test/support/forbid-unportable-math.js';

// Recorded from rough.js 4.6.6, then re-recorded from this engine after each deliberate change.
// See scripts/record-goldens.mjs.
const cases = corpus as unknown as { name: string; options: PatternOptions }[];
const expected = goldens as unknown as Record<string, Pattern>;
const names = cases.map((entry) => entry.name);

describe('golden patterns', () => {
  it('has exactly one golden per corpus case, in corpus order', () => {
    expect(Object.keys(expected)).toEqual(names);
  });

  it.each(cases)('$name', ({ name, options }) => {
    expect(pattern(options)).toEqual(expected[name]);
  });
});
