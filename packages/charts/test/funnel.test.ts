import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';

// Every chart is 300 by 200, so its stages fill x 8 to 292 and y 8 to 192, with the middle at x 150.
function funnel(display: string, data: object[], options: object = {}): ChartSpec {
  return {
    width: 300, height: 200, legend: 'none', style: { roughness: 0, fillStyle: 'solid' },
    series: [{ type: 'funnel', name: 'F', display, data, ...options }],
  } as ChartSpec;
}

const two = [{ name: 'A', value: 100 }, { name: 'B', value: 50 }];
const marksOf = (spec: ChartSpec) => layoutChart(spec).nodes.flatMap((node) => (node.kind === 'mark' ? [node] : []));
/** Each stage's outline: the first path of its first node. */
const outlines = (spec: ChartSpec) =>
  marksOf(spec).map((mark) => (mark.nodes[0]!.kind === 'sketch' ? mark.nodes[0]!.sketch.paths[0]!.d : mark.nodes[0]!.kind));
/** The box each stage of a silhouette is cut to. */
const bands = (spec: ChartSpec) =>
  marksOf(spec).map((mark) => (mark.nodes[0]!.kind === 'clip' ? mark.nodes[0]!.box : mark.nodes[0]));
const stageNames = (spec: ChartSpec) => layoutChart({ ...spec, legend: 'top' } as ChartSpec).labels;

const bottle = 'M0 0 L10 0 L10 20 L0 20 Z';
const pair = (first: object, second: object): ChartSpec => ({
  width: 300, height: 200, legend: 'none',
  series: [{ type: 'funnel', name: '2025', display: 'funnel', data: two, ...first }, { type: 'funnel', name: '2026', display: 'funnel', data: two, ...second }],
} as ChartSpec);

/** Laying the chart out, run later, so that an error it throws can be expected. */
function layingOut(spec: ChartSpec) {
  return () => layoutChart(spec);
}

