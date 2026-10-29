import { describe, expect, it } from 'vitest';
import type { SketchPath } from '@borrowdale/core';
import { layoutChart, type ChartLayout, type ChartNode, type ChartSpec } from '@borrowdale/charts';
import { textBounds } from '@borrowdale/text';
import { handFont } from '../../text/test/support/hand-font.js';

const months = { type: 'band', categories: ['Jan', 'Feb'] } as const;
const revenue: ChartSpec = {
  width: 400,
  height: 300,
  title: 'Revenue',
  axes: { x: months, y: { type: 'linear', format: { prefix: '€' } } },
  series: [
    { type: 'bar', name: 'Pencils', data: [12, 15] },
    { type: 'bar', name: 'Paper', data: [7, 8] },
  ],
};
// Pencils in February changes, but not the axis: every other bar keeps its place.
const revenueLater: ChartSpec = { ...revenue, series: [{ type: 'bar', name: 'Pencils', data: [12, 14] }, revenue.series[1]!] };
const reseeded: ChartSpec = { ...revenue, seed: 2 };
const oneSeries: ChartSpec = { ...revenue, series: [revenue.series[0]!] };
// Labels 60 high, on ticks of 2 about 37 apart.
const tallLabels: ChartSpec = {
  width: 400,
  height: 700,
  fontSize: 60,
  axes: { x: { type: 'band', categories: ['a', 'b'] }, y: { type: 'linear' } },
  series: [{ type: 'bar', name: 'S', data: [1, 30] }],
};
// x and y written differently, to tell them apart in a tooltip.
const formats: ChartSpec = {
  width: 300,
  height: 200,
  axes: { x: { type: 'linear', format: { prefix: '$' } }, y: { type: 'linear', format: { suffix: ' kg' } } },
  series: [{ type: 'scatter', name: 'S', data: [[1, 2]] }],
};
// A fixed range so narrow that it holds one tick.
const loneTick: ChartSpec = { ...revenue, axes: { x: months, y: { type: 'linear', min: 1.2e-20, max: 2.6e-20 } }, series: [{ type: 'line', name: 'L', data: [1.5e-20, 2e-20] }] };
// Value labels about 55 wide, on ticks about 35 apart.
const wideTicks: ChartSpec = {
  width: 300,
  height: 200,
  axes: { x: { type: 'linear' }, y: { type: 'band', categories: ['North', 'South'] } },
  series: [{ type: 'bar', name: 'Sales', data: [1_200_000, 2_600_000] }],
};
const share: ChartSpec = {
  width: 400,
  height: 300,
  axes: { x: months, y: { type: 'linear', percent: true } },
  series: [
    { type: 'bar', name: 'A', stack: 's', data: [1, 3] },
    { type: 'bar', name: 'B', stack: 's', data: [3, 1] },
  ],
};
const dashed: ChartSpec = { ...revenue, series: [{ type: 'line', name: 'Goal', dash: [6, 4], data: [10, 20] }] };
const coloured: ChartSpec = { ...revenue, series: [{ type: 'bar', name: 'Pencils', color: '#123456', data: [12, 15] }] };
const unsetStroke: ChartSpec = { ...revenue, series: [{ type: 'bar', name: 'Pencils', style: { stroke: undefined }, data: [12, 15] }] };
const inkStyle: ChartSpec = { ...revenue, style: { stroke: '#000' }, series: [{ type: 'bar', name: 'Pencils', data: [12, 15] }] };
const ownWins: ChartSpec = { ...inkStyle, series: [{ type: 'bar', name: 'Pencils', style: { stroke: '#f00' }, data: [12, 15] }] };
const tokyo: ChartSpec = { ...revenue, axes: { x: { type: 'band', categories: ['東京', 'Paris'] }, y: { type: 'linear' } } };
const sparkline: ChartSpec = {
  width: 120,
  height: 30,
  axes: { x: { ...months, hidden: true }, y: { type: 'linear', hidden: true } },
  series: [{ type: 'line', name: 'Trend', data: [3, 5] }],
};
const crowd: ChartSpec = {
  width: 600,
  height: 400,
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ type: 'scatter', name: 'Crowd', data: Array.from({ length: 100_000 }, (_, i): [number, number] => [i, i % 97]) }],
};
const categories = Array.from({ length: 1000 }, (_, i) => `c${i}`);
// 200,100 values on one axis: two ends of each bar and a zero per series.
const crowdedBars: ChartSpec = {
  width: 10000,
  height: 4000,
  legend: 'none',
  style: { fillStyle: 'solid' },
  axes: { x: { type: 'band', categories }, y: { type: 'linear' } },
  series: Array.from({ length: 100 }, (_, s) => ({ type: 'bar' as const, name: `s${s}`, color: '#000', data: categories.map(() => 1) })),
};
// Size 10 is the largest of A but a quarter of B's largest: both must draw at one size.
const bubbles: ChartSpec = {
  width: 300,
  height: 300,
  style: { roughness: 0 },
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [
    { type: 'bubble', name: 'A', data: [[1, 1, 10]] },
    { type: 'bubble', name: 'B', data: [[2, 2, 10], [3, 3, 40]] },
  ],
};
// y2 fixes its min, but no series is drawn on it.
const emptyY2: ChartSpec = {
  ...revenue,
  axes: { x: months, y: { type: 'linear', format: { prefix: '€' } }, y2: { type: 'linear', min: 10 } },
};
const crowdedLegend: ChartSpec = {
  width: 300,
  height: 120,
  legend: 'right',
  series: [{ type: 'pie', name: 'Many', data: Array.from({ length: 20 }, (_, i) => ({ name: `slice ${i}`, value: 1 })) }],
};
// Six entries need 111 units of height; this chart leaves 111, and one unit less leaves 110.
const sixSlices: ChartSpec = { ...crowdedLegend, series: [{ type: 'pie', name: 'Six', data: Array.from({ length: 6 }, (_, i) => ({ name: `slice ${i}`, value: 1 })) }] };
const legendJustFits: ChartSpec = { ...sixSlices, height: 127 };
const legendOneShort: ChartSpec = { ...sixSlices, height: 126 };
// A slice a hundred-millionth of the other, and one far below anything that can be drawn.
const thinSlice: ChartSpec = { width: 300, height: 200, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1e8 }, { name: 'b', value: 1 }] }] };
const tinySlice: ChartSpec = { width: 300, height: 200, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1e-300 }, { name: 'b', value: 3 }] }] };
// Its share of the turn underflows to exactly 0.
const vanishingSlice: ChartSpec = { width: 300, height: 200, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 5e-324 }, { name: 'b', value: 3 }] }] };
const halfDonut: ChartSpec = {
  width: 300,
  height: 200,
  series: [{ type: 'pie', name: 'Mix', innerRadius: 0.5, startAngle: -90, endAngle: 90, data: [{ name: 'Wind', value: 3 }, { name: 'Sun', value: 1 }] }],
};

