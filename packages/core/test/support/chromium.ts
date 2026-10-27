import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { build, defaultClientConditions, type Rolldown } from 'vite';

const INSTALL = 'npx playwright-core install chromium-headless-shell';

/**
 * Opens `html` in headless Chromium with a package's source loaded as `globalThis[name]`, runs `fn`
 * in the page with `arg`, and closes the browser. The source is bundled fresh, so the browser runs
 * the code under test rather than whatever `dist` was last built.
 */
export async function evaluateInChromium<Arg, Result>(
  entry: URL,
  name: string,
  html: string,
  fn: (arg: Arg) => Result | Promise<Result>,
  arg: Arg,
): Promise<Result> {
  const code = await bundleSource(entry, name);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: code });
    return (await page.evaluate(fn as (arg: unknown) => Promise<unknown>, arg)) as Result;
  } finally {
    await browser.close();
  }
}

// Workspace imports resolve to their source too, through the `@borrowdale/source` condition.
async function bundleSource(entry: URL, name: string): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { conditions: ['@borrowdale/source', ...defaultClientConditions] },
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(entry), formats: ['iife'], name },
    },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : [result as Rolldown.RolldownOutput];
  const chunk = outputs
    .flatMap(({ output }) => output)
    .find((file): file is Rolldown.OutputChunk => file.type === 'chunk' && file.isEntry);
  if (!chunk) {
    throw new Error('The parity test could not find the bundled entry chunk in the vite build output.');
  }
  return chunk.code;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(`The parity test needs Chromium. Install it with: ${INSTALL}\n\n${String(error)}`);
  }
}
