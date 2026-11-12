import statisticalCases from '../../examples/statistical-cases.json';
import { presentationExamples, type ChartExample } from './chart-examples';
import coreCases from '../../../packages/core/test/golden/corpus.json';
import chartCases from '../../../packages/charts/test/golden/corpus.json';
import textCases from '../../../packages/text/test/golden/corpus.json';
import fillCases from '../../../packages/fills/test/golden/corpus.json';
import type { Shape, SketchOptions } from '@borrowdale/core';
import type { ChartSpec } from '@borrowdale/charts';
import type { LayoutTextOptions } from '@borrowdale/text';
import type { PatternOptions } from '@borrowdale/fills';
import { examplePath } from './routing';
import { chart, shapeSvg, textSvg, patternSvg, scribble, escape, seed } from './drawing';
export type Category = 'charts' | 'shapes' | 'text' | 'patterns' | 'components';
export type Example = {
  name: string;
  category: Category;
  tag: string;
  families?: string[];
  render: (renderer: 'svg' | 'canvas') => string;
};
const json = (x: unknown) => JSON.stringify(x, null, 2);
export function codeBlock(code: string) {
  return `<div class="code-block"><div class="code-bar"><span>JavaScript</span><button class="copy-code" type="button">Copy code</button></div><pre tabindex="0" aria-label="Code"><code>${escape(code)}</code></pre></div>`;
}
export function chartCode(spec: ChartSpec) {
  return `import { layoutChart, toSvgChart } from '@borrowdale/charts';\nimport { excalifontFiles } from '@borrowdale/text/excalifont-files';\n\nconst spec = ${json({ ...spec, seed })};\nconst svg = toSvgChart(layoutChart(spec), { fontFiles: excalifontFiles });\ndocument.querySelector('#chart').innerHTML = svg;`;
}
const shapes: Example[] = coreCases.map((e) => ({
  name: e.name,
  category: 'shapes',
  tag: e.shape.kind,
  render: () => shapeSvg(e.shape as Shape, e.options as SketchOptions, 300, 180, true),
}));
export const chartExamples = [...chartCases, ...presentationExamples, ...statisticalCases] as ChartExample[];
/**
 * What a series is called in the gallery: a statistical, unit or funnel series by its display, a
 * heatmap by its shape, prefixed `correlation` when it is one, a pictorial bar and a pie of pie by
 * name, else its type.
 */
export function seriesTag(series: ChartSpec['series'][number]): string {
  if (series.type === 'heatmap') {
    const shape = series.display === undefined || series.display === 'rect' ? 'heatmap' : `${series.display} heatmap`;
    return series.correlation ? `correlation ${shape}` : shape;
  }
  if (series.type === 'bar' && series.shape === 'pictorial') return 'pictorial bar';
  if (series.type === 'pie' && series.breakout) return 'pie of pie';
  return 'display' in series && ['market', 'distribution', 'relationship', 'units', 'funnel'].includes(series.type) ? String(series.display) : series.type;
}
const charts: Example[] = chartExamples.map((e) => ({
  name: e.name,
  category: 'charts',
  tag: [...new Set(e.spec.series.map(seriesTag))].join(' + '),
  families: [...new Set(e.spec.series.map((s) => s.type))],
  render: (renderer) => chart(e.spec, renderer, e.images),
}));
const texts: Example[] = textCases.map((e) => ({
  name: e.name,
  category: 'text',
  tag: e.name.startsWith('every-') ? 'character sets' : 'layout',
  render: () => {
    const t = textSvg(e.text, e.options as LayoutTextOptions);
    return `${t.svg}${t.missing.length ? `<span class="fallback-note">Fallback glyphs: ${escape(t.missing.join(' '))}</span>` : ''}`;
  },
}));
const patterns: Example[] = fillCases.map((e) => ({
  name: e.name,
  category: 'patterns',
  tag: e.options.kind,
  render: () => patternSvg(e.options as PatternOptions),
}));
// Each UI recipe is written once, with ${frame(width,height,fill)} where a sketched frame goes: the
// playground shows this markup as code, and the gallery draws the frames into it for its preview.
export const recipes = [
  {
    name: 'Primary action',
    tag: 'button',
    template:
      '<button class="sketch-button">${frame(260,64,"#f0c557")}<span>Make something ↗</span></button>',
  },
  {
    name: 'Choice controls',
    tag: 'checkbox',
    template:
      '<fieldset class="recipe-choices"><legend>Layers</legend><label><input type="checkbox" checked> Show labels</label><label><input type="checkbox"> Show grid</label></fieldset>',
  },
  {
    name: 'Segmented control',
    tag: 'radio',
    template:
      '<fieldset class="recipe-segments"><legend>Range</legend><label><input type="radio" name="range" checked><span>Week</span></label><label><input type="radio" name="range"><span>Month</span></label><label><input type="radio" name="range"><span>Year</span></label></fieldset>',
  },
  {
    name: 'Metric card',
    tag: 'card',
    template:
      '<div class="recipe-metric">${frame(260,145,"#f5e9c4")}<div><small>Sketches made</small><strong>12,480</strong><span>↑ 18% this month · sample data</span></div></div>',
  },
  {
    name: 'Status chips',
    tag: 'badge',
    template:
      '<div class="recipe-badges"><span>${frame(120,44,"#dfebd9")}<b>Ready</b></span><span>${frame(120,44,"#f5df9c")}<b>In progress</b></span><span>${frame(120,44,"#e3e5ec")}<b>Draft</b></span></div>',
  },
  {
    name: 'Progress indicator',
    tag: 'progress',
    template:
      '<div class="recipe-progress"><label>Collection complete <span>68%</span></label><progress max="100" value="68">68%</progress></div>',
  },
  {
    name: 'Note & disclosure',
    tag: 'disclosure',
    template:
      '<details class="recipe-note"><summary>A small observation</summary><p>Data can feel human without losing its precision.</p></details>',
  },
  {
    name: 'Form field',
    tag: 'input',
    template:
      '<label class="recipe-input">Name your collection<input placeholder="A new perspective…" maxlength="80"></label>',
  },
];
const recipeHtml = (template: string) =>
  template.replace(/\$\{frame\((\d+),(\d+),"(#[0-9a-f]+)"\)\}/g, (_, width, height, fill) =>
    scribble(Number(width), Number(height), fill),
  );
