import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { legendEntries } from '../src/layout.js';
import type { ChartNode } from '../src/types.js';
import { checkChart } from '../src/validate.js';

function units(display: string, data: object[], options: object = {}, size: [number, number] = [300, 300]): ChartSpec {
  return {
    width: size[0], height: size[1], legend: 'none', style: { roughness: 0 },
    series: [{ type: 'units', name: 'U', display, data, ...options }],
  } as ChartSpec;
}

const marksOf = (spec: ChartSpec) =>
  layoutChart(spec).nodes.flatMap((node) => (node.kind === 'mark' ? [node] : []));
const titles = (spec: ChartSpec) => marksOf(spec).map((mark) => mark.title);
/** How many units each category's mark draws. */
const counts = (spec: ChartSpec) => marksOf(spec).map((mark) => mark.nodes.length);
/** Where each node's first path starts: a square's top-left corner, or the first point of a circle or segment. */
const starts = (nodes: readonly ChartNode[]) =>
  nodes.map((node) => (node.kind === 'sketch' ? node.sketch.paths[0]!.d.split(/ [LC]/)[0] : node.kind));

// A units series with no display, as a spec can be written but not typed.
const undisplayed = { width: 300, height: 300, series: [{ type: 'units', name: 'U', data: [{ name: 'A', value: 1 }] }] } as unknown as ChartSpec;

/** For each category's mark, whether each node is its name or one of its units. */
const rowsOf = (spec: ChartSpec) =>
  marksOf(spec).map((mark) => mark.nodes.map((node) => (node.kind === 'text' ? 'name' : 'unit')));

/** The symbol each legend entry shows, undefined for a box. */
const legendSymbols = (spec: ChartSpec) => legendEntries(checkChart(spec)).map((entry) => entry.symbol);

/** Laying the chart out, run later, so that an error it throws can be expected. */
function layingOut(spec: ChartSpec) {
  return () => layoutChart(spec);
}

