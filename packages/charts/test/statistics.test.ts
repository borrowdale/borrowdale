import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec, type Series } from '@borrowdale/charts';
import cases from '../../../apps/examples/statistical-cases.json' with { type: 'json' };
import { checkChart } from '../src/validate.js';
import type { Point } from '@borrowdale/core';
import { legendOf } from '../src/cartesian.js';
import type { Rect } from '../src/frame.js';
import type { Glyph } from '../src/statistics/geometry.js';
import { placeSwarm, swarmOffset } from '../src/statistics/swarm.js';
import { placedAs, placedTexts, placesOf } from './support/layout.js';

function spec(...series: Series[]): ChartSpec {
  return { width: 480, height: 300, axes: { x: { type: 'linear' }, y: { type: 'linear' } }, series };
}
function marks(...series: Series[]) {
  const chart = checkChart(spec(...series));
  if (chart.system !== 'cartesian') throw new Error('Expected Cartesian axes');
  return chart.series.flatMap((s) => ('marks' in s ? s.marks : []));
}
describe('sample statistics', () => {
  it('aggregates ECDF ties at their exact sample coordinates', () => {
    expect(marks({ type: 'distribution', display: 'ecdf', name: 'A', data: [5, 1, 1, 3] })[0]!.points).toEqual([
      [1, 0],
      [1, 0.5],
      [3, 0.5],
      [3, 0.75],
      [5, 0.75],
      [5, 1],
    ]);
  });
  it('interpolates quartiles and separates Tukey outliers from the whiskers', () => {
    const shapes = marks({ type: 'distribution', display: 'box', name: 'A', data: [1, 2, 3, 4, 100] });
    expect(shapes[0]!.points).toEqual([
      [0, 1],
      [0, 4],
    ]);
    expect(shapes[1]!.points.map((p) => p[1])).toEqual([2, 2, 4, 4]);
    expect(shapes.at(-1)!.points).toEqual([[0, 100]]);
  });
  it('ends a Tukey whisker at the quartile when the nearest sample within the fence lies inside the box', () => {
    const low = marks({ type: 'distribution', display: 'box', name: 'A', data: [0, 9, 10, 11] });
    expect(low[0]!.points).toEqual([
      [0, 6.75],
      [0, 11],
    ]);
    expect(low.slice(5)).toMatchObject([{ points: [[0, 0]] }]);
    const high = marks({ type: 'distribution', display: 'box', name: 'A', data: [-11, -10, -9, 0] });
    expect(high[0]!.points).toEqual([
      [0, -11],
      [0, -6.75],
    ]);
  });
  it('puts the Tukey fences exactly 1.5 IQR outside the quartiles', () => {
    const on = marks({ type: 'distribution', display: 'box', name: 'A', data: [1, 4, 5, 6, 9] });
    expect(on[0]!.points).toEqual([
      [0, 1],
      [0, 9],
    ]);
    expect(on).toHaveLength(5);
    // Just past either fence, a sample is an outlier.
    const past = marks({ type: 'distribution', display: 'box', name: 'A', data: [0.9, 4, 5, 6, 9.1] });
    expect(past.slice(5)).toMatchObject([{ points: [[0, 0.9]] }, { points: [[0, 9.1]] }]);
  });
  it('reaches both extremes with min-max whiskers, in a box and a raincloud', () => {
    const box = marks({ type: 'distribution', display: 'box', name: 'A', whiskers: 'minmax', data: [-100, 1, 2, 3, 4] });
    expect(box[0]!.points).toEqual([
      [0, -100],
      [0, 4],
    ]);
    expect(box).toHaveLength(5);
    const raincloud = marks({ type: 'distribution', display: 'raincloud', name: 'R', whiskers: 'minmax', data: [1, 2, 3, 4, 100] });
    expect(raincloud[1]!.points).toEqual([
      [0, 1],
      [0, 100],
    ]);
  });
  it('normalises a Gaussian kernel and fits the sample standard deviation', () => {
    const density = marks({ type: 'distribution', display: 'density', name: 'A', data: [0], bandwidth: 1 })[0]!;
    expect(density.points[32]![1]).toBeCloseTo(0.39894228, 7);
    expect(density.points[0]![1]).toBeCloseTo(0.00443185, 7);
    const normal = marks({ type: 'distribution', display: 'normal', name: 'A', data: [-1, 0, 1] })[0]!;
    expect(normal.points[32]).toEqual(density.points[32]);
    const qq = marks({ type: 'distribution', display: 'normalQQ', name: 'A', data: [2, 1] });
    expect(qq[0]!.points[0]![0]).toBeCloseTo(-0.67448975, 5);
  });
  it('starts the second density on the first curve', () => {
    const first = { type: 'distribution', display: 'density', name: 'A', data: [1, 2, 4], stack: 's' } as const;
    const [a, b] = marks(first, { ...first, name: 'B' });
    expect(b!.points[32]![1]).toBeCloseTo(2 * a!.points[32]![1], 10);
    expect(b!.points.at(-33)).toEqual(a!.points[32]);
  });
  it('dodges adjacent observations by both radii and rejects overcrowding', () => {
    const neighbours = [{ value: 5, radius: 3, offset: 0 }];
    const offset = swarmOffset(8, 4, neighbours, -100, 100)!;
    expect(offset ** 2 + 3 ** 2).toBeCloseTo(8 ** 2, 10);
    expect(swarmOffset(8, 4, neighbours, -1, 1)).toBeUndefined();
  });
  it('conserves observations in square and hexagonal cells', () => {
    for (const display of ['histogram2d', 'hexbin'] as const) {
      const cells = marks({
        type: 'relationship',
        display,
        name: 'A',
        data: [
          [-1, -1],
          [-1, -1],
          [0, 0],
          [3, 4],
        ],
      });
      expect(cells.map((c) => Number(c.label)).sort()).toEqual([1, 1, 2]);
      expect(cells[0]!.points).toHaveLength(display === 'hexbin' ? 6 : 4);
    }
  });
  it('reproduces polynomial, exponential, logarithmic and locally linear fits', () => {
    for (const method of ['polynomial', 'logarithmic', 'exponential', 'loess'] as const) {
      const values =
        method === 'polynomial'
          ? [2, 5, 10, 17]
          : method === 'exponential'
            ? [2, 4, 8, 16]
            : method === 'logarithmic'
              ? [0, 0.69314718056, 1.09861228867, 1.38629436112]
              : [3, 5, 7, 9];
      const fit = marks({
        type: 'relationship',
        display: 'regression',
        name: 'F',
        method,
        data: values.map((v, i) => [i + 1, v]),
      })[0]!.points;
      expect(fit[0]![1]).toBeCloseTo(values[0]!, 6);
      expect(fit.at(-1)![1]).toBeCloseTo(values.at(-1)!, 6);
    }
  });
});
describe('financial transforms', () => {
  it('seeds the EMA with a full window and aligns Wilder RSI to the first full set of price changes', () => {
    expect(marks({ type: 'market', display: 'ema', name: 'P', period: 3, data: [1, 2, 3, 6] })[0]!.points).toEqual([
      [2, 2],
      [3, 4],
    ]);
    expect(marks({ type: 'market', display: 'rsi', name: 'P', period: 2, data: [1, 2, 3, 2] })[0]!.points).toEqual([
      [2, 100],
      [3, 50],
    ]);
  });
  it('aligns MACD and signal to sessions 26 and 34', () => {
    const prices = Array.from({ length: 39 }, (_, i) => i + 1);
    const result = marks({ type: 'market', display: 'macd', name: 'P', data: prices });
    expect(result.at(-2)!.points[0]).toEqual([25, 7]);
    expect(result.at(-1)!.points[0]).toEqual([33, 7]);
  });
  it('requires two bricks to reverse a Renko trend and three boxes to reverse a point-and-figure column', () => {
    const series = { type: 'market', name: 'P', data: [10, 12, 11, 10, 9], boxSize: 1 } as const;
    expect(marks({ ...series, display: 'renko' })).toMatchObject([{ values: [11] }, { values: [12] }, { values: [10] }, { values: [9] }]);
    expect(marks({ ...series, display: 'pointFigure' }).map((m) => m.points[0])).toEqual([
      [0, 11],
      [0, 12],
      [1, 11],
      [1, 10],
      [1, 9],
    ]);
  });
  it('checks OHLC validity, chart-specific options and expansion limits', () => {
    expect(() => marks({ type: 'market', display: 'ohlc', name: 'P', data: [[2, 1, 0, 2]] })).toThrow(/enclose/);
    expect(() =>
      marks({ type: 'market', display: 'rsi', name: 'P', hollow: true, data: [1, 2] } as unknown as Series),
    ).toThrow(/unknown key/);
    expect(() => marks({ type: 'market', display: 'renko', name: 'P', boxSize: 0.01, data: [0, 1000] })).toThrow(
      /4000/,
    );
  });
});
it.each(cases)('draws $name from raw observations', ({ spec: input }) => {
  const svg = toSvgChart(layoutChart(input as ChartSpec));
  expect(svg).toContain('<g><title>');
  expect(svg).not.toMatch(/NaN|Infinity/);
});

