import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { build, type Rolldown } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Shape, Sketch, SketchOptions } from '@borrowdale/core';
import corpus from './golden/corpus.json' with { type: 'json' };
import goldens from './golden/goldens.json' with { type: 'json' };

// Renders the whole golden corpus in headless Chromium and compares it with the goldens, which
// golden.test.ts checks against Node. The engine promises identical output in every JavaScript
// engine; this is where that promise is tested.

type Case = { name: string; shape: Shape; options: SketchOptions };
type Core = { sketch: (shape: Shape, options: SketchOptions) => Sketch };

const INSTALL = 'npx playwright-core install chromium-headless-shell';
const cases = corpus as unknown as Case[];
const expected = goldens as unknown as Record<string, Sketch>;

let browser: Browser | undefined;
let rendered: Record<string, Sketch> = {};

// The package source as one script that sets `globalThis.borrowdale`, so the browser runs the code
// under test rather than whatever `dist` was last built.
async function bundleSource(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('../src/index.ts', import.meta.url)), formats: ['iife'], name: 'borrowdale' },
    },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : [result as Rolldown.RolldownOutput];
  const entry = outputs
    .flatMap(({ output }) => output)
    .find((file): file is Rolldown.OutputChunk => file.type === 'chunk' && file.isEntry);
  if (!entry) {
    throw new Error('The parity test could not find the bundled entry chunk in the vite build output.');
  }
  return entry.code;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(`The parity test needs Chromium. Install it with: ${INSTALL}\n\n${String(error)}`);
  }
}

beforeAll(async () => {
  const code = await bundleSource();
  browser = await launch();
  const page = await browser.newPage();
  await page.addScriptTag({ content: code });
  rendered = await page.evaluate(
    (entries: Case[]) => {
      const { sketch } = (globalThis as unknown as { borrowdale: Core }).borrowdale;
      return Object.fromEntries(entries.map((entry) => [entry.name, sketch(entry.shape, entry.options)]));
    },
    cases,
  );
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('Chromium parity', () => {
  it('draws exactly the corpus in Chromium', () => {
    expect(Object.keys(rendered)).toEqual(Object.keys(expected));
  });

  it.each(cases)('$name is byte for byte the same in Chromium', ({ name }) => {
    expect(rendered[name]).toEqual(expected[name]);
  });
});
