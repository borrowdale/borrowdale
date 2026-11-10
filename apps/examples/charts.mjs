// Lays out one chart of each kind with no DOM, writes each as an SVG with its font embedded, and
// prints each file's SHA-256.
// Usage: node apps/examples/charts.mjs [seed]
import statisticalCases from './statistical-cases.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutChart, toSvgChart } from '@borrowdale/charts';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';

const seed = process.argv[2] ?? 'borrowdale';
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

const charts = {
  combo: {
    width: 640,
    height: 400,
    title: 'Revenue by month',
    axes: {
      x: { type: 'band', categories: months },
      y: { type: 'linear', title: 'Revenue', format: { prefix: '€' } },
      y2: { type: 'linear', title: 'Target' },
    },
    series: [
      { type: 'bar', name: 'Pencils', data: [12, 15, 9, 14, 18, 21] },
      { type: 'bar', name: 'Paper', data: [7, 8, 11, 9, 6, 10] },
      { type: 'bar', name: 'Ink', data: [3, 4, 2, 5, 4, 6] },
      { type: 'line', name: 'Target', axis: 'y2', curve: 'monotone', dash: [6, 4], data: [25, 25, 30, 30, 35, 40] },
    ],
  },
  stacked: {
    width: 480,
    height: 320,
    title: 'Share of sales',
    axes: { x: { type: 'linear', percent: true }, y: { type: 'band', categories: ['North', 'South', 'East', 'West'] } },
    series: [
      { type: 'bar', name: 'Online', stack: 'all', data: [40, 25, 30, 55] },
      { type: 'bar', name: 'Shops', stack: 'all', data: [35, 50, 45, 30] },
      { type: 'bar', name: 'Post', stack: 'all', data: [25, 25, 25, 15] },
    ],
  },
  areas: {
    width: 480,
    height: 320,
    title: 'Visitors',
    axes: { x: { type: 'band', categories: months }, y: { type: 'linear' } },
    series: [
      { type: 'area', name: 'New', stack: 'v', curve: 'monotone', data: [120, 180, 150, 210, 260, 240] },
      { type: 'area', name: 'Returning', stack: 'v', curve: 'monotone', data: [80, 90, 140, 130, 170, 220] },
      { type: 'line', name: 'Goal', curve: 'step', data: [250, 250, 300, 300, 400, 400] },
    ],
  },
  scatter: {
    width: 480,
    height: 320,
    title: 'Height and weight',
    axes: { x: { type: 'linear', title: 'Height (cm)' }, y: { type: 'linear', title: 'Weight (kg)' } },
    series: [
      { type: 'scatter', name: 'Group A', data: [[160, 55], [165, 61], [170, 66], [175, 72], [182, 80]] },
      { type: 'bubble', name: 'Group B', data: [[158, 70, 3], [168, 64, 8], [178, 75, 5], [186, 88, 12]] },
    ],
  },
  donut: {
    width: 360,
    height: 260,
    title: 'Energy mix',
    legend: 'right',
    series: [
      {
        type: 'pie',
        name: 'Mix',
        innerRadius: 0.5,
        startAngle: -90,
        endAngle: 90,
        data: [
          { name: 'Wind', value: 34 },
          { name: 'Solar', value: 21 },
          { name: 'Hydro', value: 18 },
          { name: 'Gas', value: 27 },
        ],
      },
    ],
  },
  pie: {
    width: 360,
    height: 260,
    title: 'Fruit',
    legend: 'right',
    series: [
      {
        type: 'pie',
        name: 'Fruit',
        data: [
          { name: 'Apples', value: 5 },
          { name: 'Pears', value: 3 },
          { name: 'Plums', value: 2 },
        ],
      },
    ],
  },
  radar: {
    width: 420,
    height: 360,
    title: 'Skills',
    axes: { angle: { type: 'band', categories: ['Speed', 'Power', 'Range', 'Control', 'Stamina'] } },
    series: [
      { type: 'radar', name: 'Ada', data: [8, 6, 7, 9, 5] },
      { type: 'radar', name: 'Bo', data: [5, 9, 6, 4, 8] },
    ],
  },
  rose: {
    width: 420,
    height: 400,
    title: 'Wind by direction',
    axes: { angle: { type: 'band', categories: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] } },
    series: [
      { type: 'rose', name: 'Calm', stack: 'wind', data: [4, 3, 2, 2, 3, 5, 6, 5] },
      { type: 'rose', name: 'Breezy', stack: 'wind', data: [3, 2, 1, 2, 2, 4, 5, 4] },
      { type: 'rose', name: 'Gale', stack: 'wind', data: [1, 1, 0, 1, 1, 2, 3, 2] },
    ],
  },
  radialBar: {
    width: 420,
    height: 400,
    title: 'Goals reached',
    axes: {
      angle: { type: 'linear', max: 100, endAngle: 270, format: { suffix: '%' } },
      radius: { type: 'band', categories: ['Move', 'Exercise', 'Stand'], innerRadius: 0.3 },
    },
    series: [{ type: 'radialBar', name: 'Today', data: [82, 45, 67] }],
  },
  polarLine: {
    width: 420,
    height: 400,
    title: 'Temperature by month',
    axes: {
      angle: { type: 'band', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
      radius: { type: 'linear', format: { suffix: '°' } },
    },
    series: [
      { type: 'polarArea', name: 'High', data: [6, 7, 10, 13, 17, 20, 22, 22, 19, 14, 9, 7] },
      { type: 'polarLine', name: 'Low', dash: [5, 3], data: [1, 1, 3, 5, 8, 11, 13, 13, 10, 7, 4, 2] },
    ],
  },
  polarScatter: {
    width: 420,
    height: 400,
    title: 'Sightings',
    axes: { angle: { type: 'linear', min: 0, max: 360 }, radius: { type: 'linear' } },
    series: [
      { type: 'polarScatter', name: 'Owls', data: [[20, 3], [75, 5], [140, 2], [210, 6], [300, 4]] },
      { type: 'polarScatter', name: 'Bats', data: [[45, 1], [120, 4], [190, 3], [260, 5], [330, 2]] },
    ],
  },
  gauge: {
    width: 320,
    height: 280,
    title: 'Load',
    axes: {
      angle: {
        type: 'linear',
        min: 0,
        max: 100,
        format: { suffix: '%' },
        bands: [
          { from: 0, to: 60, color: '#009e73' },
          { from: 60, to: 85, color: '#e69f00' },
          { from: 85, to: 100, color: '#d55e00' },
        ],
      },
    },
    series: [{ type: 'gauge', name: 'CPU', value: 72 }],
  },
  rings: {
    width: 420,
    height: 380,
    title: 'Sales by region',
    series: [
      {
        type: 'pie',
        name: '2025',
        padAngle: 2,
        cornerRadius: 4,
        data: [
          { name: 'North', value: 5, offset: 0.06 },
          { name: 'South', value: 3 },
          { name: 'East', value: 2 },
        ],
      },
      {
        type: 'pie',
        name: '2024',
        innerRadius: 0.25,
        padAngle: 2,
        cornerRadius: 4,
        data: [
          { name: 'North', value: 3 },
          { name: 'South', value: 4 },
          { name: 'West', value: 1 },
        ],
      },
    ],
  },
  slanted: {
    width: 480,
    height: 320,
    title: 'Visits by city',
    axes: {
      x: {
        type: 'band',
        categories: ['Zürich', 'Łódź', 'São Paulo', 'Reykjavík', 'Kraków', 'Montréal', 'Ho Chi Minh City', 'Kyiv'],
        labelAngle: -45,
      },
      y: { type: 'linear' },
    },
    series: [{ type: 'bar', name: 'Visits', data: [5, 3, 8, 4, 6, 7, 9, 2] }],
  },
  sparkline: {
    width: 120,
    height: 32,
    axes: { x: { type: 'band', categories: months, hidden: true }, y: { type: 'linear', hidden: true } },
    series: [{ type: 'line', name: 'Trend', data: [3, 5, 4, 7, 6, 9] }],
  },
};

const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [name, spec] of [...Object.entries(charts), ...statisticalCases.map(({ name, spec }) => [name, spec])]) {
  const svg = toSvgChart(layoutChart({ ...spec, seed }), { fontFiles: excalifontFiles });
  writeFileSync(new URL(`chart-${name}.svg`, outDir), svg);
  console.log(`${name} ${createHash('sha256').update(svg).digest('hex')}`);
}
