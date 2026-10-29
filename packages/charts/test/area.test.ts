import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartLayout, type ChartSpec, type ChartNode } from '@borrowdale/charts';
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

function stacked(data: (number | null)[], horizontal = false, percent = false, secondAxis = false): ChartSpec {
  const categories = data.map((_, i) => String.fromCharCode(65 + i));
  const band = { type: 'band' as const, categories };
  const value = { type: 'linear' as const, min: 0, max: percent ? 100 : 20, percent };
  return {
    width: 600, height: 500, legend: 'none', style: { roughness: 0, fillStyle: 'solid' },
    axes: horizontal ? { x: value, y: band } : { x: band, y: value, ...(secondAxis ? { y2: value } : {}) },
    series: [
      { type: 'area', name: 'lower', stack: 's', curve: 'monotone', axis: secondAxis ? 'y2' : 'y',
        data: data.map((_, i) => i === 0 ? 0 : i % 2 ? 10 : 5) },
      { type: 'area', name: 'upper', stack: 's', curve: 'monotone', axis: secondAxis ? 'y2' : 'y', data },
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

describe('stacked area boundaries', () => {
  it.each([
    ['leading', [null, 2, 2, 2], 2],
    ['trailing', [2, 2, 2, null], 2],
    ['interior', [2, 2, null, 2, 2], 2],
    ['continuous', [2, 2, 2, 2], 3],
  ] as const)('shares the entire smoothed edge with a %s missing-value pattern', (_name, data, count) => {
    sharedEdges(layoutChart(stacked([...data])), count);
  });

  it.each([
    [true, false, false], [false, true, false], [true, true, false], [false, false, true],
  ])('shares edges with horizontal=%s percent=%s y2=%s', (horizontal, percent, secondAxis) => {
    sharedEdges(layoutChart(stacked([null, 2, 2, 2], horizontal, percent, secondAxis)), 2);
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

  it('shares edges through three layers with staggered gaps', () => {
    const spec = stacked([null, 2, 2, null, 2, 2]);
    const layout = layoutChart({ ...spec, series: [...spec.series,
      { type: 'area', name: 'third', stack: 's', curve: 'monotone', data: [2, 2, 2, 2, null, 2] },
    ] });
    sharedEdges(layout, 2);
    sharedEdges(layout, 1, 'upper', 'third');
  });

  it('preserves real singleton runs without adding artificial dots to peers', () => {
    const layout = layoutChart(stacked([null, 2, null, null]));
    const lower = series(layout, 'lower');
    const upper = series(layout, 'upper');
    expect(lower.kind === 'mark' && lower.nodes.length).toBe(4); // Two fills and two outlines.
    expect(upper.kind === 'mark' && upper.nodes.length).toBe(1); // The original lone dot.
  });

  it('does not split a stack for an entirely missing layer', () => {
    const spec = stacked([null, null, null, null]);
    const layout = layoutChart(spec);
    const lower = series(layout, 'lower');
    const upper = series(layout, 'upper');
    expect(lower.kind === 'mark' && lower.nodes.length).toBe(2);
    expect(upper.kind === 'mark' && upper.nodes.length).toBe(0);
  });

  it('does not cut a stack with the same name on a different value axis', () => {
    const spec = stacked([2, 2, 2, 2], false, false, true);
    const before = layoutChart(spec);
    const after = layoutChart({ ...spec, series: [...spec.series,
      { type: 'area', name: 'other', stack: 's', curve: 'monotone', axis: 'y', data: [null, 2, 2, 2] },
    ] });
    expect(series(after, 'lower')).toEqual(series(before, 'lower'));
    expect(series(after, 'upper')).toEqual(series(before, 'upper'));
  });
});
