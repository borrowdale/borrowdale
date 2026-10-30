// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import * as core from '@borrowdale/core';
import { appendChart, layoutChart, type ChartSpec } from '@borrowdale/charts';
import { bandScale } from '../src/scale.js';
import { checkChart } from '../src/validate.js';

const spec: ChartSpec = { width: 400, height: 300, legend: 'none',
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ type: 'xyLine', name: 'Trend', data: [[0, 0], [1, 1]],
    gradient: { axis: 'x', stops: [{ offset: 0, color: '#f00' }, { offset: 1, color: '#00f' }] } }] };
const id = (svg: SVGSVGElement) => svg.querySelector('linearGradient')!.id;
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

it('does not reuse a detached explicit resource prefix automatically', () => {
  const first = appendChart(document.createElement('div'), layoutChart(spec), { idPrefix: 'chart' });
  const second = appendChart(document.createElement('div'), layoutChart(spec));
  expect(id(second)).not.toBe(id(first));
});
it('allocates unique automatic resources across owner documents including template contents', () => {
  const first = appendChart(document.createElement('div'), layoutChart(spec));
  const template = document.createElement('template');
  template.innerHTML = '<div></div>';
  const second = appendChart(template.content.firstElementChild!, layoutChart(spec));
  const other = document.implementation.createHTMLDocument('Other');
  const third = appendChart(other.body, layoutChart(spec));
  const fourth = appendChart(other.body, layoutChart(spec));
  const fifth = appendChart(other.body, layoutChart(spec));
  expect(new Set([id(first), id(second), id(third), id(fourth), id(fifth)]).size).toBe(5);
});
it('avoids existing resource ids in the destination shadow root', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'closed' });
  const target = document.createElement('div');
  root.appendChild(target);
  const next = id(appendChart(document.createElement('div'), layoutChart(spec))).replace(/chart(?:-(\d+))?-/, (_, n) => `chart-${Number(n ?? 0) + 1}-`);
  const occupied = document.createElement('span'); occupied.id = next;
  root.prepend(occupied);
  expect(id(appendChart(target, layoutChart(spec)))).not.toBe(next);
});
it('uses the same gap at both weighted edges and between bands', () => {
  const scale = bandScale(3, [10, 610], 0.2, [1, 3, 5]);
  const gap = scale.start(0) - 10;
  expect(gap).toBeGreaterThan(0);
  expect(610 - scale.start(2) - scale.width(2)).toBeCloseTo(gap, 9);
  for (let i = 1; i < 3; i++) expect(scale.start(i) - scale.start(i - 1) - scale.width(i - 1)).toBeCloseTo(gap, 9);
  expect(scale.width(2) / scale.width(0)).toBeCloseTo(5, 9);
});
it('keeps categorical line images and data labels inside their series tooltip group', () => {
  const layout = layoutChart({ width: 400, height: 300, legend: 'none',
    axes: { x: { type: 'band', categories: ['A', 'B'] }, y: { type: 'linear' } },
    series: [{ type: 'line', name: 'Trend', data: [2, 3], symbol: { image: 'badge' }, dataLabels: true }] });
  const group = layout.nodes.find((node) => node.kind === 'mark' && node.title === 'Trend');
  expect(group?.kind).toBe('mark');
  if (group?.kind !== 'mark') throw new Error('Missing series mark');
  expect(group.nodes.filter((node) => node.kind === 'image')).toHaveLength(2);
  expect(group.nodes.filter((node) => node.kind === 'text')).toHaveLength(2);
});
it('validates many segment dash arrays without producing probe sketches', () => {
  const spy = vi.spyOn(core, 'sketch');
  const data = Array.from({ length: 2000 }, (_, i) => [i, i % 2] as const);
  checkChart({ ...spec, series: [{ type: 'xyLine', name: 'Dashes', data,
    segments: data.slice(1).map((_, i) => ({ dash: [i + 1, 2] })) }] });
  expect(spy).not.toHaveBeenCalled();
});
it.each([[], [0], [0.1, 0.1], [-1, 2], [NaN, 2], [Infinity], Array(17).fill(1), Array(2)].map((dash) => [dash]))('rejects invalid segment dashes %j', (dash) => {
  expect(() => checkChart({ ...spec, series: [{ type: 'xyLine', name: 'Bad', data: [[0, 0], [1, 1]], segments: [{ dash }] }] })).toThrow('series[0].segments[0].dash');
});

it('does not let a maximum-length explicit prefix exhaust automatic allocation', () => {
  const prefix = 'chart-' + '9'.repeat(94);
  appendChart(document.createElement('div'), layoutChart(spec), { idPrefix: prefix });
  expect(() => appendChart(document.createElement('div'), layoutChart(spec))).not.toThrow();
});

it('does not consume detached explicit reservations while drawing resource-free charts', () => {
  const probe = appendChart(document.createElement('div'), layoutChart(spec));
  const prefix = id(probe).replace(/-gradient-0$/, '').replace(/chart(?:-(\d+))?$/, (_, n) => `chart-${Number(n ?? 0) + 1}`);
  const explicit = appendChart(document.createElement('div'), layoutChart(spec), { idPrefix: prefix });
  appendChart(document.createElement('div'), { ...layoutChart(spec), nodes: [] });
  const automatic = appendChart(document.createElement('div'), layoutChart(spec));
  expect(id(automatic)).not.toBe(id(explicit));
});

it('includes the detached root element itself in resource collision checks', () => {
  const probe = appendChart(document.createElement('div'), layoutChart(spec));
  const next = id(probe).replace(/chart(?:-(\d+))?-/, (_, n) => `chart-${Number(n ?? 0) + 1}-`);
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.id = next;
  expect(id(appendChart(root, layoutChart(spec)))).not.toBe(root.id);
});
