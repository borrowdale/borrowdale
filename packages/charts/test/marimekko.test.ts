import { describe, expect, it } from 'vitest';
import { layoutChart, toSvgChart, type ChartSpec } from '@borrowdale/charts';

// Three columns whose stacks total 60, 80 and 100.
const bars = [
  { type: 'bar', name: 'S1', stack: 'all', data: [30, 10, 40] },
  { type: 'bar', name: 'S2', stack: 'all', data: [20, 50, 10] },
  { type: 'bar', name: 'S3', stack: 'all', data: [10, 20, 50] },
];

function chart(weights: unknown, series: object[] = bars, value: object = { type: 'linear', percent: true }): ChartSpec {
  return {
    width: 640, height: 400, style: { roughness: 0 },
    axes: { x: { type: 'band', categories: ['A', 'B', 'C'], weights }, y: value },
    series,
  } as ChartSpec;
}

function sideways(weights: unknown): ChartSpec {
  return { ...chart(weights), axes: { x: { type: 'linear', percent: true }, y: { type: 'band', categories: ['A', 'B', 'C'], weights } } } as ChartSpec;
}

const svg = (spec: ChartSpec) => toSvgChart(layoutChart(spec));

/** Laying the chart out, run later, so that an error it throws can be expected. */
function layingOut(spec: ChartSpec) {
  return () => layoutChart(spec);
}

describe('weights from stacks', () => {
  it('makes each column as wide as its stack, as the shares of the largest stack typed as weights do', () => {
    expect(svg(chart('stacks'))).toBe(svg(chart([0.6, 0.8, 1])));
    expect(svg(chart('stacks'))).not.toBe(svg(chart(undefined)));
  });

  it('counts a part below zero by its size, as the stack draws it', () => {
    expect(svg(chart('stacks', [{ ...bars[0], data: [30, -10, 40] }, bars[1]!, bars[2]!])))
      .toBe(svg(chart([0.6, 0.8, 1], [{ ...bars[0], data: [30, -10, 40] }, bars[1]!, bars[2]!])));
  });

  it('does the same for bars across a band y axis', () => {
    expect(svg(sideways('stacks'))).toBe(svg(sideways([0.6, 0.8, 1])));
  });

  it('needs every series to be a bar of one stack', () => {
    expect(layingOut(chart('stacks', [...bars, { type: 'area', name: 'A', stack: 'all', data: [1, 2, 3] }])))
      .toThrow('axes.x.weights is "stacks", which needs every series to be a bar, but series[3] is an area series');
    expect(layingOut(chart('stacks', [bars[0]!, { ...bars[1], stack: 'other' }])))
      .toThrow('axes.x.weights is "stacks", which needs every bar in one stack, but series[1] stacks in "other", and series[0] in "all"');
    expect(layingOut(chart('stacks', [{ ...bars[0], stack: undefined }])))
      .toThrow('axes.x.weights is "stacks", which needs every bar in one stack, but series[0] has no stack');
  });

  it('needs the stacks shown as shares', () => {
    expect(layingOut(chart('stacks', bars, { type: 'linear' })))
      .toThrow('axes.x.weights is "stacks", which needs the stacks shown as shares: set percent on axes.y');
  });

  // Only a linear axis takes percent, so on another kind the advice is to change the kind.
  it('needs a linear value axis to show the stacks as shares', () => {
    expect(layingOut(chart('stacks', bars, { type: 'sqrt' })))
      .toThrow('axes.x.weights is "stacks", which needs the stacks shown as shares: axes.y is sqrt: make it linear, with percent');
  });

  it('rejects a column too thin to draw, naming its category', () => {
    expect(layingOut(chart('stacks', [{ type: 'bar', name: 'S1', stack: 'all', data: [30, 0, 40] }])))
      .toThrow('axes.x.weights is "stacks", but the stack of "B" totals 0, less than a millionth of the largest, 40');
    expect(layingOut(chart('stacks', [{ type: 'bar', name: 'S1', stack: 'all', data: [1000000, 0.5, 40] }])))
      .toThrow('the stack of "B" totals 0.5, less than a millionth of the largest, 1000000');
    expect(layingOut(chart('stacks', [{ type: 'bar', name: 'S1', stack: 'all', data: [0, 0, 0] }])))
      .toThrow('axes.x.weights is "stacks", but the stack of "A" totals 0, as every stack does');
  });

  it('needs bars on one band axis', () => {
    const cells = [{ type: 'heatmap', name: 'H', data: [['A', 'r', 1], ['B', 'r', 2], ['C', 'r', 3]] }];

    expect(layingOut(chart('stacks', cells, { type: 'band', categories: ['r'] })))
      .toThrow('axes.x.weights is "stacks", which needs bars on one band axis');
  });

  it('takes no other word for weights', () => {
    expect(layingOut(chart('totals'))).toThrow('axes.x.weights must be "stacks" or an array of 3 weights, got "totals"');
  });
});
