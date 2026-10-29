// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendSketch, drawSketch, type Sketch } from '@borrowdale/core';

const outlined: Sketch = { paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 2, fill: 'none' }] };
const filled: Sketch = { paths: [{ d: 'M0 0 L1 1 Z', stroke: 'none', strokeWidth: 0, fill: 'red' }] };
const evenOdd: Sketch = { paths: [{ d: 'M0 0 L1 1 Z', stroke: 'none', strokeWidth: 0, fill: 'red', fillRule: 'evenodd' }] };
const dashed: Sketch = { paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, strokeLineDash: [4, 2], fill: 'none' }] };
const twoStrokes: Sketch = {
  paths: [
    { d: 'M0 0 L1 1', stroke: '#111', strokeWidth: 1, fill: 'none' },
    { d: 'M2 2 L3 3', stroke: '#222', strokeWidth: 1, fill: 'none' },
  ],
};

class RecordingPath2D {
  constructor(readonly d: string) {}
}

function fakeContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appendSketch', () => {
  it('appends SVG-namespaced path elements with the sketch attributes', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const [path] = appendSketch(svg, outlined);

    expect(path?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(path?.getAttribute('d')).toBe('M0 0 L1 1');
    expect(path?.getAttribute('stroke-width')).toBe('2');
    expect(path?.getAttribute('stroke')).toBe('#000');
    expect(path?.getAttribute('fill')).toBe('none');
    expect(svg.childElementCount).toBe(1);
  });

  it('sets the fill rule attribute when a path has one', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const [path] = appendSketch(svg, evenOdd);

    expect(path?.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('sets the dash pattern attribute when a path has one', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const [path] = appendSketch(svg, dashed);

    expect(path?.getAttribute('stroke-dasharray')).toBe('4 2');
  });

  it('leaves the dash pattern attribute off otherwise', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const [path] = appendSketch(svg, outlined);

    expect(path?.hasAttribute('stroke-dasharray')).toBe(false);
  });

  it('leaves the fill rule attribute off otherwise', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const [path] = appendSketch(svg, filled);

    expect(path?.hasAttribute('fill-rule')).toBe(false);
  });

  it('appends one element per path, in order', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    appendSketch(svg, twoStrokes);

    expect(svg.lastElementChild?.getAttribute('d')).toBe('M2 2 L3 3');
    expect(svg.childElementCount).toBe(2);
  });

  it('stores hostile values as attributes, not markup', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    appendSketch(svg, { paths: [{ d: 'M0 0', stroke: '"/><script>', strokeWidth: 1, fill: 'none' }] });

    expect(svg.querySelector('script')).toBeNull();
  });
});

describe('drawSketch', () => {
  it('strokes an outline path and does not fill it', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, outlined);

    expect(context.stroke).toHaveBeenCalledWith(new RecordingPath2D('M0 0 L1 1'));
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.lineWidth).toBe(2);
    expect(context.strokeStyle).toBe('#000');
  });

  it('strokes every path of the sketch', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, twoStrokes);

    expect(context.stroke).toHaveBeenNthCalledWith(2, new RecordingPath2D('M2 2 L3 3'));
    expect(context.stroke).toHaveBeenCalledTimes(2);
  });

  it('sets the dash pattern before stroking a dashed path', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, dashed);

    expect(context.setLineDash).toHaveBeenCalledWith([4, 2]);
    expect(context.setLineDash.mock.invocationCallOrder[0]).toBeLessThan(context.stroke.mock.invocationCallOrder[0]!);
  });

  it('sets the dash pattern between save() and restore(), so it does not reach later drawing', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, dashed);

    expect(context.save.mock.invocationCallOrder[0]).toBeLessThan(context.setLineDash.mock.invocationCallOrder[0]!);
    expect(context.restore.mock.invocationCallOrder[0]).toBeGreaterThan(context.setLineDash.mock.invocationCallOrder[0]!);
  });

  it('clears the dash pattern for a solid path', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, outlined);

    expect(context.setLineDash).toHaveBeenCalledWith([]);
  });

  it('draws with its own dash and phase, then restores the caller state', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    let dash = [5, 5];
    let saved: { dash: number[]; offset: number };
    const drawn: { dash: number[]; offset: number }[] = [];
    const context = {
      ...fakeContext(), lineDashOffset: 3,
      setLineDash: (value: number[]) => { dash = [...value]; },
      save: () => { saved = { dash: [...dash], offset: context.lineDashOffset }; },
      restore: () => { dash = saved.dash; context.lineDashOffset = saved.offset; },
      stroke: () => { drawn.push({ dash: [...dash], offset: context.lineDashOffset }); },
    };
    drawSketch(context as unknown as CanvasRenderingContext2D, { paths: [...dashed.paths, ...outlined.paths] });
    expect(drawn).toEqual([{ dash: [4, 2], offset: 0 }, { dash: [], offset: 0 }]);
    expect(dash).toEqual([5, 5]);
    expect(context.lineDashOffset).toBe(3);
  });

  it('fills with the even-odd rule when the path asks for it', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, evenOdd);

    expect(context.fill).toHaveBeenCalledWith(new RecordingPath2D('M0 0 L1 1 Z'), 'evenodd');
  });

  it('saves before drawing and restores after', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, outlined);

    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.save.mock.invocationCallOrder[0]).toBeLessThan(
      context.stroke.mock.invocationCallOrder[0] ?? 0,
    );
    expect(context.restore.mock.invocationCallOrder[0]).toBeGreaterThan(
      context.stroke.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('fills a fill path and does not stroke it', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, filled);

    expect(context.fill).toHaveBeenCalledWith(new RecordingPath2D('M0 0 L1 1 Z'), 'nonzero');
    expect(context.stroke).not.toHaveBeenCalled();
    expect(context.fillStyle).toBe('red');
  });

  it('restores the context state it saved', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, outlined);

    expect(context.restore).toHaveBeenCalledTimes(1);
  });
});
