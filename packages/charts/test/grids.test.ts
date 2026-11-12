import { describe, expect, it } from 'vitest';
import { layoutChart, toSvgChart, type ChartLayout, type ChartSpec } from '@borrowdale/charts';
import { mark, shapesOf } from './support/layout.js';

// Paired observations binned into hexagons of different counts, so the cells differ in density.
const hexbin: ChartSpec = {
  width: 400,
  height: 300,
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{
    type: 'relationship', display: 'hexbin', name: 'Observations', binWidth: 1.3, binHeight: 1.1,
    data: [[1, 2], [1.3, 2.3], [1.8, 3.4], [2, 3], [2.2, 3.1], [2.5, 3.5], [3, 4], [3.1, 3.8], [3.2, 3.5], [6, 7.8]],
  }],
};
const solidHexbin: ChartSpec = { ...hexbin, series: [{ ...hexbin.series[0]!, style: { fillStyle: 'solid' } }] };
const widelyHatchedHexbin: ChartSpec = { ...hexbin, style: { hachureGap: 4 } };

const days = { type: 'band', categories: ['Mon', 'Tue'] } as const;
const times = { type: 'band', categories: ['AM', 'PM'] } as const;
// Black to white from 0 to 10: a value of 5 is 127.5 in each byte, drawn as 128, #808080.
const load: ChartSpec = {
  width: 400,
  height: 300,
  colorAxis: { type: 'linear', min: 0, max: 10, stops: ['#000000', '#ffffff'] },
  axes: { x: days, y: times },
  series: [{ type: 'heatmap', name: 'Load', data: [['Mon', 'AM', 5], ['Tue', 'PM', 10], ['Mon', 'PM', 0]] }],
};
const loadWith = (data: unknown[], colorAxis: object = { type: 'linear' }): ChartSpec =>
  ({ ...load, colorAxis, series: [{ type: 'heatmap', name: 'Load', data }] } as ChartSpec);
const filledLoad: ChartSpec = { ...load, series: [{ ...load.series[0]!, style: { fill: '#ff0000' } }] };
const filledChartLoad: ChartSpec = { ...load, style: { fill: '#ff0000' } };
const colouredLoad: ChartSpec = { ...load, series: [{ ...load.series[0]!, color: '#ff0000' }] };
const missingLoad = loadWith([['Mon', 'AM', 5], ['Tue', 'AM', null]], { type: 'linear', min: 0, max: 10, stops: ['#000000', '#ffffff'] });
// Five values, all 3: one colour, wherever the domain's ends round to.
const constantLoad = loadWith([['Mon', 'AM', 3], ['Tue', 'AM', 3], ['Mon', 'PM', 3]]);
// From 0 to 10 in four equal classes: boundaries at 2.5, 5 and 7.5, each written to one decimal.
const quarteredLoad = loadWith([['Mon', 'AM', 0], ['Tue', 'PM', 10]], { type: 'linear', scale: 'quantize', classes: 4 });
const markupLoad: ChartSpec = { ...load, axes: { x: { type: 'band', categories: ['<b>Mon</b>', 'Tue'] }, y: times }, series: [{ type: 'heatmap', name: 'Load', data: [['<b>Mon</b>', 'AM', 5]] }] };
const barsOnTwoBands: ChartSpec = { ...load, colorAxis: undefined, series: [{ type: 'bar', name: 'Bars', data: [1, 2] }] };
const barsWithColorAxis: ChartSpec = { ...barsOnTwoBands, axes: { x: days, y: { type: 'linear' } }, colorAxis: { type: 'linear' } };
const hexOnBands: ChartSpec = { ...load, series: [{ type: 'heatmap', display: 'hex', name: 'Load', data: [[0, 0, 1]] }] };
const correlationBeyondOne: ChartSpec = { ...load, colorAxis: undefined, series: [{ type: 'heatmap', correlation: true, name: 'r', data: [['Mon', 'AM', 1.2]] }] };

// 2024 is a leap year: 29 February is a Thursday, as 4 January is, and 5 January a Friday.
const leapYear: ChartSpec = {
  width: 900,
  height: 220,
  colorAxis: { type: 'linear' },
  series: [{
    type: 'calendar', name: 'Visits', from: '2024-01-01', to: '2024-12-31',
    data: [['2024-01-01', 1], ['2024-01-02', 2], ['2024-01-04', 3], ['2024-01-05', 4], ['2024-02-28', 4], ['2024-02-29', 5], ['2024-03-01', 6]],
  }],
};
const calendarWith = (series: object): ChartSpec => ({ ...leapYear, series: [{ ...leapYear.series[0]!, ...series }] } as ChartSpec);
const sundayLeapYear = calendarWith({ weekStart: 'sunday' });
const verticalLeapYear: ChartSpec = { ...calendarWith({ orientation: 'vertical' }), width: 400, height: 900 };

// Quantile classes need at least as many distinct values as classes: these have two.
const fewDistinct = loadWith([['Mon', 'AM', 1], ['Tue', 'AM', 1], ['Mon', 'PM', 2]], { type: 'linear', scale: 'quantile', classes: 3 });

// Seven values of 1 among eleven: the first three of five quantile breaks are all 1.
const tiedQuantiles = { ...load, colorAxis: { type: 'linear', scale: 'quantile' }, axes: { x: { type: 'band', categories: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] }, y: times },
  series: [{ type: 'heatmap', name: 'Load', data: [['a', 'AM', 1], ['b', 'AM', 1], ['c', 'AM', 1], ['d', 'AM', 1], ['e', 'AM', 1], ['f', 'AM', 1], ['g', 'AM', 1], ['h', 'AM', 2], ['i', 'AM', 3], ['j', 'AM', 4], ['k', 'AM', 5]] }] } as ChartSpec;