it('preserves decimal box boundaries and excludes a close just below them', () => {
  const base = { type: 'market', display: 'renko', name: 'P', boxSize: 0.1 } as const;
  expect(marks({ ...base, data: [100, 100.3] })).toHaveLength(3);
  expect(marks({ ...base, data: [100, 100.29999999999998] })).toHaveLength(2);
  expect(marks({ ...base, boxSize: 1, data: [0, 3999, 3997] })).toHaveLength(4000);
});
it('anchors a flag to its transformed session and handles two-point local regression', () => {
  const candle = marks({
    type: 'market',
    display: 'heikinAshi',
    name: 'Price',
    data: [
      [100, 101, 99, 100],
      [1, 2, 0, 1],
    ],
    flags: [{ index: 1, label: 'Flag' }],
  });
  expect(candle.at(-1)!.points).toEqual([[1, 100]]);
  const trend = marks({
    type: 'relationship',
    display: 'regression',
    method: 'loess',
    name: 'Fit',
    data: [
      [0, 0],
      [1, 1],
    ],
  });
  expect(trend[0]!.points[16]![1]).toBeCloseTo(0.25, 10);
});
it('closes distant density supports before crossing the empty gap', () => {
  const base = { type: 'distribution', display: 'density', bandwidth: 1, stack: 'all' } as const;
  const [layer] = marks({ ...base, data: [0], name: 'A' }, { ...base, data: [1000], name: 'B' });
  const upper = layer!.points.slice(0, layer!.points.length / 2);
  const left = upper.map((p) => p[0]).lastIndexOf(3);
  expect(upper.slice(left, left + 2)).toEqual([
    [3, 0],
    [997, 0],
  ]);
});

it('retains the spread of very small prices in Bollinger bands', () => {
  const [band] = marks({ type: 'market', display: 'bollinger', name: 'P', period: 2, data: [1e-170, 3e-170] });
  expect(band!.points[0]![1] / 1e-170).toBeCloseTo(0, 12);
  expect(band!.points[1]![1] / 1e-170).toBeCloseTo(4, 12);
});

it('draws the first complete Bollinger window and a constant decimal KDE', () => {
  expect(
    toSvgChart(layoutChart(spec({ type: 'market', display: 'bollinger', name: 'P', period: 2, data: [1, 2] }))),
  ).toContain('Two standard deviations');
  const density = marks({ type: 'distribution', display: 'density', name: 'A', data: [0.1, 0.1, 0.1] });
  expect(density[0]!.points[32]![1]).toBeCloseTo(0.39894228, 7);
});
it('does not cross an unreached fractional threshold when division rounds upward', () => {
  expect(
    marks({ type: 'market', display: 'renko', name: 'P', boxSize: 0.3, data: [0, 5.699999999999999] }),
  ).toHaveLength(18);
});
it('puts a decimal sample on the correct side of the rectangular bin boundary', () => {
  const cells = marks({
    type: 'relationship',
    display: 'histogram2d',
    name: 'C',
    data: [
      [0.29999999999999993, 0],
      [0.3, 0],
    ],
    binWidth: 0.1,
  });
  expect(cells.map((cell) => cell.points[0]![0])).toEqual([0.2, 0.3]);
});

it.each(['dotPlot', 'isotype'] as const)('starts a new %s group at the exact decimal boundary', (display) => {
  const result = marks({
    type: 'distribution',
    display,
    name: 'D',
    binWidth: 0.1,
    data: [0.2, 0.29999999999999993, 0.3],
  });
  expect(result.map((m) => m.points[0]![1])).toEqual([0.2, 0.2, 0.3]);
});
it('charges expanded price geometry to the chart before reading the next series', () => {
  const base = { type: 'market', display: 'renko', data: [0, 4000], boxSize: 1 } as const;
  expect(() => marks(...Array.from({ length: 10 }, (_, i) => ({ ...base, name: String(i) })))).toThrow(/100000/);
});
it('keeps representable subnormal responses in exponential fits', () => {
  const curve = marks({
    type: 'relationship',
    display: 'regression',
    method: 'exponential',
    name: 'D',
    data: [
      [0, 1e-310],
      [1, 2e-310],
    ],
  });
  expect(curve[0]!.points[0]![1] / 1e-310).toBeCloseTo(1, 10);
  expect(curve[0]!.points.at(-1)![1] / 2e-310).toBeCloseTo(1, 10);
});
it('keeps a large constant response level in local and polynomial fits', () => {
  const data: [number, number][] = [1, 3, 6, 9, 10, 11, 18, 25].map((x) => [x, 1e14]);
  for (const fit of [
    { method: 'polynomial', degree: 5 },
    { method: 'loess', span: 1 },
  ] as const) {
    const curve = marks({ type: 'relationship', display: 'regression', name: 'R', data, ...fit });
    expect(curve[0]!.points.every((p) => p[1] === 1e14)).toBe(true);
  }
});
it('rejects price boxes and cells with unresolvable widths', () => {
  expect(() =>
    marks({ type: 'relationship', display: 'histogram2d', name: 'D', data: [[800000000000000.2, 0]], binWidth: 0.1 }),
  ).toThrow(/distinct bin edges/);
  expect(() =>
    marks({ type: 'market', display: 'renko', name: 'P', data: [8e14, 8e14 + 0.125], boxSize: 0.01 }),
  ).toThrow(/resolvable/);
});
it('keeps exact fixed-axis endpoints when sampling a fitted line', () => {
  const chart = spec({
    type: 'relationship',
    display: 'regression',
    name: 'R',
    data: [
      [-0.2, 0],
      [0.1, 1],
    ],
  });
  chart.axes = { x: { type: 'linear', min: -0.2, max: 0.1 }, y: { type: 'linear' } };
  expect(toSvgChart(layoutChart(chart))).toContain('R, linear');
});
it('compares each sample with the unrounded decimal width of its dot group', () => {
  const result = marks({ type: 'distribution', display: 'dotPlot', name: 'D', data: [0.3, 0.4], binWidth: 0.10000000000000002 });
  expect(result.map((m) => m.points[0]![1])).toEqual([0.3, 0.3]);
});
it('leaves square markers in place exactly one padded width apart', () => {
  expect(swarmOffset(8, 3.5, [{ value: 0, radius: 3.5, offset: 0 }], -50, 50, false)).toBe(0);
});

