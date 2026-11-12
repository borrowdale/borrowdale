// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendChart, drawChart, toSvgChart, type ChartLayout } from '@borrowdale/charts';
import type { ChartNode } from '../src/types.js';

const raster = 'data:image/png;base64,iVBORw0KGgo=';
const line = { kind: 'sketch' as const, sketch: { paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, fill: 'none' }] } };
const box = { x: 10, y: 20, width: 30, height: 40 };
const gradient: ChartNode = { kind: 'gradient', from: [0, 0], to: [10, 0],
  stops: [{ offset: 0, color: '#f00' }, { offset: 1, color: '#00f' }],
  sketch: { paths: [{ d: 'M0 0 L10 0', fill: 'none', stroke: '#000', strokeWidth: 2 }] } };
const image: ChartNode = { kind: 'image', asset: 'photo', x: 1, y: 2, width: 3, height: 4 };

function layoutOf(nodes: ChartNode[]): ChartLayout {
  return { width: 100, height: 100, family: 'test', labels: [], missing: [], nodes };
}

const clipped = layoutOf([{ kind: 'clip', box, nodes: [line] }]);
const twice = layoutOf([{ kind: 'clip', box, nodes: [line] }, { kind: 'clip', box, nodes: [line] }]);
const wrappingGradient = layoutOf([{ kind: 'clip', box, nodes: [gradient] }]);
const wrappingImage = layoutOf([{ kind: 'mark', title: 'Bar', nodes: [{ kind: 'clip', box, nodes: [image] }] }]);

/** Rendering `layout` to SVG, run later, so that an error it throws can be expected. */
function rendering(layout: ChartLayout) {
  return () => toSvgChart(layout);
}

/** The ids of the clip paths under `parent`, and the clip each group of it refers to. */
function clipIds(parent: Element) {
  return {
    defined: [...parent.querySelectorAll('clipPath')].map((node) => node.id),
    used: [...parent.querySelectorAll('g[clip-path]')].map((node) => node.getAttribute('clip-path')),
  };
}

// Records each canvas call by name, with the arguments of rect.
class RecordingContext {
  readonly calls: string[] = [];
  save(): void { this.calls.push('save'); }
  restore(): void { this.calls.push('restore'); }
  beginPath(): void { this.calls.push('beginPath'); }
  rect(x: number, y: number, width: number, height: number): void { this.calls.push(`rect ${x} ${y} ${width} ${height}`); }
  clip(): void { this.calls.push('clip'); }
  setLineDash(): void {}
  fill(): void { this.calls.push('fill'); }
  stroke(): void { this.calls.push('stroke'); }
}

class RecordingPath2D {
  constructor(readonly d: string) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clip nodes in SVG', () => {
  it('draws the clipped nodes in a group cut by a clip path of the box', () => {
    const svg = toSvgChart(clipped);

    expect(svg).toContain('<defs><clipPath id="chart-clip-0"><rect x="10" y="20" width="30" height="40"/></clipPath></defs>');
    expect(svg).toContain('<g clip-path="url(#chart-clip-0)"><path d="M0 0 L1 1" stroke="#000" stroke-width="1" fill="none"/></g>');
  });

  it('defines one clip path for clips with the same box', () => {
    const svg = toSvgChart(twice);

    expect(svg.split('<clipPath ').length - 1).toBe(1);
    expect(svg.split('clip-path="url(#chart-clip-0)"').length - 1).toBe(2);
  });

  it('defines a gradient drawn inside a clip', () => {
    const svg = toSvgChart(wrappingGradient);

    expect(svg).toContain('<linearGradient id="chart-gradient-0"');
    expect(svg).toContain('stroke="url(#chart-gradient-0)"');
  });

  it('resolves an image drawn inside a clip inside a mark', () => {
    expect(rendering(wrappingImage)).toThrow('Missing chart image: photo');
    expect(toSvgChart(wrappingImage, { images: new Map([['photo', { dataUrl: raster }]]) }))
      .toContain('<use href="#chart-image-0" x="1" y="2" width="3" height="4"/>');
  });

  it('keeps the box in the ids of an explicit prefix', () => {
    expect(toSvgChart(clipped, { idPrefix: 'sales' })).toContain('<clipPath id="sales-clip-0">');
  });
});

describe('clip nodes in the DOM', () => {
  it('gives the clips of two charts in one document distinct ids, each group using its own', () => {
    const parent = document.createElement('div');
    const first = appendChart(parent, clipped);
    const second = appendChart(parent, clipped);

    expect(new Set([...clipIds(first).defined, ...clipIds(second).defined]).size).toBe(2);
    expect(clipIds(first).used).toEqual([`url(#${clipIds(first).defined[0]})`]);
    expect(clipIds(second).used).toEqual([`url(#${clipIds(second).defined[0]})`]);
  });

  it('cuts with a rectangle of the box', () => {
    const rect = appendChart(document.createElement('div'), clipped).querySelector('clipPath rect');

    expect([rect?.getAttribute('x'), rect?.getAttribute('y'), rect?.getAttribute('width'), rect?.getAttribute('height')])
      .toEqual(['10', '20', '30', '40']);
  });
});

describe('clip nodes on a canvas', () => {
  it('clips to the box around the clipped nodes and restores the state after them', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = new RecordingContext();

    drawChart(context as unknown as CanvasRenderingContext2D, clipped);

    expect(context.calls).toEqual(['save', 'beginPath', 'rect 10 20 30 40', 'clip', 'save', 'stroke', 'restore', 'restore']);
  });
});