// A correlation asks for a diverging scale fixed at -1 and 1, a plain heatmap for a sequential one.
const mixedHeatmaps = { ...load, colorAxis: undefined, axes: { x: days, y: times }, series: [
  { type: 'heatmap', correlation: true, name: 'r', data: [['Mon', 'AM', 0.5]] },
  { type: 'heatmap', name: 'Load', data: [['Tue', 'AM', 5]] },
] } as ChartSpec;

// Three of eight values are 0: the first quarter's break is 0 too, so its class holds no value.
const lowQuantiles = { ...tiedQuantiles, colorAxis: { type: 'linear', scale: 'quantile', classes: 4 },
  series: [{ type: 'heatmap', name: 'Load', data: [['a', 'AM', 0], ['b', 'AM', 0], ['c', 'AM', 0], ['d', 'AM', 1], ['e', 'AM', 2], ['f', 'AM', 3], ['g', 'AM', 4], ['h', 'AM', 5]] }] } as ChartSpec;
// A title longer than a 400-unit legend row.
const titledLoad: ChartSpec = { ...load, colorAxis: { type: 'linear', min: 0, max: 10, title: 'Requests per minute at the busiest front-end server of the whole cluster, averaged' } };

// Nine classes need a wider legend row than 400 units.
const ninths: ChartSpec = { ...loadWith([['Mon', 'AM', 0.3], ['Tue', 'AM', 0.31], ['Mon', 'PM', 0.29]], { type: 'linear', scale: 'quantize', min: 0.1, max: 1, classes: 9 }), width: 600 };

// From -2 to 8, black to white: the default midpoint is 0, so a cell at 0 is the middle grey.
const offCentre = loadWith([['Mon', 'AM', -2], ['Tue', 'AM', 8], ['Mon', 'PM', 0]], { type: 'linear', scale: 'diverging', min: -2, max: 8, stops: ['#000000', '#ffffff'] });
const circles = (data: unknown[]): ChartSpec => ({ ...loadWith(data), series: [{ type: 'heatmap', display: 'circle', name: 'Load', data }] } as ChartSpec);
const bandedHex = { ...load, colorAxis: undefined, axes: { x: { type: 'linear' }, y: times }, series: [{ type: 'heatmap', display: 'hex', name: 'Load', data: [[0, 0, 1]] }] } as ChartSpec;
const flatStretch = { ...load, colorAxis: undefined, axes: { x: { type: 'linear' }, y: times }, series: [{ type: 'heatmap', name: 'Load', data: [[[2, 2], 'AM', 1]] }] } as ChartSpec;

// The second cell, 0.3, is named by its value in the tooltip with the format's whole numbers: 0.
const wholeQuarters = { ...loadWith([['Mon', 'AM', 0], ['Tue', 'AM', 0.3], ['Mon', 'PM', 1]], { type: 'linear', scale: 'quantize', min: 0, max: 1, classes: 4, format: { decimals: 0 } }), width: 500 } as ChartSpec;
const nearlyTen = loadWith([['Mon', 'AM', 0], ['Tue', 'AM', 9.96], ['Mon', 'PM', 9.97], ['Tue', 'PM', 9.97]], { type: 'linear', scale: 'quantile', classes: 2 });

// 0.7 − 0.4 is 0.29999999999999993 in binary: the median of these three values is that value itself,
// so the top class holds both of them, however close the value is to 0.3.
const noisyMedian = loadWith([['Mon', 'AM', 0], ['Tue', 'AM', 0.7 - 0.4], ['Mon', 'PM', 0.7 - 0.4]], { type: 'linear', scale: 'quantile', classes: 2 });
// Twenty-nine horizon rows, more than the palette's 28 colour and hatching pairs.
const rows29 = Array.from({ length: 29 }, (_, i) => `r${i}`);
const manyHorizons = {
  width: 600, height: 900, axes: { x: { type: 'linear' }, y: { type: 'band', categories: rows29 } },
  series: rows29.map((row) => ({ type: 'horizon', name: row, row, data: [[0, 1], [1, 2]] })),
} as ChartSpec;
// A heatmap and then a bar on one band axis: the bar is the chart's first series painted from the palette.
const heatmapThenBar = {
  width: 400, height: 300, legend: 'none', axes: { x: days, y: { type: 'linear' } },
  series: [{ type: 'heatmap', name: 'Cells', data: [['Mon', [0, 1], 1]] }, { type: 'bar', name: 'Bars', data: [1, 2] }],
} as ChartSpec;

// A correlation drawn with circles.
const circleCorrelation = { ...load, colorAxis: undefined, series: [{ type: 'heatmap', display: 'circle', correlation: true, name: 'r', data: [['Mon', 'AM', -0.5], ['Tue', 'AM', 0.5]] }] } as ChartSpec;
const correlationDisplay = { ...load, colorAxis: undefined, series: [{ type: 'heatmap', display: 'correlation', name: 'r', data: [['Mon', 'AM', 0.5]] }] } as unknown as ChartSpec;