it('packs square markers using their full width while their vertical spans overlap', () => {
  expect(Math.abs(swarmOffset(7.5, 6, [{ value: 0, radius: 6, offset: 0 }], -50, 50, false)!)).toBe(13);
});
it('retains small observations in a moving average with cancelling large values', () => {
  const data = [1e15, -1e15, ...Array<number>(998).fill(1)];
  expect(marks({ type: 'market', display: 'sma', name: 'M', data, period: 1000 })[0]!.points[0]![1]).toBe(0.998);
});
it('hatches cells with more observations more densely, in the series colour', () => {
  const series: Series = { type: 'relationship', display: 'histogram2d', name: 'D', color: '#dd5500', data: [[0, 0], [0, 0], [1, 0]] };
  expect(marks(series)).toMatchObject([
    { label: '2', role: 'count', weight: 1 },
    { label: '1', role: 'count', weight: 0.5 },
  ]);
  expect(colours(toSvgChart(layoutChart(spec(series))))).toEqual(['#c8c8c8', '#dd5500']);
});
it('fits a straight line inside its exact fixed ordinate limits', () => {
  const chart = spec({ type: 'relationship', display: 'regression', name: 'L', data: [[0, 0], [1, 9], [2, 18]] });
  chart.axes = { x: { type: 'linear' }, y: { type: 'linear', min: 0, max: 18 } };
  expect(toSvgChart(layoutChart(chart))).toContain('L, linear');
});
it('preserves the local linear fit for very small predictor units', () => {
  const data = [0, 1, 2, 3].map((x): [number, number] => [x * 1e-170, x]);
  const fit = marks({ type: 'relationship', display: 'regression', method: 'loess', span: 1, name: 'L', data });
  expect(fit[0]!.points[0]![1]).toBeCloseTo(0, 10);
  expect(fit[0]!.points.at(-1)![1]).toBeCloseTo(3, 10);
});

it('preserves each close in a one-session EMA and each movement in RSI', () => {
  const prices = [1e12, 0.00001, 0.00002];
  const indicator = { type: 'market', name: 'P', period: 1 } as const;
  const ema = marks({ ...indicator, display: 'ema', data: prices });
  expect(ema[0]!.points.map((point) => point[1])).toEqual(prices);
  for (const [period, data] of [[1, [-1e12, 0, 0.00001]], [2, [0, Number.MIN_VALUE, 2 * Number.MIN_VALUE]]] as const) {
    const rsi = marks({ ...indicator, display: 'rsi', period, data });
    expect(rsi[0]!.points.every((point) => point[1] === 100)).toBe(true);
  }
});

it('accepts tight ordinate limits for unevenly spaced and decimal straight-line observations', () => {
  for (const data of [[[0, -5], [3, 10], [5, 20]], [[0, 10], [1, 5.05], [2, 0.1]], [[0, 0.1], [1, 0.3], [2, 0.5]]] as const) {
    const ys = data.map((point) => point[1]);
    const chart = spec({ type: 'relationship', display: 'regression', name: 'Trend', data });
    expect(() => layoutChart({ ...chart, axes: { x: { type: 'linear' }, y: { type: 'linear', min: Math.min(...ys), max: Math.max(...ys) } } })).not.toThrow();
  }
});

it('fits a rising RSI within its conventional upper limit', () => {
  const chart = spec({ type: 'market', display: 'rsi', name: 'P', period: 1, data: [0, 55 / 17] });
  expect(() => layoutChart({
    ...chart,
    axes: { x: { type: 'linear' }, y: { type: 'linear', min: 0, max: 100 } },
  })).not.toThrow();
});

it('keeps dense and repeated straight-line observations within their fitted extent', () => {
  const diagonal = Array.from({ length: 1000 }, (_, i): [number, number] => [i, i]);
  const repeated: [number, number][] = [[0, 3], ...Array.from({ length: 99 }, (): [number, number] => [1, -4])];
  for (const data of [diagonal, repeated]) {
    const ys = data.map((point) => point[1]);
    const chart = spec({ type: 'relationship', display: 'regression', name: 'Trend', data });
    expect(() => layoutChart({
      ...chart,
      axes: { x: { type: 'linear' }, y: { type: 'linear', min: Math.min(...ys), max: Math.max(...ys) } },
    })).not.toThrow();
  }
});

// Five sessions: rising, falling, rising, falling, rising.
const BARS: [number, number, number, number][] = [
  [100, 104, 99, 103],
  [103, 105, 100, 101],
  [101, 108, 101, 107],
  [107, 109, 104, 105],
  [105, 110, 104, 109],
];
// 100 samples one unit apart.
const SPREAD = Array.from({ length: 100 }, (_, i) => i);
// Enough closes for MACD's 26-session average and 9-session signal.
const CLOSES = Array.from({ length: 40 }, (_, i) => 100 + (i % 7));

