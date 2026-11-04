// Ported from points-on-curve 0.2.0 (src/index.ts, src/curve-to-bezier.ts).
// MIT License, Copyright (c) 2020 Preet Shihn. See THIRD_PARTY_NOTICES.md.

import { charge } from '../budget.js';
import type { Point } from './core.js';
import { square } from '../trig.js';

function distance(p1: Point, p2: Point): number {
  return Math.sqrt(distanceSq(p1, p2));
}

function distanceSq(p1: Point, p2: Point): number {
  return square(p1[0] - p2[0]) + square(p1[1] - p2[1]);
}

function distanceToSegmentSq(p: Point, v: Point, w: Point): number {
  const l2 = distanceSq(v, w);
  if (l2 === 0) {
    return distanceSq(p, v);
  }
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  return distanceSq(p, lerp(v, w, t));
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Adapted from https://seant23.wordpress.com/2010/11/12/offset-bezier-curves/
function flatness(points: Point[], offset: number): number {
  const p1 = points[offset + 0]!;
  const p2 = points[offset + 1]!;
  const p3 = points[offset + 2]!;
  const p4 = points[offset + 3]!;

  let ux = 3 * p2[0] - 2 * p1[0] - p4[0];
  ux *= ux;
  let uy = 3 * p2[1] - 2 * p1[1] - p4[1];
  uy *= uy;
  let vx = 3 * p3[0] - 2 * p4[0] - p1[0];
  vx *= vx;
  let vy = 3 * p3[1] - 2 * p4[1] - p1[1];
  vy *= vy;

  if (ux < vx) {
    ux = vx;
  }
  if (uy < vy) {
    uy = vy;
  }
  return ux + uy;
}

function getPointsOnBezierCurveWithSplitting(
  points: Point[],
  offset: number,
  tolerance: number,
  newPoints?: Point[],
): Point[] {
  charge();
  const outPoints = newPoints || [];
  if (flatness(points, offset) < tolerance) {
    const p0 = points[offset + 0]!;
    if (outPoints.length) {
      const d = distance(outPoints[outPoints.length - 1]!, p0);
      if (d > 1) {
        outPoints.push(p0);
      }
    } else {
      outPoints.push(p0);
    }
    outPoints.push(points[offset + 3]!);
  } else {
    const t = 0.5;
    const p1 = points[offset + 0]!;
    const p2 = points[offset + 1]!;
    const p3 = points[offset + 2]!;
    const p4 = points[offset + 3]!;

    const q1 = lerp(p1, p2, t);
    const q2 = lerp(p2, p3, t);
    const q3 = lerp(p3, p4, t);

    const r1 = lerp(q1, q2, t);
    const r2 = lerp(q2, q3, t);

    const red = lerp(r1, r2, t);

    getPointsOnBezierCurveWithSplitting([p1, q1, r1, red], 0, tolerance, outPoints);
    getPointsOnBezierCurveWithSplitting([red, r2, q3, p4], 0, tolerance, outPoints);
  }
  return outPoints;
}

export function simplify(points: Point[], distance: number): Point[] {
  return simplifyPoints(points, 0, points.length, distance);
}

// Ramer–Douglas–Peucker algorithm
function simplifyPoints(
  points: Point[],
  start: number,
  end: number,
  epsilon: number,
  newPoints?: Point[],
): Point[] {
  charge(end - start);
  const outPoints = newPoints || [];

  const s = points[start]!;
  const e = points[end - 1]!;
  let maxDistSq = 0;
  let maxNdx = 1;
  for (let i = start + 1; i < end - 1; ++i) {
    const distSq = distanceToSegmentSq(points[i]!, s, e);
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      maxNdx = i;
    }
  }

  if (Math.sqrt(maxDistSq) > epsilon) {
    simplifyPoints(points, start, maxNdx + 1, epsilon, outPoints);
    simplifyPoints(points, maxNdx, end, epsilon, outPoints);
  } else {
    if (!outPoints.length) {
      outPoints.push(s);
    }
    outPoints.push(e);
  }
  return outPoints;
}

export function pointsOnBezierCurves(points: Point[], tolerance = 0.15, distance?: number): Point[] {
  const newPoints: Point[] = [];
  const numSegments = (points.length - 1) / 3;
  for (let i = 0; i < numSegments; i++) {
    const offset = i * 3;
    getPointsOnBezierCurveWithSplitting(points, offset, tolerance, newPoints);
  }
  if (distance && distance > 0) {
    return simplifyPoints(newPoints, 0, newPoints.length, distance);
  }
  return newPoints;
}

function clone(p: Point): Point {
  return [...p] as Point;
}

export function curveToBezier(pointsIn: Point[], curveTightness = 0): Point[] {
  const len = pointsIn.length;
  if (len < 3) {
    throw new Error('A curve must have at least three points.');
  }
  const out: Point[] = [];
  if (len === 3) {
    out.push(clone(pointsIn[0]!), clone(pointsIn[1]!), clone(pointsIn[2]!), clone(pointsIn[2]!));
  } else {
    const points: Point[] = [];
    points.push(pointsIn[0]!, pointsIn[0]!);
    for (let i = 1; i < pointsIn.length; i++) {
      points.push(pointsIn[i]!);
      if (i === pointsIn.length - 1) {
        points.push(pointsIn[i]!);
      }
    }
    const s = 1 - curveTightness;
    out.push(clone(points[0]!));
    for (let i = 1; i + 2 < points.length; i++) {
      out.push(...splineSegment(points[i - 1]!, points[i]!, points[i + 1]!, points[i + 2]!, s));
    }
  }
  return out;
}

/**
 * Bezier control points and end point for the Catmull-Rom style segment from `current` to `next`,
 * with tension `s` (1 − curveTightness). Shared by curve outlines and curve-to-bezier conversion.
 */
export function splineSegment(prev: Point, current: Point, next: Point, next2: Point, s: number): [Point, Point, Point] {
  return [
    [current[0] + (s * next[0] - s * prev[0]) / 6, current[1] + (s * next[1] - s * prev[1]) / 6],
    [next[0] + (s * current[0] - s * next2[0]) / 6, next[1] + (s * current[1] - s * next2[1]) / 6],
    [next[0], next[1]],
  ];
}
