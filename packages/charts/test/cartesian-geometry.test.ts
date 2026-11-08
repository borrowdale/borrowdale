import { describe, expect, it } from 'vitest';
import { layoutChart, toSvgChart, type ChartLayout, type ChartNode, type ChartSpec } from '@borrowdale/charts';
import { gradientAttributes } from '../src/gradients.js';
import { bandScale } from '../src/scale.js';
import { symbolShape } from '../src/symbols.js';
import { shapesOf, texts } from './support/layout.js';

const categories = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const bars = (width: number, weights?: number[]): ChartSpec => ({ width, height: 300, legend: 'none',
  axes: { x: { type: 'band', categories, ...(weights ? { weights } : {}) }, y: { type: 'linear' } },
  series: [{ type: 'bar', name: 'S', data: [1, 2, 3, 4, 5, 6] }] });

const unit = { x: { type: 'linear', min: 0, max: 1 }, y: { type: 'linear', min: 0, max: 3 } } as const;
const difference = (data: [number, number, number][]): ChartLayout => layoutChart({ width: 300, height: 200,
  legend: 'none', style: { roughness: 0 }, axes: unit,
  series: [{ type: 'xyArea', name: 'D', data, difference: { positive: '#00ff00', negative: '#ff0000' } }] });
// Edges that cross by less than the plot can tell apart, on an axis reaching 1e15, a third of the
// way along, since the first gap is half the second.
const nearFlat: ChartSpec = { width: 300, height: 200, legend: 'none', style: { roughness: 0 }, axes: { x: { type: 'linear', min: 0, max: 1 }, y: { type: 'linear', min: 0, max: 1e15 } },
  series: [{ type: 'xyArea', name: 'D', data: [[0, 1, 1 + 2 ** -52], [1, 1 + 2 ** -51, 1]], difference: { positive: '#00ff00', negative: '#ff0000' } }] };
// Edges crossing on a square-root axis: by their values a little past halfway, by their placed
// heights 8/15 of the way, where they meet on the plot.
const onRoots: ChartSpec = { width: 300, height: 200, legend: 'none', style: { roughness: 0 }, axes: { x: { type: 'linear', min: 0, max: 1 }, y: { type: 'sqrt', min: 0, max: 100 } },
  series: [{ type: 'xyArea', name: 'D', data: [[0, 1, 81], [1, 49, 0]], difference: { positive: '#00ff00', negative: '#ff0000' } }] };
const firstPath = (nodes: ChartNode[]) => nodes[0]?.kind === 'sketch' ? nodes[0].sketch.paths[0] : undefined;

const stops = [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }];
const gradientsOf = (layout: ChartLayout) => shapesOf(layout, 'G').flatMap((node) =>
  node.kind === 'gradient' ? [[node.from, node.to]] : []);
const line = (n: number, extra: object): ChartSpec => ({ width: 600, height: 400, legend: 'none',
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ type: 'xyLine', name: 'G', data: Array.from({ length: n }, (_, i) => [i, i % 7] as const), ...extra }] } as ChartSpec);
const layingOut = (spec: ChartSpec) => () => layoutChart(spec);
// Within every limit on the spec: 10,000 tooltips of about 250 characters, 2.5 million in all, but
// nearly every one a quote, which escaping makes six. Its bars have no length, so they draw no strokes.
// Within every limit on the spec: 100,000 segments, each drawn as its own path repeating the style's
// colour of 88 characters and its 16 dash lengths, about 400 characters a path.
const longStyle = { roughness: 0, stroke: `rgb(${'1'.repeat(40)} ${'2'.repeat(40)} 3)`, strokeLineDash: Array(16).fill(0.123456789012345) };
const styledSegments: ChartSpec = { width: 600, height: 400, legend: 'none', style: longStyle,
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ type: 'xyLine', name: 'S', data: Array.from({ length: 100_000 }, (_, i) => [i, i % 7] as const), segments: Array(99_999).fill({ width: 1 }) }] } as ChartSpec;
const quoted = (index: number) => `${'"'.repeat(96)}${String(index).padStart(4, '0')}`;
const quotedIntervals: ChartSpec = { width: 600, height: 400, legend: 'none',
  axes: { x: { type: 'band', categories: Array.from({ length: 1_000 }, (_, i) => quoted(i)) },
    y: { type: 'linear', format: { prefix: '"'.repeat(10), suffix: '"'.repeat(10) } } },
  series: Array.from({ length: 10 }, (_, i) => ({ type: 'interval', name: quoted(i), color: '#336699', data: Array(1_000).fill([1, 1]) })) } as ChartSpec;
const count = (text: string, part: string): number => text.split(part).length - 1;

const abc = { type: 'band', categories: ['A', 'B', 'C'] } as const;
const marks = (series: ChartSpec['series'], extra: Partial<ChartSpec> = {}): ChartLayout => layoutChart({ width: 300,
  height: 200, legend: 'none', style: { roughness: 0 }, axes: { x: abc, y: { type: 'linear', min: 0, max: 4 } },
  series, ...extra } as ChartSpec);
