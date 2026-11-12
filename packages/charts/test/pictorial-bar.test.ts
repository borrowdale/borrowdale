import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { legendOf } from '../src/cartesian.js';
import type { ChartNode } from '../src/types.js';
import type { CheckedCartesianChart } from '../src/validate.js';

const pictorial = { shape: 'pictorial', symbol: 'square' };

/**
 * Six thin bars on a fixed 0 to 10 axis, so that the plot does not move with the first bar's value;
 * `along` is the band axis.
 */
function chart(first: number, bar: object, along: 'x' | 'y' = 'x'): ChartSpec {
  const band = { type: 'band', categories: ['A', 'B', 'C', 'D', 'E', 'F'] };
  const linear = { type: 'linear', min: 0, max: 10 };
  return {
    width: 300, height: 300, legend: 'none', style: { roughness: 0, fillStyle: 'solid' },
    axes: along === 'x' ? { x: band, y: linear } : { x: linear, y: band },
    series: [{ type: 'bar', name: 'S', data: [first, 1, 1, 1, 1, 1], ...bar }],
  } as ChartSpec;
}

/** The nodes the first bar's mark holds. */
function firstBar(spec: ChartSpec): ChartNode[] {
  const mark = layoutChart(spec).nodes.find((node) => node.kind === 'mark');
  return mark?.kind === 'mark' ? mark.nodes : [];
}

/** The clip a pictorial first bar is drawn in. */
function clipOf(spec: ChartSpec): Extract<ChartNode, { kind: 'clip' }> {
  const [node] = firstBar(spec);
  if (node?.kind !== 'clip') throw new Error(`The first bar is a ${node?.kind}, not a clip`);
  return node;
}

/** The first path of each sketched node: a solid square's outline. */
function outlines(nodes: readonly ChartNode[]): string[] {
  return nodes.map((node) => (node.kind === 'sketch' ? node.sketch.paths[0]!.d : node.kind));
}

/** The clip's box written as a solid rectangle's outline is, to two decimals. */
function boxOutline({ box }: Extract<ChartNode, { kind: 'clip' }>): string {
  const n = (value: number) => String(Math.round(value * 100) / 100);
  const [left, top, right, bottom] = [n(box.x), n(box.y), n(box.x + box.width), n(box.y + box.height)];
  return `M${left} ${top} L${right} ${top} L${right} ${bottom} L${left} ${bottom}`;
}

/** Laying the chart out, run later, so that an error it throws can be expected. */
function layingOut(spec: ChartSpec) {
  return () => layoutChart(spec);
}

describe('pictorial bars', () => {
  it('repeats the symbol from the base, a bar width each, and draws the bar as one clip', () => {
    const clip = clipOf(chart(3, pictorial));

    expect(firstBar(chart(3, pictorial))).toHaveLength(1);
    expect(outlines(clip.nodes)).toEqual([
      'M42.15 235.7 L72.33 235.7 L72.33 265.88 L42.15 265.88',
      'M42.15 205.51 L72.33 205.51 L72.33 235.7 L42.15 235.7',
      'M42.15 175.33 L72.33 175.33 L72.33 205.51 L42.15 205.51',
    ]);
  });

  it('cuts the last symbol where the rectangle bar of the same value ends', () => {
    expect(outlines(firstBar(chart(3, {})))).toEqual(['M42.15 190.78 L72.33 190.78 L72.33 265.88 L42.15 265.88']);
    expect(boxOutline(clipOf(chart(3, pictorial)))).toBe('M42.15 190.78 L72.33 190.78 L72.33 265.88 L42.15 265.88');
  });

  it('repeats along a horizontal bar from its base too', () => {
    const clip = clipOf(chart(3, pictorial, 'y'));

    expect(outlines(clip.nodes)).toEqual([
      'M28.36 17.98 L58.31 17.98 L58.31 47.93 L28.36 47.93',
      'M58.31 17.98 L88.25 17.98 L88.25 47.93 L58.31 47.93',
      'M88.25 17.98 L118.2 17.98 L118.2 47.93 L88.25 47.93',
    ]);
    expect(boxOutline(clip)).toBe(outlines(firstBar(chart(3, {}, 'y')))[0]);
  });

  it('draws a whole number of symbols where rounding noise lies just past the last one', () => {
    expect(clipOf(chart(3.617341415890885, pictorial)).nodes).toHaveLength(3);
  });

  it('repeats a named image', () => {
    expect(outlines(clipOf(chart(3, { shape: 'pictorial', symbol: { image: 'cow' } })).nodes)).toEqual(['image', 'image', 'image']);
  });

  it('shows its symbol in the legend, where other bars show a box', () => {
    const [bar] = chart(3, { shape: 'pictorial', symbol: 'star' }).series;

    expect(legendOf(bar as CheckedCartesianChart['series'][number])).toEqual({ line: false, symbol: 'star' });
    expect(legendOf({ ...bar, shape: 'rectangle' } as CheckedCartesianChart['series'][number])).toEqual({ line: false, symbol: undefined });
  });

  it('needs a symbol, which other bars do not take', () => {
    expect(layingOut(chart(3, { shape: 'pictorial' })))
      .toThrow('series[0].symbol is missing: a pictorial bar repeats a symbol or an image');
    expect(layingOut(chart(3, { shape: 'rounded', symbol: 'star' }))).toThrow('series[0].symbol needs shape "pictorial"');
  });
});
