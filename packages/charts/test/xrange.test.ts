import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';
import { laying, shapesOf, svgTitles } from './support/layout.js';

const rows = { type: 'band', categories: ['Design', 'Build', 'Launch'] };
const plan = {
  type: 'xRange',
  name: 'Plan',
  dataLabels: true,
  data: [
    { row: 'Design', from: '2026-01-05', to: '2026-01-23', label: 'Sketches', progress: 1 },
    { row: 'Design', from: '2026-01-26', to: '2026-02-06', label: 'Review', progress: 0.5 },
    { row: 'Build', from: '2026-02-02', to: '2026-03-13', label: 'Prototype and production run', progress: 0.25 },
    { row: 'Launch', from: '2026-03-16', label: 'Go live' },
  ],
};
const gantt = (series: object[], extra: object = {}): ChartSpec =>
  ({ width: 480, height: 220, axes: { x: { type: 'time' }, y: rows }, series, ...extra }) as ChartSpec;
const items = (data: object[]): ChartSpec => gantt([{ type: 'xRange', name: 'P', data }]);
const actual = { type: 'xRange', name: 'Actual', data: [{ row: 'Design', from: '2026-01-07', to: '2026-01-30' }] };
// A milestone with its label on a vertical value axis, where labels go above their items.
const upright = { width: 300, height: 400, axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'linear', min: 0, max: 10 } },
  series: [{ type: 'xRange', name: 'R', dataLabels: true, data: [{ row: 'a', from: 5, label: 'Go' }] }] } as ChartSpec;
const onLinear = (data: object[]): ChartSpec =>
  ({ width: 400, height: 200, axes: { x: { type: 'linear' }, y: { type: 'band', categories: ['a'] } }, series: [{ type: 'xRange', name: 'R', data }] }) as ChartSpec;