const bar = (name: string) => ({ type: 'bar', name, data: [1, 2, 3] }) as const;
const overlaid = { type: 'interval', name: 'I', data: [[1, 3], null, null], overlay: true, display: 'line' } as const;
const ink = '#123456';
// The paths of the top-level shapes drawn in `color`, as annotations are.
const strokedWith = (layout: ChartLayout, color: string) => layout.nodes.flatMap((node) =>
  node.kind === 'sketch' && node.sketch.paths.some((path) => path.stroke === color) ? [node.sketch.paths[0]] : []);
const close = (value: number) => expect.closeTo(value, 9);

describe('weighted band labels', () => {
  it('keeps the labels of wide bands that a narrow band would otherwise thin', () => {
    expect(texts(layoutChart(bars(600, [1, 10, 10, 10, 10, 10])))).toEqual(expect.arrayContaining(categories));
  });

  it('still drops a label that would overlap the last one kept', () => {
    expect(texts(layoutChart(bars(300, [1, 1, 1, 10, 10, 10])))).toEqual(
      ['Alpha', 'Delta', 'Epsilon', 'Zeta', '0', '1', '2', '3', '4', '5', '6']);
  });

  it('draws equal weights exactly as no weights', () => {
    expect(toSvgChart(layoutChart(bars(260, [1, 1, 1, 1, 1, 1])))).toBe(toSvgChart(layoutChart(bars(260))));
  });

  it('places padded weighted bands with equal gaps and proportional widths', () => {
    const scale = bandScale(3, [0, 600], 0.2, [1, 3, 2]);

    expect(scale.start(0)).toBeCloseTo(37.5, 9);
    expect(scale.width(0)).toBeCloseTo(75, 9);
    expect(scale.start(2) + scale.width(2)).toBeCloseTo(562.5, 9);
  });
});

describe('crossing fills', () => {
  it('splits an asymmetric crossing where the boundaries meet', () => {
    expect(firstPath(shapesOf(difference([[0, 0, 3], [1, 2, 0]]), 'D'))).toMatchObject(
      { d: 'M27.4 165.88 L27.4 15.56 L181.25 105.75', fill: '#00ff00' });
  });

  it('colours a span that only touches at one end by its open side', () => {
    expect(firstPath(shapesOf(difference([[0, 1, 1], [1, 0, 2]]), 'D'))).toMatchObject({ fill: '#00ff00' });
  });

  it('fills a difference whose edges cross by less than the plot can tell apart, where the values cross', () => {
    expect(firstPath(shapesOf(layoutChart(nearFlat), 'D'))).toMatchObject({ d: 'M159.06 165.88 L159.06 165.88 L200.64 165.88', fill: '#00ff00' });
  });

  it('splits a crossing on a square-root axis where the placed edges meet', () => {
    expect(firstPath(shapesOf(layoutChart(onRoots), 'D'))).toMatchObject({ d: 'M40.06 150.85 L40.06 30.59 L170.06 102.75', fill: '#00ff00' });
  });
});

describe('continuous gradients', () => {
  it('runs a y gradient from the bottom of the plot to the top', () => {
    expect(gradientsOf(layoutChart(line(2, { gradient: { axis: 'y', stops } })))).toEqual(
      [[[38.66, 365.88], [38.66, 15.56]]]);
  });

  it('defines a tapered gradient path once, however many edges it has', () => {
    const svg = toSvgChart(layoutChart(line(50, { widths: Array(50).fill(4), gradient: { axis: 'x', stops } })));

    expect(count(svg, '<linearGradient')).toBe(1);
    expect(count(svg, 'url(#chart-gradient-0)')).toBeGreaterThan(1);
  });
});

describe('data labels and image markers', () => {
  it('accepts 10,000 data labels', () => {
    expect(layingOut(line(10_000, { dataLabels: true }))).not.toThrow();
  });

  it('rejects more than 10,000 data labels', () => {
    expect(layingOut(line(10_001, { dataLabels: true }))).toThrow(
      'Drawing too complex (more than 10000 data labels and images)');
  });

  it('counts image markers with data labels', () => {
    expect(layingOut(line(5_001, { dataLabels: true, symbol: { image: 'dot' } }))).toThrow(
      'Drawing too complex (more than 10000 data labels and images)');
  });

  it('rejects more than 8,000,000 characters of colours and dashes repeated by its paths', () => {
    expect(layingOut(styledSegments)).toThrow(
      'Drawing too complex (more than 8000000 characters of colours and dashes)');
  });

  it('rejects more than 8,000,000 characters of tooltips, counted as they are escaped', () => {
    expect(layingOut(quotedIntervals)).toThrow(
      'Drawing too complex (more than 8000000 characters of labels and tooltips)');
  });
});

