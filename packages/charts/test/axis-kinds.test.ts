import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import type { CheckedLinearAxis } from '../src/check-axis.js';
import { place, scaleOf, PLAIN_FORMAT } from '../src/scale.js';
import { shapesOf } from './support/layout.js';

const xy = (x: object, y: object, data: unknown[], type = 'xyLine', width = 400): ChartSpec =>
  ({ width, height: 260, axes: { x, y }, series: [{ type, name: 'S', data }] }) as ChartSpec;
const linearY = { type: 'linear' };
const linearX = { type: 'linear' };
const onTime = (x: object, data: unknown[], width = 400): ChartSpec => xy({ type: 'time', ...x }, linearY, data, 'xyLine', width);
const plan: ChartSpec = {
  width: 400,
  height: 200,
  axes: { x: { type: 'time' }, y: { type: 'band', categories: ['Design', 'Build'] } },
  series: [{ type: 'interval', name: 'Plan', data: [['2026-01-05', '2026-01-20'], ['2026-01-15', '2026-02-10']] }],
} as ChartSpec;
// The value labels, after the categories or before the y axis' labels.
const labels = (spec: ChartSpec): string[] => layoutChart(spec).labels;
const titles = (spec: ChartSpec): string[] => [...toSvgChart(layoutChart(spec)).matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]!);
const laying = (spec: ChartSpec) => () => layoutChart(spec);
const svg = (spec: ChartSpec): string => toSvgChart(layoutChart(spec));
const yLabels = ['1.0', '1.5', '2.0', '2.5', '3.0'];
// Bars on y and a line on a y2 axis of the given type, from 10 to 1,000.
const onY2 = (type: string): ChartSpec =>
  ({ width: 400, height: 260, axes: { x: { type: 'band', categories: ['a', 'b'] }, y: { type: 'linear' }, y2: { type } }, series: [{ type: 'bar', name: 'B', data: [1, 2] }, { type: 'line', name: 'L', axis: 'y2', data: [10, 1000] }] }) as ChartSpec;
// A bar from 0 to 100 with its data label, on a y axis of that kind fixed to those ends.
const labelledBar = (type: string): ChartSpec =>
  ({ width: 300, height: 200, legend: 'none', style: { roughness: 0 }, axes: { x: { type: 'band', categories: ['a'] }, y: { type, min: 0, max: 100 } }, series: [{ type: 'bar', name: 'B', dataLabels: true, data: [100] }] }) as ChartSpec;
const axisOf = (kind: CheckedLinearAxis['kind'], fixed: object = {}): CheckedLinearAxis => ({
  type: 'linear', kind, path: 'axes.y', title: undefined, min: undefined, max: undefined, step: undefined, interval: undefined,
  ticks: undefined, percent: false, grid: true, hidden: false, labelAngle: 0, format: PLAIN_FORMAT, months: [], ...fixed,
});