function colours(svg: string): string[] {
  return [...new Set(svg.match(/#[0-9a-f]{6}/gi) ?? [])].sort();
}
function bodies(glyphs: ReturnType<typeof marks>): [string | undefined, boolean | undefined][] {
  return glyphs.filter((glyph) => glyph.kind === 'polygon').map((glyph) => [glyph.role, glyph.hollow]);
}
function highest(glyphs: ReturnType<typeof marks>): number {
  return Math.max(...glyphs[0]!.points.map((point) => point[1]));
}
// A flag names its session: the compiler rejects one without an index or with an undefined one, and
// the typecheck of the tests is what fails if the series type stops doing so. Each line catches a
// loosening the other misses: an optional index, or one that may be undefined.
// @ts-expect-error: a flag needs its index.
const UNINDEXED_FLAG: Series = { type: 'market', display: 'candlestick', name: 'C', data: [[1, 2, 0, 1]], flags: [{ label: 'F' }] };
// @ts-expect-error: and its index is a number.
const UNDEFINED_FLAG_INDEX: Series = { type: 'market', display: 'candlestick', name: 'C', data: [[1, 2, 0, 1]], flags: [{ index: undefined, label: 'F' }] };

function outcome(chart: ChartSpec): string {
  try {
    layoutChart(chart);
    return 'drawn';
  } catch (error) {
    return (error as Error).message;
  }
}

it('rejects a flag without an index at run time too', () => {
  // What this pins is the @ts-expect-error on each flag above, which only the typecheck of the tests
  // checks; at run time the index is required either way.
  expect(outcome(spec(UNINDEXED_FLAG))).toBe('Invalid chart: series[0].flags[0].index is missing');
  expect(outcome(spec(UNDEFINED_FLAG_INDEX))).toBe('Invalid chart: series[0].flags[0].index is missing');
});

it('outlines rising candles and fills falling ones by default, whatever the series colour', () => {
  expect(bodies(marks({ type: 'market', display: 'candlestick', name: 'P', color: '#0072b2', data: BARS }))).toEqual([
    ['rise', true],
    ['fall', false],
    ['rise', true],
    ['fall', false],
    ['rise', true],
  ]);
});

it('hatches rising candles and fills falling ones when candles are not hollow', () => {
  expect(bodies(marks({ type: 'market', display: 'candlestick', name: 'P', data: BARS, hollow: false }))).toEqual([
    ['rise', false],
    ['fall', false],
    ['rise', false],
    ['fall', false],
    ['rise', false],
  ]);
});

it('draws candles in their palette colour, with no colours of their own', () => {
  const svg = toSvgChart(layoutChart(spec({ type: 'market', display: 'candlestick', name: 'P', data: BARS })));
  expect(colours(svg)).toEqual(['#c8c8c8', '#e69f00']);
});

it('rejects volume, which needs an axis of its own', () => {
  const series = { type: 'market', display: 'candlestick', name: 'P', data: BARS, volume: [1, 2, 3, 4, 5] } as unknown as Series;
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] has an unknown key, "volume"');
});

it('dashes the MACD signal line in the series colour', () => {
  expect(marks({ type: 'market', display: 'macd', name: 'M', data: CLOSES }).at(-1)).toMatchObject({ label: 'Signal', role: 'secondary' });
});

it('draws control limits and the centre line as reference lines', () => {
  expect(marks({ type: 'market', display: 'control', name: 'C', data: [3, 5, 4, 6] })).toMatchObject([
    { label: 'Lower limit', role: 'reference' },
    { label: 'Centre', role: 'reference' },
    { label: 'Upper limit', role: 'reference' },
    { label: 'Observations' },
  ]);
});

it('draws a narrow density peak within one percent of its height', () => {
  // A single sample at bandwidth 0.01 peaks at 1 / (0.01 √(2π)) / 2 samples = 19.9471.
  const curve = marks({ type: 'distribution', display: 'density', name: 'D', data: [0, 100], bandwidth: 0.01 });
  expect(highest(curve)).toBeGreaterThan(19.75);
  expect(highest(curve)).toBeLessThanOrEqual(19.9472);
  // 65 points across the curve, and runs a quarter bandwidth apart of 25 about 0 and 26 about 100,
  // where the run's width comes to just over 24 steps. Each run shares an end with the curve.
  expect(curve[0]!.points).toHaveLength(114);
});

it('draws a peak off its run grid within one percent of its height', () => {
  // Samples 3.1 bandwidths apart share one refined run, so the second peak falls between its points.
  const curve = marks({ type: 'distribution', display: 'density', name: 'D', data: [0, 0.031, 100], bandwidth: 0.01 });
  expect(highest(curve)).toBeGreaterThan(0.99 * 13.4116);
  expect(highest(curve)).toBeLessThanOrEqual(13.4116);
});

it('names a bandwidth too narrow to draw within the point limit', () => {
  const chart = spec({ type: 'distribution', display: 'density', name: 'D', data: SPREAD, bandwidth: 0.001 });
  expect(outcome(chart)).toMatch(
    /^Invalid chart: series\[0\]\.bandwidth is 0\.001, too narrow for the sample range: its density needs \d+ points, more than 2000$/,
  );
});

it('keeps the 65-point curve when the bandwidth is wide enough for it', () => {
  expect(marks({ type: 'distribution', display: 'density', name: 'D', data: [12, 14, 15, 16, 19, 29] })[0]!.points).toHaveLength(65);
});

it.each([
  { name: 'exponential', fit: { method: 'exponential' }, data: [[0, 1], [1, 10]], min: 1, max: 10 },
  { name: 'logarithmic', fit: { method: 'logarithmic' }, data: [[1, 2.5], [2, 0.9]], min: 0.9, max: 2.5 },
  { name: 'quadratic', fit: { method: 'polynomial', degree: 2 }, data: [[0.1, 0.3], [0.2, 3], [0.30000000000000004, 10]], min: 0.3, max: 10 },
  { name: 'cubic', fit: { method: 'polynomial', degree: 3 }, data: [[1, 0.1], [2, 5], [3, 9], [4, 123.456]], min: 0.1, max: 123.456 },
  { name: 'LOESS', fit: { method: 'loess', span: 1 }, data: [[1, 0.7], [2, 7], [3, 0.2]], min: 0.2, max: 7 },
])('keeps the $name fit that reaches the observed extent within axis limits there', ({ fit, data, min, max }) => {
  const chart = spec({ type: 'relationship', display: 'regression', name: 'F', data, ...fit } as unknown as Series);
  expect(outcome({ ...chart, axes: { x: { type: 'linear' }, y: { type: 'linear', min, max } } })).toBe('drawn');
});

it('draws a polynomial that genuinely passes the observed extent as calculated', () => {
  // The parabola through (0, 0), (1, 1) and (3, 0) peaks at 1.125.
  const fit = marks({ type: 'relationship', display: 'regression', method: 'polynomial', name: 'P', data: [[0, 0], [1, 1], [3, 0]] });
  expect(highest(fit)).toBeGreaterThan(1.12);
});

it('keeps a subnormal response at the end of a straight-line fit', () => {
  const fit = marks({ type: 'relationship', display: 'regression', name: 'L', data: [[0, 0], [1, Number.MIN_VALUE]] });
  expect(fit[0]!.points.at(-1)).toEqual([1, Number.MIN_VALUE]);
});

// Euro amounts with a decimal comma and one decimal.
const EUROS = { prefix: '€', decimalSeparator: ',', decimals: 1 };
const EAST = [12, 14, 15, 16, 19, 29];

it('writes statistical values in the value axis format', () => {
  const chart = spec({ type: 'distribution', display: 'box', name: 'East', data: EAST });
  const svg = toSvgChart(layoutChart({ ...chart, axes: { x: { type: 'linear' }, y: { type: 'linear', format: EUROS } } }));
  expect(svg).toContain('East, €15,5');
});

it('writes the values of a horizontal display in the x axis format', () => {
  const chart = spec({ type: 'distribution', display: 'box', name: 'East', horizontal: true, data: EAST });
  const svg = toSvgChart(layoutChart({ ...chart, axes: { x: { type: 'linear', format: EUROS }, y: { type: 'linear' } } }));
  expect(svg).toContain('East, €15,5');
});

it('writes histogram bin edges in the x axis format', () => {
  const chart = spec({ type: 'histogram', name: 'H', edges: [0, 10, 20], data: [5, 15] });
  const svg = toSvgChart(layoutChart({ ...chart, axes: { x: { type: 'linear', format: { decimals: 1 } }, y: { type: 'linear' } } }));
  expect(svg).toContain('H, [0.0, 10.0): 1');
});

it('draws the Stanford region boundaries as reference lines', () => {
  const series: Series = { type: 'relationship', display: 'stanford', name: 'S', alertLimit: 5, data: [[1, 2], [3, 4]] };
  expect(marks(series).slice(-3)).toMatchObject([
    { label: 'Error equals protection level', role: 'reference' },
    { label: 'Alert limit', role: 'reference' },
    { label: 'Error at alert limit', role: 'reference' },
  ]);
});

// 100 hexbin series of 1,000 observations fill the chart's point budget with their input alone.
const CLOUD = Array.from({ length: 1000 }, (_, i): [number, number] => [i % 50, Math.floor(i / 50)]);
const HEXBINS = Array.from({ length: 100 }, (_, i): Series => ({ type: 'relationship', display: 'hexbin', name: `H${i}`, data: CLOUD }));

it('charges the cells of binned series to the point budget', () => {
  expect(outcome(spec(...HEXBINS))).toMatch(/^Invalid chart: series hold at least \d+ data points in all, more than 100000$/);
});

it('names the sample spread when a normal curve is too narrow for its magnitude', () => {
  const series: Series = { type: 'distribution', display: 'normal', name: 'N', data: [1, 1 + Number.EPSILON] };
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] needs a sample spread resolvable at the sample coordinates');
});

it('rejects a violin that is both polar and horizontal', () => {
  const series: Series = { type: 'distribution', display: 'violin', name: 'V', data: [1, 2, 3], polar: true, horizontal: true };
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] cannot combine polar and horizontal');
});

it('rejects statistical series on a log axis', () => {
  const chart = spec({ type: 'distribution', display: 'box', name: 'D', data: [1, 2] });
  expect(outcome({ ...chart, axes: { x: { type: 'linear' }, y: { type: 'log' } } })).toBe(
    'Invalid chart: series[0] is a distribution series, which needs linear x and y axes',
  );
});

