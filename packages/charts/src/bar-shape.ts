import type { Point, Shape } from '@borrowdale/core';

/** A box in along/value coordinates, turned into the chart's orientation by its frame. */
export function barShape(
  kind: 'rectangle' | 'rounded' | 'pyramid', along: number, width: number, from: number, to: number,
  point: (point: Point) => Point, box: (along: number, width: number, from: number, to: number) => Shape,
): Shape {
  switch (kind) {
    case 'rectangle':
      return box(along, width, from, to);
    case 'pyramid':
      return { kind: 'polygon', points: [point([along, from]), point([along + width, from]), point([along + width / 2, to])] };
    case 'rounded':
      return rounded(along, width, from, to, point);
    default:
      return unknownShape(kind);
  }
}

function rounded(along: number, width: number, from: number, to: number, point: (point: Point) => Point): Shape {
  const low = Math.min(from, to), high = Math.max(from, to);
  const radius = Math.min(6, width / 2, (high - low) / 2);
  const xy = (a: number, v: number): string => point([a, v]).join(' ');
  return { kind: 'path', d: `M${xy(along + radius, low)} L${xy(along + width - radius, low)} Q${xy(along + width, low)} ${xy(along + width, low + radius)} L${xy(along + width, high - radius)} Q${xy(along + width, high)} ${xy(along + width - radius, high)} L${xy(along + radius, high)} Q${xy(along, high)} ${xy(along, high - radius)} L${xy(along, low + radius)} Q${xy(along, low)} ${xy(along + radius, low)} Z` };
}

function unknownShape(kind: never): never {
  throw new Error(`Unknown bar shape: ${String(kind)}`);
}