const compass = { type: 'band', categories: ['N', 'E', 'S', 'W'] } as const;
const windRose: ChartSpec = {
  width: 300,
  height: 300,
  legend: 'none',
  axes: { angle: compass, radius: { type: 'linear', max: 6 } },
  series: [
    { type: 'rose', name: 'Calm', stack: 'w', data: [4, 3, null, 2] },
    { type: 'rose', name: 'Gale', stack: 'w', data: [1, 1, 2, 1] },
  ],
};
// The same Calm wedges on the same axis, with Gale left out.
const calmOnly: ChartSpec = { ...windRose, series: [windRose.series[0]!] };
const goals: ChartSpec = {
  width: 300,
  height: 300,
  axes: { angle: { type: 'linear', max: 100, format: { suffix: '%' } }, radius: { type: 'band', categories: ['Move', 'Stand'] } },
  series: [{ type: 'radialBar', name: 'Today', data: [82, null] }],
};
const sightings: ChartSpec = {
  width: 300,
  height: 300,
  axes: { angle: { type: 'linear', min: 0, max: 360 }, radius: { type: 'linear', format: { suffix: ' km' } } },
  series: [{ type: 'polarScatter', name: 'Owls', data: [[20, 3]] }],
};
// Gaps at c and e: around the circle f runs on into a and b, and d stands alone.
const wrappedLine: ChartSpec = {
  width: 300,
  height: 300,
  axes: { angle: { type: 'band', categories: ['a', 'b', 'c', 'd', 'e', 'f'] } },
  series: [{ type: 'polarLine', name: 'L', data: [1, 2, null, 4, null, 3] }],
};
// The same gaps on half a turn, where f and a are at opposite ends.
const halfLine: ChartSpec = {
  ...wrappedLine,
  axes: { angle: { type: 'band', categories: ['a', 'b', 'c', 'd', 'e', 'f'], startAngle: -90, endAngle: 90 } },
};

