import { describe, expect, it } from 'vitest';
import { distanceFor, drawnInclusive, exclusiveSizes, lensArea, placeCircles, regionErrors, regionSpots, type Circle } from '../src/venn-geometry.js';

// The expected areas are computed here, with Math, independently of the portable maths under test.
const radius = (area: number) => Math.sqrt(area / Math.PI);
/** The lens two circles share, by the textbook formula, for circles that cross. */
function lensOracle(d: number, r1: number, r2: number): number {
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return r1 * r1 * a1 + r2 * r2 * a2 - Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)) / 2;
}
const pairDistance = ([c1, c2]: readonly Circle[]) => Math.hypot(c1!.x - c2!.x, c1!.y - c2!.y);
/** The largest error of the regions placed for `inclusive`, as a share of the whole. */
function largestError(circles: readonly Circle[], inclusive: readonly number[]): number {
  const wanted = exclusiveSizes(inclusive, circles.length);
  const whole = wanted.reduce((sum, area) => sum + area, 0);
  return Math.max(...regionErrors(circles, wanted).map((error) => Math.abs(error) / whole));
}
/** The mask of the circles that hold `point` strictly inside. */
const regionMask = (point: { x: number; y: number }, circles: readonly Circle[]) =>
  circles.reduce((mask, c, i) => (Math.hypot(point.x - c.x, point.y - c.y) < c.r ? mask | (1 << i) : mask), 0);
// Three circles of radius 1, their centres 1 apart: all three share a Reuleaux triangle of width 1.
const reuleaux: Circle[] = [{ x: 0, y: 0, r: 1 }, { x: 1, y: 0, r: 1 }, { x: 0.5, y: Math.sqrt(3) / 2, r: 1 }];

describe('Venn geometry', () => {
  it('gives the lens two crossing circles share', () => {
    expect(lensArea(3, 2, 2.5)).toBeCloseTo(lensOracle(3, 2, 2.5), 12);
  });

  it('gives no shared area to tangent circles, and the smaller circle when one holds the other', () => {
    expect(lensArea(4.5, 2, 2.5)).toBe(0);
    expect(lensArea(0.25, 2, 2.5)).toBe(Math.PI * 4);
  });

  it('puts two sets of 4 and 9 sharing 2 at the distance whose lens is within 0.1% of 2', () => {
    expect(lensOracle(distanceFor(4, 9, 2), radius(4), radius(9)) / 2).toBeCloseTo(1, 3);
  });

  it('keeps sets that share nothing a tenth of the smaller radius apart', () => {
    expect(distanceFor(4, 9, 0)).toBeCloseTo(radius(4) * 1.1 + radius(9), 12);
  });

  it('centres a set inside a set that holds it, and coincident sets on one centre', () => {
    expect(distanceFor(4, 9, 4)).toBe(0);
    expect(distanceFor(9, 9, 9)).toBe(0);
  });

  it('places two sets so that they share their overlap, within 0.1%', () => {
    expect(lensOracle(pairDistance(placeCircles([0, 4, 9, 2], 2)), radius(4), radius(9)) / 2).toBeCloseTo(1, 3);
  });

  it('turns the sizes of overlaps into the sizes of the regions inside exactly their sets', () => {
    expect(exclusiveSizes([0, 10, 8, 3, 6, 2, 1, 1], 3)).toEqual([0, 6, 5, 2, 4, 1, 0, 1]);
  });

  it('draws the area three circles share', () => {
    expect(drawnInclusive(reuleaux)[7]).toBeCloseTo((Math.PI - Math.sqrt(3)) / 2, 12);
  });

  it('draws as shared by three circles the smallest one, when the other two hold it', () => {
    const nested: Circle[] = [{ x: 0, y: 0, r: 3 }, { x: 0.5, y: 0, r: 2 }, { x: 0.25, y: 0, r: 1 }];
    expect(drawnInclusive(nested)[7]).toBe(Math.PI);
  });

  it('draws as shared by two coincident circles and a third the lens of one of them with the third', () => {
    const coincident: Circle[] = [{ x: 0, y: 0, r: 1 }, { x: 0, y: 0, r: 1 }, { x: 0.5, y: 0, r: 1 }];
    expect(drawnInclusive(coincident)[7]).toBeCloseTo(lensOracle(0.5, 1, 1), 12);
  });

  it('draws nothing as shared by three circles that each cross but have no point in common', () => {
    const apart: Circle[] = [{ x: 0, y: 0, r: 1 }, { x: 1.9, y: 0, r: 1 }, { x: 0.95, y: 1.9, r: 1 }];
    expect(drawnInclusive(apart)[7]).toBe(0);
  });

  it('moves three circles from where their distances put them to where their regions fit', () => {
    // Placed by their distances alone, the regions are 10.7% of the whole off; the search ends below 1%.
    expect(largestError(placeCircles([0, 9, 9, 4, 17, 4, 0, 0], 3), [0, 9, 9, 4, 17, 4, 0, 0])).toBeLessThan(0.01);
  });

  it('spots each region at the point furthest inside it', () => {
    // The shared Reuleaux triangle's centre is equally far from all three edges.
    expect(regionSpots(reuleaux).get(7)).toEqual({ x: expect.closeTo(0.5, 1), y: expect.closeTo(Math.sqrt(3) / 6, 1) });
    expect(regionMask(regionSpots(reuleaux).get(1)!, reuleaux)).toBe(1);
    expect(regionMask(regionSpots(reuleaux).get(6)!, reuleaux)).toBe(6);
  });

  it('finds again the places of three circles from the areas they draw', () => {
    expect(largestError(placeCircles(drawnInclusive(reuleaux), 3), drawnInclusive(reuleaux))).toBeLessThan(1e-4);
  });
});
