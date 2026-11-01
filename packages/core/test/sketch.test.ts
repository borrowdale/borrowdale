import { afterEach, describe, expect, it, vi } from 'vitest';
import { sketch, type Shape, type SketchOptions } from '@borrowdale/core';

const rectangle: Shape = { kind: 'rectangle', x: 0, y: 0, width: 40, height: 20 };
const wave: Shape = { kind: 'curve', points: [[0, 0], [10, 10], [20, 0], [30, 10]] };
const ellipse: Shape = { kind: 'ellipse', cx: 5, cy: 5, width: 10, height: 6 };
const triangle: Shape = { kind: 'polygon', points: [[0, 0], [10, 0], [5, 8]] };
const trianglePath: Shape = { kind: 'path', d: 'M0 0 L10 0 L5 8 Z' };
const closedArc: Shape = { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: 0, stop: 2, closed: true };

// Inputs whose drawing work exceeds the per-sketch budget.
const TOO_COMPLEX = 'Drawing too complex (more than 200000 operations)';
const manyPoints: [number, number][] = Array.from({ length: 1e5 }, (_, i) => [Math.cos(i) * 500, Math.sin(i) * 500]);
const smallSquare: Shape = { kind: 'rectangle', x: 0, y: 0, width: 10, height: 10 };
const largestSquare: Shape = { kind: 'rectangle', x: -5e5, y: -5e5, width: 1e6, height: 1e6 };
// A zigzag line whose simplification recurses once per point.
const sawtooth = `M0 0${Array.from({ length: 25000 }, (_, i) => ` L${i} ${i % 2 ? -1000 : 1000}`).join('')}`;
// Thousands of tall teeth: every scan line crosses every tooth.
const comb: [number, number][] = [...Array.from({ length: 4000 }, (_, i): [number, number] => [i, i % 2 ? 1e5 : 0]), [3999, -10], [0, -10]];

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
    ellipse,
    { kind: 'circle', cx: 5, cy: 5, diameter: 10 },
    { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: 0, stop: Math.PI, closed: true },
    triangle,
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

  it('draws the dots fill from the seed, where rough.js used Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const first = sketch(rectangle, { fill: 'red', fillStyle: 'dots' });
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    expect(sketch(rectangle, { fill: 'red', fillStyle: 'dots' })).toEqual(first);
  });

  it('passes the stroke style through', () => {
    expect(sketch(rectangle, { stroke: '#333', strokeWidth: 2 }).paths[0]).toMatchObject({
      stroke: '#333',
      strokeWidth: 2,
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
});

describe('validation', () => {
  it.each<[string, unknown, unknown, string]>([
    ['a kind that is missing', { x: 0 }, {}, 'Unknown shape kind: undefined'],
    ['an unknown kind', { kind: 'hexagon' }, {}, 'Unknown shape kind: "hexagon"'],
    ['a kind that cannot become a string', JSON.parse('{"kind":{"toString":1}}'), {}, 'Unknown shape kind: an object'],
    ['a missing field', { kind: 'rectangle', x: 0, y: 0, width: 20 }, { fill: 'red' }, 'rectangle.height must be a finite number within ±1000000, got undefined'],
    ['a number given as a string', { kind: 'line', x1: '1', y1: 0, x2: 5, y2: 5 }, {}, 'line.x1 must be a finite number within ±1000000, got "1"'],
    ['an infinite size', { kind: 'circle', cx: 0, cy: 0, diameter: Infinity }, {}, 'circle.diameter must be a finite number within ±1000000, got Infinity'],
    ['a NaN coordinate', { kind: 'line', x1: Number.NaN, y1: 0, x2: 1, y2: 1 }, {}, 'line.x1 must be a finite number within ±1000000, got NaN'],
    ['a huge size', { kind: 'ellipse', cx: 0, cy: 0, width: 1e9, height: 10 }, {}, 'ellipse.width must be a finite number within ±1000000, got 1000000000'],
    ['a negative size', { kind: 'rectangle', x: 0, y: 0, width: -5, height: 5 }, {}, 'rectangle.width must not be negative, got -5'],
    ['a slightly negative size', { kind: 'rectangle', x: 0, y: 0, width: -0.5, height: 5 }, {}, 'rectangle.width must not be negative, got -0.5'],
    ['a shape that is not an object', null, {}, 'Invalid shape: expected an object, got null'],
    ['options that are not an object', rectangle, null, 'Invalid style: options must be an object, got null'],
    ['a one-point linear path', { kind: 'linearPath', points: [[0, 0]] }, {}, 'linearPath needs at least 2 points, got 1'],
    ['path data with an unknown character', { kind: 'path', d: 'M0 0 L10 x' }, {}, 'Invalid shape: path.d: unexpected "x"'],
    ['path data that stops mid-command', { kind: 'path', d: 'M0' }, {}, 'Invalid shape: path.d ended in the middle of a command'],
    ['relative path data that leaves the range', { kind: 'path', d: 'M1e6 0 l1e6 0' }, {}, 'path.d reaches, once arcs and relative coordinates are resolved, 2000000, outside ±1000000'],
    ['an inherited option name', rectangle, { constructor: 1 }, 'Unknown option: "constructor"'],
    ['a NaN strokeWidth', rectangle, { strokeWidth: Number.NaN }, 'strokeWidth must be a finite number, got NaN'],
    ['an infinite fillWeight', rectangle, { fill: 'red', fillWeight: Infinity }, 'fillWeight must be a finite number, got Infinity'],
    ['a hachureGap given as a string', rectangle, { fill: 'red', hachureGap: '3' }, 'hachureGap must be a finite number, got "3"'],
    ['an infinite dashOffset', rectangle, { fill: 'red', fillStyle: 'dashed', dashOffset: -Infinity }, 'dashOffset must be a finite number, got -Infinity'],
    ['a NaN dashGap', rectangle, { fill: 'red', fillStyle: 'dashed', dashGap: Number.NaN }, 'dashGap must be a finite number, got NaN'],
    ['an infinite zigzagOffset', rectangle, { fill: 'red', fillStyle: 'zigzag-line', zigzagOffset: Infinity }, 'zigzagOffset must be a finite number, got Infinity'],
    ['an empty arc', { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: 1, stop: 1, closed: true }, { fill: 'red' }, 'arc.stop must be greater than arc.start, got start 1, stop 1'],
    ['an infinite arc start', { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: -Infinity, stop: 1 }, {}, 'arc.start must be a finite number within ±1000000, got -Infinity'],
    ['an arc start too far from zero', { kind: 'arc', cx: 5, cy: 5, width: 10, height: 10, start: -1e17, stop: 1 }, {}, 'arc.start must be a finite number within ±1000000, got -100000000000000000'],
    ['a non-boolean arc closed flag', { kind: 'arc', cx: 0, cy: 0, width: 4, height: 4, start: 0, stop: 1, closed: 'yes' }, {}, 'arc.closed must be a boolean, got "yes"'],
    ['missing points', { kind: 'polygon' }, {}, 'polygon.points must be an array of [x, y] pairs, got undefined'],
    ['an empty polygon', { kind: 'polygon', points: [] }, { fill: 'red' }, 'polygon needs at least 3 points, got 0'],
    ['a one-point curve', { kind: 'curve', points: [[0, 0]] }, {}, 'curve needs at least 2 points, got 1'],
    ['a point that is not a pair', { kind: 'curve', points: [[0, 0], { x: 1, y: 1 }] }, {}, 'curve.points[1] must be an [x, y] pair, got an object'],
    ['a point with three numbers', { kind: 'polygon', points: [[0, 0], [1, 0], [0, 1, 2]] }, {}, 'polygon.points[2] must be an [x, y] pair, got [0, 1, 2]'],
    ['a NaN point', { kind: 'linearPath', points: [[0, 0], [Number.NaN, 1]] }, {}, 'linearPath.points[1] must be a finite number within ±1000000, got NaN'],
    ['path data that is not a string', { kind: 'path', d: 5 }, {}, 'path.d must be a string, got 5'],
    ['a number after Z', { kind: 'path', d: 'M0 0 Z 1' }, {}, 'path.d: a number cannot follow Z'],
    ['a huge number inside path data', { kind: 'path', d: 'M0 0 S1 1 2e20 0' }, {}, 'path.d contains 200000000000000000000, outside ±1000000'],
    ['a huge arc rotation inside path data', { kind: 'path', d: 'M0 0 A10 10 1e9 0 1 20 20' }, {}, 'path.d contains 1000000000, outside ±1000000'],
    ['a huge arc radius inside path data', { kind: 'path', d: 'M0 0 A1e300 10 0 0 1 20 20' }, {}, 'path.d contains 1e+300, outside ±1000000'],
    ['an unknown option', rectangle, { roughnes: 2 }, 'Unknown option: "roughnes"'],
    ['an engine-internal option', rectangle, { maxRandomnessOffset: 1e300 }, 'Unknown option: "maxRandomnessOffset"'],
    ['a stroke that is not a string', rectangle, { stroke: 5 }, 'stroke must be a string, got 5'],
    ['a seed that is an object', rectangle, { seed: { a: 1 } }, 'seed must be a string or a number, got an object'],
    ['an unknown fill style', rectangle, { fill: 'red', fillStyle: 'crayon' }, 'Unknown fill style: "crayon"'],
    ['an infinite roughness', rectangle, { roughness: Infinity }, 'roughness must be a number from 0 to 10, got Infinity'],
    ['a negative roughness', wave, { fill: 'red', roughness: -1 }, 'roughness must be a number from 0 to 10, got -1'],
    ['a bowing above 10', rectangle, { bowing: 11 }, 'bowing must be a number from 0 to 10, got 11'],
    ['a huge curveStepCount', { kind: 'circle', cx: 0, cy: 0, diameter: 10 }, { curveStepCount: 1e7 }, 'curveStepCount must be an integer from 1 to 1000, got 10000000'],
    ['a negative curveStepCount', { kind: 'ellipse', cx: 0, cy: 0, width: 10, height: 10 }, { curveStepCount: -1 }, 'curveStepCount must be an integer from 1 to 1000, got -1'],
    ['a fractional curveStepCount', rectangle, { curveStepCount: 2.5 }, 'curveStepCount must be an integer from 1 to 1000, got 2.5'],
    ['a curveTightness above 1', wave, { curveTightness: 1e308 }, 'curveTightness must be a number from 0 to 1, got 1e+308'],
    ['a negative curveFitting', { kind: 'ellipse', cx: 0, cy: 0, width: 10, height: 10 }, { curveFitting: -0.1 }, 'curveFitting must be a number from 0 to 1, got -0.1'],
    ['a hachure angle too large for the engine trigonometry', rectangle, { fill: 'red', hachureAngle: 1e300 }, 'hachureAngle must be a finite number within ±1000000, got 1e+300'],
    ['a dash that is not an array', rectangle, { strokeLineDash: 4 }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got 4'],
    ['an empty dash', rectangle, { strokeLineDash: [] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got '],
    ['a dash pattern shorter than one unit', rectangle, { strokeLineDash: [0.005, 0] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [0.005, 0]'],
    ['a dash of zeros', rectangle, { strokeLineDash: [0, 0] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [0, 0]'],
    ['a negative dash length', rectangle, { strokeLineDash: [4, -1] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [4, -1]'],
    ['a dash length given as a string', rectangle, { strokeLineDash: [4, '2'] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [4, "2"]'],
    ['a dash with a hole', rectangle, { strokeLineDash: [4, , 2] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [4, undefined, 2]'],
    ['a fill style that cannot become a string', rectangle, JSON.parse('{"fillStyle":{"toString":1}}'), 'Unknown fill style: an object'],
    ['a dash length that cannot become a string', rectangle, JSON.parse('{"strokeLineDash":[{"toString":1}]}'), 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [an object]'],
    ['a dash length past the coordinate range', rectangle, { strokeLineDash: [2e6] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got [2000000]'],
    ['17 dash lengths', rectangle, { strokeLineDash: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }, 'strokeLineDash must be an array of 1 to 16 lengths from 0 to 1000000, adding up to at least 1, got an array of 17'],
  ])('rejects %s with a named error', (_case, shape, options, message) => {
    expect(() => sketch(shape as Shape, options as SketchOptions)).toThrow(message);
  });

  it.each<[string, Shape, SketchOptions]>([
    ['coordinates at exactly ±1,000,000', { kind: 'line', x1: -1e6, y1: 0, x2: 1e6, y2: 0 }, {}],
    ['a zero-size rectangle', { kind: 'rectangle', x: 0, y: 0, width: 0, height: 0 }, {}],
    ['roughness 0', rectangle, { roughness: 0 }],
    ['roughness 10', rectangle, { roughness: 10 }],
    ['curveTightness 1 and curveFitting 0', ellipse, { curveTightness: 1, curveFitting: 0 }],
    ['curveFitting 1', ellipse, { curveFitting: 1 }],
    ['curveStepCount 1', ellipse, { curveStepCount: 1 }],
    ['curveStepCount 1000', { kind: 'circle', cx: 5, cy: 5, diameter: 10 }, { curveStepCount: 1000 }],
    ['a numeric seed', rectangle, { seed: 42 }],
    ['an explicit closed: false', { kind: 'arc', cx: 0, cy: 0, width: 4, height: 4, start: 0, stop: 1, closed: false }, {}],
    ['a dash of one length', rectangle, { strokeLineDash: [3] }],
    ['a dash pattern of exactly one unit', rectangle, { strokeLineDash: [0.5, 0.5] }],
    ['16 dash lengths, some 0', rectangle, { strokeLineDash: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] }],
    ['a dash length of exactly 1,000,000', rectangle, { strokeLineDash: [1e6] }],
  ])('accepts %s', (_case, shape, options) => {
    expect(sketch(shape, options).paths.length).toBeGreaterThan(0);
  });
});

describe('work budget', () => {
  it.each<[string, Shape, SketchOptions]>([
    ['a dashed fill with no dash length', smallSquare, { fill: 'red', fillStyle: 'dashed', dashOffset: 0, dashGap: 0 }],
    ['a zigzag-line fill with no zigzag offset', smallSquare, { fill: 'red', fillStyle: 'zigzag-line', zigzagOffset: 0 }],
    ['a hachure fill scanning a huge height for few lines', largestSquare, { fill: 'red', hachureGap: 1e6, roughness: 0 }],
    ['a hachure fill of the largest shape', largestSquare, { fill: 'red' }],
    ['a zigzag fill of the largest shape', largestSquare, { fill: 'red', fillStyle: 'zigzag' }],
    ['a cross-hatch fill of the largest shape', largestSquare, { fill: 'red', fillStyle: 'cross-hatch' }],
    ['a dots fill of the largest shape', largestSquare, { fill: 'red', fillStyle: 'dots' }],
    ['a dots fill with huge dots', smallSquare, { fill: 'red', fillStyle: 'dots', fillWeight: 1e300 }],
    ['a smooth dots fill with huge dots', smallSquare, { fill: 'red', fillStyle: 'dots', fillWeight: 1e300, roughness: 0 }],
    ['a dots fill with dots sized by a huge stroke width', smallSquare, { fill: 'red', fillStyle: 'dots', strokeWidth: 1e300, hachureGap: 2 }],
    ['a huge ellipse at the most curve steps', { kind: 'ellipse', cx: 0, cy: 0, width: 1e6, height: 1e6 }, { curveStepCount: 1000 }],
    ['an arc at the most curve steps', { kind: 'arc', cx: 0, cy: 0, width: 1e6, height: 1e6, start: 0, stop: 6, closed: true }, { fill: 'red', curveStepCount: 1000 }],
    ['a polygon of 100,000 points with a solid fill', { kind: 'polygon', points: manyPoints }, { fill: 'red', fillStyle: 'solid' }],
    ['a curve of 100,000 points', { kind: 'curve', points: manyPoints }, {}],
    ['path data of 500,000 segments', { kind: 'path', d: `M0 0${' L1 1 L0 0'.repeat(250000)}` }, {}],
    ['path data of 300,000 moves', { kind: 'path', d: 'M0 0'.repeat(300000) }, {}],
    ['a few path curves spanning the coordinate range', { kind: 'path', d: `M0 0${' C1e6 0 -1e6 1e6 1e6 1e6'.repeat(1000)}` }, {}],
    ['an arc whose span is below the precision of its start', { kind: 'arc', cx: 0, cy: 0, width: 10, height: 10, start: 9e5, stop: 9e5 + 1e-10 }, {}],
    ['a filled arc whose fill steps are below the precision of its start', { kind: 'arc', cx: 0, cy: 0, width: 10, height: 10, start: 9e5, stop: 9e5 + 1e-8, closed: true }, { fill: 'red', curveStepCount: 1000, roughness: 0 }],
    ['a sawtooth path of 25,000 points', { kind: 'path', d: sawtooth }, {}],
    ['a hachure fill of a comb with thousands of teeth', { kind: 'polygon', points: comb }, { fill: 'red' }],
    ['path data too long to read, before an error at its end', { kind: 'path', d: `M0 0${' 1'.repeat(2e6)}#` }, {}],
  ])('stops %s with a budget error', (_case, shape, options) => {
    expect(() => sketch(shape, options)).toThrow(TOO_COMPLEX);
  });

  it('starts every sketch with a fresh budget', () => {
    expect(() => sketch(largestSquare, { fill: 'red' })).toThrow(TOO_COMPLEX);

    expect(sketch(rectangle, { fill: 'red' }).paths).toHaveLength(2);
  });
});

describe('dashed outlines', () => {
  it('puts the dash on the outline', () => {
    expect(sketch({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }, { strokeLineDash: [4, 2] }).paths).toMatchObject([
      { stroke: '#000', strokeLineDash: [4, 2] },
    ]);
  });

  it('leaves the hachure lines of a fill solid', () => {
    expect(sketch(rectangle, { fill: 'red', strokeLineDash: [4, 2] }).paths[0]).not.toHaveProperty('strokeLineDash');
  });

  it("copies the caller's dash array", () => {
    const dash = [4, 2];

    const [outline] = sketch({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }, { strokeLineDash: dash }).paths;

    expect(outline?.strokeLineDash).not.toBe(dash);
  });

  it('leaves the strokes themselves as they are without a dash', () => {
    expect(sketch(rectangle, { strokeLineDash: [4, 2] }).paths[0]?.d).toBe(sketch(rectangle).paths[0]?.d);
  });

  it('adds no dash field without the option', () => {
    expect(sketch(rectangle).paths[0]).not.toHaveProperty('strokeLineDash');
  });
});

describe('fills and outlines', () => {
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

  it('keeps a line outline even with stroke none, as the engine always has', () => {
    expect(sketch({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }, { stroke: 'none' }).paths).toHaveLength(1);
  });

  it('drops the outline of a filled shape when stroke is none', () => {
    expect(sketch(rectangle, { stroke: 'none', fill: 'red', fillStyle: 'solid' }).paths).toMatchObject([
      { fill: 'red', stroke: 'none' },
    ]);
  });

  it.each<[string, Shape, string]>([
    ['rectangle', rectangle, 'none'],
    ['rectangle', rectangle, 'transparent'],
    ['polygon', triangle, 'none'],
    ['polygon', triangle, 'transparent'],
    ['ellipse', ellipse, 'none'],
    ['ellipse', ellipse, 'transparent'],
    ['closed arc', closedArc, 'none'],
    ['closed arc', closedArc, 'transparent'],
    ['curve', wave, 'none'],
    ['curve', wave, 'transparent'],
    ['path', trianglePath, 'none'],
    ['path', trianglePath, 'transparent'],
  ])('draws only the outline of a %s with fill %s', (_kind, shape, fill) => {
    expect(sketch(shape, { fill })).toMatchObject({ paths: [{ fill: 'none', stroke: '#000' }] });
  });

  it.each<[string, Shape]>([
    ['polygon', triangle],
    ['curve', wave],
    ['path', trianglePath],
  ])('fills a %s with the even-odd rule', (_kind, shape) => {
    expect(sketch(shape, { fill: 'red', fillStyle: 'solid' }).paths[0]).toMatchObject({ fill: 'red', fillRule: 'evenodd' });
  });

  it.each<[string, Shape]>([
    ['rectangle', rectangle],
    ['ellipse', ellipse],
    ['closed arc', closedArc],
  ])('leaves the default fill rule on a %s', (_kind, shape) => {
    expect(sketch(shape, { fill: 'red', fillStyle: 'solid' }).paths[0]).not.toHaveProperty('fillRule');
  });
});
