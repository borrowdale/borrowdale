import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, type Browser, type BrowserType, type LaunchOptions } from 'playwright-core';
import { build, defaultClientConditions, type Rolldown } from 'vite';

/** The browser engines the parity tests run in: Blink, Gecko and WebKit, beside Node's V8. */
export const ENGINES = ['chromium', 'firefox', 'webkit'] as const;

export type Engine = (typeof ENGINES)[number];

const BROWSERS: Record<Engine, BrowserType> = { chromium, firefox, webkit };
// Chromium runs as the full browser in headless mode, the build its users install. The separate
// headless shell forces full font hinting on Linux, which rounds every glyph advance to a whole pixel,
// so text there is drawn up to 2 units wider or narrower than the browser itself draws it.
const LAUNCH: Record<Engine, LaunchOptions> = { chromium: { channel: 'chromium' }, firefox: {}, webkit: {} };
// What Playwright downloads for each engine.
const DOWNLOADS: Record<Engine, string> = { chromium: 'chromium', firefox: 'firefox', webkit: 'webkit' };

// One bundle per entry and global name, shared by every page and engine that loads it.
const bundles = new Map<string, Promise<string>>();

/**
 * Opens `html` in a headless `engine` with a package's source loaded as `globalThis[name]`, runs
 * `fn` in the page with `arg`, and closes the browser. The source is bundled fresh once per test
 * file, so the browser runs the code under test rather than whatever `dist` was last built.
 */
export async function evaluateIn<Arg, Result>(
  engine: Engine,
  entry: URL,
  name: string,
  html: string,
  fn: (arg: Arg) => Result | Promise<Result>,
  arg: Arg,
): Promise<Result> {
  const code = await bundleOnce(entry, name);
  const browser = await launch(engine);
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: code });
    return (await page.evaluate(fn as (arg: unknown) => Promise<unknown>, arg)) as Result;
  } finally {
    await browser.close();
  }
}

function bundleOnce(entry: URL, name: string): Promise<string> {
  const key = `${entry.href} ${name}`;
  let bundle = bundles.get(key);
  if (!bundle) {
    bundle = bundleSource(entry, name);
    bundles.set(key, bundle);
  }
  return bundle;
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
    throw new Error('The browser test could not find the bundled entry chunk in the vite build output.');
  }
  return chunk.code;
}

async function launch(engine: Engine): Promise<Browser> {
  try {
    return await BROWSERS[engine].launch(LAUNCH[engine]);
  } catch (error) {
    const install = `npx playwright-core install ${DOWNLOADS[engine]}`;
    throw new Error(`The browser tests need ${engine}. Install it with: ${install}\n\n${String(error)}`);
  }
}