// From -0.04 to 2.94 in two quantile classes, written to one decimal: rounded to the nearest, the ends
// would be written 0.0 and 2.9, both inside the values they end.
const roundedEnds = loadWith([['Mon', 'AM', -0.04], ['Tue', 'AM', 1], ['Mon', 'PM', 2], ['Tue', 'PM', 2.94]], { type: 'linear', scale: 'quantile', classes: 2 });
// Twenty decimals: the lowest value, 98765.4321, is written 98765.43210000000544823706, which the
// legend's lower label must not exceed.
const twentyDecimals = { ...loadWith([['Mon', 'AM', 98765.4321], ['Tue', 'AM', 98765.5], ['Mon', 'PM', 98766], ['Tue', 'PM', 98767]], { type: 'linear', scale: 'quantile', classes: 2, format: { decimals: 20 } }), width: 2400 } as ChartSpec;
// Every cell without a value leaves a quantile scale nothing to divide.
const valuelessQuantiles = loadWith([['Mon', 'AM', null]], { type: 'linear', scale: 'quantile', classes: 3 });
// Eleven values in seven quantile classes: the breaks 50.43 and 54 differ, but no value lies between
// them, as 54 is tied.
const elevenCategories = { type: 'band', categories: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] } as const;
const gappedQuantiles = { ...load, width: 900, colorAxis: { type: 'linear', scale: 'quantile', classes: 7 }, axes: { x: elevenCategories, y: times },
  series: [{ type: 'heatmap', name: 'Load', data: [['a', 'AM', 2], ['b', 'AM', 10], ['c', 'AM', 10], ['d', 'AM', 23], ['e', 'AM', 49], ['f', 'AM', 54], ['g', 'AM', 54], ['h', 'AM', 63], ['i', 'AM', 73], ['j', 'AM', 78], ['k', 'AM', 84]] }] } as ChartSpec;
// Two distinct values, fewer than the five quantile classes a colour axis has by default.
const defaultQuantiles = loadWith([['Mon', 'AM', 1], ['Tue', 'AM', 2]], { type: 'linear', scale: 'quantile' });
// Twelve classes need more than a 200-unit row before any title, at the top by default or as given.
const crowdedTitledLoad = { ...loadWith([['Mon', 'AM', 0], ['Tue', 'PM', 10]], { type: 'linear', scale: 'quantize', classes: 12, title: 'T' }), width: 200 } as ChartSpec;
const crowdedTopLoad = { ...crowdedTitledLoad, legend: 'top' } as ChartSpec;
// The twelve classes take 551 units: at 566 wide the row is a unit short of them, and at 567 they fit
// with no room left for the title.
const scaleJustTooWide = { ...crowdedTitledLoad, width: 566 } as ChartSpec;
const titleJustTooWide = { ...crowdedTitledLoad, width: 567 } as ChartSpec;
// Breaks too small for the 20 decimals a label writes: both would be written 0.00000000000000000000.
const tinyBreaks = loadWith([['Mon', 'AM', 0]], { type: 'linear', scale: 'threshold', breaks: [-1e-21, 1e-21] });
// A diverging scale between two neighbouring numbers has no value between them for its midpoint.
const narrowDiverging = loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'diverging', min: 1, max: 1.0000000000000002 });
// A midpoint at an end of a domain the format writes 0 to 0.
const wholeDiverging = loadWith([['Mon', 'AM', 0.1]], { type: 'linear', scale: 'diverging', min: -0.04, max: 0.24, format: { decimals: 0 }, midpoint: 0.24 });
// Threshold breaks that a fixed number of decimals does not write as they are: written 1, 0.5 would
// put 0.7 in the class labelled "from 1"; written 0.1, 0.12 and 0.14 could not be told apart.
const roundedBreaks = loadWith([['Mon', 'AM', 0.7]], { type: 'linear', scale: 'threshold', breaks: [0.5, 1.5], format: { decimals: 0 } });
const alikeBreaks = loadWith([['Mon', 'AM', 0.13]], { type: 'linear', scale: 'threshold', breaks: [0.12, 0.14], format: { decimals: 1 } });
// Breaks the fixed decimals write exactly.
const exactBreaks = loadWith([['Mon', 'AM', 0.7]], { type: 'linear', scale: 'threshold', breaks: [0.5, 1.5], format: { decimals: 1 } });

const laying = (spec: ChartSpec) => () => layoutChart(spec);

/** How many marks have a tooltip starting with `prefix`. */
function marksStarting(layout: ChartLayout, prefix: string): number {
  return layout.nodes.filter((node) => node.kind === 'mark' && node.title.startsWith(prefix)).length;
}

/** The points a mark's paths pass through, by coordinate: 0 across, 1 down. */
function coordinatesOf(layout: ChartLayout, title: string, axis: 0 | 1): number[] {
  const ds = shapesOf(layout, title).flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths.map((path) => path.d) : []));
  return ds.flatMap((d) => [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((match) => Number(match[axis + 1])));
}

/** The mean height of the points a mark's paths pass through. */
function middleOf(layout: ChartLayout, title: string): number {
  const ys = coordinatesOf(layout, title, 1);
  return ys.reduce((sum, y) => sum + y, 0) / ys.length;
}

/** The mean position across of the points a mark's paths pass through. */
function centreOf(layout: ChartLayout, title: string): number {
  const xs = coordinatesOf(layout, title, 0);
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/** Every colour a mark's paths are filled with, each once. */
function fillsOf(layout: ChartLayout, title: string): string[] {
  mark(layout, title);
  const paths = shapesOf(layout, title).flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths : []));
  return [...new Set(paths.map((path) => path.fill))];
}

/** The first label the chart draws that starts with `prefix`. */
function labelStarting(layout: ChartLayout, prefix: string): string | undefined {
  return layout.labels.find((label) => label.startsWith(prefix));
}

/** How far across the points a mark's paths pass through reach. */
function widthOf(layout: ChartLayout, title: string): number {
  const xs = coordinatesOf(layout, title, 0);
  return Math.max(...xs) - Math.min(...xs);
}

