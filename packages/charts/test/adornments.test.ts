// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { appendChart, drawChart, layoutChart, toSvgChart, type ChartLayout, type ChartSpec } from '@borrowdale/charts';
import { textBounds } from '@borrowdale/text';

const spec: ChartSpec = {
  width: 300, height: 200, legend: 'none', style: { roughness: 0 },
  axes: { x: { type: 'linear', min: 0, max: 10 }, y: { type: 'linear', min: 0, max: 10 } },
  series: [{ type: 'scatter', name: 'S', data: [[0, 0], [10, 10]], symbol: { image: 'photo' } }],
};
const raster = 'data:image/png;base64,iVBORw0KGgo=';

describe('trusted image assets', () => {
  it('embeds a repeated raster only once while retaining two positioned references', () => {
    const layout = layoutChart(spec);
    const svg = toSvgChart(layout, { images: new Map([['photo', { dataUrl: raster }]]) });
    expect(svg.split(raster).length - 1).toBe(1);
    expect(svg.match(/<use /g)).toHaveLength(2);
  });
  it('keeps only names and positions in layout, and embeds bytes in both SVG outputs', () => {
    const layout = layoutChart(spec);
    expect(JSON.stringify(layout)).not.toContain('data:image');
    const options = { images: new Map([['photo', { dataUrl: raster }]]) };
    const svg = toSvgChart(layout, options);
    expect(svg.match(/<image /g)).toHaveLength(1);
    const element = appendChart(document.createElement('div'), layout, options);
    expect(element.querySelectorAll('image')).toHaveLength(1);
    expect(element.querySelectorAll('use')).toHaveLength(2);
    expect(element.querySelector('image')!.getAttribute('href')).toBe(raster);
  });

  it('rejects missing resources before drawing anything', () => {
    const context = { drawImage: vi.fn(), save: vi.fn() };
    expect(() => drawChart(context as unknown as CanvasRenderingContext2D, layoutChart(spec))).toThrow('Missing chart image: photo');
    expect(context.save).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('requires a preloaded Canvas source and uses it directly', () => {
    const layout: ChartLayout = { width: 100, height: 100, family: 'test', labels: [], missing: [],
      nodes: [{ kind: 'image', asset: 'photo', x: 10, y: 20, width: 30, height: 40 }] };
    const context = { drawImage: vi.fn() };
    const source = document.createElement('canvas');
    expect(() => drawChart(context as unknown as CanvasRenderingContext2D, layout,
      { images: new Map([['photo', { dataUrl: raster }]]) })).toThrow('preloaded Canvas source');
    drawChart(context as unknown as CanvasRenderingContext2D, layout,
      { images: new Map([['photo', { dataUrl: raster, source }]]) });
    expect(context.drawImage).toHaveBeenCalledWith(source, 10, 20, 30, 40);
  });

  it.each(['https://example.com/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4='])('rejects non-raster resource %s', (dataUrl) => {
    expect(() => toSvgChart(layoutChart(spec), { images: new Map([['photo', { dataUrl }]]) })).toThrow('raster data URL');
  });
});

describe('automatic SVG resource identifiers', () => {
  const gradient = { kind: 'gradient' as const, from: [0, 0] as const, to: [10, 0] as const,
    stops: [{ offset: 0, color: '#f00' }, { offset: 1, color: '#00f' }],
    sketch: { paths: [{ d: 'M0 0 L10 0', fill: 'none', stroke: '#000', strokeWidth: 2 }] } };
  const layout: ChartLayout = { width: 100, height: 100, family: 'test', labels: [], missing: [],
    nodes: [gradient, { ...gradient, to: [20, 0] as const }] };

  it('reserves distinct identifiers before detached charts are attached', () => {
    const doc = document.implementation.createHTMLDocument('');
    const parent = doc.createElement('div');
    appendChart(parent, layout); appendChart(parent, layout);
    doc.body.appendChild(parent);
    const ids = [...parent.querySelectorAll('linearGradient')].map((node) => node.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('checks occupied nonzero identifiers rather than only the first resource', () => {
    const doc = document.implementation.createHTMLDocument('');
    const occupied = doc.createElement('div'); occupied.id = 'chart-gradient-1'; doc.body.appendChild(occupied);
    const svg = appendChart(doc.body, layout);
    const ids = [...svg.querySelectorAll('linearGradient')].map((node) => node.id);
    expect(ids).not.toContain(occupied.id);
    expect(new Set([...doc.querySelectorAll('[id]')].map((node) => node.id)).size).toBe(3);
  });
});

describe('data labels and annotations', () => {
  it('keeps endpoint labels on the chart and collects their font text', () => {
    const layout = layoutChart({ ...spec, series: [{ type: 'scatter', name: 'S', data: [[0, 0], [10, 10]], dataLabels: true }] });
    const labels = layout.nodes.flatMap((n) => n.kind === 'mark' ? n.nodes : []).filter((n) => n.kind === 'text');
    expect(labels).toHaveLength(2);
    for (const node of labels) {
      if (node.kind !== 'text') continue;
      const bounds = textBounds(node.text);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(layout.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(layout.height);
      expect(layout.labels).toContain(node.text.text);
    }
  });

  it('places a reference line on the same exact value as a point', () => {
    const layout = layoutChart({ ...spec, series: [{ type: 'scatter', name: 'S', data: [[5, 3]], symbol: { image: 'photo' } }],
      annotations: [{ type: 'line', axis: 'y', value: 3, color: '#f00' }] });
    const point = layout.nodes.flatMap((node) => node.kind === 'mark' ? node.nodes : []).find((node) => node.kind === 'image');
    if (point?.kind !== 'image') throw new Error('Missing point geometry');
    const line = layout.nodes.flatMap((node) => node.kind === 'sketch' ? node.sketch.paths : []).find((path) => path.stroke === '#f00');
    const start = /^M\s*(-?[\d.]+)[ ,](-?[\d.]+)/.exec(line!.d)!;
    expect(Number(start[2])).toBeCloseTo(point.y + point.height / 2, 2);
  });

  it('includes annotations in domains and rejects values outside fixed bounds', () => {
    expect(() => layoutChart({ ...spec, annotations: [{ type: 'line', axis: 'y', value: 11 }] })).toThrow('axes.y.max');
    const layout = layoutChart({ ...spec, axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      annotations: [{ type: 'line', axis: 'y', value: 100, label: 'goal' }] });
    expect(layout.labels).toContain('goal');
  });

  it('validates category names, axis bindings and collection sizes', () => {
    expect(() => layoutChart({ ...spec, annotations: [{ type: 'line', axis: 'y2', value: 1 }] })).toThrow('axes.y2');
    expect(() => layoutChart({ ...spec, annotations: Array.from({ length: 101 }, () => ({ type: 'line' as const, axis: 'y' as const, value: 1 })) })).toThrow('annotations');
    const band: ChartSpec = { ...spec, axes: { x: { type: 'band', categories: ['a'] }, y: { type: 'linear' } }, series: [{ type: 'bar', name: 'B', data: [1] }] };
    expect(() => layoutChart({ ...band, annotations: [{ type: 'line', axis: 'x', value: 'missing' }] })).toThrow('not a category');
  });

  it('draws every annotation form on numeric axes', () => {
    const layout = layoutChart({ ...spec, series: [{ type: 'scatter', name: 'S', data: [[5, 5]] }], annotations: [
      { type: 'band', axis: 'x', from: 2, to: 4 },
      { type: 'region', from: [2, 2], to: [4, 4] },
      { type: 'arrow', from: [1, 1], to: [8, 8] },
      { type: 'label', at: [8, 8], text: '<goal>' },
    ] });
    expect(toSvgChart(layout)).toContain('&lt;goal&gt;');
    expect(layout.labels).toContain('<goal>');
  });

  it.each(['horizontal', 'secondary'] as const)('aligns annotation labels with %s marks', (mode) => {
    const categories = { type: 'band' as const, categories: ['A', 'B', 'C'], hidden: true };
    const value = mode === 'horizontal' ? 3 : 150;
    const axes = mode === 'horizontal'
      ? { x: { type: 'linear' as const, min: 0, max: 10, hidden: true }, y: categories }
      : { x: categories, y: { type: 'linear' as const, min: 0, max: 10, hidden: true },
          y2: { type: 'linear' as const, min: 100, max: 200, hidden: true } };
    const layout = layoutChart({ ...spec, axes,
      series: [{ type: 'interval', name: 'I', data: [null, [value, value], null], display: 'line', toSymbol: { image: 'photo' }, axis: mode === 'horizontal' ? 'y' : 'y2' }],
      annotations: [{ type: 'label', axis: mode === 'horizontal' ? 'y' : 'y2', at: mode === 'horizontal' ? [value, 'B'] : ['B', value], text: 'target' }] });
    const point = layout.nodes.flatMap((node) => node.kind === 'mark' ? node.nodes : []).find((node) => node.kind === 'image');
    const label = layout.nodes.find((node) => node.kind === 'text' && node.text.text === 'target');
    if (point?.kind !== 'image' || label?.kind !== 'text') throw new Error('Missing mark/label geometry');
    expect(label.text.pivot[0]).toBeCloseTo(point.x + point.width / 2, 2);
    expect(label.text.pivot[1]).toBeCloseTo(point.y + point.height / 2, 2);
  });
});
