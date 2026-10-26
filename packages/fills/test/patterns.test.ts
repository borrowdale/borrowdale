import { describe, expect, it } from 'vitest';
import { pattern, type PatternOptions } from '@borrowdale/fills';

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

  it('escapes the background colour', () => {
    expect(pattern({ kind: 'lines', id: 'p', background: '"/><script>' }).def).not.toContain('<script');
  });

  it.each([0, -4, Number.NaN, Number.POSITIVE_INFINITY])('rejects a tile size of %s', (size) => {
    expect(() => pattern({ kind: 'lines', id: 'p', size })).toThrow(`Invalid pattern size: ${size}`);
  });

  it('rejects a non-numeric tile size from untyped code instead of writing it into markup', () => {
    expect(() =>
      pattern({ kind: 'circles', id: 'p', size: '1" onload="x' as unknown as number }),
    ).toThrow('Invalid pattern size: 1" onload="x');
  });

  it('passes the stroke style to the tile strokes', () => {
    expect(pattern({ kind: 'lines', id: 'p', stroke: '#b58900' }).def).toContain('stroke="#b58900"');
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

  it('rejects an id that cannot be referenced from url(#…)', () => {
    expect(() => pattern({ kind: 'lines', id: 'a) b' })).toThrow('Invalid pattern id: a) b');
  });

  it('rejects an unknown kind', () => {
    expect(() => pattern({ kind: 'waves' } as unknown as PatternOptions)).toThrow(
      'Unknown pattern kind: waves',
    );
  });
});
