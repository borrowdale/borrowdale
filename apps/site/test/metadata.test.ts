// @vitest-environment happy-dom
import { afterEach, it, expect, vi } from 'vitest';
import { allPaths, pageHtml } from '../src/pages';
import { metadata, metadataHtml, applyMetadata, checkOrigin } from '../src/metadata';

afterEach(() => vi.unstubAllEnvs());
it('provides specific metadata and valid structured data on every static page', () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const path of allPaths()) {
    const m = metadata(path, 'https://example.test', '/borrowdale/');
    expect(m.description.length).toBeGreaterThan(50);
    expect(m.title).toContain('BorrowdaleJS');
    expect(m.canonical).toBe('https://example.test/borrowdale' + path);
    expect(m.structured?.url).toBe(m.canonical);
    expect(m.robots).toBeUndefined();
    expect(metadataHtml(path, 'https://example.test', '/borrowdale/')).toContain('application/ld+json');
    titles.add(m.title);
    descriptions.add(m.description);
  }
  expect(titles.size).toBe(allPaths().length);
  expect(descriptions.size).toBe(allPaths().length);
});
it.each([
  ['/docs/charts/', 'statistical and financial charts'],
  ['/docs/charts/', 'unit charts, funnels, liquid fills and Venn diagrams'],
  ['/docs/getting-started/', 'Install BorrowdaleJS from npm'],
  ['/docs/getting-started/', 'in Node.js 22 or later'],
  ['/examples/world/', 'with a fitted income and longevity curve'],
  ['/changelog/', 'what each release'],
  ['/examples/climate/', 'decade box plots, a LOESS curve'],
  ['/examples/climate/', 'warming stripes, a monthly heatmap'],
  ['/examples/earthquakes/', 'a magnitude histogram, box plots of magnitude by depth'],
  ['/examples/earthquakes/', 'a daily calendar'],
  ['/examples/earthquakes/', 'a magnitude waffle'],
])('describes %s as it is now: %s', (path, text) => {
  expect(metadata(path, '').description).toContain(text);
});
it('does not invent a deployment domain and excludes missing pages', () => {
  expect(metadata('/docs/', '').canonical).toBeUndefined();
  expect(metadata('/missing/', 'https://example.test').robots).toBe('noindex, follow');
  expect(metadata('/missing/', 'https://example.test').canonical).toBeUndefined();
  expect(() => metadata('/', 'https://user:password@example.test')).toThrow();
});
it('keeps metadata current after client navigation', () => {
  applyMetadata('/docs/');
  expect(document.title).toContain('Documentation');
  const first = document.querySelector('meta[name="description"]')!.getAttribute('content');
  applyMetadata('/examples/climate/');
  expect(document.title).toContain('Climate notebook');
  expect(document.querySelector('meta[name="description"]')!.getAttribute('content')).not.toBe(first);
  expect(document.querySelector('meta[property="og:title"]')!.getAttribute('content')).toBe(document.title);
  applyMetadata('/missing/');
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  applyMetadata('/');
  expect(document.querySelector('meta[name="robots"]')).toBeNull();
});
it('links every playground from the HTML directory without requiring filters', () => {
  const html = pageHtml('/playground/');
  for (const path of allPaths().filter((p) => p.startsWith('/playground/') && p !== '/playground/'))
    expect(html).toContain(`href="${path}"`);
});
it.each([
  'http://example.test',
  'https://example.test/path/',
  'https://example.test/?q=1',
  'https://example.test/#top',
])('refuses %s as the site origin', (origin) => {
  expect(() => checkOrigin(origin)).toThrow('SITE_ORIGIN');
});
it('sets the canonical link, og:url and structured data in the browser when an origin is configured', () => {
  vi.stubEnv('VITE_SITE_ORIGIN', 'https://example.test');
  applyMetadata('/docs/charts/');
  expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')!.href).toBe(
    'https://example.test/docs/charts/',
  );
  expect(document.querySelector('meta[property="og:url"]')!.getAttribute('content')).toBe(
    'https://example.test/docs/charts/',
  );
  expect(JSON.parse(document.getElementById('page-schema')!.textContent!)['@type']).toBe('TechArticle');
});
it('names an example by its kind and points a raw-name URL at the slug URL', () => {
  const m = metadata('/playground/components/Primary%20action/', 'https://example.test', '/');
  expect(m.title).toBe('Primary action · UI recipe example — BorrowdaleJS');
  expect(m.canonical).toBe('https://example.test/playground/components/primary-action/');
});
it('links a large social image and ties every page to the website entity', () => {
  const html = metadataHtml('/docs/charts/', 'https://example.test', '/borrowdale/');
  expect(html).toContain(
    '<meta property="og:image" content="https://example.test/borrowdale/social-card.png">',
  );
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(metadata('/docs/charts/', 'https://example.test', '/borrowdale/').structured).toMatchObject({
    '@type': 'TechArticle',
    headline: 'Charts',
    isPartOf: { '@id': 'https://example.test/borrowdale/#website' },
  });
  expect(metadata('/', 'https://example.test', '/borrowdale/').structured!['@id']).toBe(
    'https://example.test/borrowdale/#website',
  );
});
