// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendSketch, drawSketch, type Sketch } from '@borrowdale/core';

const outlined: Sketch = { paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 2, fill: 'none' }] };
const filled: Sketch = { paths: [{ d: 'M0 0 L1 1 Z', stroke: 'none', strokeWidth: 0, fill: 'red' }] };
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

    expect(context.fill).toHaveBeenCalledWith(new RecordingPath2D('M0 0 L1 1 Z'));
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
