import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec, type SymbolName } from '@borrowdale/charts';
import { symbolShape } from '../src/symbols.js';
import { pointsOutside, shapesOf } from './support/layout.js';
import examples from '../../../apps/examples/cartesian-cases.json' with { type: 'json' };

const symbols: SymbolName[] = ['circle', 'square', 'diamond', 'triangle', 'cross', 'star', 'wye', 'tick'];
const spec: ChartSpec = {
  width: 300, height: 200, legend: 'none', style: { roughness: 0 },
  axes: { x: { type: 'linear', min: 0, max: 1 }, y: { type: 'linear', min: 0, max: 1 } },
  series: [{ type: 'scatter', name: 'S', data: [[0, 0], [1, 1]] }],
};

describe('point symbols', () => {
  it.each(examples)('$name uses only portable drawing math', ({ spec }) => {
    expect(toSvgChart(layoutChart(spec as unknown as ChartSpec))).toContain('<svg');
  });
  it.each(symbols)('%s stays within its declared square', (symbol) => {
    const shape = symbolShape(symbol, [30, 40], 12);
    if (shape.kind === 'polygon') {
      for (const [x, y] of shape.points) {
        expect(x).toBeGreaterThanOrEqual(24);
        expect(x).toBeLessThanOrEqual(36);
        expect(y).toBeGreaterThanOrEqual(34);
        expect(y).toBeLessThanOrEqual(46);
      }
    }
    const layout = layoutChart({ ...spec, series: [{ ...spec.series[0]!, type: 'scatter', name: 'S', data: [[0, 0], [1, 1]], symbol }] });
    expect(pointsOutside(layout)).toBe(0);
    expect(shapesOf(layout, 'S: 0, 0')).toHaveLength(1);
  });

  it('draws eight distinct geometries', () => {
    const drawings = symbols.map((symbol) => toSvgChart(layoutChart({
      ...spec, series: [{ type: 'scatter', name: 'S', data: [[0, 0]], symbol }],
    })));
    expect(new Set(drawings).size).toBe(8);
  });

  it('preserves default circle output', () => {
    const explicit: ChartSpec = { ...spec, series: [{ type: 'scatter', name: 'S', data: [[0, 0], [1, 1]], symbol: 'circle' }] };
    expect(toSvgChart(layoutChart(explicit))).toBe(toSvgChart(layoutChart(spec)));
  });

  it('reads symbols on bubbles and polar points', () => {
    expect(() => layoutChart({ ...spec, series: [{ type: 'bubble', name: 'B', data: [[0, 0, 1]], symbol: 'star' }] })).not.toThrow();
    expect(() => layoutChart({
      width: 300, height: 300, axes: { angle: { type: 'linear' }, radius: { type: 'linear' } },
      series: [{ type: 'polarScatter', name: 'P', data: [[0, 1]], symbol: 'diamond' }],
    })).not.toThrow();
  });

  it('rejects an unknown symbol with its input path', () => {
    const invalid = { ...spec, series: [{ type: 'scatter', name: 'S', data: [[0, 0]], symbol: 'pentagon' }] };
    expect(() => layoutChart(invalid as unknown as ChartSpec)).toThrow('series[0].symbol');
  });
});