// Thirty equal samples in a wide, short chart: there is room to spread them across x, not y.
const CROWD: Series = { type: 'distribution', display: 'swarm', name: 'S', data: Array.from({ length: 30 }, () => 5) };
const WIDE_AND_SHORT = { width: 2000, height: 90 };

it('spreads a vertical swarm across x and a horizontal one across y', () => {
  expect(outcome({ ...spec(CROWD), ...WIDE_AND_SHORT })).toBe('drawn');
  expect(outcome({ ...spec({ ...CROWD, horizontal: true } as Series), ...WIDE_AND_SHORT })).toBe(
    'Invalid chart: series[0] needs more room for its swarm markers',
  );
});

it('rejects a bandwidth that underflows to nothing between samples', () => {
  const series: Series = { type: 'distribution', display: 'density', name: 'D', data: [0, 1], bandwidth: 1e-323 };
  const message = 'Invalid chart: series[0] needs a bandwidth resolvable at the sample coordinates';
  expect(outcome(spec(series))).toBe(message);
  // Each sample's run keeps a width here, but a quarter bandwidth, the grid step, does not.
  expect(outcome(spec({ ...series, data: [0, 1e-320] }))).toBe(message);
});

it('rejects a bandwidth with no width at the magnitude of one sample', () => {
  const series: Series = { type: 'distribution', display: 'density', name: 'D', data: [0, 1e15], bandwidth: 0.01 };
  const message = 'Invalid chart: series[0] needs a bandwidth resolvable at the sample coordinates';
  expect(outcome(spec(series))).toBe(message);
  // Wide enough to give each sample's run a width, but not distinct points within it.
  expect(outcome(spec({ ...series, bandwidth: 0.1 }))).toBe(message);
  // A single sample keeps the 65-point curve, whose points coincide at that magnitude.
  expect(outcome(spec({ ...series, data: [1e15] }))).toBe(message);
});

it('names logarithms that coincide in a logarithmic fit', () => {
  const series: Series = { type: 'relationship', display: 'regression', method: 'logarithmic', name: 'L', data: [[1e15, 1], [1e15 - 0.125, 2]] };
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] needs x values whose logarithms differ');
});

it('shows the empty stems between the lowest and highest', () => {
  expect(marks({ type: 'distribution', display: 'stemLeaf', name: 'S', data: [1, 2, 51] })).toMatchObject([
    { label: '0 | 1 2' },
    { label: '1 |' },
    { label: '2 |' },
    { label: '3 |' },
    { label: '4 |' },
    { label: '5 | 1' },
  ]);
});

it('rejects a stem-and-leaf display spanning more than 100 stems', () => {
  const series: Series = { type: 'distribution', display: 'stemLeaf', name: 'S', data: [0, 1000] };
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] spans more than 100 stems');
  expect(marks({ ...series, data: [0, 999] })).toHaveLength(100);
});

it('draws isotypes as stars and swarm markers as 7-unit circles by default', () => {
  expect(marks({ type: 'distribution', display: 'isotype', name: 'I', data: [1] })).toMatchObject([{ symbol: 'star' }]);
  expect(marks({ type: 'distribution', display: 'swarm', name: 'S', data: [1] })).toMatchObject([{ size: 7, symbol: 'circle' }]);
});

it('gives a constant sample the larger of one unit and one percent of its value as bandwidth', () => {
  const wide = marks({ type: 'distribution', display: 'density', name: 'D', data: [1000] })[0]!.points;
  expect([wide[0]![0], wide.at(-1)![0]]).toEqual([970, 1030]);
  const unit = marks({ type: 'distribution', display: 'density', name: 'D', data: [5, 5] })[0]!.points;
  expect([unit[0]![0], unit.at(-1)![0]]).toEqual([2, 8]);
  const negative = marks({ type: 'distribution', display: 'density', name: 'D', data: [-1000] })[0]!.points;
  expect([negative[0]![0], negative.at(-1)![0]]).toEqual([-1030, -970]);
});

it('places the median of an odd sample at the zero normal quantile', () => {
  expect(marks({ type: 'distribution', display: 'normalQQ', name: 'Q', data: [1, 2, 3] })[1]!.points).toEqual([[0, 2]]);
});

it('draws a polar violin at the last whole position inside the angle limit', () => {
  expect(outcome(spec({ type: 'distribution', display: 'violin', name: 'V', polar: true, position: 999999, data: [1, 2, 3] }))).toBe('drawn');
});

it('rejects a stem with more than 450 leaves', () => {
  const series: Series = { type: 'distribution', display: 'stemLeaf', name: 'S', data: new Array<number>(451).fill(7) };
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] has more than 450 leaves on one stem');
  // 450 are accepted; whether their row fits is a matter of the plot's width.
  expect(marks({ ...series, data: new Array<number>(450).fill(7) })).toHaveLength(1);
});

it('rejects a polar violin whose density overflows at the sample magnitude', () => {
  const series: Series = { type: 'distribution', display: 'violin', name: 'V', polar: true, data: [0, 1e-318, 2e-318] };
  expect(outcome(spec(series))).toBe('Invalid chart: series[0] needs a bandwidth resolvable at the sample coordinates');
});

// 21 densities of 1,000 samples, each drawn with about 2,000 points: within the budget only while
// their grids go uncharged.
const EVEN_SAMPLES = Array.from({ length: 1000 }, (_, i) => (i * 476) / 999);
const DENSITIES = Array.from({ length: 21 }, (_, i): Series => ({
  type: 'distribution', display: 'density', name: `D${i}`, data: EVEN_SAMPLES, bandwidth: 1,
}));

it('charges each density grid to the point budget', () => {
  expect(outcome(spec(...DENSITIES))).toMatch(/^Invalid chart: series hold at least \d+ data points in all, more than 100000$/);
});

const THOUSAND_CLOSES = new Array<number>(1000).fill(100);

it.each([
  { kind: 'distribution', series: { type: 'distribution', display: 'box', name: 'B', data: EVEN_SAMPLES }, extra: 0 },
  { kind: 'relationship', series: { type: 'relationship', display: 'hexbin', name: 'H', data: CLOUD }, extra: [0, 0] },
  { kind: 'market', series: { type: 'market', display: 'sma', name: 'M', data: THOUSAND_CLOSES }, extra: 100 },
])('takes at most 1,000 observations in a $kind series', ({ series, extra }) => {
  expect(outcome(spec(series as Series))).toBe('drawn');
  expect(outcome(spec({ ...series, data: [...series.data, extra] } as Series))).toBe(
    'Invalid chart: series[0].data must have 1 to 1000 entries, got 1001',
  );
});

// One run of samples, each within six bandwidths of the next, from 0 to 477.5: at bandwidth 1 its
// density needs 65 points across and (477.5 + 6) × 4 + 1 in the run, 2,000 in all. A run a quarter
// bandwidth longer needs one more.
const AT_CAP = [...Array.from({ length: 96 }, (_, i) => i * 5), 477.5];
const PAST_CAP = [...AT_CAP.slice(0, -1), 477.75];

it('draws a density needing exactly 2,000 points, and names one needing more', () => {
  const series: Series = { type: 'distribution', display: 'density', name: 'D', data: AT_CAP, bandwidth: 1 };
  expect(outcome(spec(series))).toBe('drawn');
  expect(outcome(spec({ ...series, data: PAST_CAP }))).toBe(
    'Invalid chart: series[0].bandwidth is 1, too narrow for the sample range: its density needs 2001 points, more than 2000',
  );
});

it('charges histogram edges, one more than its bins, to the point budget', () => {
  const series: Series = { type: 'histogram', name: 'H', edges: [0, 1], data: new Array<number>(99_999).fill(0.5) };
  expect(outcome(spec(series))).toBe('Invalid chart: series hold at least 100001 data points in all, more than 100000');
});

