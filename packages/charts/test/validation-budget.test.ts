import { describe, expect, it } from 'vitest';
import { InvalidChartError, type ChartSpec } from '@borrowdale/charts';
import { checkChart } from '../src/validate.js';

const axes = { x: { type: 'linear' }, y: { type: 'linear' } } as const;

describe('chart data validation budget', () => {
  it('rejects an overflowing series before reading or copying its points', () => {
    let reads = 0;
    const overflow = Array.from({ length: 50_000 }, () => [1, 1]);
    Object.defineProperty(overflow, 0, { get: () => { reads++; return [1, 1]; } });
    const spec: ChartSpec = {
      width: 400, height: 300, axes,
      series: [
        { type: 'scatter', name: 'A', data: Array(50_001).fill([1, 1]) },
        { type: 'scatter', name: 'B', data: overflow as [number, number][] },
      ],
    };

    expect(() => checkChart(spec)).toThrow(expect.objectContaining({
      name: 'InvalidChartError', path: 'series', problem: 'hold at least 100001 data points in all, more than 100000',
    }));
    expect(reads).toBe(0);
  });

  it('does not inspect subsequent series after the point limit is exceeded', () => {
    let reads = 0;
    const spec: ChartSpec = {
      width: 400, height: 300, axes,
      series: [
        { type: 'scatter', name: 'A', data: Array(100_000).fill([1, 1]) },
        { type: 'scatter', name: 'B', data: [[1, 1]] },
        { type: 'scatter', name: 'C', get data() { reads++; return []; } },
      ],
    };
    expect(() => checkChart(spec)).toThrow(InvalidChartError);
    expect(reads).toBe(0);
  });

  it.each([
    ['bar', 1], ['line', 1], ['area', 1], ['rangeArea', [0, 1]],
    ['scatter', [1, 1]], ['bubble', [1, 1, 1]], ['radar', 1], ['rose', 1],
    ['radialBar', 1], ['polarLine', 1], ['polarArea', 1], ['polarScatter', [1, 1]],
    ['pie', { name: 'slice', value: 1 }],
  ])('charges %s data before reading the first point', (type, point) => {
    let reads = 0;
    const data = [point];
    Object.defineProperty(data, 0, { get: () => { reads++; return point; } });
    // The total limit applies before checking whether the series can share coordinate systems.
    const spec = {
      width: 400, height: 300, axes,
      series: [
        { type: 'scatter', name: 'full', data: Array(100_000).fill([1, 1]) },
        { type, name: 'extra', data },
      ],
    } as ChartSpec;
    expect(() => checkChart(spec)).toThrow(expect.objectContaining({ path: 'series' }));
    expect(reads).toBe(0);
  });

  it('counts a gauge value as one point before reading it', () => {
    let reads = 0;
    const spec: ChartSpec = {
      width: 400, height: 300, axes,
      series: [
        { type: 'scatter', name: 'full', data: Array(100_000).fill([1, 1]) },
        { type: 'gauge', name: 'extra', get value() { reads++; return 1; } },
      ],
    };
    expect(() => checkChart(spec)).toThrow(expect.objectContaining({ path: 'series' }));
    expect(reads).toBe(0);
  });

  it('accepts the exact total and checks the same data array it charges', () => {
    let reads = 0;
    const data: [number, number][] = Array(50_000).fill([1, 1]);
    const spec: ChartSpec = {
      width: 400, height: 300, axes,
      series: [
        { type: 'scatter', name: 'A', data },
        { type: 'scatter', name: 'B', get data() {
          reads++;
          return reads === 1 ? data : Array(100_000).fill([2, 2]);
        } },
      ],
    };
    const checked = checkChart(spec);
    expect(reads).toBe(1);
    expect(checked.series.map((series) => 'data' in series ? series.data.length : 1)).toEqual([50_000, 50_000]);
    const second = checked.series[1];
    if (second?.type !== 'scatter') {
      throw new Error('Expected a checked scatter series');
    }
    expect(second.data).not.toBe(data);
    expect(second.data[0]).toEqual([1, 1]);
    data[0]![0] = 9;
    expect(second.data[0]).toEqual([1, 1]);
  });

  it('starts each check with a fresh point allowance', () => {
    const spec: ChartSpec = {
      width: 400, height: 300, axes,
      series: [{ type: 'scatter', name: 'A', data: Array(100_000).fill([1, 1]) }],
    };
    expect(() => checkChart({ ...spec, series: [...spec.series, { type: 'scatter', name: 'B', data: [[1, 1]] }] })).toThrow(InvalidChartError);
    expect(() => checkChart(spec)).not.toThrow();
    expect(() => checkChart(spec)).not.toThrow();
  });

  it('retains the per-series limit error for a single oversized array', () => {
    const spec: ChartSpec = {
      width: 400, height: 300, axes,
      series: [{ type: 'scatter', name: 'A', data: Array(100_001).fill([1, 1]) }],
    };
    expect(() => checkChart(spec)).toThrow(expect.objectContaining({
      path: 'series[0].data', problem: 'must have 0 to 100000 entries, got 100001',
    }));
  });
});
