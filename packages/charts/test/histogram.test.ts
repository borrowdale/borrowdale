import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, type ChartSpec, type HistogramSeries } from '@borrowdale/charts';
import { svgTitles } from './support/layout.js';

const samples: HistogramSeries = { type: 'histogram', name: 'A', edges: [-2, 0, 1, 4], data: [4, -2, 1, 0] };
const chart = (...series: HistogramSeries[]): ChartSpec => ({
  width: 400, height: 200, axes: { x: { type: 'linear' }, y: { type: 'linear' } }, series,
});

describe('histogram', () => {
  it('counts samples on both outer edges and assigns interior edges to the bin on the right', () => {
    expect(svgTitles(chart(samples))).toEqual(['A, [-2, 0): 1', 'A, [0, 1): 1', 'A, [1, 4]: 2']);
  });

  it('accumulates relative frequencies in bin order, including empty bins', () => {
    const spec = chart({ ...samples, data: [-1, 1, 1, 4], frequency: 'relative', cumulative: true });
    expect(svgTitles(spec)).toEqual(['A, [-2, 0): 0.25', 'A, [0, 1): 0.25', 'A, [1, 4]: 1']);
    expect(svgTitles(chart({ ...samples, data: [], frequency: 'relative' }))).toEqual([
      'A, [-2, 0): 0', 'A, [0, 1): 0', 'A, [1, 4]: 0',
    ]);
  });

  it('includes the sum of stacked bin heights in the y domain', () => {
    const a = { ...samples, stack: 'all' };
    const spec = chart(a, { ...a, name: 'B' });
    spec.axes = { x: { type: 'linear' }, y: { type: 'linear', max: 3 } };
    expect(() => layoutChart(spec)).toThrow(/axes.y.max.*data reach 4/);
    expect(() => layoutChart(chart(a, { ...a, name: 'B', edges: [-2, 1, 4] }))).toThrow(/series\[1\].*match/);
  });

  it('validates the bin edges, samples and axes', () => {
    expect(() => layoutChart(chart({ ...samples, edges: [0, 1, 1] }))).toThrow(/edges\[2\]/);
    expect(() => layoutChart(chart({ ...samples, data: [5] }))).toThrow(/data\[0\]/);
    const spec = chart(samples);
    spec.axes = { x: { type: 'time' }, y: { type: 'linear' } };
    expect(() => layoutChart(spec)).toThrow(/linear x and y/);
  });
});
