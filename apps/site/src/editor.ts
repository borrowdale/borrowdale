import { localPath, siteUrl, examplePath, exampleSlug } from './routing';
import type { ChartSpec } from '@borrowdale/charts';
import { fontFaceCss } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import style from './style.css?inline';
import { examples, type Example } from './gallery';
import chartCases from '../../../packages/charts/test/golden/corpus.json';
import coreCases from '../../../packages/core/test/golden/corpus.json';
import textCases from '../../../packages/text/test/golden/corpus.json';
import fillCases from '../../../packages/fills/test/golden/corpus.json';
import { escape, seed } from './drawing';
export const exampleLink = (example: Example) => siteUrl(examplePath(example));
const drafts = new Map<string, string>();
let worker: Worker | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
export function stopEditor() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timeout);
  clearTimeout(debounce);
}
export function findExample(path = location.pathname) {
  const [, category, ...name] = localPath(path).split('/').filter(Boolean);
  try {
    return examples.find(
      (e) =>
        e.category === category &&
        (e.name === decodeURIComponent(name.join('/')) || exampleSlug(e.name) === name.join('/')),
    );
  } catch {
    return undefined;
  }
}
const json = (x: unknown) => JSON.stringify(x, null, 2);
export function editorCode(e: Example) {
  if (e.category === 'charts') {
    const spec = chartCases.find((x) => x.name === e.name)!.spec as ChartSpec;
    return `import { layoutChart, toSvgChart } from '@borrowdale/charts';\nimport { excalifontFiles } from '@borrowdale/text/excalifont-files';\n\nconst spec = ${json({ ...spec, seed })};\n\nconst svg = toSvgChart(layoutChart(spec), { fontFiles: excalifontFiles });\nrender(svg);`;
  }
  if (e.category === 'shapes') {
    const entry = coreCases.find((x) => x.name === e.name)!;
    return `import { sketch, toSvgPaths } from '@borrowdale/core';\n\nconst shape = ${json(entry.shape)};\nconst options = ${json({ seed, ...entry.options })};\n\nconst drawing = sketch(shape, options);\nrender(\`<svg data-fit viewBox="0 0 300 240">\${toSvgPaths(drawing)}</svg>\`);\n// data-fit fits the preview to the drawn strokes.`;
  }
  if (e.category === 'text') {
    const entry = textCases.find((x) => x.name === e.name)!;
    return `import { layoutText, textBounds, toSvgText } from '@borrowdale/text';\n\nconst label = layoutText(${json(entry.text)}, ${json(entry.options)});\nconst b = textBounds(label);\n\nrender(\`<svg viewBox="\${b.x-12} \${b.y-12} \${Math.max(b.width+24,40)} \${Math.max(b.height+24,40)}">\${toSvgText(label)}</svg>\`);\n// Excalifont is loaded in the preview. Check label.missing for fallback glyphs.`;
  }
  if (e.category === 'patterns') {
    const entry = fillCases.find((x) => x.name === e.name)!;
    return `import { pattern } from '@borrowdale/fills';\n\nconst options = ${json(entry.options)};\nconst tile = pattern(options);\n\nrender(\`<svg viewBox="0 0 300 200"><defs>\${tile.def}</defs>\n  <rect width="300" height="200" fill="\${tile.fill}"/>\n</svg>\`);`;
  }
  return componentCode(e);
}
function componentCode(e: Example) {
  const templates: Record<string, string> = {
    button: '<button class="sketch-button">${frame(260,64,"#f0c557")}<span>Make something ↗</span></button>',
    checkbox:
      '<fieldset class="recipe-choices"><legend>Layers</legend><label><input type="checkbox" checked> Show labels</label><label><input type="checkbox"> Show grid</label></fieldset>',
    radio:
      '<fieldset class="recipe-segments"><legend>Range</legend><label><input type="radio" name="range" checked><span>Week</span></label><label><input type="radio" name="range"><span>Month</span></label><label><input type="radio" name="range"><span>Year</span></label></fieldset>',
    card: '<div class="recipe-metric">${frame(260,145,"#f5e9c4")}<div><small>Sketches made</small><strong>12,480</strong><span>↑ 18% this month · sample data</span></div></div>',
    badge:
      '<div class="recipe-badges"><span>${frame(120,44,"#dfebd9")}<b>Ready</b></span><span>${frame(120,44,"#f5df9c")}<b>In progress</b></span><span>${frame(120,44,"#e3e5ec")}<b>Draft</b></span></div>',
    progress:
      '<div class="recipe-progress"><label>Collection complete <span>68%</span></label><progress max="100" value="68">68%</progress></div>',
    disclosure:
      '<details class="recipe-note"><summary>A small observation</summary><p>Data can feel human without losing its precision.</p></details>',
    input:
      '<label class="recipe-input">Name your collection<input placeholder="A new perspective…" maxlength="80"></label>',
  };
  return `// UI recipe: native HTML + BorrowdaleJS drawing primitives.\n// Preview includes the site stylesheet and Excalifont.\nimport { sketch, toSvgPaths } from '@borrowdale/core';\n\nfunction frame(width, height, fill) {\n  const drawing = sketch(\n    { kind: 'rectangle', x: 3, y: 3, width: width-6, height: height-6 },\n    { seed: ${seed}, fill, fillStyle: 'solid', roughness: 0.8 }\n  );\n  return \`<svg viewBox="0 0 \${width} \${height}" aria-hidden="true">\${toSvgPaths(drawing)}</svg>\`;\n}\n\nrender(\`${templates[e.tag]}\`);`;
}
export function editorPage(path = location.pathname) {
  const e = findExample(path);
  if (!e)
    return '<section class="empty"><h1>Example not found.</h1><a href="#gallery">Back to the collection →</a></section>';
  return `<section class="editor-heading"><div><a class="eyebrow" href="#gallery?category=${e.category}">← BACK TO ${e.category.toUpperCase()}</a><h1>${escape(e.name.replaceAll('-', ' '))}</h1><p>Edit the JavaScript. Run it. See your drawing take shape.</p></div><span class="editor-family">${escape(e.tag)}</span></section>
  <div class="playground"><section class="editor-code-panel" aria-label="Code editor"><header><span>JAVASCRIPT</span><div><button id="editor-reset">Reset</button><button id="editor-copy">Copy</button><button id="editor-run" class="run-button">Run ↗</button></div></header><textarea id="editor-source" aria-label="Example JavaScript code" spellcheck="false" autocapitalize="off" autocorrect="off">${escape(drafts.get(exampleLink(e)) ?? editorCode(e))}</textarea><footer><label><input type="checkbox" id="editor-auto" checked> Auto-run</label><span>⌘ / Ctrl + Enter to run · + ] to indent</span></footer></section>
  <section class="editor-preview-panel" aria-label="Live preview"><header><span>LIVE PREVIEW</span><span id="editor-status" role="status">Preparing…</span></header><iframe id="editor-preview" title="BorrowdaleJS live drawing" sandbox=""></iframe><pre id="editor-error" role="alert" hidden></pre><footer>Rendered by the local BorrowdaleJS packages</footer></section></div>
  <p class="editor-help">Named imports from the four BorrowdaleJS packages are available. Call <code>render(svg)</code> to show the result. The preview loads Excalifont. In your app, put the SVG in a container. Drafts stay in memory while you browse; Reset restores the example. Execution stops after 3 seconds.</p>`;
}
function previewDocument(output: string) {
  // The iframe has no script, same-origin, form, navigation or popup permissions.
  // CSP also prevents network access from arbitrary markup produced by edited code.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><style>${fontFaceCss(excalifontFiles)}${style}\nhtml,body{margin:0;width:100%;height:100%;background:#fffefa}body{display:grid;place-items:center;padding:25px;overflow:auto}body>svg{width:100%;height:100%;max-height:100%;min-width:0}body>.recipe-note{max-width:340px}</style></head><body>${output}</body></html>`;
}
export function bindEditor() {
  const source = document.getElementById('editor-source') as HTMLTextAreaElement | null;
  const example = findExample();
  if (!source || !example) return;
  const status = document.getElementById('editor-status')!;
  const error = document.getElementById('editor-error')!;
  const run = () => {
    stopEditor();
    drafts.set(exampleLink(example), source.value);
    status.textContent = 'Drawing…';
    error.hidden = true;
    worker = new Worker(new URL('./playground.worker.ts', import.meta.url), { type: 'module' });
    const current = worker;
    const fail = (message: string) => {
      current.terminate();
      clearTimeout(timeout);
      status.textContent = 'Check your code';
      error.textContent = message;
      error.hidden = false;
    };
    timeout = setTimeout(
      () =>
        fail('Execution stopped after 3 seconds. Check for an infinite loop or reduce the drawing workload.'),
      3000,
    );
    current.onerror = (event) => fail(event.message);
    current.onmessage = (event) => {
      current.terminate();
      clearTimeout(timeout);
      if (!event.data.ok) {
        fail(event.data.error);
        return;
      }
      let output: string = event.data.output;
      // Core sketches contain cubic paths. Bound their control points conservatively without
      // executing or inserting user markup into the parent document.
      const parsed = new DOMParser().parseFromString(output, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (svg.localName === 'svg' && svg.hasAttribute('data-fit')) {
        const xs: number[] = [],
          ys: number[] = [];
        for (const path of svg.querySelectorAll('path')) {
          const n =
            (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
          for (let i = 0; i + 1 < n.length; i += 2) {
            xs.push(n[i]);
            ys.push(n[i + 1]);
          }
        }
        if (xs.length) {
          // Reduce avoids argument-limit failures on large paths.
          const loX = xs.reduce((a, b) => Math.min(a, b)),
            hiX = xs.reduce((a, b) => Math.max(a, b));
          const loY = ys.reduce((a, b) => Math.min(a, b)),
            hiY = ys.reduce((a, b) => Math.max(a, b));
          svg.setAttribute(
            'viewBox',
            `${loX - 8} ${loY - 8} ${Math.max(16, hiX - loX + 16)} ${Math.max(16, hiY - loY + 16)}`,
          );
          output = new XMLSerializer().serializeToString(svg);
        }
      }
      (document.getElementById('editor-preview') as HTMLIFrameElement).srcdoc = previewDocument(output);
      status.textContent = 'Up to date';
    };
    current.postMessage({ code: source.value });
  };
  document.getElementById('editor-run')!.onclick = run;
  document.getElementById('editor-reset')!.onclick = () => {
    source.value = editorCode(example);
    run();
  };
  document.getElementById('editor-copy')!.onclick = async () => {
    try {
      await navigator.clipboard.writeText(source.value);
      status.textContent = 'Code copied';
    } catch {
      source.select();
      status.textContent = 'Select and copy the code';
    }
  };
  const auto = document.getElementById('editor-auto') as HTMLInputElement;
  auto.onchange = () => {
    clearTimeout(debounce);
    if (auto.checked) run();
    else status.textContent = 'Auto-run paused';
  };
  source.oninput = () => {
    drafts.set(exampleLink(example), source.value);
    clearTimeout(debounce);
    if ((document.getElementById('editor-auto') as HTMLInputElement).checked)
      debounce = setTimeout(() => {
        if (auto.checked) run();
      }, 650);
    else status.textContent = 'Changes not run';
  };
  source.onkeydown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      run();
    }
    if (event.key === ']' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end');
      source.dispatchEvent(new Event('input'));
    }
  };
  run();
}
