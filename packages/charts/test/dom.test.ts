// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendChart, drawChart, type ChartLayout } from '@borrowdale/charts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const label = {
  text: 'Hi',
  width: 10,
  ascent: 8,
  descent: 3,
  missing: [],
  family: 'Excalifont',
  fontSize: 12,
  x: 1,
  y: 2,
  box: { x: 1, y: -6, width: 10, height: 11 },
  rotate: 0,
  pivot: [1, 2] as const,
};
const first = { d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, fill: 'none' };
const second = { d: 'M2 2 L3 3', stroke: '#000', strokeWidth: 1, fill: 'none' };
const layout: ChartLayout = {
  width: 100,
  height: 50,
  title: 'Sales',
  family: 'Excalifont',
  nodes: [
    { kind: 'sketch', sketch: { paths: [first] } },
    { kind: 'mark', title: 'Bar 1', nodes: [{ kind: 'sketch', sketch: { paths: [second] } }] },
    { kind: 'text', text: label, fill: '#333' },
  ],
  labels: ['Hi'],
  missing: [],
};
const shapesOnly: ChartLayout = { ...layout, nodes: layout.nodes.slice(0, 2) };

class RecordingPath2D {
  constructor(readonly d: string) {}
}

// A FontFaceSet with one face of the family, loaded or not.
function fontSet(status: string) {
  const face = { family: 'Excalifont', status };
  return { forEach: (visit: (face: unknown) => void) => visit(face), check: () => status === 'loaded' };
}

function fakeContext(status = 'loaded') {
  return {
    canvas: { ownerDocument: { fonts: fontSet(status) } },
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
  };
}

// A gradient over a path that is both filled and stroked.
const painted: ChartLayout = { width: 100, height: 50, family: 'Excalifont', labels: [], missing: [], nodes: [{ kind: 'gradient', from: [0, 0], to: [10, 0],
  stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }],
  sketch: { paths: [{ d: 'M0 0 L1 1 Z', stroke: '#000', strokeWidth: 1, fill: '#123' }] } }] };

// A context that records the paint in force at each fill and stroke.
class PaintContext {
  fillStyle: unknown = '';
  strokeStyle: unknown = '';
  readonly fills: unknown[] = [];
  readonly strokes: unknown[] = [];
  readonly gradient = { addColorStop: vi.fn() };
  save(): void {}
  restore(): void {}
  setLineDash(): void {}
  createLinearGradient(): unknown {
    return this.gradient;
  }
  fill(): void {
    this.fills.push(this.fillStyle);
  }
  stroke(): void {
    this.strokes.push(this.strokeStyle);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appendChart', () => {
  it('appends a sized svg element and returns it', () => {
    const parent = document.createElement('div');

    const svg = appendChart(parent, layout);

    expect(parent.lastElementChild).toBe(svg);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute('width')).toBe('100');
    expect(svg.getAttribute('height')).toBe('50');
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(svg.getAttribute('role')).toBe('img');
  });

  it('gives the svg its title first', () => {
    const svg = appendChart(document.createElement('div'), layout);

    expect(svg.firstElementChild?.tagName).toBe('title');
    expect(svg.firstElementChild?.textContent).toBe('Sales');
  });

  it('wraps a mark in a group whose title is its tooltip', () => {
    const svg = appendChart(document.createElement('div'), layout);

    const group = svg.querySelector('g');

    expect(group?.firstElementChild?.textContent).toBe('Bar 1');
    expect(group?.querySelector('path')?.getAttribute('d')).toBe('M2 2 L3 3');
  });

  it('draws text as a text element', () => {
    const svg = appendChart(document.createElement('div'), layout);

    expect(svg.querySelector('text')?.textContent).toBe('Hi');
  });

  it('paints a gradient node with its definition', () => {
    const svg = appendChart(document.createElement('div'), painted);
    const paint = `url(#${svg.querySelector('linearGradient')?.id})`;

    expect(svg.querySelector('path')?.getAttribute('fill')).toBe(paint);
    expect(svg.querySelector('path')?.getAttribute('stroke')).toBe(paint);
  });

  it('keeps a hostile title as text, not markup', () => {
    const svg = appendChart(document.createElement('div'), { ...layout, title: '<script>x</script>' });

    expect(svg.querySelector('script')).toBeNull();
  });
});

describe('drawChart', () => {
  it('draws the shapes of marks too, in order', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawChart(context as unknown as CanvasRenderingContext2D, shapesOnly);

    expect(context.stroke).toHaveBeenNthCalledWith(1, new RecordingPath2D('M0 0 L1 1'));
    expect(context.stroke).toHaveBeenNthCalledWith(2, new RecordingPath2D('M2 2 L3 3'));
  });

  it('fills and strokes a gradient node with the gradient', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = new PaintContext();

    drawChart(context as unknown as CanvasRenderingContext2D, painted);

    expect(context.fills).toEqual([context.gradient]);
    expect(context.strokes).toEqual([context.gradient]);
  });

  it('draws text with the font loaded', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawChart(context as unknown as CanvasRenderingContext2D, layout);

    expect(context.fillText).toHaveBeenCalledWith('Hi', 1, 2);
  });

  it('throws when the font has not loaded', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext('unloaded');

    expect(() => drawChart(context as unknown as CanvasRenderingContext2D, layout)).toThrow('Font not loaded: Excalifont');
  });
});
