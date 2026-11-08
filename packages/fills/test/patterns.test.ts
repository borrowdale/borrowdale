import { describe, expect, it } from 'vitest';
import { sketch, type Shape } from '@borrowdale/core';
import { pattern, type PatternOptions } from '@borrowdale/fills';

const square: Shape = { kind: 'rectangle', x: 0, y: 0, width: 10, height: 10 };

// Pattern options whose stroke is a getter that counts its reads.
function countedStroke(): { options: PatternOptions; reads: () => number } {
  let reads = 0;
  const options = { kind: 'lines', seed: 's', get stroke() { reads += 1; return '#333'; } } as PatternOptions;
  return { options, reads: () => reads };
}
const counted = countedStroke();

// An array inside an array, `depth` times: deep enough that serialising it overflows the stack.
function deeplyNested(depth: number): unknown[] {
  let value: unknown[] = [];
  for (let level = 0; level < depth; level++) value = [value];
  return value;
}

describe('pattern', () => {
  it('produces the same definition for the same options', () => {
    expect(pattern({ kind: 'lines', seed: 'paper' })).toEqual(pattern({ kind: 'lines', seed: 'paper' }));
  });

  it('produces the same pattern whatever order the options are written in', () => {
    expect(pattern({ kind: 'lines', size: 12, stroke: '#333' })).toEqual(
      pattern({ stroke: '#333', size: 12, kind: 'lines' }),
    );
  });

  it('produces different strokes for a different seed', () => {
    expect(pattern({ kind: 'lines', id: 'p', seed: 'a' }).def).not.toBe(
      pattern({ kind: 'lines', id: 'p', seed: 'b' }).def,
    );
  });

  it('keeps the seed when an explicit id is given', () => {
    expect(pattern({ kind: 'circles', id: 'dots', seed: 'a' }).def).not.toBe(
      pattern({ kind: 'circles', id: 'dots', seed: 'b' }).def,
    );
  });

  it('gives different tiles different ids even when they share a seed', () => {
    expect(pattern({ kind: 'lines', seed: 's', stroke: 'red' }).id).not.toBe(
      pattern({ kind: 'lines', seed: 's', stroke: 'blue' }).id,
    );
  });

  it('gives tiles of different sizes different ids even when they share a seed', () => {
    expect(pattern({ kind: 'lines', seed: 's', size: 10 }).id).not.toBe(
      pattern({ kind: 'lines', seed: 's', size: 40 }).id,
    );
  });

  it('gives the same id whether the default size is written out or not', () => {
    expect(pattern({ kind: 'lines', seed: 's' }).id).toBe(pattern({ kind: 'lines', seed: 's', size: 10 }).id);
  });

  it('draws the same tile whether the default size is written out or not', () => {
    expect(pattern({ kind: 'lines' })).toEqual(pattern({ kind: 'lines', size: 10 }));
  });

  it('derives a stable id from the kind and seed', () => {
    expect(pattern({ kind: 'lines', seed: 'paper' }).id).toMatch(/^borrowdale-lines-\d+$/);
  });

  it('uses an explicit id for the element and the fill reference', () => {
    expect(pattern({ kind: 'circles', id: 'dots' })).toMatchObject({ id: 'dots', fill: 'url(#dots)' });
  });

  it('wraps the strokes in a user-space pattern tile of the given size', () => {
    expect(pattern({ kind: 'circles', id: 'dots', size: 12 }).def).toMatch(
      /^<pattern id="dots" patternUnits="userSpaceOnUse" width="12" height="12"><path .*<\/pattern>$/,
    );
  });

  it('paints the background behind the strokes', () => {
    expect(pattern({ kind: 'lines', id: 'p', background: '#fdf6e3' }).def).toContain(
      '<pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="10" height="10" fill="#fdf6e3"/>',
    );
  });

  it.each<[string, unknown, string]>([
    ['markup', '"/><script>', '"\\"/><script>"'],
    ['a file elsewhere', 'url(https://example.com/a.svg#p)', '"url(https://example.com/a.svg#p)"'],
    ['a pattern', 'url(#p)', '"url(#p)"'],
    ['a page variable', 'var(--x)', '"var(--x)"'],
    ['a number', 42, '42'],
  ])('rejects %s as the background, which must be a colour', (_case, background, shown) => {
    expect(() => pattern({ kind: 'lines', id: 'p', background: background as string })).toThrow(
      `Invalid pattern background: must be a colour (a hex code, a name, rgb() or hsl()), at most 100 characters, got ${shown}`,
    );
  });

  it.each<[string, unknown, string]>([
    ['an object', {}, 'an object'],
    ['NaN', Number.NaN, 'NaN'],
  ])('rejects %s as the seed', (_case, seed, shown) => {
    expect(() => pattern({ kind: 'lines', id: 'p', seed: seed as string })).toThrow(
      `Invalid pattern seed: must be a string or a finite number, got ${shown}`,
    );
  });

  it('names a misspelled option, however deeply its value nests', () => {
    expect(() => pattern({ kind: 'lines', strokeDash: deeplyNested(100_000) } as unknown as PatternOptions)).toThrow(
      'Unknown option: "strokeDash"',
    );
  });

  it('names a malformed option, however deeply its value nests', () => {
    expect(() => pattern({ kind: 'lines', strokeLineDash: deeplyNested(100_000) } as unknown as PatternOptions)).toThrow(
      'Invalid style: strokeLineDash',
    );
  });

  it('reads each option once, so the id comes from the options it checked and drew', () => {
    pattern(counted.options);
    expect(counted.reads()).toBe(1);
  });

  it('gives a fill that sketch accepts', () => {
    expect(sketch(square, { fill: pattern({ kind: 'lines', seed: 's' }).fill, fillStyle: 'solid', seed: 1 }).paths[0]?.fill).toMatch(
      /^url\(#borrowdale-lines-\d+\)$/,
    );
  });

  it.each([0, -4, Number.NaN, Number.POSITIVE_INFINITY])('rejects a tile size of %s', (size) => {
    expect(() => pattern({ kind: 'lines', id: 'p', size })).toThrow(`Invalid pattern size: ${size}`);
  });

  it('rejects a non-numeric tile size from untyped code instead of writing it into markup', () => {
    expect(() =>
      pattern({ kind: 'circles', id: 'p', size: '1" onload="x' as unknown as number }),
    ).toThrow('Invalid pattern size: "1\\" onload=\\"x"');
  });

  it('passes the stroke style to the tile strokes', () => {
    expect(pattern({ kind: 'lines', id: 'p', stroke: '#b58900' }).def).toContain('stroke="#b58900"');
  });

  it('dashes the tile strokes with strokeLineDash', () => {
    expect(pattern({ kind: 'lines', id: 'p', strokeLineDash: [4, 2] }).def).toContain('stroke-dasharray="4 2"');
  });

  it('gives a dashed tile a different id from a solid one with the same seed', () => {
    expect(pattern({ kind: 'lines', seed: 's', strokeLineDash: [4, 2] }).id).not.toBe(
      pattern({ kind: 'lines', seed: 's' }).id,
    );
  });

  it('gives tiles with different dashes different ids', () => {
    expect(pattern({ kind: 'lines', seed: 's', strokeLineDash: [4, 2] }).id).not.toBe(
      pattern({ kind: 'lines', seed: 's', strokeLineDash: [2, 4] }).id,
    );
  });

  it('draws three diagonal strokes for lines', () => {
    expect(pattern({ kind: 'lines', id: 'p' }).def.match(/<path /g)).toHaveLength(3);
  });

  it('draws six diagonal strokes for crosshatch', () => {
    expect(pattern({ kind: 'crosshatch', id: 'p' }).def.match(/<path /g)).toHaveLength(6);
  });

  it('draws one circle for circles', () => {
    expect(pattern({ kind: 'circles', id: 'p' }).def.match(/<path /g)).toHaveLength(1);
  });

  it('rejects an id too long for its fill to be a paint the other packages accept', () => {
    expect(() => pattern({ kind: 'lines', id: `p${'0'.repeat(94)}` })).toThrow(`Invalid pattern id: "p${'0'.repeat(94)}"`);
  });

  it('gives the longest id a fill that sketch accepts', () => {
    expect(sketch(square, { fill: pattern({ kind: 'lines', id: `p${'0'.repeat(93)}` }).fill, fillStyle: 'solid', seed: 1 }).paths[0]?.fill).toBe(
      `url(#p${'0'.repeat(93)})`,
    );
  });

  it('rejects an id that cannot be referenced from url(#…)', () => {
    expect(() => pattern({ kind: 'lines', id: 'a) b' })).toThrow('Invalid pattern id: "a) b"');
  });

  it('rejects an unknown kind', () => {
    expect(() => pattern({ kind: 'waves' } as unknown as PatternOptions)).toThrow(
      'Unknown pattern kind: "waves"',
    );
  });
});