/** Every colour a mark's paths are stroked with, each once: a hatched shape's colour is its strokes'. */
function strokesOf(layout: ChartLayout, title: string): string[] {
  const paths = shapesOf(layout, title).flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths : []));
  return [...new Set(paths.map((path) => path.stroke))];
}

/** How many different colours the cells of the series `name` are filled with. */
function cellColours(layout: ChartLayout, name: string): number {
  const marks = layout.nodes.filter((node) => node.kind === 'mark' && node.title.startsWith(`${name}, `));
  const fills = marks.flatMap((node) => (node.kind === 'mark' ? node.nodes : [])).flatMap((node) => (node.kind === 'sketch' ? node.sketch.paths : []));
  return new Set(fills.map((path) => path.fill).filter((fill) => fill !== 'none')).size;
}

/** The stops of every gradient the chart draws. */
function gradientsOf(layout: ChartLayout): unknown[] {
  return layout.nodes.filter((node) => node.kind === 'gradient').map((node) => node.kind === 'gradient' && node.stops);
}

describe('colour by value', () => {
  // A count cell's hachure density is its count, so a style's fill style or gap must not replace it.
  it('keeps a count cell\'s density over a style that sets the fill style or the hachure gap', () => {
    const plain = layoutChart(hexbin).nodes;

    expect(layoutChart(solidHexbin).nodes).toEqual(plain);
    expect(layoutChart(widelyHatchedHexbin).nodes).toEqual(plain);
  });

  // The colours are worked out by hand above, not by the scale under test.
  it('fills each cell of a heatmap on two band axes with the colour axis\' colour at its value', () => {
    const layout = layoutChart(load);

    expect(fillsOf(layout, 'Load, Mon, AM: 5')).toContain('#808080');
    expect(fillsOf(layout, 'Load, Tue, PM: 10')).toContain('#ffffff');
    expect(fillsOf(layout, 'Load, Mon, PM: 0')).toContain('#000000');
  });

  // A continuous scale is shown as a gradient from the first stop to the last, between its ends.
  it('draws the colour axis as a ramp with the labels of its ends', () => {
    const layout = layoutChart(load);

    expect(gradientsOf(layout)).toEqual([[{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }]]);
    expect(layout.labels).toEqual(expect.arrayContaining(['0', '10']));
  });

  // Class boundaries computed here: a quarter of 0 to 10 apart.
  it('labels a classed scale at its class boundaries', () => {
    expect(layoutChart(quarteredLoad).labels).toEqual(expect.arrayContaining(['0.0', '2.5', '5.0', '7.5', '10.0']));
  });

  // 0.1 to 1 in nine classes: the legend writes a boundary at 0.30, and a value of 0.30 is in the class
  // above it, not the one 0.29 is in, though 0.1 + 0.9 × 2 / 9 is a hair above 0.3 in binary.
  it('puts a value on a written class boundary in the class above it', () => {
    const layout = layoutChart(ninths);

    expect(fillsOf(layout, 'Load, Mon, AM: 0.3')).toEqual(fillsOf(layout, 'Load, Tue, AM: 0.31'));
    expect(fillsOf(layout, 'Load, Mon, AM: 0.3')).not.toEqual(fillsOf(layout, 'Load, Mon, PM: 0.29'));
  });

  // A diverging scale's middle colour sits at 0 when the domain spans it, wherever its ends are.
  it('centres a diverging scale on 0 by default', () => {
    expect(fillsOf(layoutChart(offCentre), 'Load, Mon, PM: 0')).toContain('#808080');
  });

  // A circle's area grows with its value's size, so -10 is drawn larger than 5.
  it('sizes a circle cell by the size of its value, negative or not', () => {
    const layout = layoutChart(circles([['Mon', 'AM', -10], ['Tue', 'AM', 5]]));

    expect(widthOf(layout, 'Load, Mon, AM: -10')).toBeGreaterThan(widthOf(layout, 'Load, Tue, AM: 5') + 5);
  });

  // A circle cell with no value is outlined at full size, never filled.
  it('outlines a circle cell with no value', () => {
    expect(fillsOf(layoutChart(circles([['Mon', 'AM', null], ['Tue', 'AM', 5]])), 'Load, Mon, AM: no value')).toEqual(['none']);
  });

  // Written to whole numbers, 0 to 1 in four classes has boundaries the legend writes 0, 1 and 1: the
  // classes are still the computed quarters, so 0 and 0.3 keep different colours.
  it('keeps classes apart that the legend writes alike', () => {
    const layout = layoutChart(wholeQuarters);

    expect(fillsOf(layout, 'Load, Mon, AM: 0')).not.toEqual(fillsOf(layout, 'Load, Tue, AM: 0'));
  });

  // The median of 0, 9.96, 9.97 and 9.97 is 9.965, written 10.0: the top class still holds 9.97.
  it('keeps a quantile class that the legend\'s rounding would empty', () => {
    const layout = layoutChart(nearlyTen);

    expect(fillsOf(layout, 'Load, Mon, AM: 0')).not.toEqual(fillsOf(layout, 'Load, Tue, PM: 9.97'));
  });

  // A quantile break that is itself a value of the data keeps that value in the class above it.
  it('keeps a value equal to a quantile break in the class above it', () => {
    expect(cellColours(layoutChart(noisyMedian), 'Load')).toBe(2);
  });

  // The lower end is written rounded down and the upper end rounded up, so the legend's range holds
  // every value: -0.04 keeps its sign as -0.1.
  it('rounds the ends of a classed legend outward', () => {
    expect(layoutChart(roundedEnds).labels).toEqual(expect.arrayContaining(['-0.1', '1.5', '3.0']));
  });

  // An end the decimals already write exactly is written as it is, however many decimals there are.
  it('keeps an outer label exact at 20 decimals', () => {
    expect(layoutChart(twentyDecimals).labels).toContain('98,765.43210000000544823706');
  });

  // Within the limits on classes, breaks and their decimals, each spec is valid and its legend fits.
  it.each([
    ['threshold breaks that a fixed number of decimals writes exactly', exactBreaks],
  ])('accepts %s', (_case, spec) => {
    expect(laying(spec)).not.toThrow();
  });

  // Series coloured by value take no colour and hatching pair from the palette.
  it('draws more series coloured by value than the palette has pairs', () => {
    expect(marksStarting(layoutChart(manyHorizons), 'r28, r28')).toBe(1);
  });

  // The palette's first colour goes to the first series painted from it, after any coloured by value.
  it('gives a bar after a heatmap the palette\'s first colour', () => {
    expect(strokesOf(layoutChart(heatmapThenBar), 'Bars, Mon: 1')).toContain('#e69f00');
  });

  // A correlation is a reading of the values, not a shape: it works with circles too, -0.5 and 0.5 on
  // opposite sides of the diverging scale: halfway between RdBu's 3rd and 4th stops, and its 8th and 9th.
  it('draws a correlation matrix with circles on a diverging scale', () => {
    const layout = layoutChart(circleCorrelation);

    expect(fillsOf(layout, 'r, Mon, AM: -0.5')).toContain('#e58368');
    expect(fillsOf(layout, 'r, Tue, AM: 0.5')).toContain('#6bacd1');
  });

  // A missing value is shown as missing, never in the colour of the lowest value.
  it('draws a cell with no value as an outline, with a "no value" swatch in the legend', () => {
    const layout = layoutChart(missingLoad);

    expect(fillsOf(layout, 'Load, Tue, AM: no value')).toEqual(['none']);
    expect(layout.labels).toContain('no value');
  });

  // A colour axis title too long for the row is cut short, as other titles are, rather than an error.
  it('cuts a long colour axis title short to fit the legend', () => {
    expect(labelStarting(layoutChart(titledLoad), 'Requests per')).toMatch(/…$/);
  });

  // Equal values still get a colour of the scale, not an undefined one.
  it('draws equal values in one colour from the scheme', () => {
    const layout = layoutChart(constantLoad);

    expect(fillsOf(layout, 'Load, Mon, AM: 3')).toEqual(fillsOf(layout, 'Load, Tue, AM: 3'));
    expect(fillsOf(layout, 'Load, Mon, AM: 3')[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  // A category is the caller's text: SVG must carry it as text, not as markup.
  it('escapes markup in a category in the cell\'s tooltip', () => {
    expect(toSvgChart(layoutChart(markupLoad))).toContain('&lt;b&gt;Mon&lt;/b&gt;, AM: 5');
  });

  // Each error names the place in the spec to change.
  it.each([
    ['a fill in the style of a series coloured by value', filledLoad, 'Invalid chart: series[0].style.fill is not allowed'],
    ['a fill in the chart\'s style with a series coloured by value', filledChartLoad, 'Invalid chart: style.fill is not allowed'],
    ['a colour on a series coloured by value', colouredLoad, 'Invalid chart: series[0].color is not allowed'],
    ['a value beyond a fixed end of the colour axis', loadWith([['Mon', 'AM', 11]], { type: 'linear', max: 10 }), 'Invalid chart: colorAxis.max is 10, but the data reach 11'],
    ['a quantile break at the lowest value', lowQuantiles, 'Invalid chart: colorAxis.classes is 4, but only 3 of them would hold a value'],
    ['quantile classes that ties leave empty', tiedQuantiles, 'Invalid chart: colorAxis has 5 classes, the default, but only 2 of them would hold a value'],
    ['a quantile class with no value between distinct breaks', gappedQuantiles, 'Invalid chart: colorAxis.classes is 7, but only 6 of them would hold a value'],
    ['a quantile scale with no values', valuelessQuantiles, 'Invalid chart: colorAxis.classes is 3, but there are no values'],
    ['more quantile classes than distinct values', fewDistinct, 'Invalid chart: colorAxis.classes is 3, but the values have only 2 distinct values'],
    ['more default quantile classes than distinct values', defaultQuantiles, 'Invalid chart: colorAxis has 5 classes, the default, but the values have only 2 distinct values'],
    ['a colour scale too wide for its legend row, with a title', crowdedTitledLoad, 'Invalid chart: the legend, at the top by default, needs 551 units of width for the colour axis, but 184 are left'],
    ['a colour scale too wide for a legend placed at the top', crowdedTopLoad, 'Invalid chart: legend needs 551 units of width for the colour axis, but 184 are left'],
    ['a colour scale a unit too wide for its row', scaleJustTooWide, 'Invalid chart: the legend, at the top by default, needs 551 units of width for the colour axis, but 550 are left'],
    ['a colour title with no room beside a scale that fits', titleJustTooWide, 'Invalid chart: colorAxis.title does not fit even cut short: there are 0 units for it'],
    ['threshold breaks with more decimals than a label writes', tinyBreaks, 'Invalid chart: colorAxis.breaks[0] must have at most 20 decimals, got -1e-21'],
    ['a diverging scale with no value between its ends for the default midpoint', narrowDiverging, 'Invalid chart: colorAxis has no value strictly between its ends, 1 to 1.0000000000000002, for the default midpoint'],
    ['a midpoint at an end of a domain the format rounds', wholeDiverging, 'Invalid chart: colorAxis.midpoint must be inside the colour domain, -0.04 to 0.24, got 0.24'],
    ['a threshold break that a fixed number of decimals rounds', roundedBreaks, 'Invalid chart: colorAxis.breaks[0] is 0.5, which colorAxis.format.decimals 0 writes as 1'],
    ['threshold breaks that a fixed number of decimals writes alike', alikeBreaks, 'Invalid chart: colorAxis.breaks[0] is 0.12, which colorAxis.format.decimals 1 writes as 0.1'],
    ['a later threshold break that a fixed number of decimals rounds', loadWith([['Mon', 'AM', 0.7]], { type: 'linear', scale: 'threshold', breaks: [1, 1.5], format: { decimals: 0 } }), 'Invalid chart: colorAxis.breaks[1] is 1.5, which colorAxis.format.decimals 0 writes as 2'],
    ['a rounded threshold break, written with the format\'s prefix', loadWith([['Mon', 'AM', 0.7]], { type: 'linear', scale: 'threshold', breaks: [0.5], format: { decimals: 0, prefix: '$' } }), 'Invalid chart: colorAxis.breaks[0] is 0.5, which colorAxis.format.decimals 0 writes as $1'],
    ['breaks on the default scale', loadWith([['Mon', 'AM', 1]], { type: 'linear', breaks: [1] }), 'Invalid chart: colorAxis.breaks is only for a threshold scale, not the default sequential scale'],
    ['a midpoint on a scale given as quantize', loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'quantize', midpoint: 0 }), 'Invalid chart: colorAxis.midpoint is only for a diverging scale, not quantize'],
    ['series that need different colour scales', mixedHeatmaps, 'Invalid chart: series[1] cannot share the colour axis of series[0]: their values need different scales'],
    ['two values for one cell', loadWith([['Mon', 'AM', 1], ['Mon', 'AM', 2]]), 'Invalid chart: series[0].data[1] is a second value for the cell of series[0].data[0]'],
    ['a category not on its axis', loadWith([['Wed', 'AM', 1]]), 'Invalid chart: series[0].data[0][0] is not a category of axes.x, got "Wed"'],
    ['a bar series on two band axes', barsOnTwoBands, 'Invalid chart: axes has two band axes, which only heatmap series can share, but series[0] is a bar series'],
    ['a colour axis with nothing coloured by value', barsWithColorAxis, 'Invalid chart: colorAxis needs a series coloured by value'],
    ['a hex heatmap on band axes', hexOnBands, 'Invalid chart: series[0] is a hex heatmap, which needs linear x and y axes'],
    ['a correlation beyond 1', correlationBeyondOne, 'Invalid chart: series[0].data[0][2] must be a coefficient from -1 to 1, got 1.2'],
    ['a midpoint at an end of the domain', loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'diverging', min: 0, max: 10, midpoint: 0 }), 'Invalid chart: colorAxis.midpoint must be inside the colour domain, 0 to 10, got 0'],
    ['a midpoint on a sequential scale', loadWith([['Mon', 'AM', 1]], { type: 'linear', midpoint: 0 }), 'Invalid chart: colorAxis.midpoint is only for a diverging scale, not the default sequential scale'],
    ['breaks on a quantize scale', loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'quantize', breaks: [1] }), 'Invalid chart: colorAxis.breaks is only for a threshold scale, not quantize'],
    ['both a scheme and stops', loadWith([['Mon', 'AM', 1]], { type: 'linear', scheme: 'viridis', stops: ['#000000', '#ffffff'] }), 'Invalid chart: colorAxis cannot combine scheme and stops'],
    ['breaks that do not increase', loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'threshold', breaks: [10, 10] }), 'Invalid chart: colorAxis.breaks[1] must be greater than the break before it (10), got 10'],
    ['a hex heatmap with a band axis', bandedHex, 'Invalid chart: series[0] is a hex heatmap, which needs linear x and y axes'],
    ['a stretch that ends where it starts', flatStretch, 'Invalid chart: series[0].data[0][0][1] must be after 2, got 2'],
    ['correlation given as a display', correlationDisplay, 'Invalid chart: series[0].display must be one of'],
    ['a threshold scale without breaks', loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'threshold' }), 'Invalid chart: colorAxis is a threshold scale, which needs breaks'],
    ['classes on a sequential scale', loadWith([['Mon', 'AM', 1]], { type: 'linear', classes: 3 }), 'Invalid chart: colorAxis.classes is only for a quantize or quantile scale, not the default sequential scale'],
    ['classes on a scale given as sequential', loadWith([['Mon', 'AM', 1]], { type: 'linear', scale: 'sequential', classes: 3 }), 'Invalid chart: colorAxis.classes is only for a quantize or quantile scale, not sequential'],
    ['two values for one calendar day', calendarWith({ data: [['2024-03-01', 1], ['2024-03-01', 2]] }), 'Invalid chart: series[0].data[1] is a second value for 2024-03-01, after series[0].data[0]'],
    ['a time of day in a calendar', calendarWith({ data: [['2024-03-01T09:00Z', 1]] }), 'Invalid chart: series[0].data[0][0] has a time of day, but a calendar takes dates'],
    ['a calendar of more than 100,000 days', calendarWith({ from: '0000-01-01', to: '0300-01-01', data: [] }), 'Invalid chart: series[0].to makes 109574 days from 0000-01-01, more than 100000'],
    ['a calendar day outside its range', calendarWith({ data: [['2025-01-01', 1]] }), 'Invalid chart: series[0].data[0][0] is 2025-01-01, outside 2024-01-01 to 2024-12-31'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});

