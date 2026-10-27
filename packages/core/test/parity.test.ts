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
  return ((result as Rolldown.RolldownOutput[])[0]!.output[0] as Rolldown.OutputChunk).code;
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
    (cases: Case[]) => {
      const { sketch } = (globalThis as unknown as { borrowdale: Core }).borrowdale;
      return Object.fromEntries(cases.map((entry) => [entry.name, sketch(entry.shape, entry.options)]));
    },
    corpus as unknown as Case[],
  );
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('Chromium parity', () => {
  it('draws every golden byte for byte in Chromium', () => {
    expect(rendered).toEqual(goldens);
  });
});