describe('a time axis', () => {
  it.each<[string, ChartSpec, string[]]>([
    ['labels a year by quarters, at the year and the months', onTime({}, [['2026-01-01', 1], ['2026-12-31', 3]]), ['2026', 'Apr', 'Jul', 'Oct', '2027', ...yLabels]],
    ['labels a month by its Mondays', onTime({}, [['2026-11-02', 1], ['2026-11-30', 3]]), ['2 Nov', '9 Nov', '16 Nov', '23 Nov', '30 Nov', ...yLabels]],
    ['labels a day by its hours', onTime({}, [['2026-11-03T06:00Z', 1], ['2026-11-03T18:00Z', 3]]), ['06:00', '09:00', '12:00', '15:00', '18:00', ...yLabels]],
    ['labels midnight by its date', onTime({}, [['2026-11-03T18:00Z', 1], ['2026-11-04T06:00Z', 3]]), ['18:00', '21:00', '4 Nov', '03:00', '06:00', ...yLabels]],
    ['labels decades', onTime({}, [['1950', 1], ['2026', 3]]), ['1940', '1960', '1980', '2000', '2020', '2040', ...yLabels]],
    ['steps by its own interval', onTime({ step: { unit: 'month', every: 3 } }, [['2026-01-01', 1], ['2027-01-01', 3]]), ['2026', 'Apr', 'Jul', 'Oct', '2027', ...yLabels]],
    ['labels every tick of its own interval when they fit, though no built-in one is that long', onTime({ step: { unit: 'month', every: 2 } }, [['2026-01-01', 1], ['2026-12-31', 3]], 600), ['2026', 'Mar', 'May', 'Jul', 'Sep', 'Nov', '2027', ...yLabels]],
    ['labels every ten minutes when they fit', onTime({ step: { unit: 'minute', every: 10 } }, [['2026-11-03T09:00Z', 1], ['2026-11-03T10:00Z', 3]], 600), ['09:00', '09:10', '09:20', '09:30', '09:40', '09:50', '10:00', ...yLabels]],
    ['chooses fewer ticks on a narrow axis', onTime({}, [['2026-01-01', 1], ['2026-03-31', 3]], 200), ['2026', 'Feb', 'Mar', 'Apr', ...yLabels]],
    ['names the months as it is told', onTime({ format: { months: ['jan', 'febr', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'] } }, [['2026-01-01', 1], ['2026-12-31', 3]]), ['2026', 'ápr', 'júl', 'okt', '2027', ...yLabels]],
  ])('%s', (_case, spec, expected) => {
    expect(labels(spec)).toEqual(expected);
  });

  it('puts listed ticks at the times given, labelled by their own labels or as its ticks are', () => {
    expect(labels(onTime({ ticks: ['2026-01-01', { value: '2026-07-01', label: 'H2' }] }, [['2026-01-01', 1], ['2026-12-31', 3]]))).toEqual(['2026', 'H2', ...yLabels]);
  });

  it('draws times given as milliseconds exactly as the same times given as strings', () => {
    expect(svg(onTime({}, [[Date.UTC(2026, 10, 3), 1], [Date.UTC(2026, 10, 30), 2]]))).toBe(svg(onTime({}, [['2026-11-03', 1], ['2026-11-30', 2]])));
  });

  it('writes a time in a tooltip as its date and time of day', () => {
    expect(titles(xy({ type: 'time' }, linearY, [['2026-11-03T09:30Z', 5]], 'scatter'))).toEqual(['S: 2026-11-03 09:30, 5']);
  });

  it('places annotations at times', () => {
    const marked = { ...onTime({}, [['2026-01-01', 1], ['2026-12-31', 3]]), annotations: [{ type: 'line', axis: 'x', value: '2026-06-15', label: 'launch' }, { type: 'band', axis: 'x', from: '2026-03-01', to: '2026-04-01' }] } as ChartSpec;
    expect(labels(marked)).toEqual(['launch', '2026', 'Apr', 'Jul', 'Oct', '2027', ...yLabels]);
  });

  it('draws intervals of time as range bars, with their dates in tooltips', () => {
    expect(titles(plan)).toEqual(['Plan, Design: 2026-01-05 to 2026-01-20', 'Plan, Build: 2026-01-15 to 2026-02-10']);
  });

  it('labels range bars by the Mondays they span', () => {
    expect(labels(plan)).toEqual(['5 Jan', '12 Jan', '19 Jan', '26 Jan', '2 Feb', '9 Feb', '16 Feb', 'Design', 'Build']);
  });

  it.each<[string, ChartSpec, string]>([
    ['a line series on a time value axis', { width: 400, height: 200, axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'time' } }, series: [{ type: 'line', name: 'L', data: [1] }] } as ChartSpec, 'Invalid chart: series[0] is a line series on axes.y, a time axis, which only interval and xRange series can use'],
    ['a time on an axis that is not a time axis', xy(linearX, linearY, [['2026-01-01', 1]]), 'Invalid chart: series[0].data[0][0] must be a number, since axes.x is not a time axis, got "2026-01-01"'],
    ['a date and time without an offset', onTime({}, [['2026-01-01T09:00', 1]]), 'Invalid chart: series[0].data[0][0] must end in Z or an offset such as +01:00, since a time without one is local time, got "2026-01-01T09:00"'],
    ['an impossible day', onTime({}, [['2027-02-30', 1]]), 'Invalid chart: series[0].data[0][0] is not a date in the calendar, got "2027-02-30"'],
    ['a step that gives too many ticks', onTime({ step: { unit: 'day' } }, [['2020-01-01', 1], ['2026-01-01', 3]]), 'Invalid chart: axes.x.step gives more than 1000 ticks from 2020-01-01 to 2026-01-01'],
    ['a step in an unknown unit', onTime({ step: { unit: 'fortnight' } }, [['2026-01-01', 1]]), 'Invalid chart: axes.x.step.unit must be one of millisecond, second, minute, hour, day, week, month, year, got "fortnight"'],
    ['a step of no units', onTime({ step: { unit: 'day', every: 0 } }, [['2026-01-01', 1]]), 'Invalid chart: axes.x.step.every must be an integer from 1 to 1000, got 0'],
    ['eleven month names', onTime({ format: { months: Array.from({ length: 11 }, () => 'm') } }, [['2026-01-01', 1]]), 'Invalid chart: axes.x.format.months must have 12 entries, got 11'],
    ['a number format on a time axis', onTime({ format: { decimals: 2 } }, [['2026-01-01', 1]]), 'Invalid chart: axes.x.format has an unknown key, "decimals"'],
    ['a max before the min', onTime({ min: '2026-02-01', max: '2026-01-01' }, [['2026-01-01', 1]]), 'Invalid chart: axes.x.max must be greater than min (2026-02-01), got 2026-01-01'],
    ['data before a fixed min', onTime({ min: '2026-02-01' }, [['2026-01-01', 1]]), 'Invalid chart: axes.x.min is 2026-02-01, but the data reach 2026-01-01'],
    ['an xyArea whose times go back', xy({ type: 'time' }, linearY, [['2026-01-02', 1, 2], ['2026-01-01', 1, 3]], 'xyArea'), 'Invalid chart: series[0].data[1][0] must increase within each run'],
    ['a time axis on y2', { width: 400, height: 200, axes: { x: { type: 'band', categories: ['a'] }, y: linearY, y2: { type: 'time' } }, series: [{ type: 'bar', name: 'B', data: [1] }] } as unknown as ChartSpec, 'Invalid chart: axes.y2.type must be "linear", "log" or "sqrt", got "time"'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});

describe('a log axis', () => {
  it.each<[string, ChartSpec, string[]]>([
    ['rounds out to powers of ten and labels them', xy(linearX, { type: 'log' }, [[0, 3], [1, 700]], 'scatter'), ['1', '10', '100', '1,000']],
    ['labels each power of ten across six of them', xy(linearX, { type: 'log' }, [[0, 1], [1, 1e6]], 'scatter'), ['1', '10', '100', '1,000', '10,000', '100,000', '1,000,000']],
    ['labels 1, 2 and 5 times the power of ten that one value lies in', xy(linearX, { type: 'log' }, [[0, 50], [1, 50]], 'scatter'), ['10', '20', '50', '100']],
    ['labels small values as decimals', xy(linearX, { type: 'log' }, [[0, 0.002], [1, 0.3]], 'scatter'), ['0.001', '0.01', '0.1', '1']],
    ['keeps fixed ends within one power of ten', xy(linearX, { type: 'log', min: 20, max: 80 }, [[0, 30], [1, 70]], 'scatter'), ['20', '50']],
  ])('%s', (_case, spec, expected) => {
    expect(labels(spec).slice(6)).toEqual(expected);
  });

  // Seven whole tens are too many for a short axis, one 5 × 10 is too few, and no power of ten is
  // within the range.
  it('ticks a range within one power of ten as a linear axis does when its powers are too few', () => {
    expect(labels({ ...xy(linearX, { type: 'log', min: 30, max: 95 }, [[0, 40], [1, 90]], 'scatter'), height: 200 }).slice(6)).toEqual(['40', '60', '80']);
  });

  // The legend, the categories and the y axis' labels come first.
  it('serves as y2', () => {
    expect(labels(onY2('log')).slice(9)).toEqual(['10', '100', '1,000']);
  });

  it('places each power of ten an equal distance apart', () => {
    expect(place(scaleOf(axisOf('log'), [1, 1000], 300), [0, 300]).at(10)).toBeCloseTo(100, 9);
  });

  it.each<[string, ChartSpec, string]>([
    ['a value of 0', xy(linearX, { type: 'log' }, [[0, 0]], 'scatter'), 'Invalid chart: series[0].data[0][1] must be a number from 1e-20 to 1e15 on a log axis, got 0'],
    ['a negative value of a line', { width: 400, height: 200, axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'log' } }, series: [{ type: 'line', name: 'L', data: [-1] }] } as ChartSpec, 'Invalid chart: series[0].data[0] must be a number from 1e-20 to 1e15 on a log axis, got -1'],
    ['a bar series', { width: 400, height: 200, axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'log' } }, series: [{ type: 'bar', name: 'B', data: [1] }] } as ChartSpec, 'Invalid chart: series[0] is a bar series on axes.y, a log axis, which cannot show the 0 it stands on'],
    ['an area series', { width: 400, height: 200, axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'log' } }, series: [{ type: 'area', name: 'A', data: [1] }] } as ChartSpec, 'Invalid chart: series[0] is a area series on axes.y, a log axis, which cannot show the 0 it stands on'],
    ['a min of 0', xy(linearX, { type: 'log', min: 0 }, [[0, 1]], 'scatter'), 'Invalid chart: axes.y.min must be a number from 1e-20 to 1e15 on a log axis, got 0'],
    ['a step', xy(linearX, { type: 'log', step: 10 }, [[0, 1]], 'scatter'), 'Invalid chart: axes.y has an unknown key, "step"'],
    ['a percent stack', xy(linearX, { type: 'log', percent: true }, [[0, 1]], 'scatter'), 'Invalid chart: axes.y has an unknown key, "percent"'],
    ['a max at the least value it shows, with the data there too', xy(linearX, { type: 'log', max: 1e-20 }, [[0, 1e-20]], 'scatter'), 'Invalid chart: axes.y.max is 1e-20, the least a log axis shows, which leaves no room below it'],
    ['ends whose logarithms are equal', xy(linearX, { type: 'log', min: 999999999999999.9, max: 1e15 }, [[0, 1e15]], 'scatter'), 'Invalid chart: axes.y cannot place values between 999999999999999.9 and 1000000000000000, whose logarithms are equal'],
    ['data beyond a fixed end', xy(linearX, { type: 'log', max: 100 }, [[0, 400]], 'scatter'), 'Invalid chart: axes.y.max is 100, but the data reach 400'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});

describe('a square-root axis', () => {
  it.each<[string, ChartSpec, string[]]>([
    ['labels the ticks of a linear axis', xy(linearX, { type: 'sqrt' }, [[0, 0], [1, 100]], 'scatter'), ['0', '20', '40', '60', '80', '100']],
    ['takes negative values', xy(linearX, { type: 'sqrt' }, [[0, -100], [1, 100]], 'scatter'), ['-100', '-50', '0', '50', '100']],
  ])('%s', (_case, spec, expected) => {
    expect(labels(spec).slice(6)).toEqual(expected);
  });

  it('puts the data label of a bar at the middle of the bar, as on a linear axis, not at its middle value', () => {
    expect(shapesOf(layoutChart(labelledBar('sqrt')), 'B, a: 100')).toEqual(shapesOf(layoutChart(labelledBar('linear')), 'B, a: 100'));
  });

  it.each<[string, [number, number], number, number]>([
    ['a quarter of the top value halfway up', [0, 100], 25, 50],
    ['a negative value as far below 0 as its positive is above', [-100, 100], -25, 25],
  ])('places %s', (_case, extent, value, at) => {
    expect(place(scaleOf(axisOf('sqrt', { min: extent[0], max: extent[1] }), extent, 300), [0, 100]).at(value)).toBeCloseTo(at, 9);
  });

  it('serves as y2', () => {
    expect(labels(onY2('sqrt')).slice(9)).toEqual(['0', '500', '1,000']);
  });

  it('rejects ends whose square roots are equal', () => {
    expect(laying(xy(linearX, { type: 'sqrt', min: 999999999999999.9, max: 1e15 }, [[0, 1e15]], 'scatter'))).toThrow('Invalid chart: axes.y cannot place values between 999999999999999.9 and 1000000000000000, whose square roots are equal');
  });

  it('rejects data past a fixed end with listed ticks, as without them', () => {
    expect(laying(xy(linearX, { type: 'sqrt', max: 100, ticks: [0, 50, 100] }, [[0, 10], [1, 400]], 'scatter'))).toThrow('Invalid chart: axes.y.max is 100, but the data reach 400');
  });

  it('places listed ticks by their square roots', () => {
    expect(place(scaleOf(axisOf('sqrt', { max: 100, ticks: [{ value: 0, label: undefined }, { value: 25, label: undefined }, { value: 100, label: undefined }] }), [0, 100], 300), [0, 100]).at(25)).toBeCloseTo(50, 9);
  });

  it('rejects a percent stack', () => {
    expect(laying(xy(linearX, { type: 'sqrt', percent: true }, [[0, 1]], 'scatter'))).toThrow('Invalid chart: axes.y has an unknown key, "percent"');
  });
});
