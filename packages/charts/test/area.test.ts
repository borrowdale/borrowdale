import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartLayout, type ChartSpec } from '@borrowdale/charts';
import type { ChartNode } from '../src/types.js';
import type { Point } from '@borrowdale/core';

// Compare actual rendered Bézier geometry, not only vertices: the original defect had identical
// endpoints but different tangents between them. Core emits M/C paths, including for straight edges.
function cubics(node: ChartNode, filled: boolean): Point[][] {
  if (node.kind !== 'mark') {
    throw new Error('Expected a series mark');
  }
  return node.nodes.flatMap((child) => {
    if (child.kind !== 'sketch') {
      return [];
    }
    return child.sketch.paths.filter((path) => (path.fill !== 'none') === filled).flatMap(({ d }) => {
      // Any other command would be read as numbers of the one before it.
      if (/[^MC\d\s,.eE+-]/.test(d)) {
        throw new Error(`Expected only M and C commands in ${d}`);
      }
      const found: Point[][] = [];
      let start: Point = [0, 0];
      for (const [, command, args] of d.matchAll(/([MC])([^MC]*)/g)) {
        const values = args!.trim().split(/[ ,]+/).map(Number);
        if (command === 'M') {
          start = [values[0]!, values[1]!];
        } else {
          const end: Point = [values[4]!, values[5]!];
          found.push([start, [values[0]!, values[1]!], [values[2]!, values[3]!], end]);
          start = end;
        }
      }
      return found;
    });
  });
}

function series(layout: ChartLayout, title: string): ChartNode {
  const found = layout.nodes.find((node) => node.kind === 'mark' && node.title === title);
  if (!found) {
    throw new Error(`No series ${title}`);
  }
  return found;
}

/** How many shapes the series `title` draws: a fill and an outline per run, or one dot. */
function nodesOf(layout: ChartLayout, title: string): number {
  const found = series(layout, title);
  if (found.kind !== 'mark') {
    throw new Error(`No series ${title}`);
  }
  return found.nodes.length;
}

interface StackOptions {
  horizontal?: boolean;
  percent?: boolean;
  secondAxis?: boolean;
  curve?: 'monotone' | 'linear';
}

function stacked(data: (number | null)[], options: StackOptions = {}): ChartSpec {
  const { horizontal = false, percent = false, secondAxis = false, curve = 'monotone' } = options;
  const categories = data.map((_, i) => String.fromCharCode(65 + i));
  const band = { type: 'band' as const, categories };
  const value = { type: 'linear' as const, min: 0, max: percent ? 100 : 20, percent };
  return {
    width: 600, height: 500, legend: 'none', style: { roughness: 0, fillStyle: 'solid' },
    axes: horizontal ? { x: value, y: band } : { x: band, y: value, ...(secondAxis ? { y2: value } : {}) },
    series: [
      { type: 'area', name: 'lower', stack: 's', curve, axis: secondAxis ? 'y2' : 'y',
        data: data.map((_, i) => i === 0 ? 0 : i % 2 ? 10 : 5) },
      { type: 'area', name: 'upper', stack: 's', curve, axis: secondAxis ? 'y2' : 'y', data },
    ],
  };
}

function sharedEdges(layout: ChartLayout, expected: number, lower = 'lower', upper = 'upper'): void {
  const low = cubics(series(layout, lower), false);
  const high = cubics(series(layout, upper), true).map((curve) => [...curve].reverse());
  const checked = new Set<string>();
  for (const curve of low) {
    const partner = high.find((other) => JSON.stringify([other[0], other[3]]) === JSON.stringify([curve[0], curve[3]]));
    if (partner) {
      expect(partner).toEqual(curve);
      checked.add(JSON.stringify(curve));
    }
  }
  expect(checked.size).toBe(expected);
}

/** The last `count` shapes the series `title` draws. */
function lastShapes(layout: ChartLayout, title: string, count: number): ChartNode[] {
  const found = series(layout, title);
  return found.kind === 'mark' ? found.nodes.slice(-count) : [];
}

// A lower layer with two runs, under an upper layer that does or does not stop at C: the upper
// layer's gap cuts the lower layer's first run, and must not change the strokes of its second.
function twoRuns(upper: (number | null)[]): ChartSpec {
  const categories = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  return {
    width: 600, height: 400, legend: 'none',
    axes: { x: { type: 'band', categories }, y: { type: 'linear', min: 0, max: 4 } },
    series: [
      { type: 'area', name: 'lower', stack: 's', curve: 'monotone', data: [1, 2, 1, 2, null, 1, 2] },
      { type: 'area', name: 'upper', stack: 's', curve: 'monotone', data: upper },
    ],
  };
}