// Two rings sharing the name "a": one legend entry for it.
const rings: ChartSpec = {
  width: 300,
  height: 300,
  series: [
    { type: 'pie', name: '2025', data: [{ name: 'a', value: 3 }, { name: 'b', value: 1 }] },
    { type: 'pie', name: '2024', data: [{ name: 'a', value: 1 }, { name: 'c', value: 1 }] },
  ],
};
// A slice of 3.6 degrees, less than the 4 degrees of space between slices.
const spaced: ChartSpec = {
  width: 300,
  height: 300,
  series: [{ type: 'pie', name: 'P', padAngle: 4, data: [{ name: 'big', value: 99 }, { name: 'sliver', value: 1 }] }],
};

const speed: ChartSpec = {
  width: 300,
  height: 260,
  axes: { angle: { type: 'linear', min: 0, max: 200, format: { suffix: ' km/h' } } },
  series: [{ type: 'gauge', name: 'Speed', value: 88 }],
};
const twoNeedles: ChartSpec = { ...speed, series: [...speed.series, { type: 'gauge', name: 'Limit', value: 120 }] };

// Eight city names on 300 units: flat, every other one is left out; slanted, each fits.
const cities = ['Zürich', 'Łódź', 'São Paulo', 'Reykjavík', 'Kraków', 'Montréal', 'Ho Chi Minh City', 'Kyiv'];
const cityAxis = { type: 'band', categories: cities } as const;
const flatCities: ChartSpec = {
  width: 300,
  height: 260,
  axes: { x: cityAxis, y: { type: 'linear' } },
  series: [{ type: 'bar', name: 'Visits', data: [5, 3, 8, 4, 6, 7, 9, 2] }],
};
const slantedCities: ChartSpec = { ...flatCities, axes: { x: { ...cityAxis, labelAngle: -60 }, y: { type: 'linear' } } };

// Long money labels slanted on the side: the lowest must stay on the 200-unit-high chart.
const slantedMoney: ChartSpec = {
  width: 300,
  height: 200,
  legend: 'none',
  axes: {
    x: { type: 'band', categories: ['Alpha', 'Beta'] },
    y: { type: 'linear', labelAngle: -45, format: { prefix: '$' }, min: 1_000_000, max: 2_000_000 },
  },
  series: [{ type: 'line', name: 'S', data: [1_500_000, 1_800_000] }],
};

// A dial from 50 to 150: 0 is not on it.
const offsetDial: ChartSpec = {
  width: 300,
  height: 260,
  axes: { angle: { type: 'linear', min: 50, max: 150 } },
  series: [{ type: 'gauge', name: 'a', value: 100 }],
};
// Ten bars need ten rings, more than a 260 × 240 dial has room for.
const tooManyBars: ChartSpec = {
  width: 260,
  height: 240,
  legend: 'none',
  series: Array.from({ length: 10 }, (_, i) => ({ type: 'gauge' as const, name: `g${i}`, display: 'bar' as const, value: i * 10 })),
};
// A half dial whose width limits it, with little room under its centre for its value.
const lowValue: ChartSpec = {
  width: 216,
  height: 136,
  axes: { angle: { type: 'linear', min: 0, max: 100, startAngle: -90, endAngle: 90 } },
  series: [{ type: 'gauge', name: 'G', value: 37 }],
};
// Slice a reaches out to radius 0: nothing to draw, even with rounded corners.
const flatSlice: ChartSpec = {
  width: 300,
  height: 260,
  series: [{ type: 'pie', name: 'P', cornerRadius: 5, data: [{ name: 'a', value: 1, radius: 0 }, { name: 'b', value: 1, radius: 1 }] }],
};
// A ring half the chart's radius, its slice pulled out by half that radius.
const pulledHalf: ChartSpec = {
  width: 300,
  height: 260,
  legend: 'none',
  series: [{ type: 'pie', name: 'P', outerRadius: 0.5, data: [{ name: 'a', value: 1, offset: 0.5 }, { name: 'b', value: 3 }] }],
};
// One slice takes the whole turn: pulling it out would only move the pie off centre.
const loneSlice: ChartSpec = { width: 300, height: 260, legend: 'none', series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1 }, { name: 'b', value: 0 }] }] };
const pulledLoneSlice: ChartSpec = {
  ...loneSlice,
  series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, offset: 0.3 }, { name: 'b', value: 0 }] }],
};