it('stacks densities whose refined grids share points with the curve across them', () => {
  const density: Series = { type: 'distribution', display: 'density', name: 'A', data: [0, 100], bandwidth: 1, stack: 's' };
  expect(outcome(spec(density, { ...density, name: 'B' }))).toBe('drawn');
});

// Thirty narrow peaks at the same sample: each is drawable alone, but not stacked past the 25th.
const PEAKS = Array.from({ length: 30 }, (_, i): Series => ({
  type: 'distribution', display: 'density', name: `P${i}`, data: [0], bandwidth: 1e-14, stack: 's',
}));

it('names the first stacked density that the stack lifts out of the drawable range', () => {
  expect(outcome(spec(...PEAKS))).toBe('Invalid chart: series[25] produces coordinates outside the drawable range');
});

it('keeps densities with different stack names apart', () => {
  const a: Series = { type: 'distribution', display: 'density', name: 'A', data: [0], bandwidth: 1, stack: 'a' };
  expect(highest(marks(a, { ...a, name: 'B', stack: 'b' }).slice(1))).toBe(highest(marks(a)));
});

it('names the stacked density whose own curve leaves the drawable range', () => {
  const small: Series = { type: 'distribution', display: 'density', name: 'Small', data: [1, 2, 3], stack: 'all' };
  const large: Series = { type: 'distribution', display: 'density', name: 'Large', data: [999e12], stack: 'all' };
  expect(outcome(spec(small, large))).toBe('Invalid chart: series[1] produces coordinates outside the drawable range');
});

// Three equal markers 7 units across, valued on x, all starting at (50, 100).
const HORIZONTAL_DOTS: Glyph[] = Array.from({ length: 3 }, (): Glyph => ({
  kind: 'dot', label: '{0}', points: [[5, 1]], size: 7, symbol: 'circle', along: 'x',
}));
const ROOMY: Rect = { left: 0, top: 50, right: 200, bottom: 150 };
// Room for a marker each side of the group position only without the markers' own radius.
const NARROW: Rect = { left: 0, top: 91, right: 200, bottom: 109 };

// Three equal markers 7 units across, valued on y, all starting at (100, 50).
const VERTICAL_DOTS: Glyph[] = Array.from({ length: 3 }, (): Glyph => ({
  kind: 'dot', label: '{0}', points: [[1, 5]], size: 7, symbol: 'circle',
}));
// The same room as NARROW, across x.
const NARROW_ACROSS: Rect = { left: 91, top: 0, right: 109, bottom: 200 };
// Two square markers 7 units across, valued on x.
const SQUARES: Glyph[] = Array.from({ length: 2 }, (): Glyph => ({
  kind: 'dot', label: '{0}', points: [[5, 1]], size: 7, symbol: 'square', along: 'x',
}));

function placed(dots: readonly Glyph[], starts: readonly Point[], plot: Rect, mirrored: boolean): Point[][] | string {
  const screen = starts.map((start): Point[] => [start]);
  try {
    placeSwarm('series[0]', dots, screen, plot, mirrored);
    return screen;
  } catch (error) {
    return (error as Error).message;
  }
}

function swarmed(plot: Rect, mirrored: boolean, count = 3): Point[][] | string {
  return placed(HORIZONTAL_DOTS.slice(0, count), new Array<Point>(count).fill([50, 100]), plot, mirrored);
}

it('spreads a horizontal swarm across y, to both sides when mirrored', () => {
  expect(swarmed(ROOMY, true)).toEqual([[[50, 100]], [[50, 92]], [[50, 108]]]);
});

it('spreads a one-sided horizontal swarm up from its group position, as a dot plot stacks', () => {
  expect(swarmed(ROOMY, false)).toEqual([[[50, 100]], [[50, 92]], [[50, 84]]]);
});

it('spreads a one-sided vertical swarm rightward from its group position', () => {
  expect(placed(VERTICAL_DOTS, new Array<Point>(3).fill([100, 50]), ROOMY, false)).toEqual([[[100, 50]], [[108, 50]], [[116, 50]]]);
});

it('bounds a vertical swarm by the plot left and right, less the marker radius', () => {
  expect(placed(VERTICAL_DOTS.slice(0, 2), new Array<Point>(2).fill([100, 50]), NARROW_ACROSS, true)).toBe(
    'Invalid chart: series[0] needs more room for its swarm markers',
  );
});

it('keeps a one-sided horizontal swarm from crossing its group position', () => {
  expect(placed(HORIZONTAL_DOTS, [[50, 100], [57.5, 100], [64.7, 100]], ROOMY, false)).toMatchObject([
    [[50, 100]],
    [[57.5, expect.closeTo(97.216, 3)]],
    [[64.7, expect.closeTo(93.729, 3)]],
  ]);
});

const axisLabels = (series: Series): string[] => layoutChart(spec(series)).labels;
const swarmAt = (position: number, extra: object = {}): Series =>
  ({ type: 'distribution', display: 'swarm', name: `S${position}`, position, data: [5, 5, 5], ...extra }) as Series;

it('keeps half a unit each side of a swarm on its group axis, or one side when one-sided', () => {
  expect(axisLabels(swarmAt(0)).slice(0, 11)).toEqual(['-0.5', '-0.4', '-0.3', '-0.2', '-0.1', '0.0', '0.1', '0.2', '0.3', '0.4', '0.5']);
  expect(axisLabels(swarmAt(0, { mirrored: false })).slice(0, 11)).toEqual(
    ['0.00', '0.05', '0.10', '0.15', '0.20', '0.25', '0.30', '0.35', '0.40', '0.45', '0.50'],
  );
  expect(checkChart(spec(swarmAt(0, { mirrored: false, horizontal: true }))).series[0]).toMatchObject({
    swarm: { mirrored: false, room: [[5, 0], [5, 0.5]] },
  });
  expect(checkChart(spec(swarmAt(0, { horizontal: true }))).series[0]).toMatchObject({
    swarm: { mirrored: true, room: [[5, -0.5], [5, 0.5]] },
  });
});

const withGroupLimits = (series: Series, min: number, max: number): ChartSpec => ({
  ...spec(series),
  axes: { x: { type: 'linear', min, max }, y: { type: 'linear' } },
});

it('requires an end fixed on the group axis to leave a swarm its room', () => {
  expect(outcome(withGroupLimits(swarmAt(0), -0.3, 0.3))).toBe('Invalid chart: axes.x.min is -0.3, but the data reach -0.5');
  expect(outcome(withGroupLimits(swarmAt(0), -0.5, 0.3))).toBe('Invalid chart: axes.x.max is 0.3, but the data reach 0.5');
  expect(outcome(withGroupLimits(swarmAt(0), -0.5, 0.5))).toBe('drawn');
  expect(outcome(withGroupLimits(swarmAt(0, { mirrored: false }), 0, 0.5))).toBe('drawn');
});

it('keeps a swarm and its room within the drawable range', () => {
  const outside = 'Invalid chart: series[0] produces coordinates outside the drawable range';
  expect(outcome(spec(swarmAt(1e15)))).toBe(outside);
  expect(outcome(spec(swarmAt(-1e15)))).toBe(outside);
  expect(outcome(spec(swarmAt(-1e15, { mirrored: false })))).toBe('drawn');
});

it('draws one-sided swarms at neighbouring positions on default axes', () => {
  expect(outcome(spec(swarmAt(1, { mirrored: false }), swarmAt(2, { mirrored: false })))).toBe('drawn');
});