describe('calendars', () => {
  // A leap year has 366 days, and each gets a cell whether or not it has a value.
  it('draws a cell for each of the 366 days of 2024, 29 February in the Thursday row', () => {
    const layout = layoutChart(leapYear);

    expect(marksStarting(layout, 'Visits, 2024-')).toBe(366);
    expect(middleOf(layout, 'Visits, 2024-02-29: 5')).toBeCloseTo(middleOf(layout, 'Visits, 2024-01-04: 3'), -1);
  });

  // With weeks from Sunday, Thursday is the fifth row, where Friday is with weeks from Monday.
  it('moves every day down a row when weeks start on Sunday', () => {
    const monday = layoutChart(leapYear);
    const sunday = layoutChart(sundayLeapYear);

    expect(middleOf(sunday, 'Visits, 2024-02-29: 5')).toBeCloseTo(middleOf(monday, 'Visits, 2024-01-05: 4'), -1);
  });

  // 28 February, 29 February and 1 March are consecutive days: one row apart each, give or take the strokes.
  it('steps one row from day to day across the leap day', () => {
    const layout = layoutChart(leapYear);
    const step = middleOf(layout, 'Visits, 2024-02-29: 5') - middleOf(layout, 'Visits, 2024-02-28: 4');

    expect(step).toBeGreaterThan(5);
    expect(middleOf(layout, 'Visits, 2024-03-01: 6') - middleOf(layout, 'Visits, 2024-02-29: 5')).toBeCloseTo(step, -1);
  });

  // Without from and to, the calendar takes the whole years of its dates.
  it('defaults a calendar to the whole years of its dates', () => {
    expect(marksStarting(layoutChart(calendarWith({ from: undefined, to: undefined, data: [['2024-03-01', 1]] })), 'Visits, 2024-')).toBe(366);
  });

  // A range of one day draws one cell.
  it('draws one cell for a range of one day', () => {
    expect(marksStarting(layoutChart(calendarWith({ from: '2024-03-01', to: '2024-03-01', data: [] })), 'Visits, 2024-')).toBe(1);
  });

  // 30 and 31 January end the first week, with no full week of their own: the month is left unnamed.
  it('leaves a month with no room in the range unnamed', () => {
    expect(layoutChart(calendarWith({ from: '2024-01-30', to: '2024-03-31', data: [] })).labels).not.toContain('Jan');
  });

  // Monday 1 and Tuesday 2 January share a week: a column across, a row down.
  it('transposes the grid when vertical', () => {
    const across = layoutChart(leapYear);
    const down = layoutChart(verticalLeapYear);

    expect(centreOf(across, 'Visits, 2024-01-02: 2')).toBeCloseTo(centreOf(across, 'Visits, 2024-01-01: 1'), -1);
    expect(middleOf(down, 'Visits, 2024-01-02: 2')).toBeCloseTo(middleOf(down, 'Visits, 2024-01-01: 1'), -1);
    expect(centreOf(down, 'Visits, 2024-01-02: 2')).toBeGreaterThan(centreOf(down, 'Visits, 2024-01-01: 1') + 5);
  });
});