/** The mark whose tooltip is `title`. */
function mark(layout: ChartLayout, title: string): ChartNode {
  const found = layout.nodes.find((node) => node.kind === 'mark' && node.title === title);
  if (!found) {
    throw new Error(`No mark titled ${title}`);
  }
  return found;
}

/** The outline of a mark's first shape: its last path. */
function outline(layout: ChartLayout, title: string): SketchPath {
  const group = mark(layout, title);
  const first = group.kind === 'mark' ? group.nodes[0] : undefined;
  if (first?.kind !== 'sketch') {
    throw new Error(`Mark ${title} starts with no shape`);
  }
  return first.sketch.paths.at(-1)!;
}

/** How wide a mark's outline is drawn, from its path data. */
function width(layout: ChartLayout, title: string): number {
  const xs = [...outline(layout, title).d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((match) => Number(match[1]));
  return Math.round(Math.max(...xs) - Math.min(...xs));
}

/** How far down the chart the label `text` reaches, once rotated. */
function lowestEdge(layout: ChartLayout, text: string): number {
  const found = layout.nodes.find((node) => node.kind === 'text' && node.text.text === text);
  if (found?.kind !== 'text') {
    throw new Error(`No label ${text}`);
  }
  const { y, height } = textBounds(found.text);
  return y + height;
}

/** How many points of the drawn shapes lie outside the chart. */
function pointsOutside(layout: ChartLayout): number {
  const ds = layout.nodes.flatMap((node) => (node.kind === 'mark' ? node.nodes : [node]));
  const paths = ds.flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths.map((path) => path.d) : []));
  const points = paths.flatMap((d) => [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]));
  return points.filter(([px, py]) => px! < 0 || py! < 0 || px! > layout.width || py! > layout.height).length;
}

function titles(layout: ChartLayout): string[] {
  return layout.nodes.flatMap((node) => (node.kind === 'mark' ? [node.title] : []));
}

function texts(layout: ChartLayout): string[] {
  return layout.nodes.flatMap((node) => (node.kind === 'text' ? [node.text.text] : []));
}

