// Renders a hand-drawn scene with no DOM and prints its SHA-256.
// Usage: node apps/examples/core-and-fills.mjs [seed]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sketch, svgElement, toSvgDocument, toSvgSketch } from '@borrowdale/core';
import { pattern } from '@borrowdale/fills';

const seed = process.argv[2] ?? 'borrowdale';
const paper = pattern({ kind: 'lines', size: 12, stroke: '#d8cfc0', background: '#fdf8ef', seed });
const ink = { stroke: '#2b2b2b', strokeWidth: 1.5 };

const svg = toSvgDocument({
  width: 360,
  height: 220,
  defs: [paper.def],
  body: [
    svgElement('rect', { width: 360, height: 220, fill: paper.fill }),
    toSvgSketch(sketch({ kind: 'rectangle', x: 20, y: 20, width: 100, height: 70 }, { ...ink, fill: '#e76f51', seed: `${seed}:rectangle` })),
    toSvgSketch(sketch({ kind: 'ellipse', cx: 200, cy: 55, width: 100, height: 60 }, { ...ink, fill: '#2a9d8f', fillStyle: 'cross-hatch', seed: `${seed}:ellipse` })),
    toSvgSketch(sketch({ kind: 'line', x1: 260, y1: 30, x2: 340, y2: 90 }, { ...ink, seed: `${seed}:line` })),
    toSvgSketch(sketch({ kind: 'polygon', points: [[30, 200], [90, 120], [150, 200]] }, { ...ink, fill: '#e9c46a', fillStyle: 'zigzag', seed: `${seed}:polygon` })),
    toSvgSketch(sketch({ kind: 'path', d: 'M180 190 C 220 110, 280 230, 340 140' }, { ...ink, seed: `${seed}:path` })),
  ],
});

const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('core-and-fills.svg', outDir), svg);
console.log(createHash('sha256').update(svg).digest('hex'));
