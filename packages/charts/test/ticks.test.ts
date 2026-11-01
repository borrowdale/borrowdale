import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { laying } from './support/layout.js';

const months = { type: 'band', categories: ['Jan', 'Feb'] };
const bars = (y: object): ChartSpec =>
  ({ width: 400, height: 300, axes: { x: months, y: { type: 'linear', ...y } }, series: [{ type: 'bar', name: 'A', data: [1, 2] }] }) as ChartSpec;
const points = (x: object): ChartSpec =>
  ({ width: 400, height: 300, axes: { x: { type: 'linear', ...x }, y: { type: 'linear' } }, series: [{ type: 'scatter', name: 'A', data: [[5, 1], [5, 2]] }] }) as ChartSpec;
const dial = (angle: object): ChartSpec =>
  ({ width: 260, height: 260, legend: 'none', axes: { angle: { type: 'linear', startAngle: 0, endAngle: 360, ...angle } }, series: [{ type: 'gauge', name: 'G', value: 3 }] }) as ChartSpec;
const radius = (axis: object): ChartSpec =>
  ({ width: 300, height: 300, axes: { angle: { type: 'band', categories: ['a', 'b', 'c'] }, radius: { type: 'linear', ...axis } }, series: [{ type: 'radar', name: 'R', data: [1, 2, 3] }] }) as ChartSpec;
const polar = (angle: object): ChartSpec =>
  ({ width: 300, height: 300, legend: 'none', axes: { angle: { type: 'linear', ...angle }, radius: { type: 'linear' } }, series: [{ type: 'polarScatter', name: 'S', data: [[10, 1]] }] }) as ChartSpec;
// The value-axis labels of a bar chart: every label but the two categories.
const valueLabels = (spec: ChartSpec): string[] => layoutChart(spec).labels.slice(2);

