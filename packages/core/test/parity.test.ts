import { beforeAll, describe, expect, it } from 'vitest';
import type { Shape, Sketch, SketchOptions } from '@borrowdale/core';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };
import { evaluateInChromium } from './support/chromium.js';

// Renders the whole golden corpus in headless Chromium and compares it with the goldens, which
// golden.test.ts checks against Node. The engine promises identical output in every JavaScript
// engine; this is where that promise is tested.

type Case = { name: string; shape: Shape; options: SketchOptions };
type Core = { sketch: (shape: Shape, options: SketchOptions) => Sketch };

const cases = corpus as unknown as Case[];
const expected = goldens as unknown as Record<string, Sketch>;

let rendered: Record<string, Sketch> = {};

beforeAll(async () => {
  rendered = await evaluateInChromium(
    new URL('../src/index.ts', import.meta.url),
    'borrowdale',
    '',
    (entries: Case[]) => {
      const { sketch } = (globalThis as unknown as { borrowdale: Core }).borrowdale;
      return Object.fromEntries(entries.map((entry) => [entry.name, sketch(entry.shape, entry.options)]));
    },
    cases,
  );
}, 120_000);

describe('Chromium parity', () => {
  it('draws exactly the corpus in Chromium', () => {
    expect(Object.keys(rendered)).toEqual(Object.keys(expected));
  });

  it.each(cases)('$name is byte for byte the same in Chromium', ({ name }) => {
    expect(rendered[name]).toEqual(expected[name]);
  });
});
