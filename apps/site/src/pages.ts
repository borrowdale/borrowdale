import type { ChartSpec } from '@borrowdale/charts';
import { chart, chartSpec, shapeSvg, scribble, patternSvg, escape, decorative } from './drawing';
// Every drawing on these pages is ornament: the text beside it carries the meaning.
const ornament = (...args: Parameters<typeof shapeSvg>) => decorative(shapeSvg(...args));
import { gallery, examples, codeBlock, chartCode } from './gallery';
import { worldDashboard, climateDashboard, quakeDashboard } from './dashboards';
import { editorPage, findExample } from './editor';
import { docs, documentPage } from './documents';
import { localPath, siteUrl, rewriteLinks, examplePath } from './routing';
const names: Record<string, string> = {
  home: 'Overview',
  gallery: 'Playground',
  examples: 'Examples',
  world: 'World atlas',
  climate: 'Climate notebook',
  earthquakes: 'Earthquake watch',
  example: 'Playground',
  docs: 'Documentation',
};
const demoSpec = chartSpec(
  'A little room to grow',
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  [
    { type: 'bar', name: 'Ideas', color: '#de9b24', data: [12, 19, 15, 26, 32] },
    { type: 'line', name: 'Notes', color: '#397e92', curve: 'monotone', data: [8, 12, 17, 20, 25] },
  ],
  { legend: 'top', width: 510, height: 300 },
);
function logo() {
  return `<a class="brand" href="#home" aria-label="BorrowdaleJS home"><span class="brand-symbol">${ornament(
    {
      kind: 'polygon',
      points: [
        [4, 25],
        [15, 3],
        [27, 25],
      ],
    },
    { fill: '#efbc47', fillStyle: 'solid', roughness: 1 },
    32,
    30,
  )}</span>Borrowdale<span class="brand-js">JS</span><span class="brand-period">.</span></a>`;
}
function nav(r: string) {
  return `<header class="site-header">${logo()}<nav aria-label="Main navigation"><a class="${r === 'docs' ? 'active' : ''}" href="/docs/">Docs</a><a class="${r === 'gallery' || r === 'example' ? 'active' : ''}" href="#gallery">Playground <span>${examples.length}</span></a><a class="${['examples', 'world', 'climate', 'earthquakes'].includes(r) ? 'active' : ''}" href="/examples/">Examples</a></nav><a class="github" href="https://github.com/borrowdale/borrowdale" target="_blank" rel="noreferrer">GitHub ↗</a><button ${r === 'docs' ? 'hidden' : ''} id="resketch" class="resketch" title="Draw again with a different seed" aria-label="Re-sketch">⤨ <span>Re-sketch</span></button></header>`;
}
function dashboardNav(activeRoute: string) {
  return `<nav class="dashboard-nav" aria-label="Demo dashboards"><span>REAL DATA, DIFFERENT PERSPECTIVES</span>${['world', 'climate', 'earthquakes'].map((r, i) => `<a href="#${r}" class="${r === activeRoute ? 'selected' : ''}" ${r === activeRoute ? 'aria-current="page"' : ''}><small>0${i + 1}</small> ${names[r]}</a>`).join('')}</nav>`;
}
function heroArt() {
  const donut: ChartSpec = {
    width: 220,
    height: 220,
    legend: 'none',
    style: { fillStyle: 'hachure', roughness: 0.9 },
    series: [
      {
        type: 'pie',
        name: 'Ideas',
        innerRadius: 0.58,
        data: [
          { name: 'A', value: 42, color: '#397e92' },
          { name: 'B', value: 33, color: '#efbd4d' },
          { name: 'C', value: 25, color: '#8b9f70' },
        ],
      },
    ],
  };
  return `<div class="hero-art" role="group" aria-label="BorrowdaleJS chart examples using illustrative data"><div class="art-dotgrid">${decorative(patternSvg({ kind: 'circles', size: 17, stroke: '#c8c8b8', strokeWidth: 0.5 }))}</div><div class="hand-note">a little less rigid.</div><div class="hero-chart paper">${chart(demoSpec)}</div><div class="hero-donut paper">${chart(donut)}<span>A fresh perspective</span></div><div class="hero-stamp">${scribble(170, 80, '#e4ebda')}<span>Same data.<br>More character.</span></div><div class="hero-spark">${ornament(
    {
      kind: 'linearPath',
      points: [
        [8, 52],
        [35, 38],
        [60, 47],
        [87, 20],
        [110, 30],
        [142, 5],
      ],
    },
    { stroke: '#397e92', strokeWidth: 3 },
    150,
    60,
  )}</div><div class="art-caption">DRAWN BY BORROWDALE · ILLUSTRATIVE DATA</div></div>`;
}
function previews() {
  return [
    {
      route: 'world',
      num: '01',
      title: 'A wider world',
      desc: 'Income, health and the places we call home.',
      color: 'blue',
      spec: chartSpec(
        '',
        ['A', 'B', 'C', 'D', 'E'],
        [{ type: 'bar', name: 'Preview', color: '#397e92', data: [19, 12, 28, 22, 36] }],
        {
          width: 360,
          height: 180,
          axes: {
            x: { type: 'band', categories: ['A', 'B', 'C', 'D', 'E'], hidden: true },
            y: { type: 'linear', hidden: true },
          },
        },
      ),
    },
    {
      route: 'climate',
      num: '02',
      title: 'A warming record',
      desc: 'More than a century of global temperatures.',
      color: 'coral',
      spec: chartSpec(
        '',
        ['1', '2', '3', '4', '5', '6'],
        [
          {
            type: 'line',
            name: 'Preview',
            color: '#bd6556',
            curve: 'monotone',
            data: [1, 2, 1.8, 3, 3.5, 5],
          },
        ],
        {
          width: 360,
          height: 180,
          axes: {
            x: { type: 'band', categories: ['1', '2', '3', '4', '5', '6'], hidden: true },
            y: { type: 'linear', hidden: true },
          },
        },
      ),
    },
    {
      route: 'earthquakes',
      num: '03',
      title: 'Beneath the surface',
      desc: 'Thirty days of movement around the planet.',
      color: 'green',
      spec: {
        width: 360,
        height: 180,
        legend: 'none',
        axes: { x: { type: 'linear', hidden: true }, y: { type: 'linear', hidden: true } },
        series: [
          {
            type: 'scatter',
            name: 'Preview',
            color: '#3b7662',
            data: [
              [1, 3],
              [2, 1],
              [2.5, 4],
              [3, 2],
              [4, 3],
              [4.5, 1],
              [5, 5],
              [6, 3],
            ],
          },
        ],
      } as ChartSpec,
    },
  ];
}
function home() {
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> AN OPEN-SOURCE DRAWING TOOLKIT</p><h1>Serious data.<br><span>A human touch.</span></h1><p class="hero-description">Hand-drawn charts, expressive lettering, and beautifully imperfect shapes. Bring a little character to the things you build.</p><div class="hero-actions"><a href="#gallery" class="sketch-button">${scribble()}<span>Explore the playground ↗</span></a><a class="text-link" href="#world">See it in the wild →</a></div><div class="hero-footnote"><span>TypeScript</span><i>·</i><span>SVG + Canvas</span><i>·</i><span>Seeded & repeatable</span></div></div>${heroArt()}</section>
 <section class="package-strip"><span>ONE VISUAL LANGUAGE.<br>FOUR SMALL PACKAGES.</span>${['core', 'text', 'fills', 'charts'].map((x, i) => `<a href="#gallery?category=${['shapes', 'text', 'patterns', 'charts'][i]}"><small>0${i + 1}</small> @borrowdale/<b>${x}</b> ↗</a>`).join('')}</section>
 <section class="intro-section"><div><p class="eyebrow">PRECISION, WITH PERSONALITY</p><h2>Made by code.<br>Feels made by hand.</h2></div><p>Not a filter on top of a chart. BorrowdaleJS lays out data, measures text, and builds every stroke from the same drawing language. A sketchbook feel, with numbers you can still read.</p></section>
 <section class="feature-grid"><article><span class="feature-icon">${ornament(
   {
     kind: 'curve',
     points: [
       [5, 42],
       [35, 12],
       [65, 45],
       [95, 10],
     ],
   },
   { stroke: '#397e92', strokeWidth: 2 },
   105,
   55,
 )}</span><h3>A considered imperfection</h3><p>Tune roughness, fill patterns and stroke weight. Keep it crisp or let the pencil wander.</p></article><article><span class="feature-icon">${ornament({ kind: 'rectangle', x: 6, y: 6, width: 82, height: 42 }, { fill: '#efbd4d', fillStyle: 'hachure', roughness: 0.7 }, 100, 55)}</span><h3>The same sketch, every time</h3><p>Seeded drawings and DOM-free layout. Share the same input between server and browser.</p></article><article><span class="feature-icon hand">Aa ↗</span><h3>Words belong in the picture</h3><p>Measured Excalifont labels, from a tiny axis tick to a handwritten annotation.</p></article></section>
 <section class="demo-section"><div class="section-top"><div><p class="eyebrow">THREE OPEN-DATA NOTEBOOKS</p><h2>Real numbers. New perspectives.</h2></div><a class="text-link" href="#world">Explore the examples ↗</a></div><div class="demo-grid">${previews()
   .map(
     (p) =>
       `<a class="demo-card ${p.color}" href="#${p.route}"><div class="demo-preview">${chart(p.spec)}<span>Illustrative preview</span></div><div class="demo-caption"><small>NOTEBOOK ${p.num}</small><h3>${p.title} <b>↗</b></h3><p>${p.desc}</p></div></a>`,
   )
   .join('')}</div></section>
 <section class="quickstart" id="quickstart"><div><p class="eyebrow">A FEW LINES. YOUR OWN DRAWING.</p><h2>Start with an idea.<br>Leave with a chart.</h2><p>A plain JavaScript spec describes the data. BorrowdaleJS handles the marks, scales and labels. Every example in the playground comes with its working code.</p><div class="local-note"><b>Work in progress, ready to explore.</b><p>The packages are not published yet. This site runs directly from the workspace—no npm release needed.</p><code>nvm use<br>npm ci<br>npm run site</code></div><a href="#gallery" class="text-link">Browse the playground →</a></div><div>${codeBlock(chartCode(chartSpec('Ideas per day', ['Mon', 'Tue', 'Wed'], [{ type: 'bar', name: 'Ideas', data: [12, 19, 15], color: '#de9b24' }], { width: 480, height: 280 })))}</div></section>
 <section class="closing"><p class="hand">A little graphite goes a long way.</p><p>Named for the Lake District valley where the story of the pencil began.</p><a href="#gallery" class="button">Find your next mark ↗</a></section>`;
}

export function route(path: string): string {
  const clean = localPath(path);
  if (clean === '/') return 'home';
  if (clean === '/playground/') return 'gallery';
  if (clean.startsWith('/playground/')) return findExample(path) ? 'example' : '404';
  if (clean === '/examples/') return 'examples';
  const match = clean.match(/^\/examples\/(world|climate|earthquakes)\/$/);
  if (match) return match[1]!;
  if (docs.some((d) => d.url === clean)) return 'docs';
  return '404';
}
export function pageTitle(path: string) {
  const clean = localPath(path);
  return (
    docs.find((d) => d.url === clean)?.title ??
    (route(path) === 'example'
      ? findExample(path)!.name.replaceAll('-', ' ')
      : (names[route(path)] ?? 'Page not found'))
  );
}
export function pageHtml(path: string) {
  const r = route(path);
  const content =
    r === 'home'
      ? home()
      : r === 'gallery'
        ? gallery()
        : r === 'example'
          ? editorPage(path)
          : r === 'world'
            ? worldDashboard()
            : r === 'climate'
              ? climateDashboard()
              : r === 'earthquakes'
                ? quakeDashboard()
                : r === 'docs'
                  ? documentPage(localPath(path))
                  : r === 'examples'
                    ? `<section class="page-heading"><p class="eyebrow">EXAMPLES / REAL DATA</p><h1>See the whole picture.</h1><p>Complete dashboards built with BorrowdaleJS. Explore three open datasets, adjust the views, and copy the code behind each chart.</p></section><div class="demo-grid">${previews()
                        .map(
                          (p) =>
                            `<a class="demo-card ${p.color}" href="#${p.route}"><div class="demo-preview">${chart(p.spec)}</div><div class="demo-caption"><small>EXAMPLE ${p.num}</small><h2>${p.title} ↗</h2><p>${p.desc}</p></div></a>`,
                        )
                        .join('')}</div>`
                    : `<section class="empty"><h1>Page not found.</h1><p>Try the documentation or explore a drawing in the playground.</p><a href="/docs/">Read the docs →</a></section>`;
  return rewriteLinks(
    `${nav(r)}<main id="main" tabindex="-1">${['world', 'climate', 'earthquakes'].includes(r) ? dashboardNav(r) : ''}${content}</main><footer class="site-footer">${logo()}<nav aria-label="Footer">${[
      ['About', '/about/'],
      ['Contributing', '/contributing/'],
      ['Changelog', '/changelog/'],
      ['License & credits', '/license/'],
    ]
      .map(([label, url]) => `<a href="${url}">${label}</a>`)
      .join(
        '',
      )}</nav><span>MIT code · OFL font</span></footer>`,
  );
}
export function allPaths() {
  return [
    '/',
    '/playground/',
    '/examples/',
    ...['world', 'climate', 'earthquakes'].map((x) => `/examples/${x}/`),
    ...docs.map((d) => d.url),
    ...examples.map(examplePath),
  ];
}
