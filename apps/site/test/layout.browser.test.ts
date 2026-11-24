import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { launch } from '../../../packages/core/test/support/browsers.js';
import { loadDashboards, pageHtml } from '../src/pages';

// The site's stylesheet, read from disk: the tests do not process CSS imports, so an `?inline`
// import would be empty here.
const style = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

// How far the page at `path` reaches past the right edge of a `width`-pixel viewport in headless
// Chromium, with every collapsible section open: the larger of the document's own overflow and that
// of the chart panel that reaches furthest right. Measuring the panels too catches overflow that is clipped instead of
// fixed, which keeps the document narrow but cuts the panels off. A page that fits gives 0.
async function overflowAt(path: string, width: number): Promise<number> {
  const browser = await launch('chromium');
  try {
    const page = await browser.newPage({ viewport: { width, height: 812 } });
    await page.setContent(`<!doctype html><style>${style}</style><div id="app">${pageHtml(path)}</div>`);
    return await page.evaluate(() => {
      document.querySelectorAll('details').forEach((details) => {
        details.open = true;
      });
      const root = document.documentElement;
      const panels = Array.from(document.querySelectorAll('.chart-panel'), (panel) => panel.getBoundingClientRect().right);
      return Math.max(root.scrollWidth, ...panels) - root.clientWidth;
    });
  } finally {
    await browser.close();
  }
}

describe('phone layout', () => {
  beforeAll(loadDashboards);

  // On a phone neither the page nor a chart panel may run past the right edge of the screen.
  it.each(['/examples/world/', '/examples/climate/', '/examples/earthquakes/'])(
    'fits %s on a 375 px screen',
    async (path) => {
      expect(await overflowAt(path, 375)).toBe(0);
    },
    30_000,
  );
});