describe('limits of the Cartesian extensions', () => {
  const band = { type: 'band', categories: ['A', 'B'] } as const;
  const interval = (width: number): ChartSpec => ({ width: 300, height: 200, axes: { x: band, y: { type: 'linear' } },
    series: [{ type: 'interval', name: 'I', data: [[0, 1], [1, 2]], width }] });
  const weighted = (weights: number[]): ChartSpec => ({ width: 300, height: 200,
    axes: { x: { ...band, weights }, y: { type: 'linear' } }, series: [{ type: 'bar', name: 'B', data: [1, 2] }] });
  const ramp = (n: number) => Array.from({ length: n }, (_, i) => ({ offset: i / (n - 1), color: '#000000' }));

  it.each<[string, ChartSpec]>([
    ['32 gradient stops', line(2, { gradient: { axis: 'x', stops: ramp(32) } })],
    ['a weight of 0.000001', weighted([0.000001, 1])],
    ['a weight of 1000000', weighted([1000000, 1])],
    ['an interval width of 0.05', interval(0.05)],
    ['an interval width of 1', interval(1)],
  ])('accepts %s', (_, spec) => {
    expect(layingOut(spec)).not.toThrow();
  });

  it.each<[string, ChartSpec, string]>([
    ['33 gradient stops', line(2, { gradient: { axis: 'x', stops: ramp(33) } }), 'series[0].gradient.stops'],
    ['a weight of 0', weighted([0, 1]), 'axes.x.weights[0]'],
    ['a weight above 1000000', weighted([1000001, 1]), 'axes.x.weights[0]'],
    ['an interval width below 0.05', interval(0.049), 'series[0].width'],
    ['an interval width above 1', interval(1.01), 'series[0].width'],
    ['segments with a gradient', line(2, { segments: [null], gradient: { axis: 'x', stops } }),
      'cannot combine segments and gradient'],
    ['segments with tapered widths', line(2, { segments: [null], widths: [1, 2] }),
      'cannot combine segments and tapered widths'],
  ])('rejects %s', (_, spec, message) => {
    expect(layingOut(spec)).toThrow(message);
  });
});

describe('marks the examples leave unpinned', () => {
  it('draws a star with an inner radius of 0.4', () => {
    expect(symbolShape('star', [0, 0], 2)).toEqual({ kind: 'polygon', points: [
      [close(0), close(-1)], [close(0.2351141009), close(-0.3236067977)], [close(0.9510565163), close(-0.3090169944)],
      [close(0.3804226065), close(0.1236067977)], [close(0.5877852523), close(0.8090169944)], [close(0), close(0.4)],
      [close(-0.5877852523), close(0.8090169944)], [close(-0.3804226065), close(0.1236067977)],
      [close(-0.9510565163), close(-0.3090169944)], [close(-0.2351141009), close(-0.3236067977)]] });
  });

  it('writes a gradient from its start to its end', () => {
    expect(gradientAttributes({ kind: 'gradient', from: [0, 10], to: [0, 0], stops, sketch: { paths: [] } }, 'g'))
      .toEqual({ id: 'g', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 10, x2: 0, y2: 0 });
  });

  it('leaves the slots of grouped bars to the bars beside an overlay', () => {
    expect(shapesOf(marks([bar('Bar'), overlaid]), 'Bar, A: 1')).toEqual(shapesOf(marks([bar('Bar')]), 'Bar, A: 1'));
  });

  it('centres an overlay on its category, not on a slot', () => {
    expect(firstPath(shapesOf(marks([bar('P'), bar('Q'), overlaid]), 'I, A: 1 to 3'))).toMatchObject(
      { d: expect.stringMatching(/^M77\.01 128\.3 /) });
  });

  it('keeps the data label of a zero-height bar', () => {
    expect(shapesOf(marks([{ type: 'bar', name: 'Bar', data: [0, 2, 3], dataLabels: true }]), 'Bar, A: 0'))
      .toMatchObject([{ kind: 'text', text: { text: '0' } }]);
  });

  it('places a band annotation at the centre of its weighted band', () => {
    const layout = marks([bar('Bar')], { axes: { x: { ...abc, weights: [1, 3, 1] }, y: { type: 'linear', min: 0, max: 4 } },
      annotations: [{ type: 'line', axis: 'x', value: 'B', color: ink }] });

    expect(strokedWith(layout, ink)).toMatchObject([{ d: expect.stringMatching(/^M159\.7 15\.56 /) }]);
  });

  it('shortens the head of a short arrow to half its length', () => {
    const layout = layoutChart({ width: 300, height: 200, legend: 'none', style: { roughness: 0 },
      axes: { x: { type: 'linear', min: 0, max: 100 }, y: { type: 'linear', min: 0, max: 1 } },
      series: [{ type: 'xyLine', name: 'L', data: [[0, 0], [100, 1]] }],
      annotations: [{ type: 'arrow', from: [50, 0.5], to: [52, 0.5], color: ink }] });

    expect(strokedWith(layout, ink)).toMatchObject([{ d: expect.stringMatching(/^M159\.85 90\.72 /) },
      { d: expect.stringMatching(/^M162\.28 91\.94 /) }]);
  });
});
