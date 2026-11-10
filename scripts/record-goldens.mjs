// Records the golden files from freshly built packages: `npm run goldens` (builds first).
// Usage: node scripts/record-goldens.mjs [core] [fills] [text] [charts]   (every package when none is named)
//
// Two uses, and they are not interchangeable:
// 1. A DELIBERATE output change in this repo: run `npm run goldens` and review the diff of every
//    golden that moves. The recording comes from this repo's own engine.
// 2. ADDING corpus cases that must prove fidelity to rough.js 4.6.6: record them from the last
//    commit that still depended on rough.js, never from this engine:
//      git archive c89cb6ab | tar -x -C <empty dir>; cd <empty dir>; npm ci; npm run build
//      copy scripts/record-goldens.mjs and the core and fills test/golden/corpus.json files into it
//      in those copies, rename dashLength, zigzagWidth and the 'cross-hatch' pattern kind back to
//        dashOffset, zigzagOffset and 'crosshatch': rough.js ignores names it does not know
//      node scripts/record-goldens.mjs core fills, then copy both goldens.json files back
//      then record fills again here (use 1): a pattern's id comes from its kind, so the cross-hatch
//        ids change with the name, and only their strokes come from rough.js
//    Then run the tests here: any failing case is a port bug.
// Text and charts goldens have no rough.js origin: they only ever come from use 1. Each package is imported
// only when it is recorded, so the script runs in a checkout that lacks the others.
import { readFileSync, writeFileSync } from 'node:fs';

const record = (dir, render, additional = []) => {
  const corpus = JSON.parse(readFileSync(new URL(`${dir}/corpus.json`, import.meta.url), 'utf8'));
  const goldens = Object.fromEntries([...corpus, ...additional].map((entry) => [entry.name, render(entry)]));
  writeFileSync(new URL(`${dir}/goldens.json`, import.meta.url), `${JSON.stringify(goldens, null, 1)}\n`);
  console.log(`${dir}: ${corpus.length + additional.length} goldens`);
};

const recorders = {
  async core() {
    const { sketch } = await import('@borrowdale/core');
    record('../packages/core/test/golden', ({ shape, options }) => sketch(shape, options));
  },
  async fills() {
    const { pattern } = await import('@borrowdale/fills');
    record('../packages/fills/test/golden', ({ options }) => pattern(options));
  },
  async text() {
    const { layoutText, toSvgText } = await import('@borrowdale/text');
    record('../packages/text/test/golden', ({ text, options, style }) => {
      const layout = layoutText(text, options);
      return { ...layout, svg: toSvgText(layout, style) };
    });
  },
  async charts() {
    const { layoutChart, toSvgChart } = await import('@borrowdale/charts');
    const { default: examples } = await import('../apps/examples/statistical-cases.json', { with: { type: 'json' } });
    record('../packages/charts/test/golden', ({ spec }) => {
      const layout = layoutChart(spec);
      return { svg: toSvgChart(layout), missing: layout.missing };
    }, examples);
  },
};

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(recorders);
// Every name is checked before anything is recorded, so a typo never leaves half the goldens rewritten.
const unknown = names.filter((name) => !Object.hasOwn(recorders, name));
if (unknown.length > 0) {
  throw new Error(`Unknown package: ${unknown.join(', ')}. Choose from: ${Object.keys(recorders).join(', ')}`);
}
for (const name of names) {
  await recorders[name]();
}
