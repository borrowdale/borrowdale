import { pageTitle, route } from './pages';
import { docs } from './documents';
import { findExample } from './editor';
import { examples } from './gallery';
import { localPath, examplePath } from './routing';
import { escape } from './drawing';
const descriptions: Record<string, string> = {
  '/': 'BorrowdaleJS is a TypeScript toolkit for hand-drawn charts, shapes, text and patterns. Explore editable examples, documentation and open-data dashboards.',
  '/docs/':
    'Learn BorrowdaleJS with shared guides, working code examples, and references for charts, shapes, text and repeating patterns.',
  '/docs/getting-started/':
    'Install BorrowdaleJS from npm and draw your first hand-drawn chart from a JavaScript spec, in Node.js 22 or later or in a browser.',
  '/docs/rendering/':
    'Render BorrowdaleJS drawings as SVG or Canvas, load Excalifont, use repeatable seeds and work with the live playground.',
  '/docs/cartesian/':
    'Build interval and numeric charts with BorrowdaleJS: markers, labels, annotations, gradients, weighted bars and editable chart compositions.',
  '/docs/accessibility/':
    'Make BorrowdaleJS charts understandable with accessible descriptions, data alternatives and clear labels. Learn the current limitations.',
  '/docs/charts/':
    'BorrowdaleJS chart API: cartesian, polar, statistical and financial charts, unit, Venn and hierarchy charts, and heatmaps, drawn to SVG or Canvas.',
  '/docs/core/':
    'BorrowdaleJS drawing API: seeded shapes, sketch styles, SVG paths, Canvas rendering and geometry primitives.',
  '/docs/text/':
    'BorrowdaleJS text API: measure and lay out Excalifont lettering, identify missing glyphs, and render text in SVG or Canvas.',
  '/docs/fills/':
    'BorrowdaleJS fill API: generate repeatable hand-drawn line, cross-hatch and circle patterns for SVG backgrounds.',
  '/playground/': `Explore ${examples.length} editable BorrowdaleJS examples covering charts, shapes, text, patterns and native HTML component recipes.`,
  '/examples/':
    'Explore three complete BorrowdaleJS dashboards using World Bank, NASA GISS and USGS datasets. Every chart includes its code.',
  '/examples/world/':
    'Compare income, life expectancy and population across selected countries, with a fitted income and longevity curve, using World Bank data.',
  '/examples/climate/':
    'Explore NASA GISTEMP temperature anomalies through warming stripes, a monthly heatmap, annual trends, decade box plots, a LOESS curve, polar charts and a gauge.',
  '/examples/earthquakes/':
    'Explore a saved USGS earthquake feed through a daily calendar, a magnitude histogram, box plots of magnitude by depth, a magnitude waffle and radial charts.',
  '/about/':
    'Discover BorrowdaleJS, a TypeScript toolkit combining measured data visualization with a repeatable hand-drawn style.',
  '/contributing/':
    'Contribute to BorrowdaleJS: set up Node.js 24, run tests, report reproducible bugs, improve documentation and propose focused changes.',
  '/changelog/':
    'Follow the development of BorrowdaleJS: what each release of the four @borrowdale packages added, changed and fixed.',
  '/license/':
    'Read the BorrowdaleJS MIT license, Excalifont SIL OFL license, incorporated-code notices and open-dataset credits.',
};
/** The site's origin, for canonical URLs, the sitemap and robots.txt; throws unless it is a bare HTTPS origin. */
export function checkOrigin(origin: string) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('SITE_ORIGIN must be an HTTPS origin without credentials, path, query or fragment.');
  return url;
}
const kinds: Record<string, string> = {
  charts: 'Chart',
  shapes: 'Shape',
  text: 'Text',
  patterns: 'Pattern',
  components: 'UI recipe',
};
const titleCase = (name: string) => name.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase());
export function metadata(
  path: string,
  origin = import.meta.env.VITE_SITE_ORIGIN || '',
  base = import.meta.env.BASE_URL,
) {
  const clean = localPath(path),
    example = findExample(path),
    missing = route(path) === '404';
  // The page's own name; the title adds the site name, and an example says what kind of example it is.
  const name =
    clean === '/'
      ? 'Hand-drawn charts and graphics'
      : example
        ? `${titleCase(example.name)} · ${kinds[example.category]} example`
        : pageTitle(path);
  const title = `${name} — BorrowdaleJS`;
  const description = missing
    ? 'This BorrowdaleJS page could not be found. Browse the documentation, playground or complete examples.'
    : example
      ? `Edit the ${example.name.replaceAll('-', ' ')} ${example.category} example with BorrowdaleJS. Change JavaScript and see the live SVG or HTML preview.`
      : (descriptions[clean] ?? 'Explore BorrowdaleJS documentation and examples.');
  let canonical: string | undefined;
  if (origin) {
    const url = checkOrigin(origin);
    // An example reached by its raw name still names its slug URL as canonical.
    if (!missing) canonical = new URL(base + (example ? examplePath(example) : clean).slice(1), url).href;
  }
  const site = canonical ? new URL(base, canonical).href : undefined;
  const image = site && `${site}social-card.png`;
  const structured = canonical
    ? {
        '@context': 'https://schema.org',
        '@type': clean === '/' ? 'WebSite' : clean.startsWith('/docs/') ? 'TechArticle' : 'WebPage',
        '@id': clean === '/' ? `${site}#website` : canonical,
        name,
        ...(clean.startsWith('/docs/') ? { headline: name } : {}),
        ...(clean === '/' ? {} : { isPartOf: { '@id': `${site}#website` } }),
        description,
        url: canonical,
        image,
        inLanguage: 'en',
      }
    : undefined;
  return {
    title,
    description,
    canonical,
    image,
    structured,
    robots: missing ? 'noindex, follow' : undefined,
  };
}
export function metadataHtml(path: string, origin?: string, base?: string) {
  const m = metadata(path, origin, base);
  return `<title>${escape(m.title)}</title><meta name="description" content="${escape(m.description)}"><meta property="og:title" content="${escape(m.title)}"><meta property="og:description" content="${escape(m.description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="BorrowdaleJS"><meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">${m.image ? `<meta property="og:image" content="${escape(m.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="The BorrowdaleJS home page: hand-drawn bar, line and donut charts beside the headline Serious data. A human touch.">` : ''}${m.canonical ? `<link rel="canonical" href="${escape(m.canonical)}"><meta property="og:url" content="${escape(m.canonical)}">` : ''}${m.robots ? `<meta name="robots" content="${m.robots}">` : ''}${m.structured ? `<script type="application/ld+json" id="page-schema">${JSON.stringify(m.structured).replaceAll('<', '\\u003c')}</script>` : ''}`;
}
export function applyMetadata(path: string) {
  const m = metadata(path);
  document.title = m.title;
  const set = (key: string, name: string, value?: string) => {
    const selector = `meta[${key}="${name}"]`;
    let node = document.head.querySelector<HTMLMetaElement>(selector);
    if (!value) {
      node?.remove();
      return;
    }
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(key, name);
      document.head.append(node);
    }
    node.content = value;
  };
  set('name', 'description', m.description);
  set('property', 'og:title', m.title);
  set('property', 'og:description', m.description);
  set('property', 'og:type', 'website');
  set('property', 'og:site_name', 'BorrowdaleJS');
  set('name', 'twitter:card', m.image ? 'summary_large_image' : 'summary');
  set('property', 'og:image', m.image);
  set('name', 'robots', m.robots);
  set('property', 'og:url', m.canonical);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (m.canonical) {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.append(link);
    }
    link.href = m.canonical;
  } else link?.remove();
  document.getElementById('page-schema')?.remove();
  if (m.structured) {
    const node = document.createElement('script');
    node.id = 'page-schema';
    node.type = 'application/ld+json';
    node.textContent = JSON.stringify(m.structured);
    document.head.append(node);
  }
}