describe('a step on a linear axis', () => {
  it.each<[string, object, string[]]>([
    ['puts a tick at every multiple of it', { step: 0.5 }, ['0.0', '0.5', '1.0', '1.5', '2.0']],
    ['writes as many decimals as it has', { step: 0.25 }, ['0.00', '0.25', '0.50', '0.75', '1.00', '1.25', '1.50', '1.75', '2.00']],
    ['rounds a free end out to a multiple that is not a nice number', { step: 3 }, ['0', '3']],
    ['keeps the axis format', { step: 1, format: { prefix: '€' } }, ['€0', '€1', '€2']],
  ])('%s', (_case, y, labels) => {
    expect(valueLabels(bars(y))).toEqual(labels);
  });

  it('labels a crowded step on multiples of a nice number of steps, counted from zero', () => {
    expect(valueLabels({ ...bars({ step: 0.1 }), height: 100 })).toEqual(['0.0', '1.0', '2.0']);
  });

  // Its value, 3, is written under the hub, and the labels are listed once each.
  it('labels every hour of a dial', () => {
    expect(layoutChart(dial({ min: 0, max: 12, step: 1 })).labels).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('steps a radius axis', () => {
    expect(layoutChart(radius({ step: 1.5 })).labels).toEqual(['1.5', '3.0', 'a', 'b', 'c']);
  });
});

describe('crowded labels on a gauge or polar chart', () => {
  // The dial's value, 3, is written under its hub.
  it('labels a crowded dial on multiples of a nice number of steps', () => {
    expect(layoutChart(dial({ min: 0, max: 100, step: 1, startAngle: -90, endAngle: 90 })).labels).toEqual(['0', '20', '40', '60', '80', '100', '3']);
  });

  it('labels a crowded radius axis on multiples of a nice number of steps', () => {
    expect(layoutChart(radius({ step: 0.1 })).labels).toEqual(['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', 'a', 'b', 'c']);
  });

  it('labels only the outermost tick of a radius axis too crowded for two', () => {
    const rose = { width: 160, height: 160, axes: { angle: { type: 'band', categories: ['n', 'e', 's', 'w'], startAngle: 270, endAngle: 450 }, radius: { type: 'linear', format: { suffix: ' thousand' } } }, series: [{ type: 'rose', name: 'R', data: [100_000, 200_000, 300_000, 400_000] }] } as ChartSpec;
    expect(layoutChart(rose).labels).toEqual(['400,000 thousand', 'n', 'e', 's', 'w']);
  });

  // The radius axis' labels, 0.5 and 1.0, come first.
  it('labels a crowded angle axis on multiples of a nice number of steps', () => {
    expect(layoutChart(polar({ min: 0, max: 360, step: 5 })).labels).toEqual(['0.5', '1.0', '0', '25', '50', '75', '100', '125', '150', '175', '200', '225', '250', '275', '300', '325']);
  });

  it('leaves out the last label of a whole turn when it would crowd the first', () => {
    expect(layoutChart(polar({ min: 0, max: 360 })).labels).toEqual(['0.5', '1.0', '0', '50', '100', '150', '200', '250', '300']);
  });
});

describe('listed ticks on a linear axis', () => {
  it.each<[string, object, string[]]>([
    ['put ticks exactly there, with their own labels or formatted values', { ticks: [0, { value: 1.5, label: 'target' }, 2] }, ['0', 'target', '2']],
    ['reach past the data', { ticks: [0, 10] }, ['0', '10']],
    ['write their values in the axis format', { ticks: [0, 1.25], format: { suffix: ' kg' } }, ['0 kg', '1.25 kg']],
  ])('%s', (_case, y, labels) => {
    expect(valueLabels(bars(y))).toEqual(labels);
  });

  // The dial's value, 3, is written under its hub.
  it('labels a compass dial by its points', () => {
    const compass = { min: 0, max: 360, ticks: [{ value: 0, label: 'N' }, { value: 90, label: 'E' }, { value: 180, label: 'S' }, { value: 270, label: 'W' }] };
    expect(layoutChart(dial(compass)).labels).toEqual(['N', 'E', 'S', 'W', '3']);
  });

  it('keeps a label only where it clears the last one kept, however unevenly the ticks are spaced', () => {
    expect(valueLabels({ ...bars({ ticks: [0, 0.1, 0.2, 1, 2] }), height: 120 })).toEqual(['0', '1', '2']);
  });
});

describe('step and ticks', () => {
  it.each<[string, ChartSpec, string]>([
    ['a step of 0', bars({ step: 0 }), 'Invalid chart: axes.y.step must be a number above 0 and at most 1e15, got 0'],
    ['a step given as a string', bars({ step: '1' }), 'Invalid chart: axes.y.step must be a number above 0 and at most 1e15, got "1"'],
    ['a step with more decimals than a format writes', bars({ step: 1e-21 }), 'Invalid chart: axes.y.step must have at most 20 decimals, got 1e-21'],
    ['a step that gives too many ticks', bars({ step: 0.001 }), 'Invalid chart: axes.y.step gives 2001 ticks from 0 to 2, more than 1000'],
    ['both step and ticks', bars({ step: 1, ticks: [0, 1] }), 'Invalid chart: axes.y cannot combine step and ticks'],
    ['ticks out of order', bars({ ticks: [0, 2, 1] }), 'Invalid chart: axes.y.ticks[2] must be greater than the tick before it (2), got 1'],
    ['a repeated tick', bars({ ticks: [1, 1] }), 'Invalid chart: axes.y.ticks[1] must be greater than the tick before it (1), got 1'],
    ['a tick beyond a fixed end', bars({ max: 3, ticks: [0, 4] }), "Invalid chart: axes.y.ticks[1] must be within the axis' fixed ends, got 4"],
    ['no ticks', bars({ ticks: [] }), 'Invalid chart: axes.y.ticks must have 1 to 1000 entries, got 0'],
    ['a tick given as a string on an axis that is not a time axis', bars({ ticks: ['1'] }), 'Invalid chart: axes.y.ticks[0] must be a number from -1e15 to 1e15, got "1"'],
    ['a tick that is neither a value nor an object', bars({ ticks: [true] }), 'Invalid chart: axes.y.ticks[0] must be an object, got true'],
    ['a tick with an unknown key', bars({ ticks: [{ value: 1, text: 'a' }] }), 'Invalid chart: axes.y.ticks[0] has an unknown key, "text"'],
    ['a tick label over 100 characters', bars({ ticks: [{ value: 1, label: 'x'.repeat(101) }] }), 'Invalid chart: axes.y.ticks[0].label must be a string of at most 100 characters, got a string of 101 characters'],
    ['one tick equal to all the data', points({ ticks: [5] }), 'Invalid chart: axes.x.ticks and the data all equal 5: give a min, a max or another tick'],
    ['one tick equal to all the data, in a format', points({ ticks: [5], format: { prefix: '$' } }), 'Invalid chart: axes.x.ticks and the data all equal 5: give a min, a max or another tick'],
    ['one tick equal to all the times', { ...points({}), axes: { x: { type: 'time', ticks: ['2026-11-03'] }, y: { type: 'linear' } }, series: [{ type: 'scatter', name: 'A', data: [['2026-11-03', 1]] }] } as ChartSpec, 'Invalid chart: axes.x.ticks and the data all equal 2026-11-03: give a min, a max or another tick'],
    ['a radius tick below 0 when the radius starts at 0', radius({ ticks: [-1, 2] }), 'Invalid chart: axes.radius.ticks[0] is negative, -1, but axes.radius starts at 0 unless its min is set'],
    ['a step on a band axis', { ...bars({}), axes: { x: { ...months, step: 1 }, y: { type: 'linear' } } } as ChartSpec, 'Invalid chart: axes.x has an unknown key, "step"'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});
