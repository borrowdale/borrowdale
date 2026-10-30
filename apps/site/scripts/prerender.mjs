import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { allPaths, pageHtml } = await server.ssrLoadModule('/src/pages.ts');
  const { metadataHtml } = await server.ssrLoadModule('/src/metadata.ts');
  const { fontFaceCss } = await server.ssrLoadModule('../../packages/text/src/index.ts');
  const { excalifontFiles } = await server.ssrLoadModule('../../packages/text/src/fonts/excalifont-files.ts');
  const template = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  const origin = process.env.SITE_ORIGIN;
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
      throw new Error('SITE_ORIGIN must be an HTTPS origin with no path, query or fragment.');
  }
  const escape = (s) =>
    s.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const paths = allPaths();
  for (const path of [...paths, '/404/']) {
    const content = pageHtml(path);
    const base = server.config.base;
    const html = template
      .replace('<div id="app"></div>', () => `<div id="app">${content}</div>`)
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description"[^>]*>/, '')
      .replace(
        '</head>',
        () => `${metadataHtml(path, origin, base)}<style>${fontFaceCss(excalifontFiles)}</style></head>`,
      );
    const output = resolve(root, 'dist', path === '/404/' ? '404.html' : path.slice(1) + 'index.html');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html);
  }
  await writeFile(resolve(root, 'dist/.nojekyll'), '');
  if (origin) {
    await writeFile(
      resolve(root, 'dist/robots.txt'),
      `User-agent: *\nAllow: /\nSitemap: ${new URL(server.config.base + 'sitemap.xml', origin).href}\n`,
    );
    await writeFile(
      resolve(root, 'dist/sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escape(new URL(server.config.base + p.slice(1), origin).href)}</loc></url>`).join('')}</urlset>`,
    );
  }
  console.log(`Generated ${paths.length} static pages and 404.html.`);
} finally {
  await server.close();
}