describe('funnels', () => {
  it('give each stage an equal depth and a width in proportion to its value, sloping to the next', () => {
    // Half widths of 142 and 71; the last stage keeps its width.
    expect(outlines(funnel('funnel', two))).toEqual(['M8 8 L292 8 L221 100 L79 100', 'M79 100 L221 100 L221 192 L79 192']);
  });

  it('keep each stage straight as bars', () => {
    expect(outlines(funnel('funnel', two, { shape: 'bar' }))).toEqual(['M8 8 L292 8 L292 100 L8 100', 'M79 100 L221 100 L221 192 L79 192']);
  });

  it('curve between widths when smooth', () => {
    // Level at both ends: the side leaves 292 8 downwards and reaches 221 100 downwards.
    expect(outlines(funnel('funnel', two, { shape: 'smooth' }))[0]).toContain('C292 54, 221 54, 221 100');
  });

  it('run left to right when horizontal', () => {
    // Half heights of 92 and 46 around y 100.
    expect(outlines(funnel('funnel', two, { orientation: 'horizontal' }))[0]).toBe('M8 8 L8 192 L150 146 L150 54');
  });

  it('give the stages of a pyramid areas in proportion to their values', () => {
    // A quarter of the area lies above half the depth: y 100, where the half width is 71.
    expect(outlines(funnel('pyramid', [{ name: 'A', value: 1 }, { name: 'B', value: 3 }])))
      .toEqual(['M150 8 L150 8 L221 100 L79 100', 'M79 100 L221 100 L292 192 L8 192']);
  });

  it('give the stages of a funnel area areas in proportion to their values, in a trapezoid a third as wide at its foot', () => {
    // Half the area lies above (1 - sqrt(5 / 9)) * 1.5 of the depth, 70.28, where the half width is
    // 142 * sqrt(5 / 9), 105.84.
    expect(outlines(funnel('funnelArea', [{ name: 'A', value: 1 }, { name: 'B', value: 1 }]))[0])
      .toBe('M8 8 L292 8 L255.84 78.28 L44.16 78.28');
  });

  it('cut a silhouette into bands as deep as their values, the first at the top', () => {
    // A 10 by 20 rectangle scaled by 9.2 is 92 by 184, centred at x 104.
    expect(bands(funnel('pictorialStacked', [{ name: 'A', value: 1 }, { name: 'B', value: 3 }], { silhouette: bottle })))
      .toEqual([{ x: 104, y: 8, width: 92, height: 46 }, { x: 104, y: 54, width: 92, height: 138 }]);
  });

  it('list their stages in the legend and show the share of each stage in its tooltip', () => {
    expect(stageNames(funnel('funnel', two))).toEqual(['A', 'B']);
    expect(marksOf(funnel('funnel', two)).map((mark) => mark.title)).toEqual(['A: 100 (66.7%)', 'B: 50 (33.3%)']);
  });

  it('stand back to back as two funnels with the same stages, each named over its half', () => {
    expect(layoutChart(pair({}, {})).labels).toEqual(['2025', '2026']);
    expect(marksOf(pair({}, {})).map((mark) => mark.title))
      .toEqual(['2025, A: 100 (66.7%)', '2025, B: 50 (33.3%)', '2026, A: 100 (66.7%)', '2026, B: 50 (33.3%)']);
  });

  it('need funnels back to back to share their stages and run the same way', () => {
    expect(layingOut(pair({}, { data: [two[0], { name: 'C', value: 1 }] })))
      .toThrow('series[1].data[1].name is "C", but series[0].data[1].name is "B": funnels back to back share their stages, in order');
    expect(layingOut(pair({}, { data: [two[0]] })))
      .toThrow('series[1].data has 1 stages, but series[0].data has 2: funnels back to back share their stages');
    expect(layingOut(pair({}, { orientation: 'horizontal' })))
      .toThrow('series[1].orientation is horizontal, but series[0] has the default, vertical: funnels back to back run the same way');
    expect(layingOut(pair({ orientation: 'horizontal' }, {})))
      .toThrow('series[0].orientation is horizontal, but series[1] has the default, vertical: funnels back to back run the same way');
    expect(layingOut(pair({}, { display: 'pyramid' })))
      .toThrow('series[1].display is pyramid, but only funnel displays stand back to back');
  });

  it('need funnels back to back to give a stage one colour', () => {
    const red = { data: [{ name: 'A', value: 100, color: '#ff0000' }, two[1]] };
    const blue = { data: [{ name: 'A', value: 100, color: '#0000ff' }, two[1]] };

    expect(layingOut(pair(red, blue)))
      .toThrow('series[1].data[0].color is "#0000ff", but series[0].data[0].color, of the same name, gives "#ff0000"');
  });

  it('need room for funnels back to back after their names', () => {
    expect(layingOut({ ...pair({}, {}), width: 200, height: 24 } as ChartSpec))
      .toThrow('Invalid chart: a 200 × 24 chart leaves no room for the plot after its title, legend and labels');
  });

  it('are one or two series, with no axes', () => {
    const spec = funnel('funnel', two);

    expect(layingOut({ ...spec, axes: {} } as ChartSpec)).toThrow('axes must be left out: a funnel chart has no axes');
    expect(layingOut({ ...spec, series: [spec.series[0]!, { ...spec.series[0]!, name: 'G' }, { ...spec.series[0]!, name: 'H' }] } as ChartSpec))
      .toThrow('series of a funnel chart must be one funnel series, or two funnels back to back, got 3');
  });

  it('need a silhouette that draws, for a pictorial stack only', () => {
    expect(layingOut(funnel('pictorialStacked', two))).toThrow('series[0].silhouette is missing');
    expect(layingOut(funnel('pictorialStacked', two, { silhouette: 'M0 0 L10 0' })))
      .toThrow('series[0].silhouette is not valid: Invalid shape: path.d needs a width and a height to fit a box');
    expect(layingOut(funnel('pictorialStacked', two, { silhouette: `M0 0 L${'1'.repeat(10_001)}` })))
      .toThrow('series[0].silhouette must be a string of at most 10000 characters');
    expect(layingOut(funnel('funnel', two, { silhouette: bottle }))).toThrow('series[0] has an unknown key, "silhouette"');
  });
});
