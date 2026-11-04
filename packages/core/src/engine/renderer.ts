// Ported from rough.js 4.6.6 (src/renderer.ts). MIT License, Copyright (c) 2019 Preet Shihn.
// See THIRD_PARTY_NOTICES.md.

import { charge } from '../budget.js';
import type { Op, OpSet, Point, ResolvedOptions } from './core.js';
import { splineSegment } from './bezier.js';
import { cos, sin, square } from '../trig.js';
import type { Segment } from './path-data.js';
import { cloneOptionsAlterSeed, doubleLine, randomOffset, randomOffsetAround, strokeLine } from './strokes.js';

interface EllipseParams {
  rx: number;
  ry: number;
  increment: number;
}

interface EllipseResult {
  opset: OpSet;
  estimatedPoints: Point[];
}

export function line(x1: number, y1: number, x2: number, y2: number, o: ResolvedOptions): OpSet {
  return { type: 'path', ops: doubleLine(x1, y1, x2, y2, o) };
}

export function linearPath(points: Point[], close: boolean, o: ResolvedOptions): OpSet {
  const len = (points || []).length;
  if (len > 2) {
    const ops: Op[] = [];
    for (let i = 0; i < len - 1; i++) {
      ops.push(...doubleLine(points[i]![0], points[i]![1], points[i + 1]![0], points[i + 1]![1], o));
    }
    if (close) {
      ops.push(...doubleLine(points[len - 1]![0], points[len - 1]![1], points[0]![0], points[0]![1], o));
    }
    return { type: 'path', ops };
  } else if (len === 2) {
    return line(points[0]![0], points[0]![1], points[1]![0], points[1]![1], o);
  }
  return { type: 'path', ops: [] };
}

export function polygon(points: Point[], o: ResolvedOptions): OpSet {
  return linearPath(points, true, o);
}

