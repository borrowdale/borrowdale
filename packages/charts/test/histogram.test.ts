import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, type ChartSpec, type HistogramSeries } from '@borrowdale/charts';
import { svgTitles } from './support/layout.js';

const samples: HistogramSeries = { type: 'histogram', name: 'A', edges: [-2, 0, 1, 4], data: [4, -2, 1, 0] };
const chart = (...series: HistogramSeries[]): ChartSpec => ({
  width: 400, height: 200, axes: { x: { type: 'linear' }, y: { type: 'linear' } }, series,
});
// Bin tooltips write their edges in the x axis' format: to whole numbers, -0.4 would be written 0,
// leaving -0.3 outside its bin, and 0.5 written 1 would make the bin [1, 1).
const roundedEdges: ChartSpec = { ...chart({ ...samples, edges: [-0.4, 0.5, 1, 1.5], data: [-0.3, 0.7, 1.2] }), axes: { x: { type: 'linear', format: { decimals: 0 } }, y: { type: 'linear' } } };
const exactEdges: ChartSpec = { ...roundedEdges, axes: { x: { type: 'linear', format: { decimals: 1 } }, y: { type: 'linear' } } };
// Edges too small for the 20 decimals a label writes: both would be written 0.00000000000000000000.
const tinyEdges = chart({ ...samples, edges: [-3e-21, 3e-21, 1], data: [0] });
// Whole numbers write the first edge, 0, as it is, and the second, 0.5, as 1.
const laterRoundedEdge: ChartSpec = { ...roundedEdges, series: [{ ...samples, edges: [0, 0.5, 1], data: [0.2, 0.7] }] };
const laying = (spec: ChartSpec) => () => layoutChart(spec);

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

  // An edge is a boundary the tooltips state, so the x axis must write it exactly.
  it.each([
    ['an edge a fixed number of decimals rounds', roundedEdges, 'Invalid chart: series[0].edges[0] is -0.4, which axes.x.format.decimals 0 writes as 0'],
    ['edges with more decimals than a label writes', tinyEdges, 'Invalid chart: series[0].edges[0] must have at most 20 decimals, got -3e-21'],
    ['a later edge a fixed number of decimals rounds', laterRoundedEdge, 'Invalid chart: series[0].edges[1] is 0.5, which axes.x.format.decimals 0 writes as 1'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });

  // With enough decimals, the tooltips state each bin as it counts.
  it('writes edges that the x axis\' format writes exactly', () => {
    expect(svgTitles(exactEdges)).toEqual(['A, [-0.4, 0.5): 1', 'A, [0.5, 1.0): 1', 'A, [1.0, 1.5]: 1']);
  });
});
