import { describe, expect, it } from 'vitest';
import { InvalidChartError, layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import { laying } from './support/layout.js';

const bands = { x: { type: 'band', categories: ['a', 'b'] }, y: { type: 'linear' } };
const longKey = 'k'.repeat(101);
const manyBars = Array.from({ length: 28 }, (_, i) => ({ type: 'bar', name: `s${i}`, data: [1, 2] }));
const oneTooMany = [...manyBars, { type: 'bar', name: 's28', data: [1, 2] }];
const ownColour = [...manyBars, { type: 'bar', name: 'own', color: '#000', data: [1, 2] }];
const bars = { width: 400, height: 300, axes: bands, series: [{ type: 'bar', name: 'A', data: [1, 2] }] };
// Core's message for a dash of one string, up to the string: 116 characters.
const DASH_MESSAGE = 'Invalid style: strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got ["';
const dashOf = (entry: string) => ({ ...bars, style: { strokeLineDash: [entry] } });
const xy = { x: { type: 'linear' }, y: { type: 'linear' } };
const pie = { width: 300, height: 200, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1 }] }] };
const spokes = { angle: { type: 'band', categories: ['a', 'b', 'c'] } };
const radar = { width: 300, height: 300, axes: spokes, series: [{ type: 'radar', name: 'R', data: [1, 2, 3] }] };
const gauge = { width: 300, height: 260, series: [{ type: 'gauge', name: 'G', value: 50 }] };
const rose = { width: 300, height: 300, axes: spokes, series: [{ type: 'rose', name: 'R', data: [1, 2, 3] }] };
const radialBars = {
  width: 300,
  height: 300,
  axes: { angle: { type: 'linear' }, radius: { type: 'band', categories: ['a', 'b'] } },
  series: [{ type: 'radialBar', name: 'B', data: [1, 2] }],
};
/** A style made in code whose stroke is a colour when first read, and a paint reference after. */
function shiftingStroke(): object {
  let reads = 0;
  return {
    get stroke(): string {
      reads += 1;
      return reads === 1 ? '#000' : 'url(#x)';
    },
  };
}
// A series made in code, whose name comes only from its prototype.
const inheritedName = { ...bars, series: [Object.assign(Object.create({ name: 'A' }), { type: 'bar', data: [1, 2] })] };
// JSON.parse makes "__proto__" an own key, where an object literal would set the prototype.
const protoKey = JSON.parse('{"width":400,"height":300,"axes":{"x":{"type":"band","categories":["a"]},"y":{"type":"linear"}},"series":[{"type":"bar","name":"A","data":[1],"__proto__":{"stack":"s"}}]}');
// A chart at every limit at once: 100 series, 1,000 categories and 100,000 data points, all null.
const names = (count: number, prefix: string) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const atEveryLimit = {
  width: 400,
  height: 300,
  legend: 'none',
  axes: { x: { type: 'band', categories: names(1000, 'c') }, y: { type: 'linear' } },
  series: names(100, 's').map((name) => ({ type: 'line', name, color: '#000', data: Array(1000).fill(null) })),
};
const oneSeriesTooMany = { ...atEveryLimit, series: [...atEveryLimit.series, { type: 'line', name: 'extra', color: '#000', data: [] }] };
const oneCategoryTooMany = { ...bars, axes: { x: { type: 'band', categories: names(1001, 'c') }, y: bands.y } };
const slices = (count: number) => names(count, 's').map((name) => ({ name, value: 1, color: '#000' }));
const fullPie = { ...pie, legend: 'none', series: [{ type: 'pie', name: 'P', style: { fillStyle: 'solid' }, data: slices(1000) }] };
const oneSliceTooMany = { ...fullPie, series: [{ type: 'pie', name: 'P', data: slices(1001) }] };
const onePointTooMany = { ...bars, axes: xy, series: [{ type: 'scatter', name: 'A', data: Array(50001).fill([1, 1]) }, { type: 'scatter', name: 'B', data: Array(50000).fill([1, 1]) }] };