// A middle layer missing two categories, over a bottom layer that keeps rising, so the edge the top
// layer shares with the bottom one over the gap has tangents that are not 0.
const gapInTheMiddle: ChartSpec = {
  width: 640, height: 480, legend: 'none', style: { roughness: 0, fillStyle: 'solid' },
  axes: { x: { type: 'band', categories: ['A', 'B', 'C', 'D', 'E', 'F'] }, y: { type: 'linear', min: 0, max: 10 } },
  series: [
    { type: 'area', name: 'lower', stack: 's', curve: 'monotone', data: [1, 2, 3, 4, 5, 6] },
    { type: 'area', name: 'upper', stack: 's', curve: 'monotone', data: [1, 1, null, null, 1, 1] },
    { type: 'area', name: 'third', stack: 's', curve: 'monotone', data: [1, 1, 1, 1, 1, 1] },
  ],
};
// A gap in the bottom layer, with nothing below it to share an edge with.
const gapAtTheBottom: ChartSpec = { ...gapInTheMiddle,
  series: [
    { type: 'area', name: 'lower', stack: 's', curve: 'monotone', data: [2, 2, null, null, 2, 2] },
    { type: 'area', name: 'upper', stack: 's', curve: 'monotone', data: [2, 2, 2, 2, 2, 2] },
  ],
};
// A middle layer missing one category, where the top layer steps down onto the bottom one and back.
const oneGapInTheMiddle: ChartSpec = { ...gapInTheMiddle,
  axes: { x: { type: 'band', categories: ['A', 'B', 'C', 'D', 'E'] }, y: { type: 'linear', min: 0, max: 10 } },
  series: [
    { type: 'area', name: 'lower', stack: 's', curve: 'monotone', data: [1, 2, 3, 4, 5] },
    { type: 'area', name: 'upper', stack: 's', curve: 'monotone', data: [1, 1, null, 1, 1] },
    { type: 'area', name: 'third', stack: 's', curve: 'monotone', data: [1, 1, 1, 1, 1] },
  ],
};
// A middle layer missing three categories: the one in the middle of the gap borders no value.
const longGapInTheMiddle: ChartSpec = { ...gapInTheMiddle,
  axes: {
    x: { type: 'band', categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
    y: { type: 'linear', min: 0, max: 10 },
  },
  series: [
    { type: 'area', name: 'lower', stack: 's', curve: 'monotone', data: [1, 2, 3, 4, 5, 6, 7] },
    { type: 'area', name: 'upper', stack: 's', curve: 'monotone', data: [1, 1, null, null, null, 1, 1] },
    { type: 'area', name: 'third', stack: 's', curve: 'monotone', data: [1, 1, 1, 1, 1, 1, 1] },
  ],
};
// Another stack, with a gap, to list before the stack under test.
const otherStack: ChartSpec['series'][number] = {
  type: 'area', name: 'other', stack: 'other', curve: 'monotone', color: '#abcdef', data: [null, 2, 2, 2],
};

/** `stacked(data)` with fixed colours, after the series `before`, so palette order cannot matter. */
function stackedAfter(data: (number | null)[], before: ChartSpec['series']): ChartSpec {
  const spec = stacked(data);
  const [lower, upper] = spec.series;
  return { ...spec, series: [...before, { ...lower!, color: '#123456' }, { ...upper!, color: '#654321' }] };
}

describe('stacked area boundaries', () => {
  it.each([
    ['leading', [null, 2, 2, 2], 2],
    ['trailing', [2, 2, 2, null], 2],
    ['interior', [2, 2, null, 2, 2], 2],
    ['continuous', [2, 2, 2, 2], 3],
  ] as const)('shares the entire smoothed edge with the %s missing-value pattern', (_name, data, count) => {
    sharedEdges(layoutChart(stacked([...data])), count);
  });

  it.each([
    { horizontal: true }, { percent: true }, { horizontal: true, percent: true }, { secondAxis: true },
  ])('shares edges with %o', (options) => {
    sharedEdges(layoutChart(stacked([null, 2, 2, 2], options)), 2);
  });

  it('does not cut another stack with the same axis', () => {
    const spec = stacked([2, 2, 2, 2]);
    const before = layoutChart(spec);
    const after = layoutChart({ ...spec, series: [...spec.series,
      { type: 'area', name: 'other', stack: 'other', curve: 'monotone', data: [null, 2, 2, 2] },
    ] });
    expect(series(after, 'lower')).toEqual(series(before, 'lower'));
    expect(series(after, 'upper')).toEqual(series(before, 'upper'));
  });

  it('does not cut a stack listed after another stack with a gap', () => {
    const before = layoutChart(stackedAfter([2, 2, 2, 2], []));
    const after = layoutChart(stackedAfter([2, 2, 2, 2], [otherStack]));
    expect(series(after, 'lower')).toEqual(series(before, 'lower'));
    expect(series(after, 'upper')).toEqual(series(before, 'upper'));
  });

  it('shares edges through three layers with staggered gaps', () => {
    const spec = stacked([null, 2, 2, null, 2, 2]);
    const layout = layoutChart({ ...spec, series: [...spec.series,
      { type: 'area', name: 'third', stack: 's', curve: 'monotone', data: [2, 2, 2, 2, null, 2] },
    ] });
    sharedEdges(layout, 2);
    sharedEdges(layout, 1, 'upper', 'third');
  });

  it('shares the edge under a gap of two categories in a middle layer', () => {
    const layout = layoutChart(gapInTheMiddle);
    sharedEdges(layout, 1, 'lower', 'third');
    sharedEdges(layout, 2, 'upper', 'third');
  });

  it('cuts the layer above a bottom gap only where the gap layer stops and starts', () => {
    expect(nodesOf(layoutChart(gapAtTheBottom), 'upper')).toBe(6); // Three runs: cut at B and E.
  });

  it('cuts the layers around a middle gap at its edges, not inside it', () => {
    const layout = layoutChart(longGapInTheMiddle);
    expect(nodesOf(layout, 'lower')).toBe(10); // Five runs: cut at B, C, E and F.
    sharedEdges(layout, 2, 'lower', 'third');
  });

  it('cuts the layers at a one-category gap in a middle layer', () => {
    expect(nodesOf(layoutChart(oneGapInTheMiddle), 'lower')).toBe(8); // Four runs: cut at B, C and D.
  });

  it('keeps a lone value as a dot, and cuts the other layers where it stands, as at any run end', () => {
    const layout = layoutChart(stacked([null, 2, null, null]));
    expect(nodesOf(layout, 'lower')).toBe(4); // Two runs, cut at B: two fills and two outlines.
    expect(nodesOf(layout, 'upper')).toBe(1); // The lone dot.
  });

  it('adds no dot where a run starts after a gap', () => {
    expect(nodesOf(layoutChart(stacked([null, 2, 2, 2])), 'upper')).toBe(2);
  });

  it('adds no dot where a run ends before a gap', () => {
    expect(nodesOf(layoutChart(stacked([2, 2, 2, null])), 'upper')).toBe(2);
  });

  it('adds no dot where a peer cuts at the last category', () => {
    expect(nodesOf(layoutChart(stacked([2, 2, null, 2])), 'lower')).toBe(4);
  });

  it('does not split a linear stack at a peer gap', () => {
    expect(nodesOf(layoutChart(stacked([null, 2, 2, 2], { curve: 'linear' })), 'lower')).toBe(2);
  });

  it('does not split a stack for an entirely missing layer', () => {
    const layout = layoutChart(stacked([null, null, null, null]));
    expect(nodesOf(layout, 'lower')).toBe(2);
    expect(nodesOf(layout, 'upper')).toBe(0);
  });

  it('does not cut a stack with the same name on a different value axis', () => {
    const spec = stacked([2, 2, 2, 2], { secondAxis: true });
    const before = layoutChart(spec);
    const after = layoutChart({ ...spec, series: [...spec.series,
      { type: 'area', name: 'other', stack: 's', curve: 'monotone', axis: 'y', data: [null, 2, 2, 2] },
    ] });
    expect(series(after, 'lower')).toEqual(series(before, 'lower'));
    expect(series(after, 'upper')).toEqual(series(before, 'upper'));
  });

  it('keeps the strokes of a run that a gap in another layer does not cut', () => {
    const whole = layoutChart(twoRuns([1, 1, 1, 1, 1, 1, 1]));
    const gapped = layoutChart(twoRuns([1, 1, null, 1, 1, 1, 1]));

    expect(nodesOf(gapped, 'lower')).toBe(nodesOf(whole, 'lower') + 2);
    expect(lastShapes(gapped, 'lower', 2)).toEqual(lastShapes(whole, 'lower', 2));
  });
});
