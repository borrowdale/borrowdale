// Records the golden files from freshly built packages: `npm run goldens` (builds first).
//
// Two uses, and they are not interchangeable:
// 1. A DELIBERATE output change in this repo: run `npm run goldens` and review the diff of every
//    golden that moves. The recording comes from this repo's own engine.
// 2. ADDING corpus cases that must prove fidelity to rough.js 4.6.6: record them from the last
//    commit that still depended on rough.js, never from this engine:
//      git archive c89cb6ab | tar -x -C <empty dir>; cd <empty dir>; npm ci; npm run build
//      copy scripts/record-goldens.mjs and both test/golden/corpus.json files into it
//      node scripts/record-goldens.mjs, then copy both goldens.json files back
//    Then run the tests here: any failing case is a port bug.
import { readFileSync, writeFileSync } from 'node:fs';
import { sketch } from '@borrowdale/core';
import { pattern } from '@borrowdale/fills';

const record = (dir, render) => {
  const corpus = JSON.parse(readFileSync(new URL(`${dir}/corpus.json`, import.meta.url), 'utf8'));
  const goldens = Object.fromEntries(corpus.map((entry) => [entry.name, render(entry)]));
  writeFileSync(new URL(`${dir}/goldens.json`, import.meta.url), `${JSON.stringify(goldens, null, 1)}\n`);
  console.log(`${dir}: ${corpus.length} goldens`);
};

record('../packages/core/test/golden', ({ shape, options }) => sketch(shape, options));
record('../packages/fills/test/golden', ({ options }) => pattern(options));