describe('layoutChart', () => {
  it('lays out the same spec identically every time', () => {
    expect(layoutChart(revenue)).toEqual(layoutChart(revenue));
  });

  it('keeps the strokes of a mark when another mark changes', () => {
    expect(mark(layoutChart(revenueLater), 'Paper, Jan: €7')).toEqual(mark(layoutChart(revenue), 'Paper, Jan: €7'));
  });

  it('draws a mark with other strokes under another chart seed', () => {
    expect(mark(layoutChart(reseeded), 'Paper, Jan: €7')).not.toEqual(mark(layoutChart(revenue), 'Paper, Jan: €7'));
  });

  it('gives each bar a tooltip with its series, category and value, in the axis format', () => {
    expect(titles(layoutChart(revenue))).toEqual(['Pencils, Jan: €12', 'Pencils, Feb: €15', 'Paper, Jan: €7', 'Paper, Feb: €8']);
  });

  it('shows the values, not the shares, in the tooltips of a percent axis', () => {
    expect(titles(layoutChart(share))).toEqual(['A, Jan: 1', 'A, Feb: 3', 'B, Jan: 3', 'B, Feb: 1']);
  });

  it('labels every other tick of a value axis whose labels would overlap', () => {
    expect(texts(layoutChart(wideTicks))).toEqual(['0', '1,000,000', '2,000,000', '3,000,000', 'North', 'South']);
  });

  it('labels every third tick of a vertical value axis whose labels would overlap', () => {
    expect(texts(layoutChart(tallLabels))).toEqual(['a', 'b', '0', '6', '12', '18', '24', '30']);
  });

  it('writes a point in its tooltip with the format of each axis', () => {
    expect(titles(layoutChart(formats))).toEqual(['S: $1, 2 kg']);
  });

  it('labels the one tick of a value axis that has only one', () => {
    expect(texts(layoutChart(loneTick))).toEqual(['Revenue', 'Jan', 'Feb', '0.00000000000000000002']);
  });

  it('labels a percent axis from 0% to 100%', () => {
    expect(texts(layoutChart(share))).toEqual(['A', 'B', 'Jan', 'Feb', '0%', '20%', '40%', '60%', '80%', '100%']);
  });

  it('draws the title first, 4 units larger than the labels', () => {
    expect(layoutChart(revenue).nodes[0]).toMatchObject({ kind: 'text', text: { text: 'Revenue', fontSize: 16 } });
  });

  it('shows a legend for two series', () => {
    expect(texts(layoutChart(revenue))).toEqual(expect.arrayContaining(['Pencils', 'Paper']));
  });

  it('shows no legend for one series', () => {
    expect(texts(layoutChart(oneSeries))).not.toContain('Pencils');
  });

  it('lists every label drawn once', () => {
    expect(layoutChart(revenue).labels).toEqual(['Revenue', 'Pencils', 'Paper', 'Jan', 'Feb', '€0', '€5', '€10', '€15']);
  });

  it('reports the characters the font does not cover', () => {
    expect(layoutChart(tokyo).missing).toEqual(['東', '京']);
  });

  it('draws a line series with its dash', () => {
    expect(outline(layoutChart(dashed), 'Goal')).toMatchObject({ strokeLineDash: [6, 4] });
  });

  it("uses a series' own colour", () => {
    expect(outline(layoutChart(coloured), 'Pencils, Jan: €12').stroke).toBe('#123456');
  });

  it('keeps the palette colour when a style sets stroke to undefined', () => {
    expect(outline(layoutChart(unsetStroke), 'Pencils, Jan: €12').stroke).toBe('#e69f00');
  });

  it("puts the chart's style over the palette", () => {
    expect(outline(layoutChart(inkStyle), 'Pencils, Jan: €12').stroke).toBe('#000');
  });

  it("puts a series' own style over the chart's", () => {
    expect(outline(layoutChart(ownWins), 'Pencils, Jan: €12').stroke).toBe('#f00');
  });

  it('draws no text for hidden axes and a single series', () => {
    expect(layoutChart(sparkline).labels).toEqual([]);
  });

  it('lays out an empty axis that fixes its min, from that min', () => {
    expect(layoutChart(emptyY2).labels).toContain('10');
  });

  it('rejects a right-hand legend taller than the chart, by name', () => {
    expect(() => layoutChart(crowdedLegend)).toThrow(
      'Invalid chart: legend "right" needs 379 units of height for 20 entries, but 104 are left',
    );
  });

  it('lays out a right-hand legend that just fits', () => {
    expect(texts(layoutChart(legendJustFits))).toEqual(['slice 0', 'slice 1', 'slice 2', 'slice 3', 'slice 4', 'slice 5']);
  });

  it('rejects a right-hand legend one unit too tall', () => {
    expect(() => layoutChart(legendOneShort)).toThrow(
      'Invalid chart: legend "right" needs 111 units of height for 6 entries, but 110 are left',
    );
  });

  it("measures and draws text in the caller's font", () => {
    expect(layoutChart(revenue, { font: handFont }).family).toBe('Hand Test');
  });

  it('draws a pie with a slice a hundred-millionth of the other', () => {
    expect(titles(layoutChart(thinSlice))).toEqual(['a: 100,000,000 (100.0%)', 'b: 1 (0.0%)']);
  });

  it('draws a slice of nearly the whole turn across the pie, not as a line', () => {
    expect(width(layoutChart(thinSlice), 'a: 100,000,000 (100.0%)')).toBe(206);
  });

  it('draws a slice far thinner than a pixel without an error', () => {
    expect(titles(layoutChart(tinySlice))).toEqual(['a: 0.00000000000000000000 (0.0%)', 'b: 3 (100.0%)']);
  });

  it('leaves out a slice whose sweep rounds to nothing, keeping the others', () => {
    expect(titles(layoutChart(vanishingSlice))).toEqual(['b: 3 (100.0%)']);
  });

  it('gives each slice a tooltip with its value and share', () => {
    expect(titles(layoutChart(halfDonut))).toEqual(['Wind: 3 (75.0%)', 'Sun: 1 (25.0%)']);
  });

  it('stops a chart whose drawing work is too large with a named error', () => {
    expect(() => layoutChart(crowd)).toThrow('Drawing too complex (more than 400000 operations)');
  });

  it('stops a chart with 200,000 values on one axis with the named error, not a stack overflow', () => {
    expect(() => layoutChart(crowdedBars)).toThrow('Drawing too complex (more than 400000 operations)');
  });

  it('draws bubbles of one size at one size in every series', () => {
    const layout = layoutChart(bubbles);

    expect(width(layout, 'A: 1, 1, size 10')).toBe(width(layout, 'B: 2, 2, size 10'));
  });

  it('gives each wedge of a rose a tooltip with its value, and none to a null', () => {
    expect(titles(layoutChart(windRose))).toEqual([
      'Calm, N: 4',
      'Calm, E: 3',
      'Calm, W: 2',
      'Gale, N: 1',
      'Gale, E: 1',
      'Gale, S: 2',
      'Gale, W: 1',
    ]);
  });

  it('keeps the strokes of a wedge when a series stacked on it changes', () => {
    expect(mark(layoutChart(windRose), 'Calm, E: 3')).toEqual(mark(layoutChart(calmOnly), 'Calm, E: 3'));
  });

  it('writes a radial bar value in the angle axis format', () => {
    expect(titles(layoutChart(goals))).toEqual(['Today, Move: 82%']);
  });

  it('labels the rings of a radial bar chart', () => {
    expect(texts(layoutChart(goals))).toEqual(expect.arrayContaining(['Move', 'Stand']));
  });

  it('labels a whole turn of a linear angle axis once where it starts and ends', () => {
    expect(texts(layoutChart(sightings))).toEqual(expect.arrayContaining(['0', '300']));
    expect(texts(layoutChart(sightings))).not.toContain('360');
  });

  it('writes a polar point as its angle and radius, each in its axis format', () => {
    expect(titles(layoutChart(sightings))).toEqual(['Owls: 20, 3 km']);
  });

  it('joins a polar line across the start of a whole turn', () => {
    expect(mark(layoutChart(wrappedLine), 'L')).toMatchObject({ nodes: [{ kind: 'sketch' }, { kind: 'sketch' }] });
  });

  it('keeps the ends of part of a turn apart', () => {
    expect(mark(layoutChart(halfLine), 'L')).toMatchObject({ nodes: [{}, {}, {}] });
  });

  it('names the ring in the tooltip of each slice of nested rings', () => {
    expect(titles(layoutChart(rings))).toEqual(['2025, a: 3 (75.0%)', '2025, b: 1 (25.0%)', '2024, a: 1 (50.0%)', '2024, c: 1 (50.0%)']);
  });

  it('gives a slice name shared by two rings one legend entry', () => {
    expect(texts(layoutChart(rings))).toEqual(['a', 'b', 'c']);
  });

  it('leaves out a slice narrower than the space between slices, keeping its legend entry', () => {
    expect(titles(layoutChart(spaced))).toEqual(['big: 99 (99.0%)']);
    expect(texts(layoutChart(spaced))).toEqual(['big', 'sliver']);
  });

  it('writes a gauge value in the dial format, in its tooltip and under a lone gauge', () => {
    expect(titles(layoutChart(speed))).toEqual(['Speed: 88 km/h']);
    expect(texts(layoutChart(speed))).toContain('88 km/h');
  });

  it('writes no value under a gauge of several needles', () => {
    expect(texts(layoutChart(twoNeedles))).not.toContain('88 km/h');
  });

  it('leaves out every other flat label that would overlap', () => {
    expect(texts(layoutChart(flatCities))).not.toContain('Łódź');
  });

  it('fits every label once they are slanted', () => {
    expect(texts(layoutChart(slantedCities))).toEqual(expect.arrayContaining(cities));
  });

  it('keeps the lowest slanted label of a side axis on the chart, inside its padding', () => {
    expect(lowestEdge(layoutChart(slantedMoney), '$1,000,000')).toBeLessThanOrEqual(192);
  });

  it('draws a gauge whose dial does not reach 0', () => {
    expect(titles(layoutChart(offsetDial))).toEqual(['a: 100']);
  });

  it('rejects more gauge bars than the dial has rings for, by name', () => {
    expect(() => layoutChart(tooManyBars)).toThrow('Invalid chart: series holds 10 gauge bars, more rings than the dial has room for');
  });

  it("keeps a lone gauge's value on the chart, inside its padding", () => {
    expect(lowestEdge(layoutChart(lowValue), '37')).toBeLessThanOrEqual(128);
  });

  it('leaves out a slice that reaches no further than the hole, rounded or not', () => {
    expect(titles(layoutChart(flatSlice))).toEqual(['b: 1 (50.0%)']);
  });

  it('pulls a slice out in proportion to its own ring, keeping it on the chart', () => {
    expect(pointsOutside(layoutChart(pulledHalf))).toBe(0);
  });

  it('does not pull out a slice that takes the whole turn', () => {
    expect(mark(layoutChart(pulledLoneSlice), 'a: 1 (100.0%)')).toEqual(mark(layoutChart(loneSlice), 'a: 1 (100.0%)'));
  });
});
