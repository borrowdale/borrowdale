import { beforeAll, describe, expect, it } from 'vitest';
import type { Shape, Sketch, SketchOptions } from '@borrowdale/core';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };
import { ENGINES, evaluateIn } from './support/browsers.js';

// Renders the whole golden corpus in headless Chromium, Firefox and WebKit and compares it with the
// goldens, which golden.test.ts checks against Node. The engine promises identical output in every
// JavaScript engine; this is where that promise is tested.

type Case = { name: string; shape: Shape; options: SketchOptions };
type Core = { sketch: (shape: Shape, options: SketchOptions) => Sketch };

const cases = corpus as unknown as Case[];
const expected = goldens as unknown as Record<string, Sketch>;

describe.each(ENGINES)('%s parity', (engine) => {
  let rendered: Record<string, Sketch> = {};

  beforeAll(async () => {
    rendered = await evaluateIn(
      engine,
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

  it(`draws exactly the corpus in ${engine}`, () => {
    expect(Object.keys(rendered)).toEqual(Object.keys(expected));
  });

  it.each(cases)(`$name is byte for byte the same in ${engine}`, ({ name }) => {
    expect(rendered[name]).toEqual(expected[name]);
  });
});
