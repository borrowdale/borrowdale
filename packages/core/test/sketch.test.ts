import { afterEach, describe, expect, it, vi } from 'vitest';
import { sketch, type FillStyle, type Shape, type SketchOptions } from '@borrowdale/core';

const rectangle: Shape = { kind: 'rectangle', x: 0, y: 0, width: 40, height: 20 };
const wave: Shape = { kind: 'curve', points: [[0, 0], [10, 10], [20, 0], [30, 10]] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sketch', () => {
  it('draws the same strokes for the same shape', () => {
    expect(sketch(rectangle)).toEqual(sketch(rectangle));
  });

  it('does not depend on Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const first = sketch(rectangle);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    expect(sketch(rectangle)).toEqual(first);
  });

  it('draws the same strokes whatever order the shape keys are written in', () => {
    expect(sketch({ kind: 'rectangle', x: 0, y: 0, width: 40, height: 20 })).toEqual(
      sketch({ height: 20, width: 40, y: 0, x: 0, kind: 'rectangle' }),
    );
  });

  it('draws different strokes for a different seed', () => {
    expect(sketch(rectangle, { seed: 'a' }).paths[0]?.d).not.toBe(
      sketch(rectangle, { seed: 'b' }).paths[0]?.d,
    );
  });

  it('draws the same strokes for the same explicit seed', () => {
    expect(sketch(rectangle, { seed: 'bar-3' })).toEqual(sketch(rectangle, { seed: 'bar-3' }));
  });

  it.each<Shape>([
    { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 10 },
    { kind: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
    { kind: 'ellipse', cx: 5, cy: 5, width: 10, height: 6 },
    { kind: 'circle', cx: 5, cy: 5, diameter: 10 },
    { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: 0, stop: Math.PI, closed: true },
    { kind: 'polygon', points: [[0, 0], [10, 0], [5, 8]] },
    { kind: 'linearPath', points: [[0, 0], [5, 5], [10, 0]] },
    { kind: 'curve', points: [[0, 0], [5, 5], [10, 0], [15, 5]] },
    { kind: 'path', d: 'M0 0 L10 10' },
  ])('draws a $kind as a stroked path', (shape) => {
    expect(sketch(shape).paths[0]).toMatchObject({ stroke: '#000', fill: 'none' });
  });

  it('rounds coordinates to two decimals so engines that differ in the last bit agree', () => {
    expect(sketch({ kind: 'ellipse', cx: 50, cy: 30, width: 80, height: 40 }).paths[0]?.d).not.toMatch(
      /\.\d{3}/,
    );
  });

  it('treats an option set to undefined as omitted', () => {
    expect(sketch(rectangle, { stroke: undefined, strokeWidth: undefined, roughness: undefined })).toEqual(
      sketch(rectangle),
    );
  });

  it('rejects the dots fill, which rough.js draws with Math.random regardless of the seed', () => {
    expect(() =>
      sketch(rectangle, { fill: 'red', fillStyle: 'dots' as unknown as FillStyle }),
    ).toThrow('Unknown fill style: dots');
  });

  it.each<[string, Shape, SketchOptions, string]>([
    ['an infinite size', { kind: 'circle', cx: 0, cy: 0, diameter: Infinity }, {}, 'circle.diameter must be a finite number'],
    ['a NaN coordinate', { kind: 'line', x1: Number.NaN, y1: 0, x2: 1, y2: 1 }, {}, 'line.x1 must be a finite number'],
    ['a huge size', { kind: 'ellipse', cx: 0, cy: 0, width: 1e9, height: 10 }, {}, 'ellipse.width must be a finite number within'],
    ['a negative size', { kind: 'rectangle', x: 0, y: 0, width: -5, height: 5 }, {}, 'rectangle.width must not be negative'],
    ['an empty arc', { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: 1, stop: 1, closed: true }, { fill: 'red' }, 'arc.stop must be greater than arc.start'],
    ['an infinite arc start', { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: -Infinity, stop: 1 }, {}, 'arc.start must be a finite number'],
    ['an arc start too far from zero', { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: -1e17, stop: 1 }, {}, 'arc.start must be a finite number within'],
    ['an empty polygon', { kind: 'polygon', points: [] }, { fill: 'red' }, 'polygon needs at least 3 points, got 0'],
    ['a one-point curve', { kind: 'curve', points: [[0, 0]] }, {}, 'curve needs at least 2 points, got 1'],
    ['a NaN point', { kind: 'linearPath', points: [[0, 0], [Number.NaN, 1]] }, {}, 'linearPath.points must be a finite number'],
    ['a huge curveStepCount', { kind: 'circle', cx: 0, cy: 0, diameter: 10 }, { curveStepCount: 1e7 }, 'curveStepCount must be an integer from 1 to 1000'],
    ['a negative curveStepCount', { kind: 'ellipse', cx: 0, cy: 0, width: 10, height: 10 }, { curveStepCount: -1 }, 'curveStepCount must be an integer from 1 to 1000'],
    ['an infinite style number', rectangle, { roughness: Infinity }, 'roughness must be a finite number'],
  ])('rejects %s instead of hanging or exhausting memory', (_case, shape, options, message) => {
    expect(() => sketch(shape, options)).toThrow(message);
  });

  it('rejects an unknown kind instead of drawing nothing', () => {
    expect(() => sketch({ kind: 'hexagon' } as unknown as Shape)).toThrow(
      'Unknown shape kind: hexagon',
    );
  });

  it('emits a solid fill before the outline', () => {
    expect(sketch(rectangle, { fill: 'red', fillStyle: 'solid' }).paths[0]).toMatchObject({
      fill: 'red',
      stroke: 'none',
    });
  });

  it('draws hachure fill lines in the fill colour', () => {
    expect(sketch(rectangle, { fill: 'blue', fillStyle: 'hachure' }).paths[0]).toMatchObject({
      stroke: 'blue',
      strokeWidth: 0.5,
      fill: 'none',
    });
  });

  it('passes dashGap through to the dashed fill', () => {
    expect(sketch(rectangle, { fill: 'red', fillStyle: 'dashed', dashGap: 2 }).paths[0]?.d).not.toBe(
      sketch(rectangle, { fill: 'red', fillStyle: 'dashed', dashGap: 12 }).paths[0]?.d,
    );
  });

  it('passes curveTightness through to curves', () => {
    expect(sketch(wave, { curveTightness: 0 }).paths[0]?.d).not.toBe(
      sketch(wave, { curveTightness: 1 }).paths[0]?.d,
    );
  });

  it('passes the stroke style through', () => {
    expect(sketch(rectangle, { stroke: '#333', strokeWidth: 2 }).paths[0]).toMatchObject({
      stroke: '#333',
      strokeWidth: 2,
    });
  });
});
