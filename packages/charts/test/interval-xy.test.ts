import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec, type IntervalSeries } from '@borrowdale/charts';
import { checkChart } from '../src/validate.js';
import { pointsOutside, shapesOf, titles } from './support/layout.js';

const band = { type: 'band', categories: ['a', 'b', 'c'] } as const;
const linear = { type: 'linear', min: -10, max: 10 } as const;
const intervals: ChartSpec = {
  width: 400, height: 300, legend: 'none', style: { roughness: 0 },
  axes: { x: band, y: linear },
  series: [{ type: 'interval', name: 'I', data: [[-5, 3], [8, -2], null] }],
};
const xy: ChartSpec = {
  ...intervals, axes: { x: linear, y: linear },
  series: [{ type: 'xyLine', name: 'X', data: [[-8, 1], [8, 2], [-2, 3], null, [4, 4]] }],
};

describe('interval and numeric path geometry', () => {
  it.each(['series', 'chart', 'segments', 'taper'] as const)('reserves room for %s widths at fixed endpoints', (kind) => {
    const style = { roughness: 0, fillStyle: 'solid' as const };
    const layout = layoutChart({ width: 300, height: 300, legend: 'none',
      style: { ...style, ...(kind === 'chart' ? { strokeWidth: 100 } : {}) },
      axes: { x: { type: 'linear', min: 0, max: 1, hidden: true }, y: { type: 'linear', min: 0, max: 1, hidden: true } },
      series: [{ type: 'xyLine', name: 'W', data: [[0, 0], [1, 1]],
        ...(kind === 'series' ? { style: { strokeWidth: 100 } } : {}),
        ...(kind === 'segments' ? { segments: [{ strokeWidth: 100 }] } : {}),
        ...(kind === 'taper' ? { widths: [100, 100] } : {}),
      }] });
    expect(pointsOutside(layout)).toBe(0);
    const shapes = shapesOf(layout, 'W');
    if (kind !== 'taper') {
      const first = shapes[0]!;
      if (first.kind !== 'sketch') throw new Error('Missing path');
      const start = /^M\s*(-?[\d.]+)[ ,](-?[\d.]+)/.exec(first.sketch.paths[0]!.d)!;
      expect(Number(start[1])).toBeGreaterThanOrEqual(50);
      expect(Number(start[2])).toBeLessThanOrEqual(250);
    }
  });
  it.each(['vertical', 'horizontal', 'secondary', 'numeric'] as const)('honours value formatting on %s marks', (orientation) => {
    const valueAxis = { type: 'linear' as const, hidden: true, format: { prefix: '$', suffix: ' kg', decimals: 2 } };
    const category = { type: 'band' as const, categories: ['A'], hidden: true };
    const axes = orientation === 'horizontal' ? { x: valueAxis, y: category }
      : orientation === 'secondary' ? { x: category, y: { type: 'linear' as const, hidden: true }, y2: valueAxis }
      : orientation === 'numeric' ? { x: { type: 'linear' as const, hidden: true }, y: valueAxis }
      : { x: category, y: valueAxis };
    const series: ChartSpec['series'] = orientation === 'numeric'
      ? [{ type: 'xyLine', name: 'F', data: [[0, 2]], dataLabels: true }]
      : [{ type: 'interval', name: 'F', data: [[1, 2]], axis: orientation === 'secondary' ? 'y2' : 'y', dataLabels: true }];
    const layout = layoutChart({ width: 300, height: 200, legend: 'none', axes, series });
    expect(layout.labels).toEqual(['$2.00 kg']);
    if (orientation !== 'numeric') expect(titles(layout)).toEqual(['F, A: $1.00 kg to $2.00 kg']);
  });
  it.each(['bar', 'line', 'error', 'points'] as const)('draws %s intervals in both orientations', (display) => {
    for (const horizontal of [false, true]) {
      const entry: IntervalSeries = { type: 'interval', name: 'I', data: [[-5, 3], [8, -2], null], display };
      const layout = layoutChart({ ...intervals, axes: horizontal ? { x: linear, y: band } : intervals.axes, series: [entry] });
      expect(titles(layout)).toEqual(['I, a: -5 to 3', 'I, b: 8 to -2']);
      expect(shapesOf(layout, 'I, b: 8 to -2')).toHaveLength(display === 'error' ? 3 : display === 'points' ? 2 : 1);
      expect(pointsOutside(layout)).toBe(0);
    }
  });

  it('draws a lollipop as a stem and one endpoint', () => {
    const layout = layoutChart({ ...intervals, series: [{ type: 'interval', name: 'L', data: [[0, 3], null, null], display: 'line', toSymbol: 'diamond' }] });
    expect(shapesOf(layout, 'L, a: 0 to 3')).toHaveLength(2);
  });

  it('joins numeric points in input order and separates null runs', () => {
    const layout = layoutChart(xy);
    const shapes = shapesOf(layout, 'X');
    expect(shapes).toHaveLength(2);
    const first = shapes[0]!;
    expect(first.kind).toBe('sketch');
    if (first.kind === 'sketch') {
      const xs = [...first.sketch.paths[0]!.d.matchAll(/(?:[ML]|C[^,]*,[^,]*,)\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => Number(m[1]));
      const vertices = xs.filter((value, i) => i === 0 || value !== xs[i - 1]);
      expect(vertices.length).toBeGreaterThanOrEqual(3);
      expect(vertices[1]).toBeGreaterThan(vertices[0]!);
      expect(vertices.at(-1)).toBeLessThan(Math.max(...vertices));
    }
    expect(pointsOutside(layout)).toBe(0);
  });

  it('includes every interval endpoint in fixed-domain validation', () => {
    expect(() => layoutChart({ ...intervals, series: [{ type: 'interval', name: 'I', data: [[0, 11], null, null] }] })).toThrow('axes.y.max');
    expect(() => layoutChart({ ...xy, series: [{ type: 'xyArea', name: 'A', data: [[0, -1, 11]] }] })).toThrow('axes.y.max');
  });

  it('draws numeric confidence bands and preserves gaps', () => {
    const layout = layoutChart({ ...xy, series: [{ type: 'xyArea', name: 'A', data: [[-5, -2, 3], [0, -1, 4], null, [5, 2, 6]] }] });
    expect(shapesOf(layout, 'A')).toHaveLength(4);
    expect(pointsOutside(layout)).toBe(0);
  });

  it.each([
    { data: [[0, 4, 2]] },
    { data: [[1, 0, 1], [0, 0, 1]] },
    { data: [[0, 0, 1], [0, 0, 2]] },
  ])('rejects invalid numeric confidence intervals $data', ({ data }) => {
    expect(() => layoutChart({ ...xy, series: [{ type: 'xyArea', name: 'A', data }] } as unknown as ChartSpec)).toThrow('series[0].data');
  });

  it.each(['interval', 'xyLine', 'xyArea'] as const)('reserves %s input before reading an overflowing point', (type) => {
    const data = new Array(1);
    Object.defineProperty(data, 0, { get: () => { throw new Error('unexpected point read'); } });
    const first = { type: 'scatter', name: 'full', data: Array.from({ length: 100_000 }, () => [0, 0]) };
    expect(() => checkChart({ ...xy, series: [first, { type, name: 'extra', data }] } as unknown as ChartSpec)).toThrow('more than 100000');
  });
});
