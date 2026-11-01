import { describe, expect, it } from 'vitest';
// Before the package, so the guard also reaches Math references it takes when it loads.
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutText, toSvgText, type LayoutOptions, type TextStyle } from '@borrowdale/text';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Recorded from this package with scripts/record-goldens.mjs, and drawn again in Chromium by
// parity.test.ts, which also checks every width against the width Chromium draws.
type Case = { name: string; text: string; options: LayoutOptions; style?: TextStyle };
const cases = corpus as unknown as Case[];
const expected = goldens as unknown as Record<string, unknown>;
const names = cases.map((entry) => entry.name);

// The recorded form of a label: its layout and its markup.
function golden(text: string, options: LayoutOptions, style?: TextStyle) {
  const layout = layoutText(text, options);
  return { ...layout, svg: toSvgText(layout, style) };
}

describe('golden labels', () => {
  it('has exactly one golden per corpus case, in corpus order', () => {
    expect(Object.keys(expected)).toEqual(names);
  });

  it.each(cases)('$name', ({ name, text, options, style }) => {
    expect(golden(text, options, style)).toEqual(expected[name]);
  });
});
