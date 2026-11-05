import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec, type Series } from '@borrowdale/charts';
import cases from '../../../apps/examples/statistical-cases.json' with { type: 'json' };
import { checkChart } from '../src/validate.js';
import { swarmOffset } from '../src/statistics/swarm.js';

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
    const offset = swarmOffset(8, 4, neighbours, true, -100, 100)!;
    expect(offset ** 2 + 3 ** 2).toBeCloseTo(8 ** 2, 10);
    expect(swarmOffset(8, 4, neighbours, true, -1, 1)).toBeUndefined();
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
    expect(marks({ ...series, display: 'renko' }).map((m) => m.label)).toEqual(['11', '12', '10', '9']);
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
  const result = marks({type:'distribution',display:'dotPlot',name:'D',data:[0.3,0.4],binWidth:0.10000000000000002});
  expect(result.map(m=>m.points[0]![1])).toEqual([0.3,0.3]);
});
it('packs square markers using their full width while their vertical spans overlap', () => {
  expect(Math.abs(swarmOffset(7.5,6,[{value:0,radius:6,offset:0}],true,-50,50,false)!)).toBe(13);
});
it('retains small observations in a moving average with cancelling large values', () => {
  const data = [1e15,-1e15,...Array<number>(998).fill(1)];
  expect(marks({type:'market',display:'sma',name:'M',data,period:1000})[0]!.points[0]![1]).toBe(.998);
});
it('retains count shading when a series supplies its outline colour', () => {
  const chart=spec({type:'relationship',display:'histogram2d',name:'D',color:'#dd5500',data:[[0,0],[0,0],[1,0]]});
  const svg=toSvgChart(layoutChart(chart));
  expect(svg).toContain('fill="rgb(35,103,149)"');
  expect(svg).toContain('fill="rgb(130,170,197)"');
  expect(svg).toContain('stroke="#dd5500"');
});
it('fits a straight line inside its exact fixed ordinate limits', () => {
  const chart = spec({type:'relationship',display:'regression',name:'L',data:[[0,0],[1,9],[2,18]]});
  chart.axes = {x:{type:'linear'},y:{type:'linear',min:0,max:18}};
  expect(toSvgChart(layoutChart(chart))).toContain('L, linear');
});
it('preserves the local linear fit for very small predictor units', () => {
  const fit=marks({type:'relationship',display:'regression',method:'loess',span:1,name:'L',data:[0,1,2,3].map(x=>[x*1e-170,x])});
  expect(fit[0]!.points[0]![1]).toBeCloseTo(0,10);
  expect(fit[0]!.points.at(-1)![1]).toBeCloseTo(3,10);
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
