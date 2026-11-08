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
// A sketch built by hand rather than by `sketch()`, whose dash is falsy but not left out.
const falsyDash: Sketch = {
  paths: [{ d: 'M0 0 L1 1', stroke: '#000', strokeWidth: 1, strokeLineDash: 0 as unknown as number[], fill: 'none' }],
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

/**
 * A context that keeps its dash pattern and phase as a canvas does: `save()` pushes both on a stack,
 * `restore()` brings back the last saved, or does nothing when none is, and each `stroke()` records
 * them in `drawn`. The caller has set [5, 5] at 3.
 */
function dashContext() {
  const drawn: { dash: number[]; offset: number }[] = [];
  const saved: { dash: number[]; offset: number }[] = [];
  const context = {
    ...fakeContext(),
    dash: [5, 5],
    lineDashOffset: 3,
    setLineDash(value: number[]) {
      context.dash = [...value];
    },
    save() {
      saved.push({ dash: [...context.dash], offset: context.lineDashOffset });
    },
    restore() {
      const last = saved.pop();
      if (last) {
        context.dash = last.dash;
        context.lineDashOffset = last.offset;
      }
    },
    stroke() {
      drawn.push({ dash: [...context.dash], offset: context.lineDashOffset });
    },
  };
  return { context, drawn };
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

  it('stores hostile path data as an attribute, not markup', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    appendSketch(svg, { paths: [{ d: 'M0 0"/><script>', stroke: '#000', strokeWidth: 1, fill: 'none' }] });

    expect(svg.querySelector('script')).toBeNull();
  });

  it('rejects a stroke naming another file in a sketch built by hand', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    expect(() => appendSketch(svg, { paths: [{ d: 'M0 0', stroke: 'url(https://example.com/a.svg#p)', strokeWidth: 1, fill: 'none' }] }))
      .toThrow('Invalid sketch: stroke must be a colour');
  });
});

describe('drawSketch', () => {
  it('rejects a fill that is not a colour or url(#id) before drawing anything', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();
    expect(() => drawSketch(context as unknown as CanvasRenderingContext2D, {
      paths: [{ d: 'M0 0 L1 1 Z', stroke: 'none', strokeWidth: 0, fill: 'var(--x)' }],
    })).toThrow('Invalid sketch: fill must be a colour');
    expect(context.save).not.toHaveBeenCalled();
  });

  it('keeps zero-width strokes invisible without disabling the fill', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();
    drawSketch(context as unknown as CanvasRenderingContext2D, {
      paths: [{ d: 'M0 0 L1 1 Z', stroke: '#000', strokeWidth: 0, fill: '#f00' }],
    }, { stroke: '#00f' });
    expect(context.stroke).not.toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.restore).toHaveBeenCalledTimes(1);
  });

  it('overrides enabled paint channels and preserves disabled ones', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const fillContext = fakeContext();
    const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
    drawSketch(fillContext as unknown as CanvasRenderingContext2D, filled, { fill: gradient, stroke: '#123456' });
    expect(fillContext.fillStyle).toBe(gradient);
    expect(fillContext.fill).toHaveBeenCalledTimes(1);
    expect(fillContext.stroke).not.toHaveBeenCalled();
    const strokeContext = fakeContext();
    drawSketch(strokeContext as unknown as CanvasRenderingContext2D, outlined, { stroke: gradient, fill: '#123456' });
    expect(strokeContext.strokeStyle).toBe(gradient);
    expect(strokeContext.stroke).toHaveBeenCalledTimes(1);
    expect(strokeContext.fill).not.toHaveBeenCalled();
    expect(filled.paths[0]!.fill).toBe('red');
  });

  it('restores after an overridden fill throws', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();
    context.fill.mockImplementation(() => { throw new Error('paint failed'); });
    expect(() => drawSketch(context as unknown as CanvasRenderingContext2D, filled, { fill: '#123456' })).toThrow('paint failed');
    expect(context.restore).toHaveBeenCalledTimes(1);
  });
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

  it('clears the dash pattern for a falsy dash, as the SVG renderers leave it off', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const context = fakeContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, falsyDash);

    expect(context.setLineDash).toHaveBeenCalledWith([]);
  });

  it('draws with its own dash and phase, then restores the caller state', () => {
    vi.stubGlobal('Path2D', RecordingPath2D);
    const { context, drawn } = dashContext();

    drawSketch(context as unknown as CanvasRenderingContext2D, { paths: [...dashed.paths, ...outlined.paths] });

    expect(drawn).toEqual([{ dash: [4, 2], offset: 0 }, { dash: [], offset: 0 }]);
    expect(context.dash).toEqual([5, 5]);
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
