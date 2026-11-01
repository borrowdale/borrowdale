import { beforeAll, describe, expect, it } from 'vitest';
import type { drawSketch as DrawSketch, Sketch } from '@borrowdale/core';
import { evaluateIn } from './support/browsers.js';

type Results = {
  strokesMatch: boolean;
  invalidDashesMatch: boolean[];
  statesRestored: boolean[];
  errors: boolean[];
  stacksRestored: boolean[];
};

let results: Results;

beforeAll(async () => {
  results = await evaluateIn('chromium', 
    new URL('../src/index.ts', import.meta.url),
    'borrowdale',
    '',
    () => {
      const { drawSketch } = (globalThis as unknown as {
        borrowdale: { drawSketch: typeof DrawSketch };
      }).borrowdale;
      // The wider join keeps its miter at 4; the narrow join bevels at 4 but not at 10.
      const path = { d: 'M20 60 L50 20 L55 60 M65 80 L75 40 L85 80', stroke: '#000', strokeWidth: 12, fill: 'none' };
      function context() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 100;
        return canvas.getContext('2d')!;
      }
      function state(ctx: CanvasRenderingContext2D) {
        return JSON.stringify([
          ctx.strokeStyle, ctx.fillStyle, ctx.lineWidth, ctx.lineCap, ctx.lineJoin,
          ctx.miterLimit, ctx.getLineDash(), ctx.lineDashOffset,
        ]);
      }
      function pixels(ctx: CanvasRenderingContext2D) {
        return Array.from(ctx.getImageData(0, 0, 100, 100).data).join(',');
      }
      const reference = context();
      reference.lineWidth = path.strokeWidth;
      reference.miterLimit = 4;
      reference.stroke(new Path2D(path.d));
      const expected = pixels(reference);
      const statesRestored: boolean[] = [];
      function render(strokeLineDash?: number[]) {
        const ctx = context();
        ctx.strokeStyle = 'blue';
        ctx.fillStyle = 'green';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'bevel';
        ctx.miterLimit = 1;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = 3;
        const before = state(ctx);
        drawSketch(ctx, { paths: [{ ...path, ...(strokeLineDash ? { strokeLineDash } : {}) }] });
        statesRestored.push(state(ctx) === before);
        return pixels(ctx) === expected;
      }
      const strokesMatch = render();
      const invalidDashesMatch = [[-1, 2], [NaN, 2], [Infinity, 2]].map(render);
      const errors: boolean[] = [];
      const stacksRestored: boolean[] = [];
      for (const failure of ['dash', 'fill', 'stroke'] as const) {
        const ctx = context();
        ctx.lineWidth = 7;
        ctx.save();
        ctx.lineWidth = 9;
        const before = state(ctx);
        const sketch: Sketch = { paths: [{ ...path }] };
        if (failure === 'dash') {
          sketch.paths[0]!.strokeLineDash = 42 as unknown as number[];
        } else if (failure === 'fill') {
          sketch.paths[0]!.fill = 'red';
          ctx.fill = () => { throw new Error('fill failed'); };
        } else {
          ctx.stroke = () => { throw new Error('stroke failed'); };
        }
        let threw = false;
        try { drawSketch(ctx, sketch); } catch { threw = true; }
        errors.push(threw);
        statesRestored.push(state(ctx) === before);
        ctx.restore();
        stacksRestored.push(ctx.lineWidth === 7);
      }
      return { strokesMatch, invalidDashesMatch, statesRestored, errors, stacksRestored };
    },
    undefined,
  );
}, 120_000);

describe('Canvas stroke isolation', () => {
  it('uses SVG default caps, joins and miter limit regardless of caller state', () => {
    expect(results.strokesMatch).toBe(true);
  });

  it('draws malformed numeric dash lists solid instead of inheriting the caller dash', () => {
    expect(results.invalidDashesMatch).toEqual([true, true, true]);
  });

  it('restores caller state after successful drawing and thrown operations', () => {
    expect(results.errors).toEqual([true, true, true]);
    expect(results.statesRestored).toEqual(Array(7).fill(true));
    expect(results.stacksRestored).toEqual([true, true, true]);
  });
});