export function rectangle(x: number, y: number, width: number, height: number, o: ResolvedOptions): OpSet {
  const points: Point[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  return polygon(points, o);
}

export function curve(points: Point[], o: ResolvedOptions): OpSet {
  if (points.length) {
    const o1 = _curveWithOffset(points, 1 * (1 + o.roughness * 0.2), o);
    const o2 = o.disableMultiStroke ? [] : _curveWithOffset(points, 1.5 * (1 + o.roughness * 0.22), cloneOptionsAlterSeed(o));
    return { type: 'path', ops: o1.concat(o2) };
  }
  return { type: 'path', ops: [] };
}

export function generateEllipseParams(width: number, height: number, o: ResolvedOptions): EllipseParams {
  const psq = Math.sqrt(Math.PI * 2 * Math.sqrt((square(width / 2) + square(height / 2)) / 2));
  const stepCount = Math.ceil(Math.max(o.curveStepCount, (o.curveStepCount / Math.sqrt(200)) * psq));
  const increment = (Math.PI * 2) / stepCount;
  let rx = Math.abs(width / 2);
  let ry = Math.abs(height / 2);
  const curveFitRandomness = 1 - o.curveFitting;
  rx += randomOffsetAround(rx * curveFitRandomness, o);
  ry += randomOffsetAround(ry * curveFitRandomness, o);
  return { increment, rx, ry };
}

export function ellipseWithParams(x: number, y: number, o: ResolvedOptions, ellipseParams: EllipseParams): EllipseResult {
  const [ap1, cp1] = _computeEllipsePoints(
    ellipseParams.increment,
    x,
    y,
    ellipseParams.rx,
    ellipseParams.ry,
    1,
    ellipseParams.increment * randomOffset(0.1, randomOffset(0.4, 1, o), o),
    o,
  );
  let o1 = _curve(ap1, null, o);
  if (!o.disableMultiStroke && o.roughness !== 0) {
    const [ap2] = _computeEllipsePoints(ellipseParams.increment, x, y, ellipseParams.rx, ellipseParams.ry, 1.5, 0, o);
    const o2 = _curve(ap2, null, o);
    o1 = o1.concat(o2);
  }
  return {
    estimatedPoints: cp1,
    opset: { type: 'path', ops: o1 },
  };
}

export function arc(
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  stop: number,
  closed: boolean,
  roughClosure: boolean,
  o: ResolvedOptions,
): OpSet {
  const cx = x;
  const cy = y;
  const { rx, ry, strt, stp } = normalizedArc(width, height, start, stop, o);
  const ellipseInc = (Math.PI * 2) / o.curveStepCount;
  const arcInc = Math.min(ellipseInc / 2, (stp - strt) / 2);
  const ops = _arc(arcInc, cx, cy, rx, ry, strt, stp, 1, o);
  if (!o.disableMultiStroke) {
    // A loop, not a spread: the arc can have more ops than an engine allows as arguments to one call.
    for (const op of _arc(arcInc, cx, cy, rx, ry, strt, stp, 1.5, o)) {
      ops.push(op);
    }
  }
  if (closed) {
    if (roughClosure) {
      ops.push(
        ...doubleLine(cx, cy, cx + rx * cos(strt), cy + ry * sin(strt), o),
        ...doubleLine(cx, cy, cx + rx * cos(stp), cy + ry * sin(stp), o),
      );
    } else {
      ops.push(
        { op: 'lineTo', data: [cx, cy] },
        { op: 'lineTo', data: [cx + rx * cos(strt), cy + ry * sin(strt)] },
      );
    }
  }
  return { type: 'path', ops };
}

interface NormalizedArc {
  rx: number;
  ry: number;
  strt: number;
  stp: number;
}

// Shared by the arc outline and the arc fill: jittered radii (rx drawn before ry), the start moved
// into [0, 2π) by whole turns, and spans over a full turn clamped to one turn.
export function normalizedArc(width: number, height: number, start: number, stop: number, o: ResolvedOptions): NormalizedArc {
  let rx = Math.abs(width / 2);
  let ry = Math.abs(height / 2);
  rx += randomOffsetAround(rx * 0.01, o);
  ry += randomOffsetAround(ry * 0.01, o);
  let strt = start;
  let stp = stop;
  while (strt < 0) {
    strt += Math.PI * 2;
    stp += Math.PI * 2;
  }
  if (stp - strt > Math.PI * 2) {
    strt = 0;
    stp = Math.PI * 2;
  }
  return { rx, ry, strt, stp };
}

export function svgPath(segments: Segment[], o: ResolvedOptions): OpSet {
  const ops: Op[] = [];
  let first: Point = [0, 0];
  let current: Point = [0, 0];
  for (const { key, data } of segments) {
    switch (key) {
      case 'M': {
        current = [data[0]!, data[1]!];
        first = [data[0]!, data[1]!];
        break;
      }
      case 'L':
        ops.push(...doubleLine(current[0], current[1], data[0]!, data[1]!, o));
        current = [data[0]!, data[1]!];
        break;
      case 'C': {
        const [x1, y1, x2, y2, x, y] = data as [number, number, number, number, number, number];
        ops.push(..._bezierTo(x1, y1, x2, y2, x, y, current, o));
        current = [x, y];
        break;
      }
      case 'Z':
        ops.push(...doubleLine(current[0], current[1], first[0], first[1], o));
        current = [first[0], first[1]];
        break;
    }
  }
  return { type: 'path', ops };
}

// Fills

export function solidFillPolygon(polygonList: Point[][], o: ResolvedOptions): OpSet {
  const ops: Op[] = [];
  for (const points of polygonList) {
    if (points.length) {
      const offset = o.maxRandomnessOffset || 0;
      const len = points.length;
      if (len > 2) {
        ops.push({ op: 'move', data: [points[0]![0] + randomOffsetAround(offset, o), points[0]![1] + randomOffsetAround(offset, o)] });
        for (let i = 1; i < len; i++) {
          charge();
          ops.push({ op: 'lineTo', data: [points[i]![0] + randomOffsetAround(offset, o), points[i]![1] + randomOffsetAround(offset, o)] });
        }
      }
    }
  }
  return { type: 'fillPath', ops };
}

function _curveWithOffset(points: Point[], offset: number, o: ResolvedOptions): Op[] {
  if (!points.length) {
    return [];
  }
  const ps: Point[] = [];
  ps.push([points[0]![0] + randomOffsetAround(offset, o), points[0]![1] + randomOffsetAround(offset, o)]);
  ps.push([points[0]![0] + randomOffsetAround(offset, o), points[0]![1] + randomOffsetAround(offset, o)]);
  for (let i = 1; i < points.length; i++) {
    charge();
    ps.push([points[i]![0] + randomOffsetAround(offset, o), points[i]![1] + randomOffsetAround(offset, o)]);
    if (i === points.length - 1) {
      ps.push([points[i]![0] + randomOffsetAround(offset, o), points[i]![1] + randomOffsetAround(offset, o)]);
    }
  }
  return _curve(ps, null, o);
}

function _curve(points: Point[], closePoint: Point | null, o: ResolvedOptions): Op[] {
  const len = points.length;
  const ops: Op[] = [];
  if (len > 3) {
    const s = 1 - o.curveTightness;
    ops.push({ op: 'move', data: [points[1]![0], points[1]![1]] });
    for (let i = 1; i + 2 < len; i++) {
      charge();
      const [c1, c2, end] = splineSegment(points[i - 1]!, points[i]!, points[i + 1]!, points[i + 2]!, s);
      ops.push({ op: 'bcurveTo', data: [c1[0], c1[1], c2[0], c2[1], end[0], end[1]] });
    }
    if (closePoint && closePoint.length === 2) {
      const ro = o.maxRandomnessOffset;
      ops.push({ op: 'lineTo', data: [closePoint[0] + randomOffsetAround(ro, o), closePoint[1] + randomOffsetAround(ro, o)] });
    }
  } else if (len === 3) {
    ops.push({ op: 'move', data: [points[1]![0], points[1]![1]] });
    ops.push({
      op: 'bcurveTo',
      data: [points[1]![0], points[1]![1], points[2]![0], points[2]![1], points[2]![0], points[2]![1]],
    });
  } else if (len === 2) {
    ops.push(...strokeLine(points[0]![0], points[0]![1], points[1]![0], points[1]![1], o, true, true));
  }
  return ops;
}

function _computeEllipsePoints(
  increment: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  offset: number,
  overlap: number,
  o: ResolvedOptions,
): [Point[], Point[]] {
  const coreOnly = o.roughness === 0;
  const corePoints: Point[] = [];
  const allPoints: Point[] = [];

  if (coreOnly) {
    increment = increment / 4;
    allPoints.push([cx + rx * cos(-increment), cy + ry * sin(-increment)]);
    for (let angle = 0; angle <= Math.PI * 2; angle = angle + increment) {
      charge();
      const p: Point = [cx + rx * cos(angle), cy + ry * sin(angle)];
      corePoints.push(p);
      allPoints.push(p);
    }
    allPoints.push([cx + rx * cos(0), cy + ry * sin(0)]);
    allPoints.push([cx + rx * cos(increment), cy + ry * sin(increment)]);
  } else {
    const radOffset = randomOffsetAround(0.5, o) - Math.PI / 2;
    allPoints.push([
      randomOffsetAround(offset, o) + cx + 0.9 * rx * cos(radOffset - increment),
      randomOffsetAround(offset, o) + cy + 0.9 * ry * sin(radOffset - increment),
    ]);
    const endAngle = Math.PI * 2 + radOffset - 0.01;
    for (let angle = radOffset; angle < endAngle; angle = angle + increment) {
      charge();
      const p: Point = [
        randomOffsetAround(offset, o) + cx + rx * cos(angle),
        randomOffsetAround(offset, o) + cy + ry * sin(angle),
      ];
      corePoints.push(p);
      allPoints.push(p);
    }
    allPoints.push([
      randomOffsetAround(offset, o) + cx + rx * cos(radOffset + Math.PI * 2 + overlap * 0.5),
      randomOffsetAround(offset, o) + cy + ry * sin(radOffset + Math.PI * 2 + overlap * 0.5),
    ]);
    allPoints.push([
      randomOffsetAround(offset, o) + cx + 0.98 * rx * cos(radOffset + overlap),
      randomOffsetAround(offset, o) + cy + 0.98 * ry * sin(radOffset + overlap),
    ]);
    allPoints.push([
      randomOffsetAround(offset, o) + cx + 0.9 * rx * cos(radOffset + overlap * 0.5),
      randomOffsetAround(offset, o) + cy + 0.9 * ry * sin(radOffset + overlap * 0.5),
    ]);
  }

  return [allPoints, corePoints];
}

function _arc(
  increment: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strt: number,
  stp: number,
  offset: number,
  o: ResolvedOptions,
): Op[] {
  const radOffset = strt + randomOffsetAround(0.1, o);
  const points: Point[] = [];
  points.push([
    randomOffsetAround(offset, o) + cx + 0.9 * rx * cos(radOffset - increment),
    randomOffsetAround(offset, o) + cy + 0.9 * ry * sin(radOffset - increment),
  ]);
  for (let angle = radOffset; angle <= stp; angle = angle + increment) {
    charge();
    points.push([randomOffsetAround(offset, o) + cx + rx * cos(angle), randomOffsetAround(offset, o) + cy + ry * sin(angle)]);
  }
  points.push([cx + rx * cos(stp), cy + ry * sin(stp)]);
  points.push([cx + rx * cos(stp), cy + ry * sin(stp)]);
  return _curve(points, null, o);
}

function _bezierTo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
  current: Point,
  o: ResolvedOptions,
): Op[] {
  const ops: Op[] = [];
  const ros = [o.maxRandomnessOffset || 1, (o.maxRandomnessOffset || 1) + 0.3];
  let f: Point = [0, 0];
  const iterations = o.disableMultiStroke ? 1 : 2;
  const preserveVertices = o.preserveVertices;
  for (let i = 0; i < iterations; i++) {
    if (i === 0) {
      ops.push({ op: 'move', data: [current[0], current[1]] });
    } else {
      ops.push({
        op: 'move',
        data: [
          current[0] + (preserveVertices ? 0 : randomOffsetAround(ros[0]!, o)),
          current[1] + (preserveVertices ? 0 : randomOffsetAround(ros[0]!, o)),
        ],
      });
    }
    f = preserveVertices ? [x, y] : [x + randomOffsetAround(ros[i]!, o), y + randomOffsetAround(ros[i]!, o)];
    ops.push({
      op: 'bcurveTo',
      data: [
        x1 + randomOffsetAround(ros[i]!, o),
        y1 + randomOffsetAround(ros[i]!, o),
        x2 + randomOffsetAround(ros[i]!, o),
        y2 + randomOffsetAround(ros[i]!, o),
        f[0],
        f[1],
      ],
    });
  }
  return ops;
}
