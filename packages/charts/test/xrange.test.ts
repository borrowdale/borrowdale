import { describe, expect, it } from 'vitest';
import '../../core/test/support/forbid-unportable-calls.js';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';

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
const onLinear = (data: object[]): ChartSpec =>
  ({ width: 400, height: 200, axes: { x: { type: 'linear' }, y: { type: 'band', categories: ['a'] } }, series: [{ type: 'xRange', name: 'R', data }] }) as ChartSpec;
const titles = (spec: ChartSpec): string[] => [...toSvgChart(layoutChart(spec)).matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]!);
const laying = (spec: ChartSpec) => () => layoutChart(spec);

describe('an xRange series', () => {
  it('writes each task in its tooltip with its row, label, dates and progress, and a milestone with its date', () => {
    expect(titles(gantt([plan]))).toEqual([
      'Plan, Design: Sketches, 2026-01-05 to 2026-01-23, 100% done',
      'Plan, Design: Review, 2026-01-26 to 2026-02-06, 50% done',
      'Plan, Build: Prototype and production run, 2026-02-02 to 2026-03-13, 25% done',
      'Plan, Launch: Go live, 2026-03-16',
    ]);
  });

  it('labels its items and its time axis by month', () => {
    expect(layoutChart(gantt([plan])).labels).toEqual(['Sketches', 'Review', 'Prototype and production run', 'Go live', '2026', 'Feb', 'Mar', 'Apr', 'Design', 'Build', 'Launch']);
  });

  it('draws an arrow annotation between two tasks', () => {
    const arrow = { annotations: [{ type: 'arrow', from: ['2026-02-06', 'Design'], to: ['2026-02-02', 'Build'] }] };
    expect(laying(gantt([plan], arrow))).not.toThrow();
  });

  it('takes a slot of its own beside another series, listed in the legend', () => {
    const actual = { type: 'xRange', name: 'Actual', data: [{ row: 'Design', from: '2026-01-07', to: '2026-01-30' }] };
    expect(layoutChart(gantt([plan, actual])).labels.slice(0, 2)).toEqual(['Plan', 'Actual']);
  });

  it('writes progress as a percentage with the decimals the progress has, less two', () => {
    expect(titles(onLinear([{ row: 'a', from: 2, to: 5, progress: 0.07 }, { row: 'a', from: 6, to: 8, progress: 0.29 }, { row: 'a', from: 9, to: 10, progress: 0.075 }]))).toEqual([
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
    expect(titles(linear)).toEqual(['R, a: 2 to 5']);
  });

  it.each<[string, ChartSpec, string]>([
    ['an item in a row that is not a category', items([{ row: 'Test', from: '2026-01-01', to: '2026-01-02' }]), 'Invalid chart: series[0].data[0].row is not a category of axes.y, got "Test"'],
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