const regions = { x: { type: 'linear' }, y: { type: 'band', categories: ['North', 'South'] } } as const;
// From 0 up to 30 in three layers of 10: the colour axis rounds out to -30 and 30.
const rising: ChartSpec = {
  width: 400,
  height: 200,
  axes: regions,
  series: [{ type: 'horizon', name: 'North', row: 'North', layers: 3, data: [[0, 0], [1, 30]] }],
};
const horizonWith = (series: object, colorAxis?: object): ChartSpec =>
  ({ ...rising, colorAxis, series: [{ ...rising.series[0]!, ...series }] } as ChartSpec);
const logHorizon = { ...rising, axes: { ...regions, x: { type: 'log' } } } as ChartSpec;
const horizonAndHeatmap = { ...rising, series: [rising.series[0]!, { type: 'heatmap', name: 'Cells', data: [[[0, 1], 'South', 1]] }] } as ChartSpec;
const horizonsInOneRow: ChartSpec = { ...rising, series: [rising.series[0]!, { type: 'horizon', name: 'Also north', row: 'North', data: [[0, 1]] }] };
const twoHorizons: ChartSpec = { ...rising, series: [rising.series[0]!, { type: 'horizon', name: 'South', row: 'South', layers: 2, data: [[0, 1]] }] };
// One row of 3 layers by default beside one of 2, in either order.
const defaultThenTwoLayers = { ...twoHorizons, series: [{ ...rising.series[0]!, layers: undefined }, twoHorizons.series[1]!] } as ChartSpec;
const twoThenDefaultLayers = { ...twoHorizons, series: [{ ...rising.series[0]!, layers: 2 }, { ...twoHorizons.series[1]!, layers: undefined }] } as ChartSpec;