describe('an xRange series', () => {
  it('writes each task in its tooltip with its row, label, dates and progress, and a milestone with its date', () => {
    expect(svgTitles(gantt([plan]))).toEqual([
      'Plan, Design: Sketches, 2026-01-05 to 2026-01-23, 100% done',
      'Plan, Design: Review, 2026-01-26 to 2026-02-06, 50% done',
      'Plan, Build: Prototype and production run, 2026-02-02 to 2026-03-13, 25% done',
      'Plan, Launch: Go live, 2026-03-16',
    ]);
  });

  it('labels its items and its time axis by month', () => {
    expect(layoutChart(gantt([plan])).labels).toEqual(['Sketches', 'Review', 'Prototype and production run', 'Go live', '2026', 'Feb', 'Mar', 'Apr', 'Design', 'Build', 'Launch']);
  });

  it('accepts an arrow annotation between two tasks', () => {
    const arrow = { annotations: [{ type: 'arrow', from: ['2026-02-06', 'Design'], to: ['2026-02-02', 'Build'] }] };
    expect(laying(gantt([plan], arrow))).not.toThrow();
  });

  it('lists itself in the legend beside another series', () => {
    expect(layoutChart(gantt([plan, actual])).labels.slice(0, 2)).toEqual(['Plan', 'Actual']);
  });

  // The other series then has the whole row, as if it were alone; no legend, which would differ.
  it('takes no slot of its own as an overlay beside another series', () => {
    expect(shapesOf(layoutChart(gantt([plan, { ...actual, overlay: true }], { legend: 'none' })), 'Plan, Design: Sketches, 2026-01-05 to 2026-01-23, 100% done'))
      .toEqual(shapesOf(layoutChart(gantt([plan], { legend: 'none' })), 'Plan, Design: Sketches, 2026-01-05 to 2026-01-23, 100% done'));
  });

  // The diamond spans 184.8 to 197.7 down the chart; the label sits above it.
  it('puts a milestone label above its diamond on a vertical value axis', () => {
    expect(shapesOf(layoutChart(upright), 'R, a: Go, 5')[1]).toMatchObject({ kind: 'text', text: { y: 176.23 } });
  });

  it('writes progress as a percentage with the decimals the progress has, less two', () => {
    expect(svgTitles(onLinear([{ row: 'a', from: 2, to: 5, progress: 0.07 }, { row: 'a', from: 6, to: 8, progress: 0.29 }, { row: 'a', from: 9, to: 10, progress: 0.075 }]))).toEqual([
      'R, a: 2 to 5, 7% done',
      'R, a: 6 to 8, 29% done',
      'R, a: 9 to 10, 7.5% done',
    ]);
  });

  it('draws the same with an overlay series as without one, when it is the only series', () => {
    expect(toSvgChart(layoutChart(gantt([{ ...plan, overlay: true }])))).toBe(toSvgChart(layoutChart(gantt([plan]))));
  });

  it('spans a linear value axis too', () => {
    const linear = { width: 400, height: 200, axes: { x: { type: 'linear' }, y: { type: 'band', categories: ['a'] } }, series: [{ type: 'xRange', name: 'R', data: [{ row: 'a', from: 2, to: 5 }] }] } as ChartSpec;
    expect(svgTitles(linear)).toEqual(['R, a: 2 to 5']);
  });

  it.each<[string, ChartSpec, string]>([
    ['an item in a row that is not a category', items([{ row: 'Test', from: '2026-01-01', to: '2026-01-02' }]), 'Invalid chart: series[0].data[0].row is not a category of axes.y, got "Test"'],
    ['a row longer than 100 characters', items([{ row: 'x'.repeat(101), from: '2026-01-05' }]), 'Invalid chart: series[0].data[0].row must be a string of at most 100 characters, got a string of 101 characters'],
    ['a row with a line break, which no category has', items([{ row: 'Bu\nild', from: '2026-01-05' }]), 'Invalid chart: series[0].data[0].row is not a category of axes.y, got "Bu\\nild"'],
    ['a time longer than 40 characters', items([{ row: 'Build', from: '2026-01-05T00:00:00.00000000000000000000Z' }]), 'Invalid chart: series[0].data[0].from must be a string of at most 40 characters, got "2026-01-05T00:00:00.00000000000000000000Z"'],
    ['an item that ends where it starts', items([{ row: 'Build', from: '2026-01-05', to: '2026-01-05' }]), 'Invalid chart: series[0].data[0].to must be after from; leave it out for a milestone'],
    ['an item that ends before it starts', items([{ row: 'Build', from: '2026-01-05', to: '2026-01-01' }]), 'Invalid chart: series[0].data[0].to must be after from; leave it out for a milestone'],
    ['an item without a start', items([{ row: 'Build' }]), 'Invalid chart: series[0].data[0].from is missing'],
    ['an unknown key in an item', items([{ row: 'Build', start: '2026-01-05' }]), 'Invalid chart: series[0].data[0] has an unknown key, "start"'],
    ['progress beyond 1', items([{ row: 'Build', from: '2026-01-05', to: '2026-01-06', progress: 2 }]), 'Invalid chart: series[0].data[0].progress must be a number from 0 to 1, got 2'],
    ['a time on a linear value axis', { ...items([{ row: 'Build', from: '2026-01-05' }]), axes: { x: { type: 'linear' }, y: rows } } as ChartSpec, 'Invalid chart: series[0].data[0].from must be a number, since axes.x is not a time axis, got "2026-01-05"'],
    ['a percent value axis', { width: 400, height: 200, axes: { x: { type: 'linear', percent: true }, y: { type: 'band', categories: ['a'] } }, series: [{ type: 'xRange', name: 'R', data: [{ row: 'a', from: 2, to: 5 }] }] } as ChartSpec, 'Invalid chart: series[0] is a xRange series on axes.x, a percent axis, which only stacking series (bar, area) can use'],
    ['a chart without a band axis', { width: 400, height: 200, axes: { x: { type: 'time' }, y: { type: 'linear' } }, series: [{ type: 'xRange', name: 'P', data: [] }] } as ChartSpec, 'Invalid chart: series[0] is a xRange series, which needs one band axis'],
  ])('rejects %s', (_case, spec, message) => {
    expect(laying(spec)).toThrow(message);
  });
});
