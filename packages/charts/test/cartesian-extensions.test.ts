import { beforeAll, describe, expect, it } from 'vitest';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import cases from '../../../apps/examples/cartesian-cases.json' with { type: 'json' };
import { evaluateIn } from '../../core/test/support/browsers.js';
import { bandScale } from '../src/scale.js';
import { shapesOf } from './support/layout.js';

const examples = cases as unknown as { name: string; spec: ChartSpec }[];
let browser: Record<string, string>;
beforeAll(async () => {
  browser = await evaluateIn('chromium', new URL('../src/index.ts', import.meta.url), 'charts', '', (entries) => {
    const api = (globalThis as unknown as { charts: { layoutChart: typeof layoutChart; toSvgChart: typeof toSvgChart } }).charts;
    return Object.fromEntries(entries.map(({ name, spec }) => [name, api.toSvgChart(api.layoutChart(spec), { idPrefix: name })]));
  }, examples);
}, 120_000);

describe('Cartesian examples', () => {
  it.each(['notacolor', 'none', 'rgb(1/2/3)', 'red'])('rejects unsupported gradient paint %s before rendering', (color) => {
    const spec: ChartSpec = { width: 200, height: 150, axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      series: [{ type: 'xyLine', name: 'G', data: [[0, 0], [1, 1]], gradient: { axis: 'x', stops: [{ offset: 0, color }, { offset: 1, color: '#fff' }] } }] };
    expect(() => layoutChart(spec)).toThrow('series[0].gradient.stops[0].color');
  });
  it.each(examples)('$name matches Chromium byte for byte', ({ name, spec }) => {
    expect(toSvgChart(layoutChart(spec), { idPrefix: name })).toBe(browser[name]);
  });

  it('allocates weighted centres and widths together', () => {
    const scale = bandScale(3, [0, 600], 0, [1, 3, 2]);
    expect([0, 1, 2].map(scale.width)).toEqual([100, 300, 200]);
    expect([0, 1, 2].map((i) => scale.start(i) + scale.width(i) / 2)).toEqual([50, 250, 500]);
  });

  it('uses continuous gradients, without replacing paths by discrete colours', () => {
    const entry = examples.find((entry) => entry.name === 'gradient-line')!;
    const svg = toSvgChart(layoutChart(entry.spec));
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('stroke="url(#chart-gradient-0)"');
    expect(svg.match(/<stop /g)).toHaveLength(2);
  });

  it('splits crossing area boundaries into two oppositely coloured triangles', () => {
    const spec: ChartSpec = { width: 300, height: 200, legend: 'none', style: { roughness: 0 },
      axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      series: [{ type: 'xyArea', name: 'D', data: [[0, 0, 2], [2, 2, 0]], difference: { positive: '#009e73', negative: '#d55e00' } }] };
    const shapes = shapesOf(layoutChart(spec), 'D');
    expect(shapes).toHaveLength(4);
    expect(shapes.slice(0, 2).map((node) => node.kind === 'sketch' && node.sketch.paths[0]!.fill)).toEqual(['#009e73', '#d55e00']);
  });

  it('rejects inconsistent weight counts and unordered gradient stops', () => {
    const wide = examples.find((entry) => entry.name === 'variwide')!.spec;
    expect(() => layoutChart({ ...wide, axes: { x: { type: 'band', categories: ['a', 'b', 'c'], weights: [1, 2] }, y: { type: 'linear' } } })).toThrow('weights');
    const gradient = examples.find((entry) => entry.name === 'gradient-line')!.spec;
    expect(() => layoutChart({ ...gradient, series: [{ type: 'xyLine', name: 'G', data: [[0, 0], [1, 1]],
      gradient: { axis: 'x', stops: [{ offset: 1, color: '#000' }, { offset: 0, color: '#fff' }] } }] })).toThrow('increasing stops');
  });
});
