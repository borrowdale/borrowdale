import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { allPaths, pageHtml, loadDashboards } = await server.ssrLoadModule('/src/pages.ts');
  await loadDashboards();
  const { metadataHtml, checkOrigin } = await server.ssrLoadModule('/src/metadata.ts');
  const { escape } = await server.ssrLoadModule('/src/drawing.ts');
  const { fontFaceCss } = await server.ssrLoadModule('@borrowdale/text');
  const { excalifontFiles } = await server.ssrLoadModule('@borrowdale/text/excalifont-files');
  const template = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  if (!template.includes('<div id="app"></div>')) throw new Error('dist/index.html has no empty #app to fill.');
  const base = server.config.base;
  const origin = process.env.SITE_ORIGIN;
  if (origin) checkOrigin(origin);
  else console.warn('SITE_ORIGIN is not set: pages get no canonical URL or structured data, and no sitemap is written.');
  // The font is written once, as files every page links to and browsers cache, rather than into each page.
  // The stylesheet uses the same rules as fontFaceCss, with each embedded file replaced by its URL.
  let file = 0;
  const fontCss = fontFaceCss(excalifontFiles).replace(/url\(data:font\/woff2;base64,([^)]+)\)/g, (_, data) => {
    const name = `excalifont-${file++}.woff2`;
    writeFileSync(resolve(root, 'dist/assets', name), Buffer.from(data, 'base64'));
    return `url(${name})`;
  });
  await writeFile(resolve(root, 'dist/assets/excalifont.css'), fontCss);
  const fontLink = `<link rel="stylesheet" href="${base}assets/excalifont.css" data-font-css>`;
  const paths = allPaths();
  for (const path of [...paths, '/404/']) {
    const content = pageHtml(path);
    const html = template
      .replace('<div id="app"></div>', () => `<div id="app">${content}</div>`)
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description"[^>]*>/, '')
      .replace(
        '</head>',
        () => `${metadataHtml(path, origin, base)}${fontLink}</head>`,
      );
    const output = resolve(root, 'dist', path === '/404/' ? '404.html' : path.slice(1) + 'index.html');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html);
  }
  await writeFile(resolve(root, 'dist/.nojekyll'), '');
  // Crawlers read robots.txt only at the root of a host, so under a project path it would be ignored:
  // submit the sitemap to the search engines directly instead.
  if (origin && base !== '/')
    console.warn(`Not writing robots.txt under ${base}; submit ${new URL(base + 'sitemap.xml', origin).href} directly.`);
  if (origin && base === '/')
    await writeFile(
      resolve(root, 'dist/robots.txt'),
      `User-agent: *\nAllow: /\nSitemap: ${new URL(base + 'sitemap.xml', origin).href}\n`,
    );
  if (origin)
    await writeFile(
      resolve(root, 'dist/sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escape(new URL(base + p.slice(1), origin).href)}</loc></url>`).join('')}</urlset>`,
    );
  console.log(`Generated ${paths.length} static pages and 404.html.`);
} finally {
  await server.close();
}
