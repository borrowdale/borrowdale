import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { labelsOutside } from './support/layout.js';

// 300 by 200: the container fills x 8 to 292 and y 8 to 192; a circle has radius 92 around 150, 100.
function liquid(value: number, options: object = {}): ChartSpec {
  return {
    width: 300, height: 200, legend: 'none', style: { roughness: 0, fillStyle: 'solid' },
    series: [{ type: 'liquid', name: 'Tank', value, ...options }],
  } as ChartSpec;
}

const mark = (spec: ChartSpec) => layoutChart(spec).nodes.flatMap((node) => (node.kind === 'mark' ? [node] : []))[0]!;
/** The outline of the liquid: the mark's first node, drawn before the container. */
const surface = (spec: ChartSpec) => {
  const [node] = mark(spec).nodes;
  return node!.kind === 'sketch' ? node!.sketch.paths[0]!.d : node!.kind;
};
const kinds = (spec: ChartSpec) => mark(spec).nodes.map((node) => node.kind);

/** Laying the chart out, run later, so that an error it throws can be expected. */
function layingOut(spec: ChartSpec) {
  return () => layoutChart(spec);
}

describe('liquid fills', () => {
  it('fill a rectangle to its level, the surface a wave about it', () => {
    // Half full: level 100. The surface rises 0.02 * 184 = 3.68, at its height a quarter wave in,
    // 284 / 8 = 35.5 along.
    const outline = surface(liquid(0.5, { shape: 'rectangle' }));

    expect(outline.startsWith('M8 100 ')).toBe(true);
    expect(outline).toContain(' L43.5 103.68 ');
  });

  it('cut the liquid to a circle by its edge', () => {
    // Nine tenths full, the level is 26.4, above the circle's edge at x 67.2: 100 - sqrt(92² - 82.8²).
    expect(surface(liquid(0.9))).toContain(' L67.2 59.9 ');
  });

  it('fill a circle from its foot, half full at its centre', () => {
    const outline = surface(liquid(0.5));

    expect(outline.startsWith('M58 100 ')).toBe(true);
    expect(outline).toContain(' L150 100 ');
    expect(outline).toContain(' L150 192 ');
  });

  it('keep a full container flat to its top, and draw no liquid in an empty one', () => {
    expect(surface(liquid(1))).toContain(' L150 8 ');
    expect(kinds(liquid(0))).toEqual(['sketch', 'text']);
    expect(kinds(liquid(0.5))).toEqual(['sketch', 'sketch', 'text']);
  });

  it('write the level as a whole percentage in the middle and the tooltip', () => {
    expect(mark(liquid(0.456)).title).toBe('Tank: 46%');
    expect(layoutChart(liquid(0.456)).labels).toEqual(['46%']);
  });

  // The level is placed as a data label is: inside the chart, or an error where it cannot fit.
  it('keep the level inside a small chart', () => {
    expect(labelsOutside(layoutChart({ ...liquid(0.5), width: 40, height: 40 } as ChartSpec))).toBe(0);
    expect(layingOut({ ...liquid(0.5), width: 20, height: 20 } as ChartSpec))
      .toThrow('series[0].value does not fit even cut short: there are 4 units for it');
  });

  it('take a level from 0 to 1, 1 to 5 waves, and a circle or a rectangle', () => {
    expect(layingOut(liquid(1.2))).toThrow('series[0].value must be a number from 0 to 1, got 1.2');
    expect(layingOut(liquid(0.5, { waves: 6 }))).toThrow('series[0].waves must be');
    expect(layingOut(liquid(0.5, { shape: 'star' }))).toThrow('series[0].shape must be one of circle, rectangle, got "star"');
  });

  it('are one series, with no axes', () => {
    const spec = liquid(0.5);

    expect(layingOut({ ...spec, axes: {} } as ChartSpec)).toThrow('axes must be left out: a liquid fill has no axes');
    expect(layingOut({ ...spec, series: [spec.series[0]!, { ...spec.series[0]!, name: 'Other' }] } as ChartSpec))
      .toThrow('series of a liquid fill must be one liquid series, got 2');
  });
});