describe('unit charts', () => {
  it('draw one unit per count, in a mark per category with its value as the tooltip', () => {
    const spec = units('waffle', [{ name: 'A', value: 37 }, { name: 'B', value: 63 }]);

    expect(titles(spec)).toEqual(['A: 37', 'B: 63']);
    expect(counts(spec)).toEqual([37, 63]);
  });

  it('fill a waffle row by row, ten units to a row by default', () => {
    // Cells of (300 - 2 * 8) / 10 = 28.4, each holding a square 0.8 of that, centred: unit 37 is in
    // row 3, column 7.
    const [a, b] = marksOf(units('waffle', [{ name: 'A', value: 37 }, { name: 'B', value: 63 }]));

    expect(starts([a!.nodes[0]!, a!.nodes[9]!, a!.nodes[10]!, b!.nodes[0]!]))
      .toEqual(['M10.84 10.84', 'M266.44 10.84', 'M10.84 39.24', 'M209.64 96.04']);
  });

  it('share units out by largest remainder, in proportion to the values', () => {
    // 9.4, 13.1 and 5.2 of 27.7 are 10.18, 14.19 and 5.63 of 30 units: the 30th goes to the largest
    // remainder, 0.63.
    const data = [{ name: 'Cattle', value: 9.4 }, { name: 'Pigs', value: 13.1 }, { name: 'Sheep', value: 5.2 }];

    expect(titles(units('rows', data, { units: 30 })))
      .toEqual(['Cattle: 9.4, 10 of 30 units', 'Pigs: 13.1, 14 of 30 units', 'Sheep: 5.2, 6 of 30 units']);
  });

  it('give a tied remainder to the earlier category', () => {
    const data = [{ name: 'A', value: 1 }, { name: 'B', value: 1 }, { name: 'C', value: 1 }, { name: 'D', value: 1 }];

    expect(counts(units('waffle', data, { units: 6 }))).toEqual([2, 2, 1, 1]);
  });

  it('reject a category too small a share to get a unit, rather than leave it out', () => {
    expect(layingOut(units('waffle', [{ name: 'A', value: 0.4 }, { name: 'B', value: 99.6 }], { units: 100 })))
      .toThrow('series[0].data[0].value is 0.4, too small a share to get one of the 100 units');
  });

  it('need whole counts unless the series gives units to share', () => {
    expect(layingOut(units('waffle', [{ name: 'A', value: 2.5 }])))
      .toThrow('series[0].data[0].value is 2.5, not a whole number of units: give units to share the values out');
  });

  it('draw at most 2,000 units', () => {
    expect(layingOut(units('waffle', [{ name: 'A', value: 2001 }])))
      .toThrow('series[0].data has 2001 units, more than the 2000 a chart draws: give units to share the values out');
  });

  it('seat a parliament by angle, so each category takes a wedge', () => {
    const [a, b] = marksOf(units('parliament', [{ name: 'A', value: 2 }, { name: 'B', value: 3 }], { rows: 1 }, [300, 200]));

    expect(starts(a!.nodes)).toEqual(['M80.45 140.28', 'M116.56 90.58']);
    expect(starts(b!.nodes)).toEqual(['M174.98 71.6', 'M233.41 90.58', 'M269.52 140.28']);
  });

  it('fill the rows of a parliament together, by angle, not one row after another', () => {
    // Two rows hold 2 and 4 seats; by angle, A takes the three left of the middle from both rows.
    const [a, b] = marksOf(units('parliament', [{ name: 'A', value: 3 }, { name: 'B', value: 3 }], { rows: 2 }, [300, 200]));

    expect(starts(a!.nodes)).toEqual(['M55.53 124.81', 'M111.81 115.77', 'M120.85 59.49']);
    expect(starts(b!.nodes)).toEqual(['M213.23 59.49', 'M222.27 115.77', 'M278.55 124.81']);
  });

  it('reject more seats than 50 rows of the sweep hold', () => {
    expect(layingOut(units('parliament', [{ name: 'A', value: 2000 }], { startAngle: 0, endAngle: 10 })))
      .toThrow('series[0].data has 2000 units, more than 50 rows over 10 degrees can seat');
  });

  it('draw a ring as one segment per unit, clockwise from the top', () => {
    const [a, b] = marksOf(units('ring', [{ name: 'A', value: 1 }, { name: 'B', value: 3 }]));

    expect(starts(a!.nodes)).toEqual(['M152.48 8.02']);
    expect(b!.nodes).toHaveLength(3);
  });

  it('reject a gap that leaves the segments of a ring no room', () => {
    expect(layingOut(units('ring', [{ name: 'A', value: 40 }], { padAngle: 10 })))
      .toThrow('series[0].padAngle is 10, which leaves no room for 40 segments in 360 degrees');
  });

  it('name each row of pictograms, keeping the row of a category with no units', () => {
    const spec = units('rows', [{ name: 'A', value: 2 }, { name: 'Empty', value: 0 }, { name: 'C', value: 3 }], {}, [400, 200]);

    expect(rowsOf(spec)).toEqual([['name', 'unit', 'unit'], ['name'], ['name', 'unit', 'unit', 'unit']]);
  });

  it('list the categories, not the series, in the legend', () => {
    const spec = { ...units('waffle', [{ name: 'A', value: 3 }, { name: 'B', value: 2 }]), legend: 'top' } as ChartSpec;

    expect(layoutChart(spec).labels).toEqual(['A', 'B']);
  });

  // As a point legend does, the legend shows a circle, and a unit left to its default, as a box.
  it('show the symbol of each category in the legend', () => {
    const data = [{ name: 'A', value: 2, symbol: 'star' }, { name: 'B', value: 1, symbol: 'circle' }, { name: 'C', value: 1 }];

    expect(legendSymbols(units('rows', data))).toEqual(['star', undefined, undefined]);
  });

  // As in a calendar, a unit narrower than 1 unit of the drawing is an error rather than a speck.
  it.each(['waffle', 'parliament', 'rows'])('reject a %s too small to draw each unit 1 unit wide', (display) => {
    expect(layingOut(units(display, [{ name: 'A', value: 2000 }], {}, [40, 40])))
      .toThrow('Invalid chart: a 40 × 40 chart leaves no room for the plot after its title, legend and labels');
  });

  it('reject rows of pictograms with no room beside their names', () => {
    const narrow = { ...units('rows', [{ name: 'A', value: 2 }, { name: 'B', value: 3 }], {}, [22, 300]), fontSize: 1 } as ChartSpec;

    expect(layingOut(narrow))
      .toThrow('Invalid chart: a 22 × 300 chart leaves no room for the plot after its title, legend and labels');
  });

  it('take only the options of their display, and no symbol on a ring', () => {
    expect(layingOut(units('ring', [{ name: 'A', value: 4, symbol: 'star' }])))
      .toThrow('series[0].data[0] has an unknown key, "symbol"');
    expect(layingOut(units('waffle', [{ name: 'A', value: 4 }], { startAngle: 0 })))
      .toThrow('series[0] has an unknown key, "startAngle"');
    expect(layingOut(undisplayed)).toThrow('series[0].display is missing');
  });

  it('are one series, with no axes', () => {
    const one = units('waffle', [{ name: 'A', value: 4 }]);

    expect(layingOut({ ...one, axes: {} } as ChartSpec)).toThrow('axes must be left out: a unit chart has no axes');
    expect(layingOut({ ...one, series: [one.series[0]!, { ...one.series[0]!, name: 'V' }] } as ChartSpec))
      .toThrow('series of a unit chart must be one units series, got 2');
  });
});
