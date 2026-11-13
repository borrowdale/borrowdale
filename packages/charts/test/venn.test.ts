import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { legendEntries } from '../src/layout.js';
import { checkChart } from '../src/validate.js';
import type { Circle } from '../src/venn-geometry.js';
import { labelsOutside, laying, pointsOnCurves, shapesOf, texts, titles } from './support/layout.js';

// Every chart is 300 by 200; the circles fill the plot inside the padding.
function venn(data: object[], options: object = {}): ChartSpec {
  return {
    width: 300, height: 200, legend: 'none', style: { roughness: 0 },
    series: [{ type: 'venn', name: 'V', data, ...options }],
  } as ChartSpec;
}
const sets = (a: number, b: number, ab: number) => [{ sets: ['A'], value: a }, { sets: ['B'], value: b }, { sets: ['A', 'B'], value: ab }];
const three = (sizes: readonly number[]) =>
  [['A'], ['B'], ['C'], ['A', 'B'], ['A', 'C'], ['B', 'C'], ['A', 'B', 'C']].map((names, i) => ({ sets: names, value: sizes[i] }));
/** The circles as placed when the spec is read, before they are fitted to the chart. */
function circlesOf(spec: ChartSpec): Circle[] {
  const chart = checkChart(spec);
  return chart.system === 'venn' ? chart.series[0]!.circles : [];
}
/** Whether the second circle lies wholly inside the first. */
const holds = ([outer, inner]: readonly Circle[]) => Math.hypot(outer!.x - inner!.x, outer!.y - inner!.y) + inner!.r <= outer!.r;
const apart = ([c1, c2]: readonly Circle[]) => Math.hypot(c1!.x - c2!.x, c1!.y - c2!.y) > c1!.r + c2!.r;
/** The bounds of everything drawn: left, top, right and bottom. */
function drawnBounds(spec: ChartSpec): number[] {
  const points = pointsOnCurves(layoutChart(spec));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
/** The colour of each legend entry. */
const legendColors = (spec: ChartSpec) => legendEntries(checkChart(spec)).map((entry) => entry.paint.color);
/** The stroke of the outline drawn for the mark titled `title`. */
function strokeOf(spec: ChartSpec, title: string): string {
  const [first] = shapesOf(layoutChart(spec), title);
  return first?.kind === 'sketch' ? first.sketch.paths.at(-1)!.stroke : '';
}
// B is listed after the overlap, so its place in `data` is not its place among the sets.
const colored = [{ sets: ['A'], value: 4 }, { sets: ['A', 'B'], value: 2 }, { sets: ['B'], value: 9, color: 'red' }];

describe('Venn diagrams', () => {
  it('draw a circle for each set, its tooltip giving its size', () => {
    expect(titles(layoutChart(venn(sets(4, 9, 2))))).toEqual(['A: 4', 'B: 9']);
  });

  it('list their sets in the legend, not the overlaps', () => {
    expect(layoutChart({ ...venn(sets(4, 9, 2)), legend: 'top' } as ChartSpec).labels).toEqual(['A', 'B']);
  });

  it('fill the plot along its tighter side, centred along the other', () => {
    // The two circles are taller than wide in proportion to the plot, so they reach from y 8 to 192,
    // and their middle is at x 150. A sketched circle's curves can overshoot it by under a unit.
    const [left, top, right, bottom] = drawnBounds(venn(sets(4, 9, 2)));
    expect(Math.abs(top! - 8)).toBeLessThan(1);
    expect(Math.abs(bottom! - 192)).toBeLessThan(1);
    expect(Math.abs((left! + right!) / 2 - 150)).toBeLessThan(1);
  });

  it('keep their region labels inside the chart', () => {
    expect(labelsOutside(layoutChart(venn(three([10, 10, 10, 3, 3, 3, 1]), { dataLabels: true })))).toBe(0);
  });

  it('colour a set with its own colour, in its circle and its legend entry', () => {
    expect(strokeOf(venn(colored), 'B: 9')).toBe('red');
    expect(legendColors(venn(colored))[1]).toBe('red');
  });

  it('give each circle an area in proportion to its set', () => {
    const [a, b] = circlesOf(venn(sets(4, 9, 2)));
    expect((b!.r / a!.r) ** 2).toBeCloseTo(9 / 4, 12);
  });

  it('draw sets that share nothing apart, and a set inside one that holds it', () => {
    expect(apart(circlesOf(venn(sets(4, 9, 0))))).toBe(true);
    expect(holds(circlesOf(venn([{ sets: ['A'], value: 9 }, { sets: ['B'], value: 4 }, { sets: ['A', 'B'], value: 4 }])))).toBe(true);
  });

  it('write in each region the size of what is inside exactly its sets, when asked', () => {
    expect(texts(layoutChart(venn(three([10, 10, 10, 3, 3, 3, 1]), { dataLabels: true })))).toEqual(['5', '5', '2', '5', '2', '2', '1']);
    expect(texts(layoutChart(venn(sets(4, 9, 2))))).toEqual([]);
  });

  it('take decimal sizes whose overlaps fill a set exactly, despite rounding', () => {
    // 0.3 − 0.1 − 0.2 is −5.6e-17 in floating point, not 0.
    expect(titles(layoutChart(venn(three([0.3, 1, 1, 0.1, 0.2, 0.1, 0]))))).toEqual(['A: 0.3', 'B: 1', 'C: 1']);
  });

  it('draw sizes of any scale alike', () => {
    expect(laying(venn(three([1e-300, 1e-300, 1e-300, 3e-301, 3e-301, 3e-301, 1e-301])))).not.toThrow();
  });

  it('write sizes without the rounding of their sums', () => {
    expect(texts(layoutChart(venn(three([1, 1, 1, 0.3, 0.3, 0.3, 0.1]), { dataLabels: true })))).toEqual(['0.5', '0.5', '0.2', '0.5', '0.2', '0.2', '0.1']);
  });

  it('reject a set too small beside the rest to be drawn', () => {
    expect(laying(venn([{ sets: ['A'], value: 1e15 }, { sets: ['B'], value: 100 }, { sets: ['A', 'B'], value: 0 }]))).toThrow(
      'Invalid chart: series[0].data[1].value is 100, too small to be drawn beside the largest set, 1,000,000,000,000,000',
    );
  });

  it('draw a small overlap of large sets, which two circles draw exactly', () => {
    expect(titles(layoutChart(venn(sets(1e10, 1e10, 1))))).toEqual(['A: 10,000,000,000', 'B: 10,000,000,000']);
  });

  it('draw three sets whose regions come within 5% of the whole', () => {
    // At most 4.66% off, in the region of only "C".
    expect(titles(layoutChart(venn(three([29, 25, 21, 12, 4, 4, 4]))))).toEqual(['A: 29', 'B: 25', 'C: 21']);
  });

  it('fail for three sets whose regions circles cannot bring within 5% of the whole', () => {
    // At best 5.64% off.
    expect(laying(venn(three([21, 25, 9, 8, 4, 4, 4])))).toThrow(/^Invalid chart: series\[0\]\.data cannot be drawn with circles: .* more than 5%$/);
  });

  it('fail for three sets that would leave a region out, even within 5% of the whole', () => {
    // Only "B" asks for 3.2% of the whole, and the closest circles leave it empty.
    expect(laying(venn(three([21, 5, 17, 4, 8, 4, 4])))).toThrow(
      'Invalid chart: series[0].data cannot be drawn with circles: the region inside only "B" would be left out',
    );
  });

  it('fail for three sets that would draw a region at a sliver of its size', () => {
    // Only "A" and "C" asks for 3 and would be drawn at about 1e-8 of that.
    expect(laying(venn(three([27, 135, 166, 24, 22, 107, 19])))).toThrow(
      'Invalid chart: series[0].data cannot be drawn with circles: the region inside only "A" and "C" would be left out',
    );
  });

  it('count a region drawn at under a thousandth of its size as left out, and draw one above', () => {
    // Their smallest regions are drawn at 4.2e-3 and at 1.08e-4 of their sizes.
    expect(titles(layoutChart(venn(three([166, 92, 60, 36, 42, 10, 4]))))).toEqual(['A: 166', 'B: 92', 'C: 60']);
    expect(laying(venn(three([109, 75, 74, 38, 12, 29, 6])))).toThrow(/would be left out$/);
  });

  it('draw three sets that circles can come near', () => {
    expect(titles(layoutChart(venn(three([100, 60, 30, 20, 10, 8, 4]))))).toEqual(['A: 100', 'B: 60', 'C: 30']);
  });

  it('fail for three sets that circles cannot come near, naming the region', () => {
    expect(laying(venn(three([10, 10, 10, 5, 5, 5, 0])))).toThrow(
      'Invalid chart: series[0].data cannot be drawn with circles: the region inside only "A" would be 3.67 rather than 0, 24.4% of the whole diagram, more than 5%',
    );
  });

  it('reject an overlap larger than a set in it', () => {
    expect(laying(venn(sets(4, 9, 5)))).toThrow(
      'Invalid chart: series[0].data[2].value is 5, more than the 4 of "A" (series[0].data[0]): an overlap cannot be larger than what it is part of',
    );
  });

  it('reject an overlap of three larger than an overlap of two in it', () => {
    expect(laying(venn(three([10, 10, 10, 2, 3, 3, 3])))).toThrow(
      'Invalid chart: series[0].data[6].value is 3, more than the 2 of the overlap of "A" and "B" (series[0].data[3]): an overlap cannot be larger than what it is part of',
    );
  });

  it('reject a set smaller than its overlaps with the others', () => {
    expect(laying(venn(three([5, 10, 10, 3, 3, 3, 0])))).toThrow(
      'Invalid chart: series[0].data[0].value is 5, but its overlaps with the other sets cover 6 of it: a set must hold all of its overlaps',
    );
  });

  it('reject a fourth set', () => {
    expect(laying(venn([...sets(4, 9, 2), { sets: ['C'], value: 1 }, { sets: ['D'], value: 1 }]))).toThrow(
      'Invalid chart: series[0].data[4].sets names a fourth set, "D": circles show the overlaps of at most 3 sets',
    );
  });

  it('reject a set given twice before counting the sets', () => {
    expect(laying(venn([{ sets: ['A'], value: 1 }, { sets: ['A'], value: 1 }, { sets: ['B'], value: 1 }, { sets: ['C'], value: 1 }]))).toThrow(
      'Invalid chart: series[0].data[1].sets names the same sets as series[0].data[0].sets',
    );
  });

  it('reject a single set', () => {
    expect(laying(venn([{ sets: ['A'], value: 4 }]))).toThrow(
      'Invalid chart: series[0].data names 1 set, "A", but a Venn diagram needs 2 or 3: give each set an entry of its own',
    );
  });

  it('reject an overlap left out, rather than take it as 0', () => {
    expect(laying(venn([{ sets: ['A'], value: 4 }, { sets: ['B'], value: 9 }]))).toThrow(
      'Invalid chart: series[0].data has no entry for the overlap of "A" and "B": give one, with a value of 0 if they do not overlap',
    );
  });

  it('reject an overlap of a set that has no entry of its own', () => {
    expect(laying(venn([...sets(4, 9, 2), { sets: ['A', 'C'], value: 1 }]))).toThrow(
      'Invalid chart: series[0].data[3].sets[1] is "C", but no entry names it as a set of its own',
    );
  });

  it('reject the same sets named twice, in any order', () => {
    expect(laying(venn([...sets(4, 9, 2), { sets: ['B', 'A'], value: 2 }]))).toThrow(
      'Invalid chart: series[0].data[3].sets names the same sets as series[0].data[2].sets',
    );
    expect(laying(venn([{ sets: ['A', 'A'], value: 2 }]))).toThrow('Invalid chart: series[0].data[0].sets[1] repeats "A"');
  });

  it('reject a set of size 0', () => {
    expect(laying(venn(sets(0, 9, 0)))).toThrow('Invalid chart: series[0].data[0].value is 0, but a set needs a size above 0 to be drawn');
  });

  it('take a colour for a set only', () => {
    expect(laying(venn([{ sets: ['A'], value: 4 }, { sets: ['B'], value: 9 }, { sets: ['A', 'B'], value: 2, color: 'red' }]))).toThrow(
      'Invalid chart: series[0].data[2].color must be left out: only a set has a colour, and this entry is an overlap',
    );
  });

  it('reject axes and a second series', () => {
    expect(laying({ ...venn(sets(4, 9, 2)), axes: {} } as ChartSpec)).toThrow('Invalid chart: axes must be left out: a Venn diagram has no axes');
    expect(laying({ width: 300, height: 200, series: [venn(sets(4, 9, 2)).series[0], { ...venn(sets(4, 9, 2)).series[0], name: 'W' }] } as ChartSpec))
      .toThrow('Invalid chart: series of a Venn diagram must be one venn series, got 2');
  });
});