it('mirrors a swarm unless told otherwise, which needs room on both sides', () => {
  const chart = { ...spec(CROWD), axes: { x: { type: 'linear', min: -1, max: 1 }, y: { type: 'linear' } } } as ChartSpec;
  expect(outcome(chart)).toBe('drawn');
  expect(outcome({ ...chart, series: [{ ...CROWD, mirrored: false } as Series] })).toBe(
    'Invalid chart: series[0] needs more room for its swarm markers',
  );
});

it('packs square swarm markers by their full width', () => {
  expect(placed(SQUARES, [[50, 100], [53, 100]], ROOMY, true)).toEqual([[[50, 100]], [[53, 92]]]);
});

it('bounds a horizontal swarm by the plot top and bottom, less the marker radius', () => {
  expect(swarmed(NARROW, true, 2)).toBe('Invalid chart: series[0] needs more room for its swarm markers');
});

function legendShape(series: Series) {
  const chart = checkChart(spec(series));
  return chart.system === 'cartesian' ? legendOf(chart.series[0]!) : undefined;
}

it('shows a series of dots by its marker in the legend', () => {
  expect(legendShape({ type: 'distribution', display: 'swarm', name: 'S', data: [1, 2], symbol: 'square' })).toEqual({
    line: false,
    symbol: 'square',
  });
  expect(legendShape({ type: 'distribution', display: 'normalQQ', name: 'Q', data: [1, 2, 3] })).toEqual({
    line: false,
    symbol: 'circle',
  });
});

it('starts no point-and-figure column for a pullback one box short of the reversal', () => {
  expect(marks({ type: 'market', display: 'pointFigure', name: 'P', data: [10, 13, 11], boxSize: 1, reversal: 3 })).toMatchObject([
    { label: 'X', points: [[0, 11]] },
    { label: 'X', points: [[0, 12]] },
    { label: 'X', points: [[0, 13]] },
  ]);
});

it('rejects stacked histograms counted differently', () => {
  const counts: Series = { type: 'histogram', name: 'A', edges: [0, 1, 2], data: [0.5], stack: 's' };
  const message = 'Invalid chart: series[1] must match the edges, frequency and cumulative options of series[0] in its stack';
  expect(outcome(spec(counts, { ...counts, name: 'B', frequency: 'relative' }))).toBe(message);
  expect(outcome(spec(counts, { ...counts, name: 'B', cumulative: true }))).toBe(message);
  expect(outcome(spec(counts, { ...counts, name: 'B', edges: [0, 1.5, 2] }))).toBe(message);
});

it.each([
  ['geometry past the drawable range', { type: 'relationship', display: 'histogram2d', name: 'S', data: [[1e15, 0]] },
    'Invalid chart: series[0] produces coordinates outside the drawable range'],
  ['an indicator with too few observations', { type: 'market', display: 'sma', name: 'M', data: [1, 2], period: 5 },
    'Invalid chart: series[0] has too few observations for Simple moving average'],
  ['a control chart of one measurement', { type: 'market', display: 'control', name: 'C', data: [1] },
    'Invalid chart: series[0] needs at least two measurements'],
  ['a negative Stanford error', { type: 'relationship', display: 'stanford', name: 'S', alertLimit: 1, data: [[-1, 1]] },
    'Invalid chart: series[0] needs nonnegative errors and protection levels'],
  ['a forest interval out of order', { type: 'relationship', display: 'forest', name: 'F', data: [[2, 1]], estimates: [1.5] },
    'Invalid chart: series[0].data[0] needs an ordered interval containing its estimate'],
  ['a normal curve of constant samples', { type: 'distribution', display: 'normal', name: 'N', data: [3, 3] },
    'Invalid chart: series[0] needs sample variance above zero to fit a normal curve'],
  ['a polynomial with too few distinct x values', { type: 'relationship', display: 'regression', method: 'polynomial', degree: 3, name: 'R', data: [[0, 1], [1, 2], [2, 3]] },
    'Invalid chart: series[0] needs more distinct x values than the polynomial degree'],
  ['a fit at one x value', { type: 'relationship', display: 'regression', name: 'R', data: [[1, 1], [1, 2]] },
    'Invalid chart: series[0] needs distinct x values'],
  ['bins too narrow for the data', { type: 'relationship', display: 'histogram2d', name: 'S', binWidth: 1e-10, data: [[1e15, 0]] },
    'Invalid chart: series[0] needs bin dimensions resolvable at the data coordinates'],
  ['a dot-plot bin too narrow for the samples', { type: 'distribution', display: 'dotPlot', name: 'D', binWidth: 1e-10, data: [1e15] },
    'Invalid chart: series[0] needs a bin width resolvable at the sample coordinates'],
  ['a logarithmic fit at zero', { type: 'relationship', display: 'regression', method: 'logarithmic', name: 'R', data: [[0, 1], [1, 2]] },
    'Invalid chart: series[0].data[0] needs a positive value for the logarithm'],
  ['a fractional stem-and-leaf sample', { type: 'distribution', display: 'stemLeaf', name: 'S', data: [1.5] },
    'Invalid chart: series[0] stem-and-leaf values must be nonnegative integers'],
  ['a negative stem-and-leaf sample', { type: 'distribution', display: 'stemLeaf', name: 'S', data: [-5, 3] },
    'Invalid chart: series[0] stem-and-leaf values must be nonnegative integers'],
  ['a display named by an inherited property', { type: 'distribution', display: 'toString', name: 'D', data: [1] },
    'Invalid chart: series[0].display must be one of ecdf, box, violin, raincloud, density, ridge, normal, normalQQ, swarm, dotPlot, isotype, stemLeaf, got "toString"'],
  ['a polar violin past the angle limit', { type: 'distribution', display: 'violin', name: 'V', polar: true, position: 999999.5, data: [1, 2, 3] },
    'Invalid chart: series[0].position must leave the violin inside ±1000000 radians'],
  ['an option of another regression method', { type: 'relationship', display: 'regression', method: 'linear', span: 0.5, name: 'R', data: [[0, 1], [1, 2]] },
    'Invalid chart: series[0].span needs the loess method'],
])('rejects %s', (_case, series, message) => {
  expect(outcome(spec(series as Series))).toBe(message);
});

it('writes polar violin samples as given, since no axis measures them', () => {
  const chart = spec({ type: 'distribution', display: 'violin', name: 'V', polar: true, points: true, data: [12, 14] });
  const svg = toSvgChart(layoutChart({ ...chart, axes: { x: { type: 'linear' }, y: { type: 'linear', format: EUROS } } }));
  expect(svg).toContain('V, 12<');
  expect(svg).toContain('V, 14<');
});

it('writes forest intervals and estimates in the x axis format', () => {
  const chart = spec({ type: 'relationship', display: 'forest', name: 'F', data: [[1, 2]], estimates: [1.5] });
  const svg = toSvgChart(layoutChart({ ...chart, axes: { x: { type: 'linear', format: EUROS }, y: { type: 'linear' } } }));
  expect(svg).toContain('F, Interval €1,0 to €2,0');
  expect(svg).toContain('F, €1,5');
});

// Where a chart places a text, and its stem-and-leaf rows, laid out afresh each time. Text is placed
// to the hundredth of a unit, so equal steps agree to within a few hundredths.
const placedAt = (chart: ChartSpec, text: string) => placesOf(layoutChart(chart), text);
const boxesOf = (chart: ChartSpec, text: string) => placedAs(layoutChart(chart), text).map((placed) => placed.box);
const rowsOf = (chart: ChartSpec) => placedTexts(layoutChart(chart)).filter((placed) => placed.text.includes('|'));
const rowStarts = (chart: ChartSpec) => rowsOf(chart).map((row) => row.box.x);
const rowLevels = (chart: ChartSpec) => rowsOf(chart).map((row) => row.at[1]);
const rowTexts = (chart: ChartSpec) => rowsOf(chart).map((row) => row.text);
const flagOf = (chart: ChartSpec) => placedTexts(layoutChart(chart)).find((placed) => placed.text.startsWith('W'))!;