const components: Example[] = recipes.map((e) => ({
  name: e.name,
  tag: e.tag,
  category: 'components',
  render: () => recipeHtml(e.template),
}));
export const examples: Example[] = [...charts, ...shapes, ...texts, ...patterns, ...components];
export const categories: Category[] = ['charts', 'shapes', 'text', 'patterns', 'components'];
export const galleryState = {
  category: 'charts' as Category,
  search: '',
  tag: 'all',
  page: 0,
  renderer: 'svg' as 'svg' | 'canvas',
};
function exampleIndex() {
  return `<details class="example-index"><summary>Browse all ${examples.length} playgrounds</summary>${categories
    .map(
      (category) =>
        `<section><h2>${category}</h2><ul>${examples
          .filter((e) => e.category === category)
          .map((e) => `<li><a href="${examplePath(e)}">${escape(e.name.replaceAll('-', ' '))}</a></li>`)
          .join('')}</ul></section>`,
    )
    .join('')}</details>`;
}
export function gallery() {
  const state = galleryState;
  const tags = [
    ...new Set(examples.filter((x) => x.category === state.category).flatMap((x) => x.families ?? [x.tag])),
  ];
  const filtered = examples.filter(
    (x) =>
      x.category === state.category &&
      (state.tag === 'all' || (x.families ?? [x.tag]).includes(state.tag)) &&
      `${x.name} ${x.tag} ${x.families?.join(' ') ?? ''}`.toLowerCase().includes(state.search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  state.page = Math.min(state.page, pages - 1);
  const visible = filtered.slice(state.page * 12, state.page * 12 + 12);
  return `<section class="page-heading"><p class="eyebrow">THE PLAYGROUND / ${examples.length} EXAMPLES</p><h1>A mark for every idea.</h1><p>Explore every reference example, then take the code and make it yours.<br>Real BorrowdaleJS output. No screenshot stand-ins.</p></section>
 <div class="gallery-tools"><div class="tabs" role="group" aria-label="Example category">${categories.map((c) => `<button data-category="${c}" class="${c === state.category ? 'selected' : ''}" aria-pressed="${c === state.category}">${c[0]!.toUpperCase() + c.slice(1)} <small>${examples.filter((e) => e.category === c).length}</small></button>`).join('')}</div>
 <div class="filter-row"><label class="search">⌕ <input id="gallery-search" type="search" placeholder="Find an example…" aria-label="Search examples" value="${escape(state.search)}"></label><label>Family <select id="gallery-family"><option value="all">All families</option>${tags.map((t) => `<option ${state.tag === t ? 'selected' : ''}>${escape(t)}</option>`).join('')}</select></label>${state.category === 'charts' ? `<label>Render <select id="gallery-renderer"><option value="svg" ${state.renderer === 'svg' ? 'selected' : ''}>SVG</option><option value="canvas" ${state.renderer === 'canvas' ? 'selected' : ''}>Canvas</option></select></label>` : ''}</div></div>
 <p class="gallery-note">${state.category === 'components' ? 'UI recipes built with BorrowdaleJS primitives and native HTML—not a separate component package.' : state.category === 'text' ? 'Includes anchors, baselines, rotation, character sets, normalization and explicit fallback cases.' : 'Reference fixtures cover supported families and edge cases. Numeric and style combinations are open-ended.'}</p>
 <div class="gallery-grid">${
   visible
     .map((e, i) => {
       let preview: string;
       try {
         preview = e.render(state.renderer);
       } catch (error) {
         preview = `<p class="render-error">${escape(error)}</p>`;
       }
       return `<a class="example-card" href="${examplePath(e)}" aria-label="Open ${escape(e.name.replaceAll('-', ' '))} playground, ${escape(e.tag)}"><div class="example-preview ${state.category}" inert aria-hidden="true">${preview}</div><div class="example-caption"><span class="example-number">${String(state.page * 12 + i + 1).padStart(2, '0')}</span><div><h2>${escape(e.name.replaceAll('-', ' '))}</h2><span>${escape(e.tag)}</span></div></div><div class="example-open">Edit code & explore <span>↗</span></div></a>`;
     })
     .join('') ||
   '<div class="empty"><h2>No examples found.</h2><p>Try a different name or family.</p><button id="clear-search" class="button">Reset filters</button></div>'
 }</div>
 <div class="pagination"><span>${filtered.length} examples · Page ${state.page + 1} of ${pages}</span><div><button data-page="-1" ${state.page === 0 ? 'disabled' : ''}>← Previous</button><button data-page="1" ${state.page === pages - 1 ? 'disabled' : ''}>Next →</button></div></div>
 ${exampleIndex()}<section class="text-playground panel"><div><p class="eyebrow">TRY THE LETTERING</p><h2>Find your own words.</h2><p>Measured and drawn with @borrowdale/text.</p></div><label>Your text<input id="live-text" value="Hello, BorrowdaleJS!" maxlength="100"></label><label>Size <input id="live-size" type="range" min="16" max="64" value="36"></label><div id="live-text-output"></div><details><summary>View code</summary><div id="live-text-code"></div></details></section>`;
}
