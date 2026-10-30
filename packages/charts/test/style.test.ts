import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartLayout, type ChartSpec } from '@borrowdale/charts';
import { shapesOf } from './support/layout.js';

const revenue: ChartSpec = {
  width: 400,
  height: 300,
  axes: { x: { type: 'band', categories: ['Jan', 'Feb'] }, y: { type: 'linear', format: { prefix: '€' } } },
  series: [{ type: 'bar', name: 'Pencils', data: [12, 15] }],
};
// One bar, seeded "1|a" and named "b", or seeded "1" and named "a|b": the same parts joined with "|".
const pipedSeed: ChartSpec = { ...revenue, title: undefined, seed: '1|a', series: [{ type: 'bar', name: 'b', data: [12, 15] }] };
const pipedName: ChartSpec = { ...pipedSeed, seed: '1', series: [{ type: 'bar', name: 'a|b', data: [12, 15] }] };
// A line through every one of the most categories a chart may have, from the bottom of the plot to the
// top at every point: the most a line can turn.
const thousand = Array.from({ length: 1000 }, (_, i) => `c${i}`);
const zigzag = Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? 0 : 100));
const zigzags = (curve: 'linear' | 'step', count: number): ChartSpec => ({
  width: 600,
  height: 400,
  legend: 'none',
  axes: { x: { type: 'band', categories: thousand }, y: { type: 'linear' } },
  series: Array.from({ length: count }, (_, k) => ({ type: 'line', name: `L${k}`, curve, data: zigzag })),
});
// A chart style with a fill, which lines and the edges of areas must not take.
const filledStyle = { fill: '#f00', fillStyle: 'solid' } as const;
const filledLines: ChartSpec = {
  ...revenue,
  style: filledStyle,
  series: [
    { type: 'line', name: 'Straight', data: [10, 20] },
    { type: 'line', name: 'Smooth', curve: 'monotone', data: [20, 10] },
    { type: 'rangeArea', name: 'Range', data: [[1, 2], [3, 5]] },
  ],
};
const filledRadarLine: ChartSpec = {
  width: 300,
  height: 300,
  style: filledStyle,
  axes: { angle: { type: 'band', categories: ['a', 'b', 'c'] } },
  series: [{ type: 'polarLine', name: 'Loop', data: [1, 2, 3] }],
};
const filledRadar: ChartSpec = { ...filledRadarLine, series: [{ type: 'radar', name: 'R', data: [1, 2, 3] }] };
const filledRose: ChartSpec = {
  ...filledRadarLine,
  axes: { angle: { type: 'band', categories: ['a', 'b', 'c'] }, radius: { type: 'linear', shape: 'circle' } },
  series: [{ type: 'rose', name: 'R', data: [1, 2, 3] }],
};
const plainGauge: ChartSpec = { width: 300, height: 260, series: [{ type: 'gauge', name: 'G', value: 50 }] };
const filledGauge: ChartSpec = { ...plainGauge, style: filledStyle };

/** Every fill the paths of a mark are painted with, each once. */
function fillsOf(layout: ChartLayout, title: string): string[] {
  const paths = shapesOf(layout, title).flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths : []));
  return [...new Set(paths.map((path) => path.fill))];
}

/** How many paths of a mark are filled. */
function filledPathsOf(layout: ChartLayout, title: string): number {
  const paths = shapesOf(layout, title).flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths : []));
  return paths.filter((path) => path.fill !== 'none').length;
}

/** How many paths outside the series' marks are filled: legend swatches, gridlines, axes, ticks, tracks, hubs. */
function filledFramePaths(layout: ChartLayout): number {
  const paths = layout.nodes.flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths : []));
  return paths.filter((path) => path.fill !== 'none').length;
}

describe('chart strokes and fills', () => {
  it('draws a straight line through 1,000 categories that turns at every one', () => {
    expect(layoutChart(zigzags('linear', 1)).nodes.length).toBeGreaterThan(0);
  });

  it('draws 20 such straight lines, and 10 such step lines, within the budget', () => {
    expect(layoutChart(zigzags('linear', 20)).nodes.length).toBeGreaterThan(0);
    expect(layoutChart(zigzags('step', 10)).nodes.length).toBeGreaterThan(0);
  });

  it.each(['Straight', 'Smooth'])('fills no part of the %s line under a chart style with a fill', (title) => {
    expect(fillsOf(layoutChart(filledLines), title)).toEqual(['none']);
  });

  it('fills a range area under a chart style with a fill, but not its edges', () => {
    expect(filledPathsOf(layoutChart(filledLines), 'Range')).toBe(1);
  });

  it.each([
    ['polygon gridlines', filledRadar],
    ['circle gridlines', filledRose],
    ['axes, ticks and gridlines', { ...filledLines, legend: 'none' } as ChartSpec],
  ])('fills none of the %s under a chart style with a fill', (_case, spec) => {
    expect(filledFramePaths(layoutChart(spec))).toBe(0);
  });

  it("fills a gauge's hub, and not its track, under a chart style with a fill", () => {
    expect(filledFramePaths(layoutChart(filledGauge))).toBe(filledFramePaths(layoutChart(plainGauge)));
  });

  it('fills no part of a closed polar line under a chart style with a fill', () => {
    expect(fillsOf(layoutChart(filledRadarLine), 'Loop')).toEqual(['none']);
  });
  it('draws other strokes for names that join to the same text', () => {
    expect(shapesOf(layoutChart(pipedName), 'a|b, Jan: €12')).not.toEqual(shapesOf(layoutChart(pipedSeed), 'b, Jan: €12'));
  });

});
