// Draws a hand-drawn bar chart's axes and labels with no DOM, and prints the SVG's SHA-256.
// Usage: node apps/examples/text.mjs [seed]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sketch, svgElement, toSvgDocument, toSvgPaths } from '@borrowdale/core';
import { fontFaceCss, layoutText, measureText, toSvgText } from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

const seed = process.argv[2] ?? 'borrowdale';
const ink = { stroke: '#2b2b2b', strokeWidth: 1.5 };
const width = 420;
const height = 300;
const top = 50;
const bottom = 210;
const ticks = [0, 2500, 5000, 7500, 10000, 12500];
const cities = [
  { name: 'Zürich', value: 7200 },
  { name: 'Łódź', value: 4100 },
  { name: 'São Paulo', value: 12500 },
  { name: 'Αθήνα', value: 5300 },
  { name: 'Київ', value: 9800 },
];
const maxTick = ticks.at(-1);
const yOf = (value) => bottom - ((bottom - top) * value) / maxTick;
// Thousands separated by commas, without the locale data `toLocaleString` would depend on.
const tickText = (value) => String(value).replace(/\B(?=(\d{3})+$)/g, ',');

// Every tick label is measured before it is drawn, so the axis can sit `gap` units right of the
// widest one and no label ever overlaps it.
const gap = 6;
const labelWidth = Math.max(...ticks.map((value) => measureText(tickText(value), { fontSize: 12 }).width));
const axisX = 10 + labelWidth + gap;
const slot = (width - axisX - 10) / cities.length;

const labels = [
  layoutText('Visitors per city', { x: width / 2, y: 10, fontSize: 20, anchor: 'middle', baseline: 'top' }),
  ...ticks.map((value) =>
    layoutText(tickText(value), { x: axisX - gap, y: yOf(value), fontSize: 12, anchor: 'end', baseline: 'middle' }),
  ),
  ...cities.map(({ name }, index) =>
    layoutText(name, { x: axisX + slot * (index + 0.5), y: bottom + 8, fontSize: 12, anchor: 'end', baseline: 'top', rotate: -45 }),
  ),
];

const shapes = [
  sketch({ kind: 'line', x1: axisX, y1: top - 10, x2: axisX, y2: bottom }, { ...ink, seed: `${seed}:y-axis` }),
  sketch({ kind: 'line', x1: axisX, y1: bottom, x2: width - 10, y2: bottom }, { ...ink, seed: `${seed}:x-axis` }),
  ...ticks.map((value) =>
    sketch({ kind: 'line', x1: axisX - 4, y1: yOf(value), x2: axisX, y2: yOf(value) }, { ...ink, seed: `${seed}:tick:${value}` }),
  ),
  ...cities.map(({ name, value }, index) =>
    sketch(
      { kind: 'rectangle', x: axisX + slot * index + slot * 0.2, y: yOf(value), width: slot * 0.6, height: bottom - yOf(value) },
      { ...ink, fill: '#2a9d8f', fillStyle: 'hachure', seed: `${seed}:bar:${name}` },
    ),
  ),
];

const svg = toSvgDocument({
  width,
  height,
  // Only the font files these labels use: Latin, Latin Extended, Greek and Cyrillic.
  defs: [svgElement('style', {}, fontFaceCss(excalifontFiles, labels.map(({ text }) => text).join(' ')))],
  body: [
    svgElement('rect', { width, height, fill: '#fdf8ef' }),
    ...shapes.map(toSvgPaths),
    ...labels.map((label) => toSvgText(label, { fill: '#2b2b2b' })),
  ],
});

const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('text.svg', outDir), svg);
console.log(createHash('sha256').update(svg).digest('hex'));