const compass = { type: 'band', categories: ['N', 'E', 'S', 'W'] } as const;
const rings = { type: 'band', categories: ['Day', 'Night'] } as const;
const wind: ChartSpec = {
  width: 300,
  height: 300,
  axes: { angle: compass, radius: rings },
  series: [{ type: 'polarHeatmap', name: 'Wind', data: [['N', 'Day', 3], ['E', 'Night', null]] }],
};
const windWith = (series: object, angle: object = compass): ChartSpec =>
  ({ ...wind, axes: { angle, radius: rings }, series: [{ ...wind.series[0]!, ...series }] } as ChartSpec);

// Ticks at 0 and 10, and values from -3 to 3: the domain still reaches as far below 0 as above it.
const tickedHorizon = horizonWith({ data: [[0, -3], [1, 3]] }, { type: 'linear', ticks: [0, 10] });
const flatHorizon = horizonWith({ data: [[0, 0], [1, 0]] });

describe('horizons and polar heatmaps', () => {
  // A layer's colour says how far from 0 it is, the same both ways, whatever ticks the axis lists.
  it('keeps a horizon\'s colour axis symmetric about 0 with listed ticks', () => {
    expect(layoutChart(tickedHorizon).labels).toEqual(expect.arrayContaining(['-10.0', '10.0']));
  });

  // Values that are all 0 still get a domain on both sides of 0, not one from 0 to 1.
  it('gives a flat horizon a symmetric colour axis', () => {
    expect(layoutChart(flatHorizon).labels).toEqual(expect.arrayContaining(['-1.00', '1.00']));
  });

  // Three layers each way: a rise through all three draws one polygon in each of the upper three colours.
  it('folds a rise through three layers into three colours', () => {
    expect(fillsOf(layoutChart(rising), 'North, North').filter((fill) => fill !== 'none')).toHaveLength(3);
  });

  // A polar heatmap with a cell of no value shows that in its legend, as a heatmap does.
  it('adds a "no value" swatch to a polar heatmap with an empty cell', () => {
    expect(layoutChart(wind).labels).toContain('no value');
  });

  // Negative values hang from the top of the row with `offset`, and rise from its foot with `mirror`.
  it('hangs negative layers from the top of the row when offset', () => {
    expect(middleOf(layoutChart(horizonWith({ mode: 'offset', data: [[0, -30], [1, -30]] })), 'North, North'))
      .toBeLessThan(middleOf(layoutChart(horizonWith({ data: [[0, -30], [1, -30]] })), 'North, North'));
  });

  // A cell with a value is filled, one without is an outline, and both are named in their tooltips.
  it('fills a polar heatmap\'s cells by value and outlines one with none', () => {
    const layout = layoutChart(wind);

    expect(fillsOf(layout, 'Wind, N, Day: 3')).toHaveLength(2);
    expect(fillsOf(layout, 'Wind, E, Night: no value')).toEqual(['none']);
  });

  // Each error names the place in the spec to change.
  it.each([
    ['a horizon row that is not a category', horizonWith({ row: 'East' }), 'Invalid chart: series[0].row is not a category of axes.y, got "East"'],
    ['a horizon value beyond a fixed end', horizonWith({ data: [[0, 1], [1, 11]] }, { type: 'linear', min: -10, max: 10 }), 'Invalid chart: colorAxis.max is 10, but the data reach 11'],
    ['horizon runs that go back across a gap', horizonWith({ data: [[5, 1], null, [1, 2]] }), 'Invalid chart: series[0].data[2][0] must increase, across gaps too'],
    ['horizon bands, which are its layers', horizonWith({ bands: 3 }), 'Invalid chart: series[0] has an unknown key, "bands"'],
    ['horizon points with equal x', horizonWith({ data: [[1, 1], [1, 2]] }), 'Invalid chart: series[0].data[1][0] must increase, across gaps too'],
    ['a horizon colour axis with other classes', horizonWith({}, { type: 'linear', classes: 4 }), 'Invalid chart: colorAxis.classes must be 6, twice series[0].layers, got 4'],
    ['a heatmap sharing a horizon\'s colour axis', horizonAndHeatmap, 'Invalid chart: series[1] is a heatmap series, which cannot share the colour axis of series[0], a horizon'],
    ['two horizons in one row', horizonsInOneRow, 'Invalid chart: series[1].row is "North", the row of series[0] too: a row holds one horizon'],
    ['a horizon on a log x axis', logHorizon, 'Invalid chart: series[0] is a horizon series on axes.x, a log axis, but needs a linear or time x axis'],
    ['horizon rows with different layers', twoHorizons, 'Invalid chart: series[1].layers is 2, but series[0].layers is 3'],
    ['horizon rows with given layers after the default', defaultThenTwoLayers, 'Invalid chart: series[1].layers is 2, but series[0] has 3 layers, the default: horizon rows share their colours'],
    ['horizon rows with the default layers after given ones', twoThenDefaultLayers, 'Invalid chart: series[1] has 3 layers, the default, but series[0].layers is 2: horizon rows share their colours'],
    ['a horizon colour axis with other classes than the default layers', horizonWith({ layers: undefined }, { type: 'linear', classes: 4 }), 'Invalid chart: colorAxis.classes must be 6, twice series[0]\'s 3 layers, the default, got 4'],
    ['a horizon colour axis with only a max', horizonWith({}, { type: 'linear', max: 10 }), 'Invalid chart: colorAxis.max needs min, at -max, on a horizon chart'],
    ['a horizon colour axis with only a min', horizonWith({}, { type: 'linear', min: -10 }), 'Invalid chart: colorAxis.min needs max, at -min, on a horizon chart'],
    ['a horizon on a sequential colour axis', horizonWith({}, { type: 'linear', scale: 'sequential' }), 'Invalid chart: colorAxis.scale must be quantize on a horizon chart'],
    ['a horizon colour axis that is not symmetric', horizonWith({}, { type: 'linear', min: 0, max: 30 }), 'Invalid chart: colorAxis.min must be -max on a horizon chart'],
    ['two values for one polar cell', windWith({ data: [['N', 'Day', 1], ['N', 'Day', 2]] }), 'Invalid chart: series[0].data[1] is a second value for the cell of series[0].data[0]'],
    ['a polygon heatmap with two spokes', windWith({ display: 'polygon' }, { type: 'band', categories: ['N', 'S'] }), 'Invalid chart: axes.angle.categories must have at least 3 categories for series[0], a polarHeatmap series, got 2'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});