describe('chart validation', () => {
  it.each<[string, unknown, string]>([
    ['a chart that is not an object', null, 'Invalid chart: expected an object, got null'],
    ['an unknown key', { ...bars, colour: 'red' }, 'Invalid chart: unknown key "colour"'],
    ['a missing width', { ...bars, width: undefined }, 'Invalid chart: width is missing'],
    ['a width of 0', { ...bars, width: 0 }, 'Invalid chart: width must be a number from 1 to 10000, got 0'],
    ['a width given as a string', { ...bars, width: '400' }, 'Invalid chart: width must be a number from 1 to 10000, got "400"'],
    ['a width given as an array', { ...bars, width: [400] }, 'Invalid chart: width must be a number from 1 to 10000, got [400]'],
    ['a width whose toString is not a function', JSON.parse('{"width":{"toString":1},"height":300,"series":[]}'), 'Invalid chart: width must be a number from 1 to 10000, got an object'],
    ['a title longer than 1000 characters', { ...bars, title: 'a'.repeat(1001) }, 'Invalid chart: title must be a string of at most 1000 characters, got a string of 1001 characters'],
    ['a NaN height', { ...bars, height: Number.NaN }, 'Invalid chart: height must be a number from 1 to 10000, got NaN'],
    ['a title with a line break', { ...bars, title: 'a\nb' }, 'Invalid chart: title is not valid: Text must be a single line'],
    ['a title that is not a string', { ...bars, title: 5 }, 'Invalid chart: title must be a string of at most 1000 characters, got 5'],
    ['a seed that is an object', { ...bars, seed: {} }, 'Invalid chart: seed must be a finite number or a string of at most 100 characters, got an object'],
    ['an infinite seed', { ...bars, seed: Infinity }, 'Invalid chart: seed must be a finite number or a string of at most 100 characters, got Infinity'],
    ['a seed longer than 100 characters', { ...bars, seed: 'x'.repeat(101) }, 'Invalid chart: seed must be a finite number or a string of at most 100 characters, got a string of 101 characters'],
    ['a font size of 0', { ...bars, fontSize: 0 }, 'Invalid chart: fontSize must be a number from 1 to 200, got 0'],
    ['a font in the spec, which only the caller may choose', { ...bars, font: { family: 'X' } }, 'Invalid chart: unknown key "font"'],
    ['an unknown legend position', { ...bars, legend: 'left' }, 'Invalid chart: legend must be one of top, bottom, right, none, got "left"'],
    ['a chart style core rejects', { ...bars, style: { roughness: 11 } }, 'Invalid chart: style is not valid: Invalid style: roughness must be a number from 0 to 10, got 11'],
    ['a style with a seed', { ...bars, style: { seed: 3 } }, 'Invalid chart: style.seed is not allowed: each mark gets its own seed from the chart seed'],
    ['no series', { ...bars, series: [] }, 'Invalid chart: series must have 1 to 100 entries, got 0'],
    ['series that are not an array', { ...bars, series: {} }, 'Invalid chart: series must be an array, got an object'],
    ['an unknown series type', { ...bars, series: [{ type: 'pyramid', name: 'A', data: [] }] }, 'Invalid chart: series[0].type must be a series type (bar, line, area, rangeArea, interval, xRange, distribution, relationship, market, histogram, xyLine, xyArea, scatter, bubble, timeline, pie, radar, rose, radialBar, polarLine, polarArea, polarScatter, heatmap, horizon, polarHeatmap, calendar, gauge), got "pyramid"'],
    ['an unknown series key', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2], colour: 'red' }] }, 'Invalid chart: series[0] has an unknown key, "colour"'],
    ['a key of another series type', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2], curve: 'step' }] }, 'Invalid chart: series[0] has an unknown key, "curve"'],
    ['a missing name', { ...bars, series: [{ type: 'bar', data: [1, 2] }] }, 'Invalid chart: series[0].name is missing'],
    ['a repeated name', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2] }, { type: 'line', name: 'A', data: [1, 2] }] }, 'Invalid chart: series[1].name repeats "A"'],
    ['a value given as a string', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, '2'] }] }, 'Invalid chart: series[0].data[1] must be a number from -1e15 to 1e15 or null, got "2"'],
    ['a value past 1e15', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2e15] }] }, 'Invalid chart: series[0].data[1] must be a number from -1e15 to 1e15 or null, got 2000000000000000'],
    ['a hole in the data', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, , 2] }] }, 'Invalid chart: series[0].data[1] must be a number from -1e15 to 1e15 or null, got undefined'],
    ['data one value short', { ...bars, series: [{ type: 'bar', name: 'A', data: [1] }] }, 'Invalid chart: series[0].data has 1 values, but axes.x.categories has 2'],
    ['too many data points in all', { ...bars, axes: xy, series: [{ type: 'scatter', name: 'A', data: Array(60000).fill([1, 1]) }, { type: 'scatter', name: 'B', data: Array(60000).fill([1, 1]) }] }, 'Invalid chart: series hold at least 120000 data points in all, more than 100000'],
    ['an unknown curve', { ...bars, series: [{ type: 'line', name: 'A', data: [1, 2], curve: 'spline' }] }, 'Invalid chart: series[0].curve must be one of linear, monotone, step, step-before, step-after, got "spline"'],
    ['a dash core rejects', { ...bars, series: [{ type: 'line', name: 'A', data: [1, 2], dash: [0] }] }, 'Invalid chart: series[0].dash is not valid: Invalid style: strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [0]'],
    ['a series style core rejects', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2], style: { fillStyle: 'crayon' } }] }, 'Invalid chart: series[0].style is not valid: Unknown fill style: "crayon"'],
    ['an unknown value axis', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2], axis: 'y3' }] }, 'Invalid chart: series[0].axis must be one of y, y2, got "y3"'],
    ['y2 that the chart lacks', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2], axis: 'y2' }] }, 'Invalid chart: series[0].axis is y2, but the chart has no axes.y2'],
    ['a negative value in a stacked area', { ...bars, series: [{ type: 'area', name: 'A', stack: 's', data: [1, -2] }] }, 'Invalid chart: series[0].data[1] is negative, -2, which a stacked area cannot show'],
    ['a range whose high is below its low', { ...bars, series: [{ type: 'rangeArea', name: 'A', data: [[1, 2], [3, 1]] }] }, 'Invalid chart: series[0].data[1] has its high value below its low value, [3, 1]'],
    ['a range that is not a pair', { ...bars, series: [{ type: 'rangeArea', name: 'A', data: [[1, 2], 3] }] }, 'Invalid chart: series[0].data[1] must be a [low, high] array, got 3'],
    ['a scatter point that is not a pair', { ...bars, axes: xy, series: [{ type: 'scatter', name: 'A', data: [[1, 2, 3]] }] }, 'Invalid chart: series[0].data[0] must be a [x, y] array, got [1, 2, 3]'],
    ['a negative bubble size', { ...bars, axes: xy, series: [{ type: 'bubble', name: 'A', data: [[1, 2, -3]] }] }, 'Invalid chart: series[0].data[0] has a negative size, -3'],
    ['two band axes', { ...bars, axes: { x: bands.x, y: { type: 'band', categories: ['c'] } } }, 'Invalid chart: axes has two band axes, which only heatmap series can share, but series[0] is a bar series'],
    ['an unknown axis type', { ...bars, axes: { x: bands.x, y: { type: 'pow' } } }, 'Invalid chart: axes.y.type must be "band", "linear", "time", "log" or "sqrt", got "pow"'],
    ['a log axis on a polar chart', { ...radar, axes: { ...spokes, radius: { type: 'log' } } }, 'Invalid chart: axes.radius.type must be "band" or "linear", got "log"'],
    ['a missing y axis', { ...bars, axes: { x: bands.x } }, 'Invalid chart: axes.y is missing'],
    ['a repeated category', { ...bars, axes: { x: { type: 'band', categories: ['a', 'a'] }, y: bands.y } }, 'Invalid chart: axes.x.categories[1] repeats "a"'],
    ['no categories', { ...bars, axes: { x: { type: 'band', categories: [] }, y: bands.y } }, 'Invalid chart: axes.x.categories must have 1 to 1000 entries, got 0'],
    ['a category with a line break', { ...bars, axes: { x: { type: 'band', categories: ['a', 'b\nc'] }, y: bands.y } }, 'Invalid chart: axes.x.categories[1] is not valid: Text must be a single line'],
    ['an axis max not above its min', { ...bars, axes: { x: bands.x, y: { type: 'linear', min: 5, max: 5 } } }, 'Invalid chart: axes.y.max must be greater than min (5), got 5'],
    ['data above a fixed max', { ...bars, axes: { x: bands.x, y: { type: 'linear', max: 1.5 } } }, 'Invalid chart: axes.y.max is 1.5, but the data reach 2'],
    ['data below a fixed min', { ...bars, axes: { x: bands.x, y: { type: 'linear', min: 1 } } }, 'Invalid chart: axes.y.min is 1, but the data reach 0'],
    ['fractional decimals', { ...bars, axes: { x: bands.x, y: { type: 'linear', format: { decimals: 1.5 } } } }, 'Invalid chart: axes.y.format.decimals must be an integer from 0 to 20, got 1.5'],
    ['a long separator', { ...bars, axes: { x: bands.x, y: { type: 'linear', format: { thousandsSeparator: '           ' } } } }, 'Invalid chart: axes.y.format.thousandsSeparator must be a string of at most 10 characters, got "           "'],
    ['y2 on a horizontal chart', { ...bars, axes: { x: { type: 'linear' }, y: { type: 'band', categories: ['a', 'b'] }, y2: { type: 'linear' } } }, 'Invalid chart: axes.y2 needs x to be the band axis'],
    ['a percent axis with no band axis', { ...bars, axes: { x: { type: 'linear' }, y: { type: 'linear', percent: true } }, series: [{ type: 'scatter', name: 'A', data: [[1, 2]] }] }, 'Invalid chart: axes.y.percent needs a band axis: only stacking series (bar, area) use it'],
    ['a line on a percent axis', { ...bars, axes: { x: bands.x, y: { type: 'linear', percent: true } }, series: [{ type: 'line', name: 'A', data: [1, 2] }] }, 'Invalid chart: series[0] is a line series on axes.y, a percent axis, which only stacking series (bar, area) can use'],
    ['a scatter series on a band axis', { ...bars, series: [{ type: 'scatter', name: 'A', data: [[1, 2]] }] }, 'Invalid chart: series[0] is a scatter series, which needs both axes continuous: linear, time, log or sqrt'],
    ['a bar series with two linear axes', { ...bars, axes: xy }, 'Invalid chart: series[0] is a bar series, which needs one band axis'],
    ['an interval series with two linear axes', { ...bars, axes: xy, series: [{ type: 'interval', name: 'I', data: [[1, 2]] }] }, 'Invalid chart: series[0] is an interval series, which needs one band axis'],
    ['a distribution series on a band axis', { ...bars, series: [{ type: 'distribution', display: 'box', name: 'D', data: [1, 2] }] }, 'Invalid chart: series[0] is a distribution series, which needs linear x and y axes'],
    ['an xyLine series on a band axis', { ...bars, series: [{ type: 'xyLine', name: 'L', data: [[1, 2]] }] }, 'Invalid chart: series[0] is an xyLine series, which needs both axes continuous: linear, time, log or sqrt'],
    ['a pie series with axes', { ...pie, axes: bands }, 'Invalid chart: axes must be left out: a pie chart has no axes'],
    ['a bar series with no axes', { ...bars, axes: undefined }, 'Invalid chart: axes is missing'],
    ['a radar series with x and y axes', { ...radar, axes: bands }, 'Invalid chart: axes has an unknown key, "x"'],
    ['cartesian and polar axes mixed', { ...radar, axes: { ...spokes, y: { type: 'linear' } } }, 'Invalid chart: axes has an unknown key, "y"'],
    ['eleven rings', { ...pie, series: Array.from({ length: 11 }, (_, i) => ({ type: 'pie', name: `P${i}`, data: [{ name: 'a', value: 1 }] })) }, 'Invalid chart: series of a pie chart must be 1 to 10 pie series, got 11'],
    ['rings with different sweeps', { ...pie, series: [...pie.series, { type: 'pie', name: 'Q', endAngle: 180, data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[1].endAngle is 180, but series[0] has the default, 360: nested rings share their sweep'],
    ['a ring with the default sweep after one that sets it', { ...pie, series: [{ ...pie.series[0], startAngle: 90 }, { type: 'pie', name: 'Q', data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[1] has the default startAngle, 0, but series[0].startAngle is 90: nested rings share their sweep'],
    ['a ring that ends inside its hole', { ...pie, series: [{ ...pie.series[0], innerRadius: 0.5, outerRadius: 0.4 }] }, 'Invalid chart: series[0].outerRadius must be greater than innerRadius (0.5), got 0.4'],
    ['a ring that ends inside its default hole', { ...pie, series: [{ ...pie.series[0], outerRadius: 0.4 }, { type: 'pie', name: 'Q', data: [{ name: 'a', value: 1 }] }] }, "Invalid chart: series[0].outerRadius must be greater than the ring's default innerRadius (0.5), got 0.4"],
    ['a name coloured differently in two rings', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, color: '#000' }] }, { type: 'pie', name: 'Q', data: [{ name: 'a', value: 1, color: '#fff' }] }] }, 'Invalid chart: series[1].data[0].color is "#fff", but series[0].data[0].color, of the same name, gives "#000"'],
    ['a radius on some slices only', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, radius: 2 }, { name: 'b', value: 1 }] }] }, 'Invalid chart: series[0].data[1].radius is missing: every slice has a radius, or none does'],
    ['no radius above 0', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, radius: 0 }] }] }, 'Invalid chart: series[0].data has no slice with both a value and a radius above 0, so there is nothing to draw'],
    ['a radius only on a slice of no value', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 5, radius: 0 }, { name: 'b', value: 0, radius: 3 }] }] }, 'Invalid chart: series[0].data has no slice with both a value and a radius above 0, so there is nothing to draw'],
    ['a slice pulled out too far', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, offset: 0.6 }] }] }, 'Invalid chart: series[0].data[0].offset must be a number from 0 to 0.5, got 0.6'],
    ['too much space between slices', { ...pie, series: [{ ...pie.series[0], padAngle: 11 }] }, 'Invalid chart: series[0].padAngle must be a number from 0 to 10, got 11'],
    ['a negative corner radius', { ...pie, series: [{ ...pie.series[0], cornerRadius: -1 }] }, 'Invalid chart: series[0].cornerRadius must be a number from 0 to 1000, got -1'],
    ['a pie with nothing above 0', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 0 }] }] }, 'Invalid chart: series[0].data has no value above 0, so there is nothing to draw'],
    ['a negative slice', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: -1 }] }] }, 'Invalid chart: series[0].data[0].value must be a number from 0 to 1e15, got -1'],
    ['a repeated slice name', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1 }, { name: 'a', value: 2 }] }] }, 'Invalid chart: series[0].data[1].name repeats "a"'],
    ['a hole past 0.95', { ...pie, series: [{ type: 'pie', name: 'P', innerRadius: 1, data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[0].innerRadius must be a number from 0 to 0.95, got 1'],
    ['an end angle not past the start', { ...pie, series: [{ type: 'pie', name: 'P', startAngle: 90, endAngle: 90, data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[0].endAngle must be greater than startAngle (90) and at most 360 past it, got 90'],
    ['a sweep of more than a turn', { ...pie, series: [{ type: 'pie', name: 'P', startAngle: -90, endAngle: 300, data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[0].endAngle must be greater than startAngle (-90) and at most 360 past it, got 300'],
    ['a start angle more than a turn before the default end', { ...pie, series: [{ type: 'pie', name: 'P', startAngle: -90, data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[0].startAngle must be less than the default endAngle (360) and at most 360 before it, got -90'],
    ['an end angle before the default start', { ...pie, series: [{ type: 'pie', name: 'P', endAngle: -10, data: [{ name: 'a', value: 1 }] }] }, 'Invalid chart: series[0].endAngle must be greater than the default startAngle (0) and at most 360 past it, got -10'],
    ['a dial started past its default end', { ...gauge, axes: { angle: { type: 'linear', startAngle: 150 } } }, 'Invalid chart: axes.angle.startAngle must be less than the default endAngle (120) and at most 360 before it, got 150'],
    ['a radar with two spokes', { ...radar, axes: { angle: { type: 'band', categories: ['a', 'b'] } }, series: [{ type: 'radar', name: 'R', data: [1, 2] }] }, 'Invalid chart: axes.angle.categories must have at least 3 categories for series[0], a radar series, got 2'],
    ['a negative radar value', { ...radar, series: [{ type: 'radar', name: 'R', data: [1, -2, 3] }] }, 'Invalid chart: series[0].data[1] must be a number from 0 to 1e15, got -2'],
    ['a radar axis title', { ...radar, axes: { angle: { ...spokes.angle, title: 'T' } } }, 'Invalid chart: axes.angle has an unknown key, "title"'],
    ['a colour longer than 100 characters', { ...bars, series: [{ type: 'bar', name: 'A', color: 'a'.repeat(101), data: [1, 2] }] }, 'Invalid chart: series[0].color must be a string of at most 100 characters, got a string of 101 characters'],
    ['a slice colour longer than 100 characters', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, color: 'a'.repeat(101) }] }] }, 'Invalid chart: series[0].data[0].color must be a string of at most 100 characters, got a string of 101 characters'],
    ['a style stroke longer than 100 characters', { ...bars, style: { stroke: 'a'.repeat(101) } }, 'Invalid chart: style.stroke must be a string of at most 100 characters, got a string of 101 characters'],
    ['a series style fill longer than 100 characters', { ...bars, series: [{ type: 'bar', name: 'A', style: { fill: 'a'.repeat(101) }, data: [1, 2] }] }, 'Invalid chart: series[0].style.fill must be a string of at most 100 characters, got a string of 101 characters'],
    ['an axis on a scatter series', { ...bars, axes: xy, series: [{ type: 'scatter', name: 'A', axis: 'y', data: [[1, 2]] }] }, 'Invalid chart: series[0] has an unknown key, "axis"'],
    ['a radar series beside a bar series', { ...bars, series: [{ type: 'bar', name: 'A', data: [1, 2] }, { type: 'radar', name: 'R', data: [1, 2, 3] }] }, 'Invalid chart: series[1] is a radar series, which cannot share a chart with series[0], a bar series'],
    ['a percent radius', { ...radar, axes: { ...spokes, radius: { type: 'linear', percent: true } } }, 'Invalid chart: axes.radius has an unknown key, "percent"'],
    ['an own "__proto__" key, as JSON.parse makes it', protoKey, 'Invalid chart: series[0] has an unknown key, "__proto__"'],
    ['a name the series only inherits', inheritedName, 'Invalid chart: series[0].name is missing'],
    ['an unknown key longer than 100 characters', { ...bars, [longKey]: 1 }, 'Invalid chart: unknown key a string of 101 characters'],
    ['a style key with a line break', { ...bars, style: { 'a\nb': 1 } }, 'Invalid chart: style is not valid: Unknown option: "a\\nb"'],
    ['a style value core repeats at length', dashOf('a'.repeat(100)), `Invalid chart: style is not valid: ${DASH_MESSAGE}${'a'.repeat(84)}…`],
    ['a paint reference as a colour', { ...bars, series: [{ type: 'bar', name: 'A', color: 'url(#x)', data: [1, 2] }] }, 'Invalid chart: series[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "url(#x)"'],
    ['a style value cut inside a surrogate pair', dashOf(`${'a'.repeat(83)}\u{1F600}${'a'.repeat(10)}`), `Invalid chart: style is not valid: ${DASH_MESSAGE}${'a'.repeat(83)}…`],
    ['a paint reference as a slice colour', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, color: 'url(#x)' }] }] }, 'Invalid chart: series[0].data[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "url(#x)"'],
    ['a paint reference as a series style stroke', { ...bars, series: [{ type: 'bar', name: 'A', style: { stroke: 'url(#x)' }, data: [1, 2] }] }, 'Invalid chart: series[0].style.stroke must be a colour (a hex code, a name, rgb() or hsl()), got "url(#x)"'],
    ['a paint reference as a style fill', { ...bars, style: { fill: 'url(https://example.com/p.svg#x)' } }, 'Invalid chart: style.fill must be a colour (a hex code, a name, rgb() or hsl()), got "url(https://example.com/p.svg#x)"'],
    ['areas of one stack with different curves', { ...bars, series: [{ type: 'area', name: 'A', stack: 's', data: [1, 2] }, { type: 'area', name: 'B', stack: 's', curve: 'monotone', data: [1, 2] }] }, 'Invalid chart: series[1].curve is monotone, but series[0], in the same stack, has the default, linear'],
    ['an area with the default curve in a stack that sets one', { ...bars, series: [{ type: 'area', name: 'A', stack: 's', curve: 'monotone', data: [1, 2] }, { type: 'area', name: 'B', stack: 's', data: [1, 2] }] }, 'Invalid chart: series[1] has the default curve, linear, but series[0], in the same stack, is monotone'],
    ['areas of one stack with different given curves', { ...bars, series: [{ type: 'area', name: 'A', stack: 's', curve: 'step', data: [1, 2] }, { type: 'area', name: 'B', stack: 's', curve: 'monotone', data: [1, 2] }] }, 'Invalid chart: series[1].curve is monotone, but series[0], in the same stack, is step'],
    ['101 series', oneSeriesTooMany, 'Invalid chart: series must have 1 to 100 entries, got 101'],
    ['1001 categories', oneCategoryTooMany, 'Invalid chart: axes.x.categories must have 1 to 1000 entries, got 1001'],
    ['1001 slices', oneSliceTooMany, 'Invalid chart: series[0].data must have 1 to 1000 entries, got 1001'],
    ['100,001 data points in all', onePointTooMany, 'Invalid chart: series hold at least 100001 data points in all, more than 100000'],
    ['a stacked area value just below 0', { ...bars, series: [{ type: 'area', name: 'A', stack: 's', data: [1, -0.5] }] }, 'Invalid chart: series[0].data[1] is negative, -0.5, which a stacked area cannot show'],
    ['the series type "constructor"', { ...bars, series: [{ type: 'constructor', name: 'A', data: [1, 2] }] }, 'Invalid chart: series[0].type must be a series type (bar, line, area, rangeArea, interval, xRange, distribution, relationship, market, histogram, xyLine, xyArea, scatter, bubble, timeline, pie, radar, rose, radialBar, polarLine, polarArea, polarScatter, heatmap, horizon, polarHeatmap, calendar, gauge), got "constructor"'],
    ['the series type "toString"', { ...bars, series: [{ type: 'toString', name: 'A', data: [1, 2] }] }, 'Invalid chart: series[0].type must be a series type (bar, line, area, rangeArea, interval, xRange, distribution, relationship, market, histogram, xyLine, xyArea, scatter, bubble, timeline, pie, radar, rose, radialBar, polarLine, polarArea, polarScatter, heatmap, horizon, polarHeatmap, calendar, gauge), got "toString"'],
    ['a series given as an array', { ...bars, series: [[1, 2]] }, 'Invalid chart: series[0] must be an object, got [1, 2]'],
    ['a style given as an array', { ...bars, style: [] }, 'Invalid chart: style must be an object, got []'],
    ['axes given as an array', { ...bars, axes: [] }, 'Invalid chart: axes must be an object, got []'],
    ['a rejected string of exactly 100 characters, which is repeated', { ...bars, legend: 'l'.repeat(100) }, `Invalid chart: legend must be one of top, bottom, right, none, got "${'l'.repeat(100)}"`],
    ['a rejected string of 101 characters, which is described', { ...bars, legend: 'l'.repeat(101) }, 'Invalid chart: legend must be one of top, bottom, right, none, got a string of 101 characters'],
    ['an unknown key with a line separator', { ...bars, 'a\u2028b': 1 }, 'Invalid chart: unknown key "a\\u2028b"'],
    ['a series name longer than 100 characters', { ...bars, series: [{ type: 'bar', name: 'n'.repeat(101), data: [1, 2] }] }, 'Invalid chart: series[0].name must be a string of at most 100 characters, got a string of 101 characters'],
    ['a category longer than 100 characters', { ...bars, axes: { x: { type: 'band', categories: ['a', 'c'.repeat(101)] }, y: bands.y } }, 'Invalid chart: axes.x.categories[1] must be a string of at most 100 characters, got a string of 101 characters'],
    ['a slice name longer than 100 characters', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 's'.repeat(101), value: 1 }] }] }, 'Invalid chart: series[0].data[0].name must be a string of at most 100 characters, got a string of 101 characters'],
    ['an unknown key with a bidirectional override', { ...bars, 'a\u202eb': 1 }, 'Invalid chart: unknown key "a\\u202eb"'],
    ['an unknown key with a bidirectional isolate', { ...bars, 'a\u2066b': 1 }, 'Invalid chart: unknown key "a\\u2066b"'],
    ['an unknown key with a left-to-right mark', { ...bars, 'a\u200eb': 1 }, 'Invalid chart: unknown key "a\\u200eb"'],
    ['a legend position with a C1 control', { ...bars, legend: 'a\u0085b' }, 'Invalid chart: legend must be one of top, bottom, right, none, got "a\\u0085b"'],
    ['a repeated category with a bidirectional override', { ...bars, axes: { x: { type: 'band', categories: ['Q\u202e', 'Q\u202e'] }, y: bands.y } }, 'Invalid chart: axes.x.categories[1] repeats "Q\\u202e"'],
    ['a colour with text after a paint reference', { ...bars, series: [{ type: 'bar', name: 'A', color: 'url(#x) red', data: [1, 2] }] }, 'Invalid chart: series[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "url(#x) red"'],
    ['a hex colour of 5 digits', { ...bars, series: [{ type: 'bar', name: 'A', color: '#12345', data: [1, 2] }] }, 'Invalid chart: series[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "#12345"'],
    ['rgb() of something other than numbers', { ...bars, series: [{ type: 'bar', name: 'A', color: 'rgb(red)', data: [1, 2] }] }, 'Invalid chart: series[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "rgb(red)"'],
    ['a radar with more values than spokes', { ...radar, series: [{ type: 'radar', name: 'R', data: [1, 2, 3, 4] }] }, 'Invalid chart: series[0].data has 4 values, but axes.angle.categories has 3'],
    ['a radar with fewer values than spokes', { ...radar, series: [{ type: 'radar', name: 'R', data: [1, 2] }] }, 'Invalid chart: series[0].data has 2 values, but axes.angle.categories has 3'],
    ['a line on a percent y2', { ...bars, axes: { ...bands, y2: { type: 'linear', percent: true } }, series: [{ type: 'bar', name: 'A', data: [1, 2] }, { type: 'line', name: 'B', axis: 'y2', data: [1, 2] }] }, 'Invalid chart: series[1] is a line series on axes.y2, a percent axis, which only stacking series (bar, area) can use'],
    ['a gauge value beyond the dial', { ...gauge, series: [{ type: 'gauge', name: 'G', value: 120 }] }, 'Invalid chart: series[0].value is 120, beyond the default dial, 0 to 100; set axes.angle for another'],
    ['a gauge band that ends where it starts', { ...gauge, axes: { angle: { type: 'linear', bands: [{ from: 5, to: 5, color: '#000' }] } } }, 'Invalid chart: axes.angle.bands[0].to must be greater than from (5), got 5'],
    ['gauge bands that overlap', { ...gauge, axes: { angle: { type: 'linear', bands: [{ from: 0, to: 50, color: '#000' }, { from: 40, to: 60, color: '#fff' }] } } }, 'Invalid chart: axes.angle.bands[1].from is 40, before the end of axes.angle.bands[0] (50)'],
    ['a gauge band with a paint reference', { ...gauge, axes: { angle: { type: 'linear', bands: [{ from: 0, to: 50, color: 'url(#x)' }] } } }, 'Invalid chart: axes.angle.bands[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "url(#x)"'],
    ['a gauge display that does not exist', { ...gauge, series: [{ type: 'gauge', name: 'G', value: 1, display: 'dial' }] }, 'Invalid chart: series[0].display must be one of needle, bar, got "dial"'],
    ['a needle longer than the radius', { ...gauge, series: [{ type: 'gauge', name: 'G', value: 1, needleLength: 1.5 }] }, 'Invalid chart: series[0].needleLength must be a number from 0.1 to 1, got 1.5'],
    ['a gauge with gridlines', { ...gauge, axes: { angle: { type: 'linear', grid: true } } }, 'Invalid chart: axes.angle has an unknown key, "grid"'],
    ['a gauge beside a rose', { ...gauge, series: [...gauge.series, { type: 'rose', name: 'R', data: [1] }] }, 'Invalid chart: series[1] is a rose series, which cannot share a chart with series[0], a gauge series'],
    ['labels rotated beyond upright', { ...bars, axes: { ...bands, x: { ...bands.x, labelAngle: 91 } } }, 'Invalid chart: axes.x.labelAngle must be a number from -90 to 90, got 91'],
    ['rotated labels on a polar axis', { ...radar, axes: { angle: { ...spokes.angle, labelAngle: 45 } } }, 'Invalid chart: axes.angle has an unknown key, "labelAngle"'],
    ['polygon gridlines through two spokes of a rose', { ...rose, axes: { angle: { type: 'band', categories: ['a', 'b'] }, radius: { type: 'linear', shape: 'polygon' } }, series: [{ type: 'rose', name: 'R', data: [1, 2] }] }, 'Invalid chart: axes.angle.categories must have at least 3 categories for the polygon gridlines of axes.radius, got 2'],
    ['a radar on two spokes with circle gridlines', { ...radar, axes: { angle: { type: 'band', categories: ['a', 'b'] }, radius: { type: 'linear', shape: 'circle' } }, series: [{ type: 'radar', name: 'R', data: [1, 2] }] }, 'Invalid chart: axes.angle.categories must have at least 3 categories for series[0], a radar series, got 2'],
    ['a radar beside a polar line on one spoke', { ...radar, axes: { angle: { type: 'band', categories: ['a'] } }, series: [{ type: 'polarLine', name: 'L', data: [1] }, { type: 'radar', name: 'R', data: [1] }] }, 'Invalid chart: axes.angle.categories must have at least 3 categories for series[1], a radar series, got 1'],
    ['a gauge value beyond a dial it was given', { ...gauge, axes: { angle: { type: 'linear', max: 100 } }, series: [{ type: 'gauge', name: 'G', value: 120 }] }, 'Invalid chart: axes.angle.max is 100, but the data reach 120'],
    ['a third ring giving a named slice another colour', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1, color: '#000' }] }, { type: 'pie', name: 'Q', data: [{ name: 'a', value: 1 }] }, { type: 'pie', name: 'R', data: [{ name: 'a', value: 1, color: '#fff' }] }] }, 'Invalid chart: series[2].data[0].color is "#fff", but series[0].data[0].color, of the same name, gives "#000"'],
    ['an inner ring whose hole passes its default outer edge', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 1 }] }, { type: 'pie', name: 'Q', innerRadius: 0.6, data: [{ name: 'a', value: 1 }] }] }, "Invalid chart: series[1].innerRadius must be less than the ring's default outerRadius (0.5), got 0.6"],
    ['a radar mixing values and pairs', { ...radar, series: [{ type: 'radar', name: 'R', data: [[1, 2], 3, [1, 4]] }] }, 'Invalid chart: series[0].data[1] is 3: every value is a [low, high] pair, or none is'],
    ['a range radar with a negative low', { ...radar, series: [{ type: 'radar', name: 'R', data: [[-1, 2], [0, 3], [1, 4]] }] }, 'Invalid chart: series[0].data[0] has a negative low value, -1'],
    ['a range radar with its high below its low', { ...radar, series: [{ type: 'radar', name: 'R', data: [[3, 2], [0, 3], [1, 4]] }] }, 'Invalid chart: series[0].data[0] has its high value below its low value, [3, 2]'],
    ['a radar on a linear angle axis', { ...radar, axes: { angle: { type: 'linear' } } }, 'Invalid chart: series[0] is a radar series, which needs a band angle axis, but axes.angle is linear'],
    ['a band y2', { ...bars, axes: { ...bands, y2: { type: 'band' } } }, 'Invalid chart: axes.y2.type must be "linear", "log" or "sqrt", got "band"'],
    ['a radar on a band radius', { ...radar, axes: { ...spokes, radius: { type: 'band', categories: ['x'] } } }, 'Invalid chart: series[0] is a radar series, which needs a linear radius axis, but axes.radius is band'],
    ['a radial bar chart without its band radius axis', { ...radialBars, axes: { angle: { type: 'linear' } } }, 'Invalid chart: series[0] is a radialBar series, which needs a band radius axis, but axes.radius is left out, which makes it linear'],
    ['a rose with a negative value', { ...rose, series: [{ type: 'rose', name: 'R', data: [1, -1, 2] }] }, 'Invalid chart: series[0].data[1] is negative, -1, which a rose series cannot show'],
    ['a stacked polar area with a negative value', { ...rose, axes: { ...spokes, radius: { type: 'linear', min: -5 } }, series: [{ type: 'polarArea', name: 'A', stack: 's', data: [1, -1, 2] }] }, 'Invalid chart: series[0].data[1] is negative, -1, which a stacked polarArea series cannot show'],
    ['a polar line below a radius that starts at 0', { ...rose, series: [{ type: 'polarLine', name: 'L', data: [1, -1, 2] }] }, 'Invalid chart: series[0].data[1] is negative, -1, but axes.radius starts at 0 unless its min is set'],
    ['a polar point below a radius that starts at 0', { ...radialBars, axes: { angle: { type: 'linear' }, radius: { type: 'linear' } }, series: [{ type: 'polarScatter', name: 'S', data: [[10, -3], [20, 5]] }] }, 'Invalid chart: series[0].data[0][1] is negative, -3, but axes.radius starts at 0 unless its min is set'],
    ['a curve on a polar line', { ...rose, series: [{ type: 'polarLine', name: 'L', curve: 'monotone', data: [1, 2, 3] }] }, 'Invalid chart: series[0] has an unknown key, "curve"'],
    ['a second value axis on a rose', { ...rose, series: [{ type: 'rose', name: 'R', axis: 'y2', data: [1, 2, 3] }] }, 'Invalid chart: series[0] has an unknown key, "axis"'],
    ['a time on a polar point', { ...radialBars, axes: { angle: { type: 'linear' }, radius: { type: 'linear' } }, series: [{ type: 'polarScatter', name: 'S', data: [['2026-01-01', 1]] }] }, 'Invalid chart: series[0].data[0][0] must be a number from -1e15 to 1e15, got "2026-01-01"'],
    ['a polar radius written as text', { ...radialBars, axes: { angle: { type: 'linear' }, radius: { type: 'linear' } }, series: [{ type: 'polarScatter', name: 'S', data: [[10, '-3']] }] }, 'Invalid chart: series[0].data[0][1] must be a number from -1e15 to 1e15, got "-3"'],
    ['a polar scatter on a band angle axis', { ...rose, series: [{ type: 'polarScatter', name: 'S', data: [[1, 2]] }] }, 'Invalid chart: series[0] is a polarScatter series, which needs a linear angle axis, but axes.angle is band'],
    ['a radial bar with values for the wrong number of rings', { ...radialBars, series: [{ type: 'radialBar', name: 'B', data: [1] }] }, 'Invalid chart: series[0].data has 1 values, but axes.radius.categories has 2'],
    ['a rose beside a bar series', { ...rose, series: [rose.series[0], { type: 'bar', name: 'B', data: [1, 2, 3] }] }, 'Invalid chart: series[1] is a bar series, which cannot share a chart with series[0], a rose series'],
    ['polygon gridlines on a linear angle axis', { ...radialBars, axes: { angle: { type: 'linear' }, radius: { type: 'linear', shape: 'polygon' } }, series: [{ type: 'polarScatter', name: 'S', data: [[1, 2]] }] }, 'Invalid chart: axes.radius.shape is polygon, which needs a band angle axis for its corners'],
    ['a shape on a band radius', { ...radialBars, axes: { ...radialBars.axes, radius: { ...radialBars.axes.radius, shape: 'circle' } } }, 'Invalid chart: axes.radius.shape is only for a linear radius axis'],
    ['a hole of the whole radius', { ...rose, axes: { ...spokes, radius: { type: 'linear', innerRadius: 1 } } }, 'Invalid chart: axes.radius.innerRadius must be a number from 0 to 0.95, got 1'],
    ['an angle axis that ends where it starts', { ...rose, axes: { angle: { ...spokes.angle, startAngle: 90, endAngle: 90 } } }, 'Invalid chart: axes.angle.endAngle must be greater than startAngle (90) and at most 360 past it, got 90'],
    ['an angle axis of more than a turn', { ...rose, axes: { angle: { ...spokes.angle, startAngle: 0, endAngle: 361 } } }, 'Invalid chart: axes.angle.endAngle must be greater than startAngle (0) and at most 360 past it, got 361'],
    ['an angle axis started more than a turn before its default end', { ...rose, axes: { angle: { ...spokes.angle, startAngle: -90 } } }, 'Invalid chart: axes.angle.startAngle must be less than the default endAngle (360) and at most 360 before it, got -90'],
    ['a dash pattern shorter than one unit', { ...bars, series: [{ type: 'line', name: 'A', dash: [0.005, 0], data: [1, 2] }] }, 'Invalid chart: series[0].dash is not valid: Invalid style: strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [0.005, 0]'],
    ['a stroke width past 100', { ...bars, style: { strokeWidth: 1e300 } }, 'Invalid chart: style.strokeWidth must be a number from 0 to 100, got 1e+300'],
    ['a fill weight past 100', { ...bars, series: [{ type: 'bar', name: 'A', style: { fillWeight: 101 }, data: [1, 2] }] }, 'Invalid chart: series[0].style.fillWeight must be a number from 0 to 100, got 101'],
    ['an unknown key with separators, marks and embeddings', { ...bars, 'a\u2029\u200f\u061c\u202a\u202b\u202c\u202db': 1 }, 'Invalid chart: unknown key "a\\u2029\\u200f\\u061c\\u202a\\u202b\\u202c\\u202db"'],
    ['a paint reference to a file', { ...bars, series: [{ type: 'bar', name: 'A', color: 'url(1)', data: [1, 2] }] }, 'Invalid chart: series[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "url(1)"'],
    ['a no-break space in rgb()', { ...bars, series: [{ type: 'bar', name: 'A', color: 'rgb(1,\u00a02,3)', data: [1, 2] }] }, 'Invalid chart: series[0].color must be a colour (a hex code, a name, rgb() or hsl()), got "rgb(1,\u00a02,3)"'],
    ['more series than the palette has pairs', { ...bars, series: oneTooMany }, 'Invalid chart: series[28] needs a color: the 28 colour and hatching pairs of the palette are used up'],
    ['a plot with no room left', { ...bars, width: 20, height: 20 }, 'Invalid chart: a 20 × 20 chart leaves no room for the plot after its title, legend and labels'],
    ['a plot with no room left on a chart read from eleven', { ...bars, width: 11, height: 20 }, 'Invalid chart: an 11 × 20 chart leaves no room for the plot after its title, legend and labels'],
    ['a plot with no room left on a chart read from eighteen', { ...bars, width: 18, height: 20 }, 'Invalid chart: an 18 × 20 chart leaves no room for the plot after its title, legend and labels'],
    ['a plot with no room left on a chart read from one hundred and eighteen', { ...bars, width: 118, height: 20 }, 'Invalid chart: a 118 × 20 chart leaves no room for the plot after its title, legend and labels'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });

  it.each<[string, unknown]>([
    ['the smallest spec', bars],
    ['undefined as not set', { ...bars, title: undefined, legend: undefined, style: { stroke: undefined } }],
    ['a value of exactly 1e15', { ...bars, series: [{ type: 'bar', name: 'A', data: [1e15, -1e15] }] }],
    ['null values', { ...bars, series: [{ type: 'line', name: 'A', data: [null, null] }] }],
    ['28 series without colours', { ...bars, series: manyBars }],
    ['a 29th series with its own colour', { ...bars, series: ownColour }],
    ['a pie with zero slices beside a positive one', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 'a', value: 0 }, { name: 'b', value: 3 }] }] }],
    ['a full turn from -360', { ...pie, series: [{ type: 'pie', name: 'P', startAngle: -360, endAngle: 0, data: [{ name: 'a', value: 1 }] }] }],
    ['a radar starting at a fixed min', { ...radar, axes: { ...spokes, radius: { type: 'linear', min: 1 } } }],
    ['a cartesian axis set to undefined on a radar', { ...radar, axes: { ...spokes, y: undefined } }],
    ['a style seed set to undefined', { ...bars, style: { seed: undefined } }],
    ['a colour of exactly 100 characters', { ...bars, series: [{ type: 'bar', name: 'A', color: 'a'.repeat(100), data: [1, 2] }] }],
    ['colours as hex codes, names, rgb() and hsl()', { ...bars, style: { stroke: 'currentColor', fill: '#abcd' }, series: [{ type: 'bar', name: 'A', color: 'rgba(0, 0, 0, 0.5)', data: [1, 2] }, { type: 'bar', name: 'B', color: 'hsl(120 50% 50% / 0.3)', data: [1, 2] }] }],
    ['100 series, 1,000 categories and 100,000 data points', atEveryLimit],
    ['1000 slices', fullPie],
    ['a range whose low and high are equal', { ...bars, series: [{ type: 'rangeArea', name: 'A', data: [[1, 1], [2, 2]] }] }],
    ['areas of stacks with one name on y and y2, with different curves', { ...bars, axes: { ...bands, y2: { type: 'linear' } }, series: [{ type: 'area', name: 'A', stack: 's', data: [1, 2] }, { type: 'area', name: 'B', stack: 's', axis: 'y2', curve: 'monotone', data: [1, 2] }] }],
    ['a series name and a category of exactly 100 characters', { ...bars, axes: { x: { type: 'band', categories: ['a', 'c'.repeat(100)] }, y: bands.y }, series: [{ type: 'bar', name: 'n'.repeat(100), data: [1, 2] }] }],
    ['a slice name of exactly 100 characters', { ...pie, series: [{ type: 'pie', name: 'P', data: [{ name: 's'.repeat(100), value: 1 }] }] }],
    ['a full turn whose subtraction rounds past 360', { ...pie, series: [{ type: 'pie', name: 'P', startAngle: 152.2, endAngle: 512.2, data: [{ name: 'a', value: 1 }] }] }],
    ['a hex colour of 8 digits', { ...bars, series: [{ type: 'bar', name: 'A', color: '#11223344', data: [1, 2] }] }],
    ['a seed of exactly 100 characters', { ...bars, seed: 'x'.repeat(100) }],
    ['a line on a plain y2 beside a percent y', { ...bars, axes: { ...bands, y: { type: 'linear', percent: true }, y2: { type: 'linear' } }, series: [{ type: 'bar', name: 'A', stack: 's', data: [1, 2] }, { type: 'line', name: 'B', axis: 'y2', data: [1, 2] }] }],
    ['values that differ by exactly the smallest tick step', { ...bars, series: [{ type: 'line', name: 'A', data: [0, 1e-20] }] }],
    ['a stroke width and a fill weight of exactly 100', { ...bars, style: { strokeWidth: 100, fillWeight: 100 } }],
    ['a dash pattern of exactly one unit', { ...bars, series: [{ type: 'line', name: 'A', dash: [0.5, 0.5], data: [1, 2] }] }],
    ['areas of different stacks with different curves', { ...bars, series: [{ type: 'area', name: 'A', stack: 's', data: [1, 2] }, { type: 'area', name: 'B', stack: 't', curve: 'monotone', data: [1, 2] }] }],
  ])('accepts %s', (_case, spec) => {
    expect(layoutChart(spec as ChartSpec).nodes.length).toBeGreaterThan(0);
  });

  it('draws the style it checked, even from an object that changes as it is read', () => {
    expect(toSvgChart(layoutChart({ ...bars, style: shiftingStroke() } as ChartSpec))).not.toContain('url(');
  });

  it('repeats a message from core of exactly 200 characters in full', () => {
    // The message up to the string, a string of 82 characters, and the quote and bracket that close
    // it make 200.
    expect(laying(dashOf('a'.repeat(82)))).toThrow(
      new InvalidChartError('style', `is not valid: ${DASH_MESSAGE}${'a'.repeat(82)}"]`),
    );
  });

  it('throws an InvalidChartError that names the place in the spec apart from the problem', () => {
    const spec = { ...bars, series: [{ type: 'bar', name: 'A', data: [1, '2'] }] };

    expect(() => layoutChart(spec as ChartSpec)).toThrow(
      expect.objectContaining({
        name: 'InvalidChartError',
        path: 'series[0].data[1]',
        problem: 'must be a number from -1e15 to 1e15 or null, got "2"',
      }),
    );
  });

  it('throws an InvalidChartError with an empty path for the spec itself', () => {
    expect(() => layoutChart({ ...bars, colour: 'red' } as ChartSpec)).toThrow(
      expect.objectContaining({ path: '', problem: 'unknown key "colour"' }),
    );
  });

  it('throws an instance of the exported class', () => {
    expect(() => layoutChart({ ...bars, width: 0 } as ChartSpec)).toThrow(InvalidChartError);
  });
});