// The series alone on hidden axes: the plot then starts 8 units in from each edge of the 480 by 300
// chart, and a line of text is 15.12 units high.
const onHiddenAxes = (...series: Series[]): ChartSpec => ({
  ...spec(...series), legend: 'none', axes: { x: { type: 'linear', hidden: true }, y: { type: 'linear', hidden: true } },
});

// Closes from 0 to 40 in one-unit boxes: one rising column, an X at each level from 1 to 40.
const RISE: Series = { type: 'market', display: 'pointFigure', name: 'P', boxSize: 1, data: [0, 40] };
const RISE_FIXED: ChartSpec = { ...spec(RISE), axes: { x: { type: 'linear' }, y: { type: 'linear', min: 0, max: 40 } } };
const SCATTER: Series = { type: 'scatter', name: 'S', data: [[0, 1]] };
const RISE_AFTER_SCATTER = onHiddenAxes(SCATTER, RISE);
const RISE_BEFORE_SCATTER = onHiddenAxes(RISE, SCATTER);

// Four columns, 0 to 3: up to 5, down to 2, up to 6, down to 1. The x ticks name the first and last.
const COLUMNS: ChartSpec = {
  ...spec({ type: 'market', display: 'pointFigure', name: 'P', boxSize: 1, reversal: 3, data: [0, 5, 2, 6, 1] }),
  axes: { x: { type: 'linear', ticks: [{ value: 0, label: 'first' }, { value: 3, label: 'last' }] }, y: { type: 'linear' } },
};

// Two sessions, the second flagged at its high of 14, the top tick.
const FLAGGED: Series = {
  type: 'market', display: 'candlestick', name: 'C', data: [[10, 12, 9, 11], [11, 14, 10, 13]], flags: [{ index: 1, label: 'Peak' }],
};
// One session flagged with 100 characters, wider than the plot.
const LONG_FLAG = onHiddenAxes({
  type: 'market', display: 'candlestick', name: 'C', data: [[10, 12, 9, 11]], flags: [{ index: 0, label: 'W'.repeat(100) }],
});

// Four stems, 1 to 4.
const STEMS = onHiddenAxes({
  type: 'distribution', display: 'stemLeaf', name: 'T', data: [12, 15, 21, 23, 24, 27, 28, 29, 30, 31, 33, 35, 36, 38, 41],
});
const STEMS_X_FIXED: ChartSpec = { ...STEMS, axes: { x: { type: 'linear', min: 5, max: 10 }, y: { type: 'linear' } } };

// One stem, 1, with that many leaves of 7.
const stemOf = (leaves: number): Series => ({ type: 'distribution', display: 'stemLeaf', name: 'T', data: new Array<number>(leaves).fill(17) });
const ROW_TOO_WIDE = 'Invalid chart: series[0] has a row of text wider than the plot';

describe('text marks of statistical series', () => {
  it('draws the top point-and-figure box at its value, on a free and a fixed end', () => {
    const free = placedAt(spec(RISE), 'X');
    expect(free.at(-1)![1]).toBe(placedAt(spec(RISE), '40')[0]![1]);
    expect(free.at(-2)![1]).toBeGreaterThan(free.at(-1)![1]);
    expect(placedAt(RISE_FIXED, 'X').at(-1)![1]).toBe(placedAt(RISE_FIXED, '40')[0]![1]);
  });

  it('keeps room inside the plot for the top point-and-figure box, whichever series comes first', () => {
    expect(boxesOf(onHiddenAxes(RISE), 'X').at(-1)!.y).toBeCloseTo(8, 2);
    expect(boxesOf(RISE_AFTER_SCATTER, 'X').at(-1)!.y).toBeCloseTo(8, 2);
    expect(boxesOf(RISE_BEFORE_SCATTER, 'X').at(-1)!.y).toBeCloseTo(8, 2);
  });

  it('centres point-and-figure boxes on their positions, across and down', () => {
    const first = boxesOf(COLUMNS, 'X')[0]!;
    const last = boxesOf(COLUMNS, 'O').at(-1)!;
    const top = boxesOf(spec(RISE), 'X').at(-1)!;
    expect(first.x + first.width / 2).toBeCloseTo(placedAt(COLUMNS, 'first')[0]![0], 1);
    expect(last.x + last.width / 2).toBeCloseTo(placedAt(COLUMNS, 'last')[0]![0], 1);
    expect(top.y + top.height / 2).toBeCloseTo(placedAt(spec(RISE), '40')[0]![1], 1);
  });

  it('moves a flag on the top tick down into the plot, as a data label is', () => {
    expect(placedAt(spec(FLAGGED), 'Peak')[0]![1]).toBeGreaterThan(placedAt(spec(FLAGGED), '14')[0]![1]);
  });

  it('cuts a flag wider than the plot short, inside the plot', () => {
    const flag = flagOf(LONG_FLAG);
    expect(flag.text).toMatch(/^W+…$/);
    expect(flag.box.x).toBeGreaterThanOrEqual(8);
    expect(flag.box.x + flag.box.width).toBeLessThanOrEqual(480 - 8);
  });

  it('spaces stem rows evenly, the first and last included', () => {
    const levels = rowLevels(STEMS);
    expect(levels[1]! - levels[0]!).toBeCloseTo(levels[2]! - levels[1]!, 1);
    expect(levels[3]! - levels[2]!).toBeCloseTo(levels[2]! - levels[1]!, 1);
  });

  it('starts every stem row at the left edge of the plot', () => {
    expect(rowStarts(STEMS)).toEqual([8, 8, 8, 8]);
  });

  it('keeps half a line of room above the top stem row and below the bottom one', () => {
    expect(rowLevels(STEMS)[0]).toBeCloseTo(8 + 7.56, 2);
    expect(rowLevels(STEMS)[3]).toBeCloseTo(300 - 8 - 7.56, 2);
  });

  it('counts a stem-and-leaf display as x = 0 on the x axis', () => {
    expect(outcome(STEMS_X_FIXED)).toBe('Invalid chart: axes.x.min is 5, but the data reach 0');
  });

  it('draws a stem row whole when it fits', () => {
    expect(rowTexts(spec(stemOf(30)))).toEqual([`1 | ${'7 '.repeat(29)}7`]);
  });

  it('draws a stem row as wide as the plot allows and rejects one leaf more', () => {
    expect(outcome(onHiddenAxes(stemOf(39)))).toBe('drawn');
    expect(outcome(onHiddenAxes(stemOf(40)))).toBe(ROW_TOO_WIDE);
    // Visible axes narrow the plot.
    expect(outcome(spec(stemOf(35)))).toBe('drawn');
    expect(outcome(spec(stemOf(36)))).toBe(ROW_TOO_WIDE);
    // The row is measured in the chart's own font size: 30 leaves fit at 12, not at 24.
    expect(outcome({ ...onHiddenAxes(stemOf(15)), fontSize: 24 })).toBe('drawn');
    expect(outcome({ ...onHiddenAxes(stemOf(30)), fontSize: 24 })).toBe(ROW_TOO_WIDE);
    // A row of ten leaves is 128.47 units wide: it fits a plot of 129 units or exactly its own width,
    // not one of 128.
    expect(outcome({ ...onHiddenAxes(stemOf(10)), width: 145 })).toBe('drawn');
    expect(outcome({ ...onHiddenAxes(stemOf(10)), width: 144.47 })).toBe('drawn');
    expect(outcome({ ...onHiddenAxes(stemOf(10)), width: 144 })).toBe(ROW_TOO_WIDE);
  });
});
