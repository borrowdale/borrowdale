import coreCases from '../../../packages/core/test/golden/corpus.json';
import chartCases from '../../../packages/charts/test/golden/corpus.json';
import textCases from '../../../packages/text/test/golden/corpus.json';
import fillCases from '../../../packages/fills/test/golden/corpus.json';
import type { Shape, SketchOptions } from '@borrowdale/core';
import type { ChartSpec } from '@borrowdale/charts';
import type { LayoutOptions } from '@borrowdale/text';
import type { PatternOptions } from '@borrowdale/fills';
import { chart, shapeSvg, textSvg, patternSvg, scribble, escape, seed } from './drawing';
export type Category = 'charts' | 'shapes' | 'text' | 'patterns' | 'components';
export type Example = { name: string; category: Category; tag: string; families?: string[]; render: (renderer: 'svg' | 'canvas') => string; code: () => string };
const json = (x: unknown) => JSON.stringify(x, null, 2);
export function codeBlock(code: string) {
  return `<div class="code-block"><div class="code-bar"><span>JavaScript · workspace imports</span><button class="copy-code" type="button">Copy code</button></div><pre><code>${escape(code)}</code></pre></div>`;
}
export function chartCode(spec: ChartSpec, renderer: 'svg' | 'canvas' = 'svg') {
  return renderer === 'svg'
    ? `import { layoutChart, toSvgChart } from '@borrowdale/charts';\nimport { excalifontFiles } from '@borrowdale/text/excalifont-files';\n\nconst spec = ${json({ ...spec, seed })};\nconst svg = toSvgChart(layoutChart(spec), { fontFiles: excalifontFiles });\ndocument.querySelector('#chart').innerHTML = svg;`
    : `import { layoutChart, drawChart } from '@borrowdale/charts';\nimport { loadFont } from '@borrowdale/text';\nimport { excalifontFiles } from '@borrowdale/text/excalifont-files';\n\nconst spec = ${json({ ...spec, seed })};\nawait loadFont(document.fonts, excalifontFiles);\nconst canvas = document.querySelector('canvas');\ncanvas.width = spec.width;\ncanvas.height = spec.height;\ndrawChart(canvas.getContext('2d'), layoutChart(spec));`;
}
const shapes: Example[] = coreCases.map(e => ({ name: e.name, category: 'shapes', tag: e.shape.kind,
  render: () => shapeSvg(e.shape as Shape, e.options as SketchOptions, 300, 180, true),
  code: () => `import { sketch, toSvgDocument, toSvgPaths } from '@borrowdale/core';\n\nconst shape = ${json(e.shape)};\nconst options = ${json({seed,...e.options})};\nconst svg = toSvgDocument({ width: 300, height: 240,\n  body: [toSvgPaths(sketch(shape, options))] });\n// Set a suitable viewBox when drawing beyond this viewport.\ndocument.querySelector('#drawing').innerHTML = svg;` }));
const charts: Example[] = chartCases.map(e => ({ name: e.name, category: 'charts', tag: [...new Set(e.spec.series.map(s=>s.type))].join(' + '), families: [...new Set(e.spec.series.map(s=>s.type))],
  render: renderer => chart(e.spec as ChartSpec, renderer), code: () => chartCode(e.spec as ChartSpec) }));
const texts: Example[] = textCases.map(e => ({ name: e.name, category: 'text', tag: e.name.startsWith('every-') ? 'character sets' : 'layout',
  render: () => { const t = textSvg(e.text, e.options as LayoutOptions); return `${t.svg}${t.missing.length ? `<span class="fallback-note">Fallback glyphs: ${escape(t.missing.join(' '))}</span>` : ''}`; },
  code: () => `import { layoutText, textBounds, toSvgText, fontFaceCss } from '@borrowdale/text';\nimport { excalifontFiles } from '@borrowdale/text/excalifont-files';\n\nconst label = layoutText(${json(e.text)}, ${json(e.options)});\nconst b = textBounds(label);\nconst style = document.createElement('style');\nstyle.textContent = fontFaceCss(excalifontFiles, [label.text]);\ndocument.head.append(style);\ndocument.querySelector('#label').innerHTML =\n  \`<svg viewBox="\${b.x-12} \${b.y-12} \${b.width+24} \${b.height+24}">\${toSvgText(label)}</svg>\`;\nconsole.log(label.missing); // Check uncovered glyphs.` }));
