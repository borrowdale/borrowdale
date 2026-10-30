import { describe, expect, it } from 'vitest';
import { layoutChart, type ChartSpec } from '@borrowdale/charts';
import { labelsOutside, pointsOutside, texts, titles } from './support/layout.js';

// The largest bubble at the top right corner of the data, and the smallest at the bottom left.
const cornerBubbles: ChartSpec = {
  width: 300,
  height: 300,
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ type: 'bubble', name: 'B', data: [[0, 0, 1], [10, 10, 60]] }],
};
// The same, with both ends of x fixed at the data and no y labels to keep the plot off the edge.
const fixedBubbles: ChartSpec = {
  ...cornerBubbles,
  axes: { x: { type: 'linear', min: 0, max: 10 }, y: { type: 'linear', hidden: true } },
};
const cornerPoints: ChartSpec = { ...cornerBubbles, series: [{ type: 'scatter', name: 'S', data: [[0, 0], [10, 10]] }] };
// Text too long for a 200 × 200 chart, and band labels that reach past the ends of their axis.
const longText = 'Revenue from every region and channel';
const oneBar = { axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'linear' } }, series: [{ type: 'bar', name: 'S', data: [1] }] } as const;
const longTitle: ChartSpec = { width: 200, height: 200, title: longText, ...oneBar };
const longLegend: ChartSpec = { ...longTitle, title: undefined, series: [{ type: 'bar', name: longText, data: [1] }, { type: 'bar', name: 'B', data: [2] }] };
const longAxisTitles: ChartSpec = { ...longTitle, title: undefined, axes: { x: { type: 'band', categories: ['a'], title: longText }, y: { type: 'linear', title: longText } } };
const wideFirstLabel: ChartSpec = {
  width: 300,
  height: 200,
  axes: { x: { type: 'band', categories: ['A rather long first category', 'b', 'c'] }, y: { type: 'linear' } },
  series: [{ type: 'bar', name: 'S', data: [1, 2, 3] }],
};
const forty = Array.from({ length: 40 }, (_, i) => `c${i}`);
const denseSide: ChartSpec = {
  width: 300,
  height: 120,
  axes: { x: { type: 'linear' }, y: { type: 'band', categories: forty } },
  series: [{ type: 'bar', name: 'S', data: forty.map(() => 1) }],
};
const loneWideLabel: ChartSpec = { ...wideFirstLabel, width: 100, axes: { x: { type: 'band', categories: ['A category far too wide for this'] }, y: { type: 'linear' } }, series: [{ type: 'bar', name: 'S', data: [1] }] };

describe('room on the chart', () => {
  it('keeps bubbles at the ends of the data inside the chart', () => {
    expect(pointsOutside(layoutChart(cornerBubbles))).toBe(0);
  });

  it('keeps bubbles at fixed ends of an axis inside the chart', () => {
    expect(pointsOutside(layoutChart(fixedBubbles))).toBe(0);
  });

  it('widens an axis for its points without adding ticks', () => {
    expect(texts(layoutChart(cornerPoints))).toEqual(['0', '2', '4', '6', '8', '10', '0', '2', '4', '6', '8', '10']);
  });

  it('keeps the first label of a band axis on the chart', () => {
    expect(labelsOutside(layoutChart(wideFirstLabel))).toBe(0);
  });

  it('keeps the end labels of a dense band axis at the side on the chart', () => {
    expect(labelsOutside(layoutChart(denseSide))).toBe(0);
  });

  it('rejects a lone band label wider than the chart', () => {
    expect(() => layoutChart(loneWideLabel)).toThrow('Invalid chart: a 100 × 200 chart leaves no room for the plot');
  });

  it('cuts a title too wide for the chart short, and keeps it whole in the SVG title', () => {
    const layout = layoutChart(longTitle);

    expect(texts(layout)[0]).toBe('Revenue from every r…');
    expect(layout.title).toBe(longText);
    expect(labelsOutside(layout)).toBe(0);
  });

  it('cuts a legend name too wide for the chart short, and keeps it whole in the tooltips', () => {
    const layout = layoutChart(longLegend);

    expect(texts(layout)[0]).toBe('Revenue from every region…');
    expect(titles(layout)[0]).toBe(`${longText}, a: 1`);
    expect(labelsOutside(layout)).toBe(0);
  });

  it('cuts axis titles longer than the plot short', () => {
    const layout = layoutChart(longAxisTitles);

    expect(texts(layout)).toEqual(expect.arrayContaining(['Revenue from every r…', 'Revenue from every…']));
    expect(labelsOutside(layout)).toBe(0);
  });

  it('rejects a title of a chart too narrow for even the ellipsis', () => {
    expect(() => layoutChart({ ...longTitle, width: 20 })).toThrow(
      'Invalid chart: title does not fit even cut short: there are 4 units for it',
    );
  });

});