const patterns: Example[] = fillCases.map(e => ({ name: e.name, category: 'patterns', tag: e.options.kind,
  render: () => patternSvg(e.options as PatternOptions), code: () => `import { pattern } from '@borrowdale/fills';\n\nconst tile = pattern(${json(e.options)});\ndocument.querySelector('#pattern').innerHTML =\n  \`<svg viewBox="0 0 300 160"><defs>\${tile.def}</defs>\n  <rect width="300" height="160" fill="\${tile.fill}"/></svg>\`;` }));
const recipes = [
  { name: 'Primary action', tag: 'button', html: () => `<button class="sketch-button recipe-action">${scribble()}<span>Make something ↗</span></button>` },
  { name: 'Choice controls', tag: 'checkbox', html: () => `<fieldset class="recipe-choices"><legend>Layers</legend><label><input type="checkbox" checked> Show labels</label><label><input type="checkbox"> Show grid</label></fieldset>` },
  { name: 'Segmented control', tag: 'radio', html: () => `<fieldset class="recipe-segments"><legend>Range</legend>${['Week','Month','Year'].map((x,i) => `<label><input type="radio" name="range" ${i===0?'checked':''}><span>${x}</span></label>`).join('')}</fieldset>` },
  { name: 'Metric card', tag: 'card', html: () => `<div class="recipe-metric">${scribble(260,145,'#f5e9c4')}<div><small>Sketches made</small><strong>12,480</strong><span>↑ 18% this month · sample data</span></div></div>` },
  { name: 'Status chips', tag: 'badge', html: () => `<div class="recipe-badges">${['Ready','In progress','Draft'].map((x,i)=>`<span>${scribble(120,44,['#dfebd9','#f5df9c','#e3e5ec'][i])}<b>${x}</b></span>`).join('')}</div>` },
  { name: 'Progress indicator', tag: 'progress', html: () => `<div class="recipe-progress"><label>Collection complete <span>68%</span></label><progress max="100" value="68">68%</progress></div>` },
  { name: 'Note & disclosure', tag: 'disclosure', html: () => `<details class="recipe-note"><summary>A small observation</summary><p>Data can feel human without losing its precision.</p></details>` },
  { name: 'Form field', tag: 'input', html: () => `<label class="recipe-input">Name your collection<input placeholder="A new perspective…" maxlength="80"></label>` },
];
const components: Example[] = recipes.map(e=>({name:e.name,tag:e.tag,category:'components',render:e.html,code:()=>`// A demo UI recipe, not an exported component API.\n// Semantic native HTML provides keyboard and focus behavior.\nimport { sketch, toSvgPaths } from '@borrowdale/core';\n\nconst ink = sketch(\n  { kind: 'rectangle', x: 3, y: 3, width: 254, height: 58 },\n  { fill: '#f0c557', fillStyle: 'solid', roughness: 0.8, seed: ${seed} }\n);\nconst background = \`<svg viewBox="0 0 260 64" aria-hidden="true">\${toSvgPaths(ink)}</svg>\`;\n// This recipe's rendered HTML (style with apps/demo/src/style.css):\nconst html = ${json(e.html())};\ndocument.querySelector('#component').innerHTML = html;`}));
export const examples: Example[] = [...charts, ...shapes, ...texts, ...patterns, ...components];
export const categories: Category[] = ['charts','shapes','text','patterns','components'];
export const galleryState = { category: 'charts' as Category, search: '', tag: 'all', page: 0, renderer: 'svg' as 'svg'|'canvas' };
function exampleIndex(){return `<details class="example-index"><summary>Browse all ${examples.length} playgrounds</summary>${categories.map(category=>`<section><h2>${category}</h2><ul>${examples.filter(e=>e.category===category).map(e=>`<li><a href="#example/${e.category}/${encodeURIComponent(e.name)}">${escape(e.name.replaceAll('-',' '))}</a></li>`).join('')}</ul></section>`).join('')}</details>`;}
export function gallery() {
 const state=galleryState;
 const tags=[...new Set(examples.filter(x=>x.category===state.category).flatMap(x=>x.families??[x.tag]))];
 const filtered=examples.filter(x=>x.category===state.category && (state.tag==='all'||(x.families??[x.tag]).includes(state.tag)) && `${x.name} ${x.tag}`.toLowerCase().includes(state.search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/12)); state.page=Math.min(state.page,pages-1);
 const visible=filtered.slice(state.page*12,state.page*12+12);
 return `<section class="page-heading"><p class="eyebrow">THE PLAYGROUND / ${examples.length} EXAMPLES</p><h1>A mark for every idea.</h1><p>Explore every reference example, then take the code and make it yours.<br>Real BorrowdaleJS output. No screenshot stand-ins.</p></section>
 <div class="gallery-tools"><div class="tabs" role="group" aria-label="Example category">${categories.map(c=>`<button data-category="${c}" class="${c===state.category?'selected':''}" aria-pressed="${c===state.category}">${c[0].toUpperCase()+c.slice(1)} <small>${examples.filter(e=>e.category===c).length}</small></button>`).join('')}</div>
 <div class="filter-row"><label class="search">⌕ <input id="gallery-search" type="search" placeholder="Find an example…" aria-label="Search examples" value="${escape(state.search)}"></label><label>Family <select id="gallery-family"><option value="all">All families</option>${tags.map(t=>`<option ${state.tag===t?'selected':''}>${escape(t)}</option>`).join('')}</select></label>${state.category==='charts'?`<label>Render <select id="gallery-renderer"><option value="svg" ${state.renderer==='svg'?'selected':''}>SVG</option><option value="canvas" ${state.renderer==='canvas'?'selected':''}>Canvas</option></select></label>`:''}</div></div>
 <p class="gallery-note">${state.category==='components'?'UI recipes built with BorrowdaleJS primitives and native HTML—not a separate component package.':state.category==='text'?'Includes anchors, baselines, rotation, character sets, normalization and explicit fallback cases.': 'Reference fixtures cover supported families and edge cases. Numeric and style combinations are open-ended.'}</p>
 <div class="gallery-grid">${visible.map((e,i)=>{ let preview:string;try{preview=e.render(state.renderer);}catch(error){preview=`<p class="render-error">${escape(error)}</p>`;}return `<a class="example-card" href="#example/${e.category}/${encodeURIComponent(e.name)}" aria-label="Open ${escape(e.name.replaceAll('-',' '))} playground"><div class="example-preview ${state.category}" inert aria-hidden="true">${preview}</div><div class="example-caption"><span class="example-number">${String(state.page*12+i+1).padStart(2,'0')}</span><div><h2>${escape(e.name.replaceAll('-',' '))}</h2><span>${escape(e.tag)}</span></div></div><div class="example-open">Edit code & explore <span>↗</span></div></a>`;}).join('')||'<div class="empty"><h2>No examples found.</h2><p>Try a different name or family.</p><button id="clear-search" class="button">Reset filters</button></div>'}</div>
 <div class="pagination"><span>${filtered.length} examples · Page ${state.page+1} of ${pages}</span><div><button data-page="-1" ${state.page===0?'disabled':''}>← Previous</button><button data-page="1" ${state.page===pages-1?'disabled':''}>Next →</button></div></div>
 ${exampleIndex()}<section class="text-playground panel"><div><p class="eyebrow">TRY THE LETTERING</p><h2>Find your own words.</h2><p>Measured and drawn with @borrowdale/text.</p></div><label>Your text<input id="live-text" value="Hello, BorrowdaleJS!" maxlength="100"></label><label>Size <input id="live-size" type="range" min="16" max="64" value="36"></label><div id="live-text-output"></div><details><summary>View code</summary><div id="live-text-code"></div></details></section>`;
}
